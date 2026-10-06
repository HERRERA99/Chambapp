import { useState } from 'react';
import { DateTime } from 'luxon';
import type { CalendarAbsence } from '../../domain/models';
import { absencesOn } from '../../domain/calendar';
import { PageHeader } from '../../shared/ui/PageHeader';
import { Badge, Notice, Panel } from '../../shared/ui/Panel';
import { Button, ButtonLink, IconButton } from '../../shared/ui/Button';
import { ConfirmDialog } from '../../shared/ui/ConfirmDialog';
import { useWorkspace } from '../workspace/useWorkspace';
import { useCommand } from '../workspace/useCommand';
import { AbsenceForm } from './AbsenceForm';
import { HolidaySync } from './HolidaySync';
import './calendar.css';

export default function CalendarPage() {
  const { data, isLoading, error, reload } = useWorkspace();
  const { run, pending } = useCommand();
  const today = DateTime.now()
    .setZone(data?.profile.zona_horaria ?? 'Europe/Madrid')
    .toISODate()!;
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const month = DateTime.fromISO(selectedMonth ?? today, { zone: 'UTC' })
    .startOf('month')
    .setLocale('es');
  const [form, setForm] = useState<{ date: string; absence?: CalendarAbsence } | null>(null);
  const [removing, setRemoving] = useState<CalendarAbsence | null>(null);
  const [syncOpen, setSyncOpen] = useState(false);
  const absences = data?.absences ?? [];
  const visible = absences.filter(
    (absence) =>
      absence.inicio <= month.endOf('month').toISODate()! && absence.fin >= month.toISODate()!,
  );
  const dates = Array.from({ length: month.daysInMonth! }, (_, index) =>
    month.plus({ days: index }).toISODate()!,
  );
  function moveMonth(offset: number) {
    setSelectedMonth(month.plus({ months: offset }).toISODate());
  }
  if (isLoading && !data) return <p role="status">Cargando calendario…</p>;
  if (!data)
    return (
      <Notice title="No se pudo cargar el calendario">
        {error?.message}
        <Button onClick={() => void reload()}>Reintentar</Button>
      </Notice>
    );
  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Planificación / Días libres"
        title="Festivos & Vacaciones"
        description="Excluye los días libres del objetivo semanal sin trasladar sus horas al resto de días."
        actions={
          <>
            <Button icon="globe" onClick={() => setSyncOpen(!syncOpen)}>
              {syncOpen ? 'Ocultar sincronización' : 'Sincronizar festivos'}
            </Button>
            <Button icon="plus" variant="primary" onClick={() => setForm({ date: today })}>
              Añadir día libre
            </Button>
          </>
        }
      />
      {error ? (
        <Notice title="No se pudieron actualizar los datos">
          {error.message}
          <Button onClick={() => void reload()}>Reintentar</Button>
        </Notice>
      ) : null}
      <Panel
        title={month.toFormat('LLLL yyyy')}
        icon="calendar"
        action={
          <div className="actions">
            <IconButton label="Mes anterior" icon="left" onClick={() => moveMonth(-1)} />
            <Button onClick={() => setSelectedMonth(null)}>Hoy</Button>
            <IconButton label="Mes siguiente" icon="right" onClick={() => moveMonth(1)} />
          </div>
        }
      >
        <div className="holiday-calendar">
          {['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map((label) => (
            <span className="eyebrow holiday-calendar__heading" key={label}>
              {label}
            </span>
          ))}
          {Array.from({ length: month.weekday - 1 }, (_, index) => (
            <div aria-hidden="true" key={`empty-${index}`} />
          ))}
          {dates.map((date) => {
            const events = absencesOn(absences, date);
            const vacation = events.some((item) => item.tipo === 'vacaciones');
            return (
              <button
                key={date}
                type="button"
                className={`holiday-calendar__day ${events.length ? (vacation ? 'holiday-calendar__day--vacation' : 'holiday-calendar__day--holiday') : ''}`}
                aria-current={date === today ? 'date' : undefined}
                aria-label={`${date}${events.length ? `: ${events.map((item) => item.titulo).join(', ')}` : ': añadir día libre'}`}
                onClick={() => setForm({ date })}
              >
                <strong>{Number(date.slice(-2))}</strong>
                {events.length ? <span>{vacation ? 'Vacaciones' : 'Festivo'}</span> : null}
              </button>
            );
          })}
        </div>
        <div className="actions holiday-calendar__legend">
          <Badge tone="accent">Festivo</Badge>
          <Badge tone="success">Vacaciones</Badge>
          <span className="muted">Selecciona un día para añadir un registro.</span>
        </div>
      </Panel>
      {syncOpen ? <HolidaySync key={month.year} year={month.year} /> : null}
      <Panel
        title="Días libres de este mes"
        action={<ButtonLink to="/mi-semana">Ver semana laboral</ButtonLink>}
      >
        {visible.length ? (
          <div className="absence-list">
            {visible.map((absence) => (
              <article key={absence.id}>
                <div>
                  <Badge tone={absence.tipo === 'vacaciones' ? 'success' : 'accent'}>
                    {absence.tipo === 'vacaciones' ? 'Vacaciones' : 'Festivo'}
                  </Badge>
                  <h3>{absence.titulo}</h3>
                  <p className="mono muted">
                    {absence.inicio}
                    {absence.fin !== absence.inicio ? ` — ${absence.fin}` : ''}
                  </p>
                  <p className="dim">
                    {absence.fuente === 'nager' ? `Nager · ${absence.ambito}` : 'Manual'}
                  </p>
                </div>
                <div className="actions">
                  <IconButton
                    icon="edit"
                    label={`Editar ${absence.titulo}`}
                    onClick={() => setForm({ date: absence.inicio, absence })}
                  />
                  <IconButton
                    icon="trash"
                    label={`Eliminar ${absence.titulo}`}
                    disabled={pending}
                    onClick={() => setRemoving(absence)}
                  />
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p className="muted empty-state">No hay festivos ni vacaciones registrados este mes.</p>
        )}
      </Panel>
      {form ? (
        <AbsenceForm key={form.absence?.id ?? form.date} {...form} onClose={() => setForm(null)} />
      ) : null}
      {removing ? (
        <ConfirmDialog
          open
          title="Eliminar día libre"
          description={`Se eliminará «${removing.titulo}». El objetivo original se restablecerá en los días que no tengan otro festivo o vacaciones.`}
          confirmLabel="Eliminar"
          danger
          busy={pending}
          onClose={() => setRemoving(null)}
          onConfirm={async () => {
            await run('eliminar_ausencia', { id: removing.id, version: removing.version });
          }}
        />
      ) : null}
    </div>
  );
}
