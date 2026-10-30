import { Link } from 'react-router-dom';
import { Button, IconButton } from '../../shared/ui/Button';
import { useFeedback } from '../../shared/feedback/FeedbackContext';
import { useTracker } from '../../features/tracker/useTracker';
import { useAttendance } from '../../features/attendance/useAttendance';
import { useWorkspace } from '../../features/workspace/useWorkspace';
import { formatClock } from '../../domain/time';
import { readableError } from '../../lib/supabase/errors';
import { paths } from '../paths';

/** Compact attendance and timer status shown on every page except Hoy, which has the full controls. */
export function HeaderStatus({ showAttendance = true }: { showAttendance?: boolean }) {
  const attendance = useAttendance();
  const tracker = useTracker();
  const notify = useFeedback();
  const { data, error } = useWorkspace();
  if (!data) return null;
  const task = data.tasks.find(
    (item) => item.id === (tracker.active?.tarea_id ?? tracker.pausedTaskId),
  );
  const attendanceDisabled = attendance.busy || attendance.pending || !!error;
  const timerDisabled = tracker.busy || tracker.pending;
  async function run(work: () => Promise<void>) {
    try {
      await work();
    } catch (cause) {
      notify(readableError(cause), 'error');
    }
  }
  return (
    <div className="header-status">
      {tracker.active || tracker.pausedTaskId || tracker.pending ? (
        <div className="status-pill">
          <span
            className={`status-dot ${tracker.active ? 'status-dot--live' : 'status-dot--paused'}`}
            aria-hidden="true"
          />
          <Link to={paths.dashboard} className="status-pill__text" title={task?.titulo}>
            <span className="status-pill__label">
              {tracker.pending ? 'Pendiente' : tracker.active ? 'Tarea' : 'Pausada'}
            </span>
            <span className="status-pill__task">{task?.titulo ?? 'Tarea'}</span>
            <span className="mono" aria-label="Duración de la sesión">
              {formatClock(tracker.elapsedSeconds)}
            </span>
          </Link>
          {tracker.pending ? (
            <Button
              size="sm"
              disabled={tracker.busy}
              onClick={() => void run(tracker.retryPending)}
            >
              Reintentar
            </Button>
          ) : tracker.active ? (
            <>
              <IconButton
                icon="pause"
                label="Pausar cronómetro"
                disabled={timerDisabled}
                onClick={() => void run(tracker.pause)}
              />
              <IconButton
                icon="stop"
                label="Detener y guardar parte"
                className="icon-button--danger"
                disabled={timerDisabled}
                onClick={() => void run(tracker.stop)}
              />
            </>
          ) : (
            <IconButton
              icon="play"
              label="Reanudar cronómetro"
              disabled={timerDisabled}
              onClick={() => void run(tracker.resume)}
            />
          )}
        </div>
      ) : null}
      {showAttendance ? (
        <div className="status-pill">
          <span
            className={`status-dot ${attendance.active ? 'status-dot--success' : 'status-dot--paused'}`}
            aria-hidden="true"
          />
          <span className="status-pill__text">
            <span className="status-pill__label">{attendance.active ? 'Dentro' : 'Fuera'}</span>
            {attendance.active ? (
              <span className="mono" aria-label="Tiempo desde la entrada">
                {formatClock(attendance.elapsedSeconds)}
              </span>
            ) : null}
          </span>
          {attendance.pending ? (
            <Button
              size="sm"
              disabled={attendance.busy}
              onClick={() => void attendance.retry().catch(() => undefined)}
            >
              {attendance.busy ? 'Confirmando…' : 'Reintentar fichaje'}
            </Button>
          ) : (
            <Button
              size="sm"
              icon={attendance.active ? 'logout' : 'login'}
              loading={attendance.busy}
              disabled={attendanceDisabled}
              onClick={() =>
                void (attendance.active ? attendance.stop() : attendance.start()).catch(
                  () => undefined,
                )
              }
            >
              {attendance.active ? 'Fichar salida' : 'Fichar entrada'}
            </Button>
          )}
        </div>
      ) : null}
    </div>
  );
}
