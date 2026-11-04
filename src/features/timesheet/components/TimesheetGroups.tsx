import { useId, useState } from 'react';
import type { CSSProperties } from 'react';
import type { TimeEntry } from '../../../domain/models';
import { formatDuration } from '../../../domain/time';
import { Button } from '../../../shared/ui/Button';
import { Icon } from '../../../shared/ui/Icon';
import type { IconName } from '../../../shared/ui/Icon';
import { OdooSendButton } from '../../time-entries/components/OdooSendButton';
import {
  formatRange,
  groupRounding,
  maxImputationEntries,
  reconcileSelection,
} from '../timesheet.model';
import type { TimesheetDay, TimesheetGroup } from '../timesheet.model';
import { TimesheetDayHeader } from './TimesheetDayHeader';

type Actions = {
  busy: boolean;
  /** Marks the entries as imputed together; resolves true when saved. */
  onImpute: (group: TimesheetGroup, entries: TimeEntry[]) => Promise<boolean>;
  onUndo: (group: TimesheetGroup, imputationId: string) => Promise<void>;
};

const status: Record<TimesheetGroup['status'], { label: string; icon: IconName }> = {
  pending: { label: 'Pendiente de imputar', icon: 'clock' },
  partial: { label: 'Imputado en parte', icon: 'minus' },
  imputed: { label: 'Imputado', icon: 'check' },
};

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/** Secondary header text: pending and running are told apart; "all done" only when it is. */
function summary(days: TimesheetDay[]) {
  const groups = days.flatMap((day) => day.groups);
  const pending = groups.reduce((total, group) => total + group.pending.length, 0);
  const running = groups.reduce((total, group) => total + group.running.length, 0);
  if (!groups.length) return 'Sin partes esta semana';
  if (pending)
    return `${plural(pending, 'parte pendiente', 'partes pendientes')}${running ? ` · ${running} en curso` : ''}`;
  if (running) return `${running} en curso`;
  return groups.every((group) => group.status === 'imputed') ? 'Todo imputado' : '';
}

export function TimesheetGroups({
  days,
  today,
  ...actions
}: { days: TimesheetDay[]; today: string } & Actions) {
  const titleId = useId();
  return (
    <section className="timesheet__section" aria-labelledby={titleId}>
      <header className="timesheet__section-header">
        <h2 id={titleId}>Partes por tarea</h2>
        <span className="dim">{summary(days)}</span>
      </header>
      <div className="timesheet__grid" style={{ '--timesheet-days': days.length } as CSSProperties}>
        {days.map((day) => (
          <section
            key={day.date}
            className={`timesheet__day ${day.date === today ? 'timesheet__day--today' : ''}`}
            aria-labelledby={`timesheet-groups-${day.date}`}
          >
            <TimesheetDayHeader
              id={`timesheet-groups-${day.date}`}
              date={day.date}
              seconds={day.loggedSeconds}
              totalLabel="Total imputable del día"
            />
            <ul className="timesheet__items">
              {day.groups.length ? (
                day.groups.map((group) => <GroupCard key={group.key} group={group} {...actions} />)
              ) : (
                <li className="timesheet__empty dim">—</li>
              )}
            </ul>
          </section>
        ))}
      </div>
    </section>
  );
}

