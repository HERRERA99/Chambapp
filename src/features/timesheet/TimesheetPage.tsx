import { useState } from 'react';
import type { CSSProperties } from 'react';
import { DateTime } from 'luxon';
import type { TimeEntry, WorkspaceData } from '../../domain/models';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../auth/useAuth';
import { formatDuration, mondayForDate, todayInZone } from '../../domain/time';
import { Button, IconButton } from '../../shared/ui/Button';
import { Icon } from '../../shared/ui/Icon';
import { Notice } from '../../shared/ui/Panel';
import { useFeedback } from '../../shared/feedback/FeedbackContext';
import { useWorkspace } from '../workspace/useWorkspace';
import { useCommand } from '../workspace/useCommand';
import { useTracker } from '../tracker/useTracker';
import {
  applyImputationResult,
  buildOdooRequest,
  buildTimesheetWeek,
  odooDescriptionChoices,
} from './timesheet.model';
import { ConfirmDialog } from '../../shared/ui/ConfirmDialog';
import { useExtension } from '../extension/useExtension';
import { LONG_ODOO_MINUTES } from '../extension/protocol';
import type { OdooRequest, QueueAction } from '../extension/protocol';
import type { ImputationResultEntry, TimesheetGroup, TimesheetItem } from './timesheet.model';
import { TimesheetGroups } from './components/TimesheetGroups';
import { TimesheetDayHeader } from './components/TimesheetDayHeader';
import { OdooDescriptionDialog } from './components/OdooDescriptionDialog';
import './timesheet.css';

function weekLabel(monday: string, lastDay: string) {
  const start = DateTime.fromISO(monday, { zone: 'UTC' }).setLocale('es');
  const end = DateTime.fromISO(lastDay, { zone: 'UTC' }).setLocale('es');
  return `Semana del ${start.toFormat(start.month === end.month ? 'd' : 'd LLL')} – ${end.toFormat('d LLL yyyy')}`;
}

