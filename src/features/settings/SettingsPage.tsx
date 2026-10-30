import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { DateTime } from 'luxon';
import { PageHeader } from '../../shared/ui/PageHeader';
import { Button } from '../../shared/ui/Button';
import { Icon } from '../../shared/ui/Icon';
import type { IconName } from '../../shared/ui/Icon';
import { Panel, Notice } from '../../shared/ui/Panel';
import { useWorkspace } from '../workspace/useWorkspace';
import { useCommand } from '../workspace/useCommand';
import { WorkdaySettings } from './components/WorkdaySettings';
import { RoundingSettings } from './components/RoundingSettings';
import { RegionalSettings } from './components/RegionalSettings';
import { SecuritySettings } from './components/SecuritySettings';
import { OdooSettings } from './components/OdooSettings';
import { initialSchedule, minimumScheduleMonday, profileDraft } from './settingsDraft';
import type { ProfileDraft } from './settingsDraft';
import type { Profile, WorkspaceData } from '../../domain/models';
import './settings.css';

type CategoryId = 'regional' | 'jornada' | 'redondeo' | 'odoo' | 'seguridad';

const categories: readonly {
  id: CategoryId;
  label: string;
  hint: string;
  icon: IconName;
  independent?: boolean;
}[] = [
  { id: 'regional', label: 'Perfil y región', hint: 'Nombre y zona horaria', icon: 'user' },
  { id: 'jornada', label: 'Jornada laboral', hint: 'Reparto semanal', icon: 'calendar' },
  { id: 'redondeo', label: 'Redondeo', hint: 'Duración imputada', icon: 'timer' },
  { id: 'odoo', label: 'Odoo', hint: 'API key', icon: 'key', independent: true },
  {
    id: 'seguridad',
    label: 'Seguridad',
    hint: 'Contraseña y sesión',
    icon: 'lock',
    independent: true,
  },
];

function isCategory(value: string): value is CategoryId {
  return categories.some((category) => category.id === value);
}

function regionalChanged(a: ProfileDraft, b: ProfileDraft) {
  return (
    a.nombre !== b.nombre ||
    a.workspace !== b.workspace ||
    a.especialidad !== b.especialidad ||
    a.zonaHoraria !== b.zonaHoraria
  );
}

type SaveState =
  | { kind: 'idle' }
  | { kind: 'saved' | 'discarded'; message: string }
  | { kind: 'error'; message: string };

