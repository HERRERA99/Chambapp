import { useState } from 'react';
import type { TimeEntry, WorkspaceData } from '../../domain/models';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../auth/useAuth';
import { useFeedback } from '../../shared/feedback/FeedbackContext';
import { useCommand } from '../workspace/useCommand';
import { useTracker } from '../tracker/useTracker';
import {
  applyImputationResult,
  buildOdooRequest,
  odooDescriptionChoices,
  planWeekOdooSend,
} from './timesheet.model';
import { ConfirmDialog } from '../../shared/ui/ConfirmDialog';
import { useExtension } from '../extension/useExtension';
import { lockedIds, LONG_ODOO_MINUTES } from '../extension/protocol';
import type { OdooRequest, QueueAction } from '../extension/protocol';
import type {
  ImputationResultEntry,
  TimesheetDay,
  TimesheetGroup,
  WeekOdooSendRow,
} from './timesheet.model';
import { OdooDescriptionDialog } from './components/OdooDescriptionDialog';
import { WeekOdooSendDialog } from './components/WeekOdooSendDialog';
import type { WeekOdooSendSelection } from './components/WeekOdooSendDialog';

export function useTimesheetOdoo(
  data: WorkspaceData | null,
  days: TimesheetDay[],
  weekLabel: string,
) {
  const { run, pending } = useCommand();
  const tracker = useTracker();
  const notify = useFeedback();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const extension = useExtension();
  const busy = pending || tracker.busy || tracker.pending;
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
  const [weekSendRows, setWeekSendRows] = useState<WeekOdooSendRow[] | null>(null);
  const [sendingWeek, setSendingWeek] = useState(false);
  const [weekBatchIds, setWeekBatchIds] = useState<string[]>([]);
  const locked = lockedIds(extension.queue);
  const weekPlan = planWeekOdooSend({
    days,
    tasks: data?.tasks ?? [],
    userId: user?.id ?? '',
    locked,
    nextId: () => '00000000-0000-4000-8000-000000000000',
    odooOrigin: extension.connected ? extension.odooOrigin : null,
  });
  const sendableRows = weekPlan.filter(
    (row) => row.exclusionReason === null && row.request !== null,
  );
  const sendableMinutes = sendableRows.reduce((sum, row) => sum + (row.request?.minutos ?? 0), 0);
  const batchQueueById = new Map(extension.queue.map((item) => [item.requestId, item]));
  const batchInFlight = weekBatchIds.filter((id) => {
    const status = batchQueueById.get(id)?.status;
    return status === 'pending' || status === 'processing';
  }).length;
  const batchDone = weekBatchIds.length - batchInFlight;
  const weekSendDisabledReason = !extension.available
    ? 'Instala la extensión de Chambapp para enviar a Odoo.'
    : !extension.connected
      ? 'Conecta la extensión con esta cuenta para enviar a Odoo.'
      : !extension.odooOrigin
        ? 'Configura tu Odoo en los ajustes de la extensión.'
        : busy || sendingWeek
          ? 'Espera a que terminen los cambios actuales.'
          : sendableRows.length === 0
            ? weekPlan.length > 0
              ? 'No hay partes enviables esta semana (revisa el estado de cada grupo).'
              : 'No hay partes pendientes esta semana.'
            : null;

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

  async function sendWeek(items: WeekOdooSendSelection[]) {
    if (!user || !items.length) return;
    setActionError('');
    setSendingWeek(true);
    const queuedIds: string[] = [];
    const errors: string[] = [];
    try {
      for (const item of items) {
        const built = buildOdooRequest({
          group: item.row.group,
          entries: item.row.group.pending,
          task: data?.tasks.find((task) => task.id === item.row.group.taskId),
          userId: user.id,
          requestId: crypto.randomUUID(),
          descripcion: item.descripcion,
          confirmLong: item.row.isLong,
        });
        if ('problem' in built) {
          errors.push(`${item.row.group.title}: ${built.problem}`);
          continue;
        }
        const result = await extension.send(built.request);
        if (result.ok) {
          queuedIds.push(built.request.requestId);
        } else {
          errors.push(result.error || `${item.row.group.title}: no se pudo enviar a Odoo.`);
        }
      }
    } finally {
      setSendingWeek(false);
    }
    if (queuedIds.length > 0) {
      setWeekBatchIds((prev) => {
        const stillInFlight = prev.filter((id) => {
          const status = batchQueueById.get(id)?.status;
          return status === 'pending' || status === 'processing';
        });
        return [...stillInFlight, ...queuedIds];
      });
    }
    setWeekSendRows(null);
    if (errors.length === 0) {
      notify(
        queuedIds.length === 1
          ? '1 línea en cola para Odoo'
          : `${queuedIds.length} líneas en cola para Odoo`,
      );
    } else if (queuedIds.length > 0) {
      notify(
        errors.length === 1
          ? `${queuedIds.length} en cola, 1 rechazada: ${errors[0]}`
          : `${queuedIds.length} en cola, ${errors.length} rechazadas: ${errors.join(' · ')}`,
      );
    } else {
      const message =
        errors.length === 1
          ? `No se pudo enviar a Odoo: ${errors[0]}`
          : `${errors.length} líneas rechazadas: ${errors.join(' · ')}`;
      setActionError(message);
      notify(message);
    }
  }

  const dialogs = (
    <>
      {weekSendRows ? (
        <WeekOdooSendDialog
          open
          weekLabel={weekLabel}
          rows={weekSendRows}
          onClose={() => setWeekSendRows(null)}
          onConfirm={sendWeek}
        />
      ) : null}
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
    </>
  );

  return {
    dialogs,
    actionError,
    groupActions: {
      busy,
      onImpute: impute,
      onUndo: undo,
      onSend: send,
      onQueueAction: queueAction,
    },
    weekSendDisabledReason,
    sendableMinutes,
    openWeekSend: () => setWeekSendRows(weekPlan),
    batchProgress: batchInFlight > 0 ? { done: batchDone, total: weekBatchIds.length } : null,
  };
}
