import { useState } from 'react';
import type { FormEvent } from 'react';
import { DateTime } from 'luxon';
import { useLocation, useNavigate } from 'react-router-dom';
import { formatDuration } from '../../domain/time';
import { Icon } from '../../shared/ui/Icon';
import type { IconName } from '../../shared/ui/Icon';
import { PageHeader } from '../../shared/ui/PageHeader';
import { Button } from '../../shared/ui/Button';
import { Panel, Notice } from '../../shared/ui/Panel';
import { useWorkspace } from '../workspace/useWorkspace';
import { useCommand } from '../workspace/useCommand';
import { WorkdaySettings } from './components/WorkdaySettings';
import { RoundingSettings } from './components/RoundingSettings';
import { RegionalSettings } from './components/RegionalSettings';
import { SecuritySettings } from './components/SecuritySettings';
import { VaultSettings } from './components/VaultSettings';
import { ExtensionSettings } from './components/ExtensionSettings';
import { StorageSettings } from './components/StorageSettings';
import { ServerBackupSettings } from './components/ServerBackupSettings';
import { isLocalEdition } from '../../lib/edition';
import { useExtension } from '../extension/useExtension';
import '../vault/vault.css';
import { initialSchedule, minimumScheduleMonday, profileDraft } from './settingsDraft';
import type { Profile, WorkspaceData } from '../../domain/models';

type SectionId = 'perfil' | 'jornada' | 'redondeo' | 'datos' | 'extension' | 'seguridad';
const SECTION_IDS: readonly SectionId[] = [
  'perfil',
  'jornada',
  'redondeo',
  'datos',
  'extension',
  'seguridad',
];