function SettingsEditor({ data }: { data: WorkspaceData }) {
  const { run } = useCommand();
  const { hash } = useLocation();
  const navigate = useNavigate();
  const active: CategoryId = isCategory(hash.slice(1)) ? (hash.slice(1) as CategoryId) : 'regional';
  const [profile, setProfile] = useState(() => profileDraft(data));
  const [baseline, setBaseline] = useState(() => profileDraft(data));
  const [version, setVersion] = useState(data.profile.version);
  const [schedule, setSchedule] = useState(() => initialSchedule(data));
  const [scheduleBaseline, setScheduleBaseline] = useState(() => initialSchedule(data));
  const [saving, setSaving] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const [state, setState] = useState<SaveState>({ kind: 'idle' });
  const profileDirty = JSON.stringify(profile) !== JSON.stringify(baseline);
  // Compared with the loaded values, so undoing an edit by hand clears the pending state.
  const scheduleDirty =
    schedule.effectiveDate !== scheduleBaseline.effectiveDate ||
    schedule.minutes.some((minutes, index) => minutes !== scheduleBaseline.minutes[index]);
  const dirty = profileDirty || scheduleDirty;
  const changedElsewhere = data.profile.version !== version;
  const minimumDate = minimumScheduleMonday(data);
  const dirtyCategories = new Set<CategoryId>([
    ...(regionalChanged(profile, baseline) ? (['regional'] as const) : []),
    ...(scheduleDirty ? (['jornada'] as const) : []),
    ...(profile.intervaloRedondeo !== baseline.intervaloRedondeo ? (['redondeo'] as const) : []),
  ]);

  // Warn before leaving the page with unsaved changes.
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  // The success confirmation fades away; errors stay until the next change.
  useEffect(() => {
    if (state.kind !== 'saved' && state.kind !== 'discarded') return;
    const id = setTimeout(() => setState({ kind: 'idle' }), 5000);
    return () => clearTimeout(id);
  }, [state]);

  function edited() {
    if (state.kind !== 'idle') setState({ kind: 'idle' });
  }

  function reset() {
    const current = profileDraft(data);
    setProfile(current);
    setBaseline(current);
    setVersion(data.profile.version);
    const currentSchedule = initialSchedule(data);
    setSchedule(currentSchedule);
    setScheduleBaseline(currentSchedule);
    setShowErrors(false);
    setState({
      kind: 'discarded',
      message: changedElsewhere
        ? 'Se han cargado los valores actuales.'
        : 'Cambios descartados. Se muestran los valores guardados.',
    });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || !dirty) return;
    setState({ kind: 'idle' });
    const fail = (message: string, category?: CategoryId) => {
      setState({ kind: 'error', message });
      if (category && category !== active) navigate({ hash: category }, { replace: true });
    };
    if (!profile.nombre.trim() || !profile.workspace.trim()) {
      setShowErrors(true);
      fail('Completa tu nombre y el nombre del espacio de trabajo.', 'regional');
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
        fail('La jornada debe entrar en vigor un lunes.', 'jornada');
        return;
      }
      if (!sameSchedule && schedule.effectiveDate < minimumDate) {
        fail(
          'La semana actual ya tiene una jornada configurada. Selecciona un lunes futuro.',
          'jornada',
        );
        return;
      }
      if (
        schedule.minutes.length !== 7 ||
        schedule.minutes.some(
          (minutes) => !Number.isInteger(minutes) || minutes < 0 || minutes > 1440,
        ) ||
        weeklyMinutes < 1
      ) {
        fail(
          'Define al menos un día laborable. Cada día puede tener entre 0 y 1440 minutos.',
          'jornada',
        );
        return;
      }
      if (existing && !sameSchedule) {
        fail(
          'Ese lunes ya tiene una configuración. Elige otra fecha para conservar el reparto guardado.',
          'jornada',
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
      setScheduleBaseline(schedule);
      setShowErrors(false);
      setState({
        kind: 'saved',
        message: scheduleDirty
          ? `Guardado. El nuevo reparto entrará en vigor el ${schedule.effectiveDate}.`
          : 'Guardado.',
      });
    } catch (cause) {
      const details =
        cause instanceof Error ? cause.message : 'No se pudo guardar. Inténtalo de nuevo.';
      fail(
        savedProfile
          ? `El perfil se ha guardado, pero la jornada sigue pendiente: ${details}`
          : details,
      );
    } finally {
      setSaving(false);
    }
  }

  const pendingLabels = categories
    .filter((category) => dirtyCategories.has(category.id))
    .map((category) => category.label);
  const barVisible = dirty || saving || state.kind !== 'idle';

  return (
    <form className="settings" onSubmit={submit} aria-busy={saving} noValidate>
      <PageHeader
        title="Ajustes"
        description="Perfil, jornada, redondeo, Odoo y seguridad. Los cambios del perfil, la jornada y el redondeo se guardan juntos."
      />
      {changedElsewhere ? (
        <Notice title="Tu perfil ha cambiado en otra sesión" tone="warning">
          Carga los valores actuales antes de guardar para revisar esos cambios.{' '}
          <Button size="sm" icon="refresh" disabled={saving} onClick={reset}>
            Cargar valores actuales
          </Button>
        </Notice>
      ) : null}
      <div className="settings__layout">
        <nav className="settings-nav" aria-label="Categorías de ajustes">
          <ul>
            {categories.map((category) => (
              <li key={category.id}>
                <a
                  href={`#${category.id}`}
                  aria-current={active === category.id ? 'page' : undefined}
                  onClick={(event) => {
                    event.preventDefault();
                    navigate({ hash: category.id }, { replace: true });
                  }}
                >
                  <Icon name={category.icon} size={18} />
                  <span className="settings-nav__text">
                    <span>{category.label}</span>
                    <span className="settings-nav__hint">{category.hint}</span>
                  </span>
                  {dirtyCategories.has(category.id) ? (
                    <span className="settings-nav__dirty" title="Cambios sin guardar">
                      <span className="sr-only">(cambios sin guardar)</span>
                    </span>
                  ) : null}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <motion.div
          key={active}
          className="settings__panels"
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.16 }}
        >
          <RegionalSettings
            value={profile}
            baseline={baseline}
            hidden={active !== 'regional'}
            showErrors={showErrors}
            onChange={(next) => {
              setProfile(next);
              edited();
            }}
            disabled={saving}
          />
          <WorkdaySettings
            value={schedule}
            baseline={scheduleBaseline}
            hidden={active !== 'jornada'}
            onChange={(next) => {
              setSchedule(next);
              edited();
            }}
            minimumDate={minimumDate}
            dirty={scheduleDirty}
            disabled={saving}
            data={data}
          />
          <RoundingSettings
            interval={profile.intervaloRedondeo}
            baseline={baseline.intervaloRedondeo}
            hidden={active !== 'redondeo'}
            onChange={(intervaloRedondeo) => {
              setProfile((current) => ({ ...current, intervaloRedondeo }));
              edited();
            }}
            disabled={saving}
          />
          <OdooSettings disabled={saving} hidden={active !== 'odoo'} />
          <SecuritySettings disabled={saving} hidden={active !== 'seguridad'} />
        </motion.div>
      </div>
      <AnimatePresence>
        {barVisible ? (
          <motion.div
            className={`save-bar save-bar--${saving ? 'saving' : state.kind === 'idle' ? 'dirty' : state.kind}`}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="save-bar__status" role="status" aria-live="polite">
              {saving ? (
                <>
                  <Icon name="loader" className="spin" />
                  <span>Guardando cambios…</span>
                </>
              ) : state.kind === 'error' ? (
                <>
                  <Icon name="alert" />
                  <span>
                    <strong>No se han guardado los cambios.</strong> {state.message}
                  </span>
                </>
              ) : state.kind === 'saved' || state.kind === 'discarded' ? (
                <>
                  <Icon name={state.kind === 'saved' ? 'success' : 'undo'} />
                  <span>{state.message}</span>
                </>
              ) : (
                <>
                  <span className="save-bar__dot" aria-hidden="true" />
                  <span>
                    <strong>Cambios sin guardar</strong>
                    {pendingLabels.length ? ` en ${pendingLabels.join(', ')}` : ''}
                  </span>
                </>
              )}
            </div>
            {dirty || saving ? (
              <div className="save-bar__actions">
                <Button variant="ghost" icon="undo" disabled={saving} onClick={reset}>
                  Descartar
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  icon="check"
                  loading={saving}
                  disabled={saving}
                >
                  {saving ? 'Guardando…' : 'Guardar cambios'}
                </Button>
              </div>
            ) : null}
          </motion.div>
        ) : null}
      </AnimatePresence>
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