export default function TimesheetPage() {
  const { data, isLoading, error, reload } = useWorkspace();
  const { run, pending } = useCommand();
  const tracker = useTracker();
  const notify = useFeedback();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [selectedMonday, setSelectedMonday] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');
  const [longSend, setLongSend] = useState<{ group: TimesheetGroup; request: OdooRequest } | null>(
    null,
  );
  const [describe, setDescribe] = useState<{
    key: string;
    group: TimesheetGroup;
    entries: TimeEntry[];
    request: OdooRequest;
    choices: string[];
  } | null>(null);
  const extension = useExtension();
  const zone = data?.profile.zona_horaria ?? 'Europe/Madrid';
  const today = todayInZone(zone);
  const currentMonday = mondayForDate(today);
  const monday = selectedMonday ?? currentMonday;
  const week = buildTimesheetWeek({
    entries: data?.entries ?? [],
    tasks: data?.tasks ?? [],
    monday,
  });
  const busy = pending || tracker.busy || tracker.pending;
  const lastDay = week.days.at(-1)?.date ?? monday;
  const timelineCount = week.days.reduce((total, day) => total + day.items.length, 0);

  function moveWeek(weeks: number) {
    setSelectedMonday(DateTime.fromISO(monday, { zone: 'UTC' }).plus({ weeks }).toISODate()!);
  }

  /** Keeps the confirmed result even if the follow-up refresh fails (newer versions win). */
  function applyResult(partes: ImputationResultEntry[]) {
    if (!user) return;
    queryClient.setQueryData<WorkspaceData>(['workspace', user.id], (current) =>
      current ? { ...current, entries: applyImputationResult(current.entries, partes) } : current,
    );
  }

  async function impute(group: TimesheetGroup, entries: TimeEntry[]) {
    if (busy || !entries.length) return false;
    setActionError('');
    try {
      const saved = await run<{ partes: ImputationResultEntry[] }>('imputar_partes', {
        partes: entries.map((entry) => ({ id: entry.id, version: entry.version })),
      });
      applyResult(saved.partes);
      notify(
        entries.length === 1
          ? `Parte de ${group.title} marcado como imputado en Odoo.`
          : `${entries.length} partes de ${group.title} marcados como imputados juntos en Odoo.`,
      );
      return true;
    } catch (cause) {
      setActionError(
        cause instanceof Error ? cause.message : 'No se pudo guardar la imputación en Odoo.',
      );
      return false;
    }
  }

  async function undo(group: TimesheetGroup, imputationId: string) {
    if (busy) return;
    setActionError('');
    try {
      const saved = await run<{ partes: ImputationResultEntry[] }>('deshacer_imputacion', {
        id: imputationId,
      });
      applyResult(saved.partes);
      notify(`Imputación de ${group.title} deshecha: sus partes vuelven a estar pendientes.`);
    } catch (cause) {
      setActionError(
        cause instanceof Error ? cause.message : 'No se pudo deshacer la imputación en Odoo.',
      );
    }
  }

  async function dispatch(group: TimesheetGroup, request: OdooRequest) {
    const result = await extension.send(request);
    if (!result.ok) {
      setActionError(result.error);
      return false;
    }
    notify(
      result.error ||
        `Enviando ${request.horasFormato} de ${group.title} a Odoo. Puedes seguir trabajando.`,
    );
    return true;
  }

  function build(group: TimesheetGroup, entries: TimeEntry[], descripcion?: string) {
    return buildOdooRequest({
      group,
      entries,
      task: data?.tasks.find((task) => task.id === group.taskId),
      userId: user!.id,
      requestId: crypto.randomUUID(),
      descripcion,
    });
  }

  /** Sends a built line, asking first when it is longer than 5 hours. */
  function sendBuilt(group: TimesheetGroup, request: OdooRequest) {
    if (request.minutos > LONG_ODOO_MINUTES) {
      setLongSend({ group, request });
      return Promise.resolve(false);
    }
    return dispatch(group, request);
  }

  /**
   * Builds the Odoo line (rounded on the sum, then to whole minutes) and hands it over.
   * When the entries have several descriptions, or none, the user picks or writes one.
   */
  async function send(group: TimesheetGroup, entries: TimeEntry[]) {
    if (busy || !user) return false;
    setActionError('');
    const built = build(group, entries);
    if ('problem' in built) {
      setActionError(built.problem);
      return false;
    }
    const choices = odooDescriptionChoices(entries);
    if (choices.length !== 1) {
      setDescribe({
        key: built.request.requestId,
        group,
        entries,
        request: built.request,
        choices,
      });
      return false;
    }
    return sendBuilt(group, built.request);
  }

  async function queueAction(group: TimesheetGroup, requestId: string, action: QueueAction) {
    setActionError('');
    const result = await extension.act(requestId, action);
    if (!result.ok) setActionError(result.error);
    else if (action === 'confirm-created')
      notify(`Marcando como imputados los partes de ${group.title}…`);
  }

  return (
    <div className="timesheet">
      {describe ? (
        <OdooDescriptionDialog
          key={describe.key}
          open
          title="Descripción del parte en Odoo"
          detail={`${describe.group.title} · ${describe.request.fecha} · ${describe.request.horasFormato}`}
          choices={describe.choices}
          fallback={describe.request.descripcion}
          onClose={() => setDescribe(null)}
          onConfirm={async (descripcion) => {
            if (!user) return 'Inicia sesión para enviar a Odoo.';
            const built = build(describe.group, describe.entries, descripcion);
            if ('problem' in built) return built.problem;
            if (built.request.minutos > LONG_ODOO_MINUTES) {
              setLongSend({ group: describe.group, request: built.request });
              return null;
            }
            setActionError('');
            const result = await extension.send(built.request);
            if (!result.ok) return result.error;
            notify(
              result.error ||
                `Enviando ${built.request.horasFormato} de ${describe.group.title} a Odoo. Puedes seguir trabajando.`,
            );
            return null;
          }}
        />
      ) : null}
      <ConfirmDialog
        open={!!longSend}
        title="Imputar más de 5 horas"
        description={
          longSend
            ? `Vas a imputar ${longSend.request.horasFormato} en Odoo para ${longSend.group.title} (${longSend.request.fecha}). ¿Continuar?`
            : ''
        }
        confirmLabel="Enviar a Odoo"
        onClose={() => setLongSend(null)}
        onConfirm={async () => {
          if (!longSend) return;
          const ok = await dispatch(longSend.group, { ...longSend.request, confirmLong: true });
          if (!ok) throw new Error('No se pudo enviar a Odoo.');
        }}
      />
      <header className="timesheet__toolbar">
        <div>
          <p className="eyebrow">Parte semanal</p>
          <h1 className="timesheet__title">{weekLabel(monday, lastDay)}</h1>
        </div>
        <span className="timesheet__total mono" aria-label="Total imputable de la semana">
          {formatDuration(week.loggedSeconds)}
        </span>
        <div className="timesheet__nav">
          <IconButton icon="left" label="Semana anterior" onClick={() => moveWeek(-1)} />
          <Button
            variant="ghost"
            disabled={monday === currentMonday}
            onClick={() => setSelectedMonday(null)}
          >
            Hoy
          </Button>
          <IconButton icon="right" label="Semana siguiente" onClick={() => moveWeek(1)} />
        </div>
      </header>
      {error ? (
        <Notice title="No se pudieron cargar los partes">
          <p role="alert">{error.message}</p>
          <Button onClick={() => void reload()}>Reintentar</Button>
        </Notice>
      ) : null}
      {actionError ? (
        <p role="alert" className="form-error">
          {actionError}
        </p>
      ) : null}
      {isLoading && !data ? (
        <p role="status">Cargando partes…</p>
      ) : (
        <>
          <TimesheetGroups
            days={week.days}
            today={today}
            busy={busy}
            onImpute={impute}
            onUndo={undo}
            onSend={send}
            onQueueAction={queueAction}
          />
          <section className="timesheet__section" aria-labelledby="timesheet-timeline-title">
            <header className="timesheet__section-header">
              <h2 id="timesheet-timeline-title">Timeline</h2>
              <span className="dim">
                {timelineCount} {timelineCount === 1 ? 'parte' : 'partes'}
              </span>
            </header>
            <div
              className="timesheet__grid"
              style={{ '--timesheet-days': week.days.length } as CSSProperties}
            >
              {week.days.map((day) => (
                <section
                  key={day.date}
                  className={`timesheet__day ${day.date === today ? 'timesheet__day--today' : ''}`}
                  aria-labelledby={`timesheet-${day.date}`}
                >
                  <TimesheetDayHeader
                    id={`timesheet-${day.date}`}
                    date={day.date}
                    seconds={day.items.reduce((total, item) => total + (item.realSeconds ?? 0), 0)}
                    totalLabel="Tiempo real del día"
                  />
                  <ul className="timesheet__items">
                    {day.items.length ? (
                      day.items.map((item) => <TimesheetRow key={item.entry.id} item={item} />)
                    ) : (
                      <li className="timesheet__empty dim">—</li>
                    )}
                  </ul>
                </section>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function TimesheetRow({ item }: { item: TimesheetItem }) {
  const { entry } = item;
  const imputed = entry.imputado_en_odoo;
  const open = !entry.fin_en;
  const status = open ? 'En curso' : imputed ? 'Imputado en Odoo' : 'Pendiente de imputar en Odoo';
  return (
    <li
      className={`timesheet__item ${imputed ? 'timesheet__item--imputed' : ''} ${open ? 'timesheet__item--open' : ''}`}
    >
      <div className="timesheet__item-head">
        {item.odooUrl ? (
          <a
            className="timesheet__item-title timesheet__item-title--link"
            href={item.odooUrl}
            target="_blank"
            rel="noopener noreferrer"
            title="Abrir en Odoo"
          >
            {item.title}
            <Icon name="external" size={11} />
          </a>
        ) : (
          <strong className="timesheet__item-title">{item.title}</strong>
        )}
        {item.odooId ? (
          <span className="timesheet__odoo-id mono" title={item.odooId}>
            {item.odooId}
          </span>
        ) : null}
      </div>
      <div className="timesheet__item-meta">
        <span className="mono dim">{item.range}</span>
        <strong className="mono timesheet__logged" title="Tiempo real">
          {item.realSeconds === null ? '—' : formatDuration(item.realSeconds)}
        </strong>
      </div>
      <div className="timesheet__item-actions">
        <span
          className={`timesheet__item-status ${imputed ? 'timesheet__item-status--imputed' : ''}`}
          role="img"
          aria-label={status}
          title={status}
        >
          <Icon name={open ? 'timer' : imputed ? 'check' : 'clock'} size={13} />
        </span>
      </div>
    </li>
  );
}
