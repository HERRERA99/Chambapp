import { useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Brand } from '../../shared/brand/Brand';
import { Button } from '../../shared/ui/Button';
import { Badge, Panel, Notice, Progress } from '../../shared/ui/Panel';
import { InputField, SelectField } from '../../shared/ui/FormField';
import { Icon } from '../../shared/ui/Icon';
import { RoundingPreview } from '../time-entries/components/RoundingPreview';
import { useWorkspace } from '../workspace/useWorkspace';
import { useCommand } from '../workspace/useCommand';
import { getSupabase } from '../../lib/supabase/client';
import { storageMode } from '../../lib/local/preferences';
import { VaultKeyDialog } from '../local/VaultKeyDialog';
import { useVault } from '../vault/useVault';
import { paths } from '../../app/paths';
import { mondayForDate, todayInZone } from '../../domain/time';
import type { Profile, WorkspaceData } from '../../domain/models';
import { safeReturnTo } from '../auth/returnTo';
import './onboarding.css';
import { isLocalEdition } from '../../lib/edition';
import { LOCAL_EDITION_DOCS } from '../../lib/project';

/** "Dónde guardar": the local edition keeps everything in its own database. */
const STORAGE_STEP = 3;
const skipped = (index: number) => isLocalEdition && index === STORAGE_STEP;
/** Step number shown to the user (the local edition has one step less). */
const shownStep = (index: number) => (isLocalEdition && index > STORAGE_STEP ? index : index + 1);
const shownTotal = isLocalEdition ? 4 : 5;

const steps = [
  'Perfil & Workspace',
  'Jornada semanal',
  'Motor de Redondeo',
  'Dónde guardar',
  'Zona Horaria & Proyecto',
] as const;
const titles = [
  'Dale un lugar a tu trabajo',
  'Define tu jornada semanal',
  'Cada minuto, con total transparencia',
  '¿Dónde guardamos tus proyectos?',
  'Tu consola, a tu medida',
] as const;
const workdayChoices = [
  {
    value: '37.5',
    title: '37,5h / semana',
    name: 'Convenio flexible',
    text: 'Lunes a jueves 8h + viernes 5h30m. Un reparto con fin de semana anticipado.',
    detail: 'L–J: 32h · Viernes: 05h 30m',
  },
  {
    value: '40',
    title: '40h / semana',
    name: 'Estándar',
    text: '8 horas de lunes a viernes. La misma dedicación cada día.',
    detail: 'L–V: 40h · Diario: 08h 00m',
  },
  {
    value: 'partial',
    title: 'Jornada personalizada',
    name: 'A tu medida',
    text: 'Introduce tus horas semanales. Las repartiremos de lunes a viernes.',
    detail: 'Reparto uniforme en minutos',
  },
] as const;

function preference(data: WorkspaceData, key: string, fallback = '') {
  const value = data.profile.preferencias[key];
  return typeof value === 'string' ? value : fallback;
}

