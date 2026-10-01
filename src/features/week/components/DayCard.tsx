import type { TimeEntry } from '../../../domain/models';
import { formatClock, formatDuration, formatTime } from '../../../domain/time';
import { Badge, Progress } from '../../../shared/ui/Panel';
import { Button, IconButton } from '../../../shared/ui/Button';
import { describeBalance } from '../week.model';
import type { CalendarDay } from '../week.model';

type DayCardProps = {
  day: CalendarDay;
  canAdd: boolean;
  activeId?: string;
  elapsedSeconds: number;
  timerBusy: boolean;
  onAdd: () => void;
  onEdit: (entry: TimeEntry) => void;
  onEditGoal: () => void;
  onStop: () => void;
};

export function DayCard({
  day,
  canAdd,
  activeId,
  elapsedSeconds,
  timerBusy,
  onAdd,
  onEdit,
  onEditGoal,
  onStop,
}: DayCardProps) {
  const state = day.isToday ? 'active' : day.isFuture ? 'planned' : 'closed';
  const target = day.jornada ? day.targetSeconds : day.plannedTargetSeconds;
  const status = day.isToday ? 'Hoy' : day.isFuture ? 'Planificado' : 'Registrado';
  return (
    <section className={`day-card day-card--${state}`} aria-label={day.name}>
      <div className="day-card__heading">
        <div>
          <span className="eyebrow">{day.name}</span>
          <strong>{day.dayNumber}</strong>
        </div>
        <Badge tone={day.isToday ? 'accent' : 'neutral'}>
          {target === 0 && !day.blocks.length ? 'Descanso' : status}
        </Badge>
      </div>
      <div className="split-label week-day-target">
        <span className="mono muted">
          Obj: {formatDuration(target)}
          {!day.jornada && target > 0 ? ' · por generar' : ''}
        </span>
        {day.jornada ? (
          <IconButton
            icon="edit"
            label={`Editar objetivo del ${day.name} ${day.dayNumber}`}
            onClick={onEditGoal}
          />
        ) : null}
      </div>
      <p className="day-card__duration mono">{formatDuration(day.loggedSeconds)}</p>
      <Progress
        value={day.targetSeconds > 0 ? (day.loggedSeconds / day.targetSeconds) * 100 : 0}
        label={`Objetivo registrado del ${day.name}`}
        tone={day.isToday ? 'accent' : 'soft'}
      />
      <p className="day-card__balance">
        {day.jornada && day.targetSeconds > 0
          ? describeBalance(day.loggedSeconds - day.targetSeconds)
          : day.jornada
            ? 'Sin objetivo'
            : target > 0
              ? 'Jornada pendiente de generar'
              : 'Sin jornada configurada'}
      </p>
      <p className="mono dim week-day-real">Real: {formatDuration(day.realSeconds)}</p>
      <div className="day-blocks">
        {day.blocks.map(({ entry, task, project }) => (
          <article
            key={entry.id}
            className={`day-block ${entry.fin_en === null ? 'day-block--active' : ''}`}
          >
            <div className="split-label">
              <span className="eyebrow">{project?.nombre ?? 'Proyecto'}</span>
              <span className="mono">
                {entry.fin_en === null
                  ? 'En curso'
                  : formatDuration(entry.duracion_imputada_segundos ?? 0)}
              </span>
            </div>
            <h3>{task?.titulo ?? 'Tarea'}</h3>
            <span className="mono dim">
              {formatTime(entry.inicio_en, entry.zona_horaria)} –{' '}
              {entry.fin_en ? formatTime(entry.fin_en, entry.zona_horaria) : 'Ahora'}
            </span>
            {entry.fin_en === null ? (
              <>
                <p className="mono accent">
                  {entry.id === activeId ? formatClock(elapsedSeconds) : 'Sincronizando…'} ·
                  provisional
                </p>
                <Button
                  variant="ghost"
                  icon="stop"
                  onClick={onStop}
                  disabled={timerBusy || entry.id !== activeId}
                >
                  Detener
                </Button>
              </>
            ) : (
              <div className="week-block-footer">
                <span className="mono dim">
                  Real: {formatDuration(entry.duracion_real_segundos ?? 0)}
                </span>
                <IconButton
                  icon="edit"
                  label={`Editar parte de ${task?.titulo ?? 'tarea'}`}
                  onClick={() => onEdit(entry)}
                />
              </div>
            )}
          </article>
        ))}
        {!day.blocks.length ? (
          <p className="muted week-day-empty">Sin partes registrados.</p>
        ) : null}
      </div>
      <Button
        variant="ghost"
        icon="plus"
        className="full-width"
        onClick={onAdd}
        disabled={!canAdd || day.isFuture}
      >
        Añadir parte manual
      </Button>
    </section>
  );
}
