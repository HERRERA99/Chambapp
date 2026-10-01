import { useState } from 'react';
import type { FormEvent } from 'react';
import { DateTime } from 'luxon';
import { PageHeader } from '../../shared/ui/PageHeader';
import { Button } from '../../shared/ui/Button';
import { Panel, Notice } from '../../shared/ui/Panel';
import { useWorkspace } from '../workspace/useWorkspace';
import { useCommand } from '../workspace/useCommand';
import { WorkdaySettings } from './components/WorkdaySettings';
import { RoundingSettings } from './components/RoundingSettings';
import { RegionalSettings } from './components/RegionalSettings';
import { SecuritySettings } from './components/SecuritySettings';
import { initialSchedule, minimumScheduleMonday, profileDraft } from './settingsDraft';
import type { Profile, WorkspaceData } from '../../domain/models';

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
        setError('Define al menos un día laborable. Cada día puede tener entre 0 y 1440 minutos.');
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
    <form className="page-stack" onSubmit={submit} aria-busy={saving}>
      <PageHeader
        eyebrow="Operaciones / Sistema & Cuenta / Preferencias globales"
        title="Ajustes y Preferencias"
        description="Tu perfil, jornada laboral, redondeo y zona horaria."
        actions={
          <>
            <Button icon="left" disabled={saving || (!dirty && !changedElsewhere)} onClick={reset}>
              {changedElsewhere ? 'Cargar valores actuales' : 'Descartar cambios'}
            </Button>
            <Button type="submit" variant="primary" icon="check" disabled={saving || !dirty}>
              {saving ? 'Guardando…' : 'Guardar cambios'}
            </Button>
          </>
        }
      />
      <nav className="section-nav" aria-label="Secciones de ajustes">
        {[
          { id: 'jornada', label: 'Jornada semanal' },
          { id: 'redondeo', label: 'Redondeo de duración' },
          { id: 'regional', label: 'Perfil y zona horaria' },
          { id: 'seguridad', label: 'Seguridad' },
        ].map((section) => (
          <a key={section.id} href={`#${section.id}`}>
            {section.label}
          </a>
        ))}
      </nav>
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
      <RoundingSettings
        interval={profile.intervaloRedondeo}
        onChange={(intervaloRedondeo) => {
          setProfile((current) => ({ ...current, intervaloRedondeo }));
          setMessage(null);
        }}
        disabled={saving}
      />
      <RegionalSettings
        value={profile}
        onChange={(next) => {
          setProfile(next);
          setMessage(null);
        }}
        disabled={saving}
      />
      <SecuritySettings disabled={saving} />
      <div className="settings-footer">
        <Notice title="El histórico se conserva" icon="shield">
          Las nuevas preferencias afectan a los registros y jornadas que se creen a partir de ahora.
        </Notice>
        <Button type="submit" variant="primary" icon="check" disabled={saving || !dirty}>
          {saving ? 'Guardando…' : 'Aplicar cambios'}
        </Button>
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