function GroupCard({ group, busy, onImpute, onUndo }: { group: TimesheetGroup } & Actions) {
  const detailId = useId();
  const [expanded, setExpanded] = useState(false);
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set());
  // Entries that stop being pending (imputed elsewhere, deleted) leave the selection for
  // good, so undoing an imputation never re-selects them silently.
  const pendingKey = group.pending.map((entry) => entry.id).join(',');
  const [seenPending, setSeenPending] = useState(pendingKey);
  if (seenPending !== pendingKey) {
    setSeenPending(pendingKey);
    setSelected((current) => reconcileSelection(current, group.pending));
  }
  const selection = group.pending.filter((entry) => selected.has(entry.id));
  const selectionRounding = groupRounding(selection);
  const tooMany = (entries: TimeEntry[]) => entries.length > maxImputationEntries;
  const count = group.entries.length;
  const state = status[group.status];
  const stateLabel = group.running.length ? `${state.label} · parte en curso` : state.label;

  function toggle(entry: TimeEntry, checked: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      if (checked) next.add(entry.id);
      else next.delete(entry.id);
      return next;
    });
  }

  async function impute(entries: TimeEntry[]) {
    if (busy || !entries.length || tooMany(entries)) return;
    if (await onImpute(group, entries)) setSelected(new Set());
  }

  const open = [...group.pending, ...group.running].sort((a, b) =>
    a.inicio_en.localeCompare(b.inicio_en),
  );

  return (
    <li
      className={`timesheet-group timesheet-group--${group.status} ${group.running.length ? 'timesheet-group--running' : ''}`}
    >
      <button
        type="button"
        className="timesheet-group__toggle"
        aria-expanded={expanded}
        aria-controls={detailId}
        onClick={() => setExpanded((value) => !value)}
      >
        <span className="timesheet__item-head">
          <span className="timesheet__item-title">{group.title}</span>
          {group.odooId ? (
            <span className="timesheet__odoo-id mono" title={group.odooId}>
              {group.odooId}
            </span>
          ) : null}
        </span>
        <span className="timesheet-group__count dim">{plural(count, 'parte', 'partes')}</span>
        <span className="timesheet-group__times">
          <span className="mono dim" title="Tiempo real">
            {formatDuration(group.realSeconds)}
          </span>
          <span className="timesheet-group__logged">
            <span className="dim" aria-hidden="true">
              →
            </span>{' '}
            <strong className="mono" title="Tiempo imputable (redondeado sobre la suma)">
              {formatDuration(group.loggedSeconds)}
            </strong>
          </span>
        </span>
        <span className="timesheet-group__state">
          <span
            className="timesheet-group__status"
            role="img"
            aria-label={stateLabel}
            title={stateLabel}
          >
            <Icon name={state.icon} size={13} />
            {group.running.length ? <Icon name="timer" size={13} /> : null}
          </span>
          <Icon name="chevron" size={13} className="timesheet-group__chevron" />
        </span>
      </button>
      {expanded ? (
        <div id={detailId} className="timesheet-group__detail">
          {group.odooUrl ? (
            <a
              className="timesheet-group__odoo-link"
              href={group.odooUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Icon name="external" size={12} />
              Abrir en Odoo
            </a>
          ) : null}
          {open.length ? (
            <ul className="timesheet-group__entries" aria-label="Partes pendientes">
              {open.map((entry) => {
                const range = formatRange(entry);
                const running = !entry.fin_en;
                return (
                  <li key={entry.id}>
                    <label
                      className={`timesheet-group__entry ${running ? 'timesheet-group__entry--running' : ''}`}
                      title={running ? 'Detén el parte para imputarlo.' : undefined}
                    >
                      <input
                        type="checkbox"
                        checked={!running && selected.has(entry.id)}
                        disabled={running || busy}
                        aria-label={`Seleccionar ${group.title}, ${range}`}
                        onChange={(event) => toggle(entry, event.target.checked)}
                      />
                      <span className="mono">{range}</span>
                      <span className="mono dim">
                        {running ? 'en curso' : formatDuration(entry.duracion_real_segundos ?? 0)}
                      </span>
                    </label>
                    {entry.descripcion ? (
                      <p className="timesheet-group__description dim" title={entry.descripcion}>
                        {entry.descripcion}
                      </p>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          ) : null}
          {group.imputations.map((imputation) => (
            <div key={imputation.id} className="timesheet-group__imputation">
              <span className="timesheet-group__imputation-title">
                <Icon name="check" size={12} />
                Imputado · {plural(imputation.entries.length, 'parte', 'partes')}
              </span>
              <span className="mono dim timesheet-group__ranges">
                {imputation.entries.map((entry) => formatRange(entry)).join(' · ')}
              </span>
              <span className="timesheet-group__imputation-row">
                <span className="mono timesheet-group__pair">
                  <span>{formatDuration(imputation.realSeconds)}</span> →{' '}
                  <strong>{formatDuration(imputation.loggedSeconds)}</strong>
                </span>
                <Button
                  variant="ghost"
                  className="timesheet-group__undo"
                  disabled={busy}
                  onClick={() => void onUndo(group, imputation.id)}
                >
                  Deshacer
                </Button>
              </span>
            </div>
          ))}
          {group.pending.length ? (
            <div className="timesheet-group__footer">
              <p className="timesheet-group__selection" aria-live="polite">
                {selection.length ? (
                  <>
                    {plural(selection.length, 'seleccionado', 'seleccionados')}:{' '}
                    <span className="mono">{formatDuration(selectionRounding.realSeconds)}</span> →{' '}
                    <strong className="mono">
                      {formatDuration(selectionRounding.loggedSeconds)}
                    </strong>
                  </>
                ) : (
                  <>
                    Pendiente:{' '}
                    <strong className="mono">{formatDuration(group.pendingLoggedSeconds)}</strong>
                  </>
                )}
              </p>
              {tooMany(group.pending) || tooMany(selection) ? (
                <p className="form-error">
                  Demasiados partes para imputarlos juntos (máx. {maxImputationEntries}).
                </p>
              ) : null}
              <div className="timesheet-group__actions">
                <Button
                  variant="secondary"
                  disabled={busy || !selection.length || tooMany(selection)}
                  onClick={() => void impute(selection)}
                >
                  Marcar seleccionados
                </Button>
                <Button
                  variant="secondary"
                  icon="check"
                  disabled={busy || tooMany(group.pending)}
                  onClick={() => void impute(group.pending)}
                >
                  Marcar todos
                </Button>
                <OdooSendButton label={`partes seleccionados de ${group.title}`}>
                  Enviar seleccionados
                </OdooSendButton>
                <OdooSendButton label={`todos los partes pendientes de ${group.title}`}>
                  Enviar todos ({formatDuration(group.pendingLoggedSeconds)})
                </OdooSendButton>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}