function OnboardingForm({ data }: { data: WorkspaceData }) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { run } = useCommand();
  const initialMonday = mondayForDate(todayInZone(data.profile.zona_horaria));
  const initialConfiguration = data.configurations.find(
    (config) => config.vigente_desde === initialMonday,
  );
  const initialMinutes = initialConfiguration?.minutos_semanales ?? 2250;
  const [step, setStep] = useState(0);
  const [name, setName] = useState(data.profile.nombre);
  const [workspace, setWorkspace] = useState(preference(data, 'workspace', 'Mi Workspace'));
  const [specialty, setSpecialty] = useState(preference(data, 'especialidad'));
  const [organization, setOrganization] = useState(
    preference(data, 'organizacion', 'independiente'),
  );
  const [workday, setWorkday] = useState(
    initialMinutes === 2250 ? '37.5' : initialMinutes === 2400 ? '40' : 'partial',
  );
  const [customHours, setCustomHours] = useState(String(initialMinutes / 60));
  const [rounding, setRounding] = useState(String(data.profile.intervalo_redondeo_minutos));
  const [zone, setZone] = useState(data.profile.zona_horaria);
  const [currency, setCurrency] = useState(preference(data, 'moneda', 'EUR'));
  const [project, setProject] = useState('');
  const [client, setClient] = useState('');
  const [storage, setStorage] = useState(isLocalEdition ? 'nube' : storageMode(data.profile));
  const [keyDialog, setKeyDialog] = useState(false);
  const vault = useVault();
  const localOpen = data.local?.estado === 'abierto' || data.local?.estado === 'sin-datos';
  const lastStep = steps.length - 1;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const monday = mondayForDate(todayInZone(zone));
  const existingConfiguration = data.configurations.find(
    (config) => config.vigente_desde === monday,
  );

  async function finish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    if (step !== lastStep) {
      continueStep();
      return;
    }
    if (storage === 'local' && !localOpen) {
      setStep(3);
      setError('Crea o desbloquea tu clave maestra para guardar los datos en este navegador.');
      return;
    }
    setError(null);
    if (!name.trim() || !workspace.trim()) {
      setStep(0);
      setError('Completa tu nombre y el nombre del Workspace.');
      return;
    }
    const weeklyMinutes =
      workday === 'partial'
        ? Math.round(Number(customHours) * 60)
        : Math.round(Number(workday) * 60);
    if (
      !existingConfiguration &&
      (!Number.isFinite(weeklyMinutes) || weeklyMinutes < 60 || weeklyMinutes > 7200)
    ) {
      setStep(1);
      setError('Introduce una jornada entre 1 y 120 horas semanales.');
      return;
    }
    setSaving(true);
    try {
      // Save the time zone before creating days: every day retains its own zone.
      const profile = await run<Profile>('editar_perfil', {
        version: data.profile.version,
        nombre: name.trim(),
        zona_horaria: zone,
        intervalo_redondeo_minutos: Number(rounding),
        preferencias: {
          ...data.profile.preferencias,
          workspace: workspace.trim(),
          especialidad: specialty.trim(),
          organizacion: organization,
          moneda: currency,
          almacenamiento: storage,
        },
      });

      // A previous successful step may remain after a later request fails.
      // Reusing the Monday configuration makes finishing the wizard safe to retry.
      if (!existingConfiguration) {
        await run('crear_configuracion_semanal', {
          minutos_semanales: weeklyMinutes,
          vigente_desde: monday,
          dias: [1, 2, 3, 4, 5],
          ...(workday === '37.5'
            ? { reparto: { '1': 480, '2': 480, '3': 480, '4': 480, '5': 330 } }
            : {}),
        });
      }
      await run('generar_semana', { lunes: monday });
      const projectName = project.trim();
      const clientName = client.trim();
      if (
        projectName &&
        !data.projects.some(
          (item) => item.nombre === projectName && (item.cliente ?? '') === clientName,
        )
      ) {
        await run('crear_proyecto', {
          nombre: projectName,
          cliente: clientName || null,
          ...(isLocalEdition ? {} : { destino: storage }),
        });
      }
      // Completing onboarding is the final persisted step.
      await run('editar_perfil', { version: profile.version, onboarding_completado: true });
      const destination = safeReturnTo(searchParams.get('returnTo'));
      navigate(destination === paths.onboarding ? paths.dashboard : destination, { replace: true });
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'No se pudo guardar la configuración. Puedes volver a intentarlo.',
      );
    } finally {
      setSaving(false);
    }
  }

  async function signOut() {
    if (saving) return;
    setSaving(true);
    try {
      const { error: authError } = await getSupabase().auth.signOut();
      if (authError) throw authError;
      navigate(paths.login, { replace: true });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo cerrar la sesión.');
      setSaving(false);
    }
  }

  function continueStep() {
    setError(null);
    if (step === 0 && (!name.trim() || !workspace.trim())) {
      setError('Completa tu nombre y el nombre del Workspace.');
      return;
    }
    if (
      step === 1 &&
      !existingConfiguration &&
      workday === 'partial' &&
      (!Number.isFinite(Number(customHours)) ||
        Number(customHours) < 1 ||
        Number(customHours) > 120)
    ) {
      setError('Introduce una jornada entre 1 y 120 horas semanales.');
      return;
    }
    if (step === 3 && storage === 'local' && !localOpen) {
      setKeyDialog(true);
      return;
    }
    setStep((current) => {
      const next = Math.min(steps.length - 1, current + 1);
      return skipped(next) ? next + 1 : next;
    });
  }

  return (
    <div className="onboarding-page">
      <header className="onboarding-header">
        <Brand />
        <Badge>Configuración inicial</Badge>
        {isLocalEdition ? null : (
          <Button variant="ghost" disabled={saving} onClick={() => void signOut()}>
            Cerrar sesión
          </Button>
        )}
      </header>
      <main className="onboarding-container">
        <div className="onboarding-status">
          <div>
            <p className="eyebrow">Configuración de tu espacio de trabajo</p>
            <h2>Tu espacio. Tus reglas.</h2>
          </div>
          <span className="mono accent">
            {Math.round((shownStep(step) / shownTotal) * 100)}% del recorrido
          </span>
        </div>
        <Progress
          value={Math.round((shownStep(step) / shownTotal) * 100)}
          label="Progreso de configuración"
        />
        <nav className="onboarding-steps" aria-label="Pasos de configuración">
          {steps.map((label, index) =>
            skipped(index) ? null : (
              <button
                type="button"
                key={label}
                disabled={saving || index > step}
                className={step === index ? 'active' : step > index ? 'completed' : ''}
                aria-current={step === index ? 'step' : undefined}
                onClick={() => setStep(index)}
              >
                <span>
                  {step > index ? (
                    <Icon name="check" size={16} />
                  ) : (
                    String(shownStep(index)).padStart(2, '0')
                  )}
                </span>
                <div>
                  <small>
                    {step === index ? 'En curso' : step > index ? 'Revisado' : 'Pendiente'}
                  </small>
                  <strong>{label}</strong>
                </div>
              </button>
            ),
          )}
        </nav>
        <header className="onboarding-title">
          <p className="eyebrow">
            Configuración inicial / Paso {String(shownStep(step)).padStart(2, '0')}
          </p>
          <h1>{titles[step]}</h1>
          <p className="muted">Define los parámetros de tus jornadas. Se guardarán al finalizar.</p>
        </header>
        {error ? (
          <p className="accent" role="alert">
            {error}
          </p>
        ) : null}
        <form onSubmit={finish} aria-busy={saving}>
          <div className="page-stack">
            {step === 0 ? (
              <Panel title="Perfil & Workspace" eyebrow="Bloque 01">
                <div className="form-grid">
                  <InputField
                    label="Tu nombre"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    maxLength={200}
                    required
                    disabled={saving}
                    autoComplete="name"
                  />
                  <InputField
                    label="Nombre del Workspace"
                    value={workspace}
                    onChange={(event) => setWorkspace(event.target.value)}
                    maxLength={200}
                    required
                    disabled={saving}
                  />
                  <InputField
                    label="Especialidad"
                    placeholder="Product Engineering"
                    value={specialty}
                    onChange={(event) => setSpecialty(event.target.value)}
                    maxLength={200}
                    disabled={saving}
                  />
                  <SelectField
                    label="Tipo de organización"
                    value={organization}
                    onChange={(event) => setOrganization(event.target.value)}
                    disabled={saving}
                  >
                    <option value="independiente">Profesional independiente</option>
                    <option value="empresa">Equipo / Empresa</option>
                    <option value="estudio">Estudio / Agencia</option>
                  </SelectField>
                </div>
                <Notice title="Un espacio preparado para crecer">
                  Organiza tus proyectos, tareas y registros desde un único lugar.
                </Notice>
              </Panel>
            ) : null}
            {step === 1 ? (
              <Panel eyebrow="Bloque 02" title="Meta semanal de dedicación">
                {existingConfiguration ? (
                  <Notice title="Jornada inicial guardada">
                    Ya existe una configuración para esta semana:{' '}
                    {existingConfiguration.minutos_semanales / 60} horas. La conservaremos al
                    terminar. Puedes configurar semanas futuras desde Ajustes.
                  </Notice>
                ) : (
                  <>
                    <fieldset className="choice-fieldset">
                      <legend>Selecciona tu jornada</legend>
                      <div className="choice-grid choice-grid--three">
                        {workdayChoices.map((option) => (
                          <label
                            key={option.value}
                            className={`choice-card choice-card--large ${workday === option.value ? 'choice-card--selected' : ''}`}
                          >
                            <input
                              type="radio"
                              name="onboarding-workday"
                              checked={workday === option.value}
                              disabled={saving}
                              onChange={() => setWorkday(option.value)}
                            />
                            <strong>{option.title}</strong>
                            <span className="eyebrow">{option.name}</span>
                            <p className="muted">{option.text}</p>
                            <span className="mono accent">{option.detail}</span>
                          </label>
                        ))}
                      </div>
                    </fieldset>
                    {workday === 'partial' ? (
                      <InputField
                        label="Horas semanales"
                        type="number"
                        value={customHours}
                        onChange={(event) => setCustomHours(event.target.value)}
                        min={1}
                        max={120}
                        step={0.25}
                        disabled={saving}
                        required
                        hint="Se distribuirán de lunes a viernes."
                      />
                    ) : null}
                  </>
                )}
              </Panel>
            ) : null}
            {step === 2 ? (
              <Panel eyebrow="Bloque 03" title="Redondeo de la duración">
                <div className="form-grid">
                  <SelectField
                    label="Intervalo"
                    value={rounding}
                    onChange={(event) => setRounding(event.target.value)}
                    disabled={saving}
                  >
                    <option value="0">Sin redondeo</option>
                    <option value="5">5 minutos</option>
                    <option value="10">10 minutos</option>
                    <option value="15">15 minutos</option>
                    <option value="30">30 minutos</option>
                    <option value="60">60 minutos</option>
                  </SelectField>
                </div>
                <RoundingPreview interval={rounding} />
                <Notice title="Inicio y fin exactos">
                  Redondeamos hacia arriba únicamente el tiempo total. Por ejemplo, 4h 8min se
                  imputan como 4h 15min, 4h 30min o 5h según el intervalo.
                </Notice>
              </Panel>
            ) : null}
            {step === 3 ? (
              <Panel eyebrow="Bloque 04" title="Proyectos, tareas y partes de horas">
                <p className="muted">
                  Elige dónde se guardan. Si no estás seguro, deja «En la nube»: podrás cambiarlo en
                  Ajustes → Datos con un clic.
                </p>
                <fieldset className="choice-fieldset" disabled={saving}>
                  <legend>Guardar los proyectos nuevos</legend>
                  <div className="choice-grid">
                    <label
                      className={`choice-card ${storage === 'nube' ? 'choice-card--selected' : ''}`}
                    >
                      <input
                        type="radio"
                        name="storage"
                        checked={storage === 'nube'}
                        onChange={() => setStorage('nube')}
                      />
                      <strong>En la nube</strong>
                      <span className="muted">
                        Disponibles en cualquier dispositivo con tu cuenta.
                      </span>
                    </label>
                    <label
                      className={`choice-card ${storage === 'local' ? 'choice-card--selected' : ''}`}
                    >
                      <input
                        type="radio"
                        name="storage"
                        checked={storage === 'local'}
                        disabled={data.local?.estado === 'no-disponible'}
                        onChange={() => {
                          setStorage('local');
                          if (!localOpen) setKeyDialog(true);
                        }}
                      />
                      <strong>En este navegador</strong>
                      <span className="muted">
                        Solo aquí, cifrados con una clave maestra que crearás ahora. El resto
                        (perfil, fichajes, notas…) sigue en tu cuenta.
                      </span>
                    </label>
                  </div>
                </fieldset>
                {storage === 'local' ? (
                  localOpen ? (
                    <Notice title="Clave maestra lista" icon="verified">
                      Tus proyectos se cifrarán con tu clave maestra en este navegador.
                    </Notice>
                  ) : (
                    <Notice title="Necesitas una clave maestra" icon="shield">
                      Los datos de este navegador se cifran con ella.{' '}
                      <Button variant="ghost" icon="shield" onClick={() => setKeyDialog(true)}>
                        {vault.status === 'missing' ? 'Crear clave maestra' : 'Desbloquear'}
                      </Button>
                    </Notice>
                  )
                ) : null}
                <Notice title="¿Quieres que nada salga de tu PC?" icon="hardDrive">
                  Existe <strong>Chambapp local</strong>, una versión 100% en Docker, sin cuenta y
                  sin nube.{' '}
                  <a href={LOCAL_EDITION_DOCS} target="_blank" rel="noreferrer noopener">
                    Cómo instalarla
                  </a>
                </Notice>
                {data.local?.estado === 'no-disponible' ? (
                  <Notice title="Este navegador no permite guardar datos locales">
                    Puede ocurrir en ventanas privadas.
                  </Notice>
                ) : null}
                <VaultKeyDialog
                  open={keyDialog}
                  onClose={() => setKeyDialog(false)}
                  onUnlocked={() => setStorage('local')}
                />
              </Panel>
            ) : null}
            {step === 4 ? (
              <>
                <Panel eyebrow="Bloque 05" title="Zona Horaria & Primer Proyecto">
                  <div className="form-grid">
                    <SelectField
                      label="Zona horaria"
                      value={zone}
                      onChange={(event) => setZone(event.target.value)}
                      disabled={saving}
                    >
                      {![
                        'Europe/Madrid',
                        'Europe/London',
                        'America/Mexico_City',
                        'America/Bogota',
                        'America/Argentina/Buenos_Aires',
                        'UTC',
                      ].includes(zone) ? (
                        <option value={zone}>{zone}</option>
                      ) : null}
                      <option value="Europe/Madrid">Europe / Madrid</option>
                      <option value="Europe/London">Europe / London</option>
                      <option value="America/Mexico_City">America / Mexico City</option>
                      <option value="America/Bogota">America / Bogotá</option>
                      <option value="America/Argentina/Buenos_Aires">America / Buenos Aires</option>
                      <option value="UTC">UTC</option>
                    </SelectField>
                    <SelectField
                      label="Moneda de referencia"
                      value={currency}
                      onChange={(event) => setCurrency(event.target.value)}
                      disabled={saving}
                    >
                      <option value="EUR">EUR (€)</option>
                      <option value="USD">USD ($)</option>
                      <option value="GBP">GBP (£)</option>
                    </SelectField>
                    <InputField
                      label="Primer proyecto (opcional)"
                      value={project}
                      onChange={(event) => setProject(event.target.value)}
                      maxLength={200}
                      placeholder="Mi primer proyecto"
                      disabled={saving}
                    />
                    <InputField
                      label="Cliente (opcional)"
                      value={client}
                      onChange={(event) => setClient(event.target.value)}
                      maxLength={200}
                      placeholder="Nombre del cliente"
                      disabled={saving}
                    />
                  </div>
                </Panel>
                <Notice title="Todo preparado" icon="verified">
                  Al finalizar guardaremos tu perfil, la jornada semanal y el proyecto que hayas
                  indicado.
                </Notice>
              </>
            ) : null}
          </div>
          <footer className="onboarding-actions">
            <Button
              icon="left"
              variant="ghost"
              disabled={step === 0 || saving}
              onClick={() =>
                setStep((current) => {
                  const previous = Math.max(0, current - 1);
                  return skipped(previous) ? previous - 1 : previous;
                })
              }
            >
              Volver al paso anterior
            </Button>
            <span className="mono dim">
              {saving ? 'Guardando configuración…' : 'Se guarda al finalizar'}
            </span>
            {step === lastStep ? (
              <Button key="finish" type="submit" variant="primary" icon="arrow" disabled={saving}>
                {saving ? 'Guardando…' : 'Guardar y abrir Workspace'}
              </Button>
            ) : (
              <Button
                key="continue"
                type="button"
                variant="primary"
                icon="arrow"
                disabled={saving}
                onClick={(event) => {
                  event.preventDefault();
                  continueStep();
                }}
              >
                Continuar
              </Button>
            )}
          </footer>
        </form>
      </main>
    </div>
  );
}

export default function OnboardingPage() {
  const { data } = useWorkspace();
  if (!data)
    return (
      <div className="route-loading" role="status">
        Cargando tu perfil…
      </div>
    );
  return <OnboardingForm data={data} />;
}