/** `#regional` (old link) is an alias of Perfil; unknown or empty hashes open Perfil. */
function sectionFromHash(hash: string): SectionId {
  const id = hash.replace(/^#/, '');
  if (id === 'regional') return 'perfil';
  return (SECTION_IDS as readonly string[]).includes(id) ? (id as SectionId) : 'perfil';
}

function SettingsEditor({ data }: { data: WorkspaceData }) {
  const { run } = useCommand();
  const [profile, setProfile] = useState(() => profileDraft(data));
  const [baseline, setBaseline] = useState(() => profileDraft(data));
  const [version, setVersion] = useState(data.profile.version);
  const [schedule, setSchedule] = useState(() => initialSchedule(data));
  const [scheduleDirty, setScheduleDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const profileDirty = JSON.stringify(profile) !== JSON.stringify(baseline);
  const dirty = profileDirty || scheduleDirty;
  const changedElsewhere = data.profile.version !== version;
  const minimumDate = minimumScheduleMonday(data);
  const { hash } = useLocation();
  const extension = useExtension();
  const navigate = useNavigate();
  const active = sectionFromHash(hash);
  const roundingDirty = profile.intervaloRedondeo !== baseline.intervaloRedondeo;
  const profileFieldsDirty =
    profile.nombre !== baseline.nombre ||
    profile.workspace !== baseline.workspace ||
    profile.especialidad !== baseline.especialidad ||
    profile.zonaHoraria !== baseline.zonaHoraria;
  const storageDirty =
    profile.almacenamiento !== baseline.almacenamiento ||
    profile.avisoCopiaDias !== baseline.avisoCopiaDias;
  const weeklyMinutesDraft = schedule.minutes.reduce((sum, value) => sum + value, 0);
  const sections: {
    id: SectionId;
    label: string;
    icon: IconName;
    summary: string;
    dirty: boolean;
  }[] = [
    {
      id: 'perfil',
      label: 'Perfil y zona horaria',
      icon: 'user',
      summary: `${profile.nombre.trim() || 'Sin nombre'} · ${profile.zonaHoraria.replaceAll('_', ' ')}`,
      dirty: profileFieldsDirty,
    },
    {
      id: 'jornada',
      label: 'Jornada semanal',
      icon: 'calendar',
      summary: `${formatDuration(weeklyMinutesDraft * 60)} por semana`,
      dirty: scheduleDirty,
    },
    {
      id: 'redondeo',
      label: 'Redondeo',
      icon: 'timer',
      summary:
        profile.intervaloRedondeo === 0
          ? 'Tiempo exacto'
          : `Bloques de ${profile.intervaloRedondeo} min`,
      dirty: roundingDirty,
    },
    {
      id: 'datos',
      label: 'Datos',
      icon: 'hardDrive',
      summary: isLocalEdition
        ? 'Copias de seguridad'
        : profile.almacenamiento === 'local'
          ? 'Proyectos nuevos en este navegador'
          : 'Proyectos nuevos en la nube',
      dirty: storageDirty,
    },
    {
      id: 'extension',
      label: 'Extensión',
      icon: 'zap',
      summary: extension.available ? `Instalada · v${extension.version}` : 'No instalada',
      dirty: false,
    },
    {
      id: 'seguridad',
      label: 'Seguridad',
      icon: 'lock',
      summary: isLocalEdition ? 'Clave maestra' : 'Contraseña y sesión',
      dirty: false,
    },
  ];
  const dirtyLabels = sections.filter((section) => section.dirty).map((section) => section.label);

  function reset() {
    const current = profileDraft(data);
    setProfile(current);
    setBaseline(current);
    setVersion(data.profile.version);
    setSchedule(initialSchedule(data));
    setScheduleDirty(false);
    setError(null);
    setMessage('Se han cargado los valores guardados. Los cambios pendientes se han descartado.');
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || !dirty) return;
    setError(null);
    setMessage(null);
    if (!profile.nombre.trim() || !profile.workspace.trim()) {
      setError('Completa tu nombre y el nombre del Workspace.');
      return;
    }

    const weeklyMinutes = schedule.minutes.reduce((sum, value) => sum + value, 0);
    const existing = data.configurations.find(
      (configuration) => configuration.vigente_desde === schedule.effectiveDate,
    );
    const sameSchedule =
      !!existing &&
      existing.minutos_semanales === weeklyMinutes &&
      schedule.minutes.every(
        (minutes, index) =>
          minutes ===
          (data.days.find(
            (day) => day.configuracion_id === existing.id && day.dia_semana === index + 1,
          )?.minutos_objetivo ?? 0),
      );
    if (scheduleDirty) {
      const date = DateTime.fromISO(schedule.effectiveDate, { zone: 'UTC' });
      if (!date.isValid || date.weekday !== 1) {
        setError('La jornada debe entrar en vigor un lunes.');
        return;
      }
      if (!sameSchedule && schedule.effectiveDate < minimumDate) {
        setError('La semana actual ya tiene una jornada configurada. Selecciona un lunes futuro.');
        return;
      }
      if (
        schedule.minutes.length !== 7 ||
        schedule.minutes.some(
          (minutes) => !Number.isInteger(minutes) || minutes < 0 || minutes > 1440,
        ) ||
        weeklyMinutes < 1
      ) {
        setError('Define al menos un día laborable. Cada día puede tener entre 0 y 24 horas.');
        return;
      }
      if (existing && !sameSchedule) {
        setError(
          'Ese lunes ya tiene una configuración. Elige otra fecha para conservar el reparto guardado.',
        );
        return;
      }
    }

    let savedProfile = false;
    setSaving(true);
    try {
      if (profileDirty) {
        const result = await run<Profile>('editar_perfil', {
          version,
          nombre: profile.nombre.trim(),
          zona_horaria: profile.zonaHoraria,
          intervalo_redondeo_minutos: profile.intervaloRedondeo,
          preferencias: {
            ...data.profile.preferencias,
            workspace: profile.workspace.trim(),
            especialidad: profile.especialidad.trim(),
            almacenamiento: profile.almacenamiento,
            aviso_copia_dias: profile.avisoCopiaDias,
          },
        });
        const saved = {
          ...profile,
          nombre: profile.nombre.trim(),
          workspace: profile.workspace.trim(),
          especialidad: profile.especialidad.trim(),
        };
        setProfile(saved);
        setBaseline(saved);
        setVersion(result.version);
        savedProfile = true;
      }
      if (scheduleDirty && !sameSchedule) {
        const days = schedule.minutes.flatMap((minutes, index) => (minutes > 0 ? [index + 1] : []));
        const allocation = Object.fromEntries(
          days.map((day) => [String(day), schedule.minutes[day - 1]!]),
        );
        await run('crear_configuracion_semanal', {
          minutos_semanales: weeklyMinutes,
          vigente_desde: schedule.effectiveDate,
          dias: days,
          reparto: allocation,
        });
      }
      setScheduleDirty(false);
      setMessage(
        scheduleDirty
          ? `Ajustes guardados. El reparto semanal entrará en vigor el ${schedule.effectiveDate}.`
          : 'Perfil y preferencias guardados.',
      );
    } catch (cause) {
      const details =
        cause instanceof Error ? cause.message : 'No se pudo guardar. Inténtalo de nuevo.';
      setError(
        savedProfile
          ? `El perfil se ha guardado, pero la jornada sigue pendiente: ${details}`
          : details,
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      className="page-stack settings-page"
      // Hidden sections stay mounted: submit() validates every field and shows the error.
      noValidate
      onSubmit={submit}
      aria-busy={saving}
    >
      <PageHeader
        eyebrow="Sistema & cuenta"
        title="Ajustes"
        description="Elige una sección para ver y cambiar sus preferencias."
      />
      <div className="settings-layout">
        <nav className="settings-nav" aria-label="Secciones de ajustes">
          {sections.map((section) => (
            <a
              key={section.id}
              href={`#${section.id}`}
              className="settings-nav__item"
              aria-current={active === section.id ? 'page' : undefined}
              onClick={(event) => {
                event.preventDefault();
                navigate({ hash: section.id }, { replace: true });
              }}
            >
              <Icon name={section.icon} size={18} />
              <span className="settings-nav__text">
                <strong>
                  {section.label}
                  {section.dirty ? (
                    <span className="settings-nav__dot" title="Cambios sin guardar">
                      <span className="sr-only"> (cambios sin guardar)</span>
                    </span>
                  ) : null}
                </strong>
                <span className="dim">{section.summary}</span>
              </span>
            </a>
          ))}
        </nav>
        <div className="settings-content">
          {changedElsewhere ? (
            <Notice title="El perfil ha cambiado en otra sesión">
              Carga los valores actuales antes de guardar para revisar esos cambios.
            </Notice>
          ) : null}
          {error ? (
            <div role="alert">
              <Notice title="No se han guardado todos los cambios">{error}</Notice>
            </div>
          ) : null}
          {message ? (
            <div role="status">
              <Notice title="Configuración" icon="check">
                {message}
              </Notice>
            </div>
          ) : null}
          {/* Every section stays mounted (drafts and pending requests survive);
              only the chosen one is visible. */}
          <div hidden={active !== 'jornada'}>
            <WorkdaySettings
              value={schedule}
              onChange={(next) => {
                setSchedule(next);
                setScheduleDirty(true);
                setMessage(null);
              }}
              minimumDate={minimumDate}
              dirty={scheduleDirty}
              disabled={saving}
              data={data}
            />
          </div>
          <div hidden={active !== 'redondeo'}>
            <RoundingSettings
              interval={profile.intervaloRedondeo}
              onChange={(intervaloRedondeo) => {
                setProfile((current) => ({ ...current, intervaloRedondeo }));
                setMessage(null);
              }}
              disabled={saving}
            />
          </div>
          <div hidden={active !== 'perfil'}>
            <RegionalSettings
              value={profile}
              onChange={(next) => {
                setProfile(next);
                setMessage(null);
              }}
              disabled={saving}
            />
          </div>
          <div hidden={active !== 'datos'}>
            {isLocalEdition ? (
              <ServerBackupSettings data={data} />
            ) : (
              <StorageSettings
                value={{
                  almacenamiento: profile.almacenamiento,
                  avisoCopiaDias: profile.avisoCopiaDias,
                }}
                onChange={(next) => {
                  setProfile((current) => ({ ...current, ...next }));
                  setMessage(null);
                }}
                data={data}
                disabled={saving}
              />
            )}
          </div>
          <div hidden={active !== 'extension'}>
            <ExtensionSettings />
          </div>
          <div hidden={active !== 'seguridad'}>
            {isLocalEdition ? null : <SecuritySettings disabled={saving} />}
            <VaultSettings disabled={saving} />
          </div>
          {dirty || changedElsewhere ? (
            <div className="settings-savebar" role="region" aria-label="Guardar cambios">
              <span>
                {dirty ? (
                  <>
                    <strong>Cambios sin guardar</strong>
                    <span className="dim"> en {dirtyLabels.join(', ')}</span>
                  </>
                ) : (
                  <strong>Hay una versión más reciente de tu perfil</strong>
                )}
              </span>
              <div className="actions">
                <Button
                  icon="left"
                  variant="ghost"
                  disabled={saving || (!dirty && !changedElsewhere)}
                  onClick={reset}
                >
                  {changedElsewhere ? 'Cargar valores actuales' : 'Descartar'}
                </Button>
                <Button type="submit" variant="primary" icon="check" disabled={saving || !dirty}>
                  {saving ? 'Guardando…' : 'Guardar cambios'}
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </form>
  );
}

export default function SettingsPage() {
  const { data, isLoading, error, reload } = useWorkspace();
  if (isLoading)
    return (
      <div className="route-loading" role="status">
        Cargando tus preferencias…
      </div>
    );
  if (!data)
    return (
      <Panel title="No se pudo cargar la configuración">
        <p role="alert">{error?.message ?? 'Tus preferencias todavía no están disponibles.'}</p>
        <Button onClick={() => void reload()}>Volver a intentar</Button>
      </Panel>
    );
  return <SettingsEditor key={data.profile.id} data={data} />;
}
