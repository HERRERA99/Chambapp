import { OdooEntryStatus } from '../time-entries/components/OdooEntryStatus';
import { StartTimerButton } from './StartTimerButton';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge } from '../../shared/ui/Panel';
import { Button, IconButton } from '../../shared/ui/Button';
import { useFeedback } from '../../shared/feedback/FeedbackContext';
import { useTracker } from './useTracker';
import { useWorkspace } from '../workspace/useWorkspace';
import { formatClock } from '../../domain/time';
import { readableError } from '../../lib/supabase/errors';

function LiveTimer({ compact }: { compact: boolean }) {
  const tracker = useTracker();
  const { data } = useWorkspace();
  const notify = useFeedback();
  const task = data?.tasks.find(
    (item) => item.id === (tracker.active?.tarea_id ?? tracker.pausedTaskId),
  );
  async function action(work: () => Promise<void>) {
    try {
      await work();
    } catch (cause) {
      notify(readableError(cause), 'error');
    }
  }
  if (!tracker.active && !tracker.pausedTaskId && !tracker.pending)
    return (
      <div className="actions">
        <Link className="text-link" to="/tareas">
          Iniciar cronómetro
        </Link>
        <StartTimerButton />
      </div>
    );
  const disabled = tracker.busy || tracker.pending;
  return (
    <div className={`timer-display ${compact ? 'timer-display--compact' : ''}`}>
      <div className="timer-display__context">
        <span className="eyebrow">
          {tracker.pending
            ? 'Confirmación pendiente'
            : tracker.active
              ? 'Registro activo'
              : 'Pausado'}
        </span>
        <strong>{task?.titulo ?? 'Tarea'}</strong>
        {tracker.active ? <OdooEntryStatus entry={tracker.active} /> : null}
      </div>
      <div className="timer-display__clock">
        <span className="eyebrow">{compact ? null : 'Duración de sesión'}</span>
        <span className="timer-digits">{formatClock(tracker.elapsedSeconds)}</span>
      </div>
      <div className="timer-display__controls">
        {tracker.pending ? (
          <Button
            icon="activity"
            disabled={tracker.busy}
            onClick={() => void action(tracker.retryPending)}
          >
            Reintentar
          </Button>
        ) : tracker.active ? (
          <>
            {compact ? (
              <IconButton
                icon="pause"
                label="Pausar cronómetro"
                disabled={disabled}
                onClick={() => void action(tracker.pause)}
              />
            ) : (
              <Button icon="pause" disabled={disabled} onClick={() => void action(tracker.pause)}>
                Pausar
              </Button>
            )}
            <Button
              variant="primary"
              icon={compact ? undefined : 'stop'}
              disabled={disabled}
              onClick={() => void action(tracker.stop)}
            >
              {tracker.busy ? 'Guardando…' : compact ? 'Detener' : 'Detener y guardar parte'}
            </Button>
          </>
        ) : (
          <>
            <StartTimerButton taskId={tracker.pausedTaskId ?? undefined} />
            <Button
              icon="play"
              variant="primary"
              disabled={disabled}
              onClick={() => void action(tracker.resume)}
            >
              Reanudar
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

function PreviewTimer() {
  const [paused, setPaused] = useState(false);
  const notify = useFeedback();
  return (
    <div className="timer-display">
      <div className="timer-display__context">
        <Badge tone="accent">{paused ? 'Pausado · Ejemplo' : 'En curso · Ejemplo'}</Badge>
      </div>
      <div className="timer-display__clock">
        <span className="eyebrow">Duración de sesión</span>
        <span className="timer-digits">02:44:19</span>
      </div>
      <div className="timer-display__controls">
        <Button icon={paused ? 'play' : 'pause'} onClick={() => setPaused((value) => !value)}>
          {paused ? 'Reanudar' : 'Pausar'}
        </Button>
        <Button
          variant="primary"
          icon="stop"
          onClick={() =>
            notify('Este cronómetro es un ejemplo. Accede a tu cuenta para registrar tiempo.')
          }
        >
          Detener y guardar parte
        </Button>
      </div>
    </div>
  );
}

export function TimerDisplay({
  compact = false,
  preview = false,
}: {
  compact?: boolean;
  preview?: boolean;
}) {
  return preview ? <PreviewTimer /> : <LiveTimer compact={compact} />;
}
