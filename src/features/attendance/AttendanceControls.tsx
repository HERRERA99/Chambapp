import { Button } from '../../shared/ui/Button';
import { Badge } from '../../shared/ui/Panel';
import { formatClock, formatTime } from '../../domain/time';
import { useWorkspace } from '../workspace/useWorkspace';
import { useAttendance } from './useAttendance';
import { ManualAttendanceButton } from './ManualAttendanceButton';
import './attendance.css';

export function AttendanceControls({ compact = false }: { compact?: boolean }) {
  const attendance = useAttendance();
  const { data, error } = useWorkspace();
  if (!data) return null;
  const zone = data.profile.zona_horaria;
  const disabled = attendance.busy || attendance.pending || !!error;
  return (
    <div className={`attendance-controls ${compact ? 'attendance-controls--compact' : ''}`}>
      <div className="attendance-controls__status">
        <Badge tone={attendance.active ? 'success' : 'neutral'}>
          {attendance.active ? (
            <>
              <span className="status-dot" /> Dentro
            </>
          ) : (
            'Fuera'
          )}
        </Badge>
        {attendance.active ? (
          <>
            <span
              className="mono attendance-controls__elapsed"
              aria-label="Tiempo desde la entrada"
            >
              {formatClock(attendance.elapsedSeconds)}
            </span>
            {!compact ? (
              <span className="muted">
                Entrada: {formatTime(attendance.active.inicio_en, zone)} · {zone}
              </span>
            ) : null}
          </>
        ) : !compact ? (
          <span className="muted">Fichaje de jornada independiente de las tareas.</span>
        ) : null}
      </div>
      <div className="actions">
        {attendance.pending ? (
          <Button
            variant="primary"
            disabled={attendance.busy}
            onClick={() => void attendance.retry().catch(() => undefined)}
          >
            {attendance.busy ? 'Confirmando…' : 'Reintentar fichaje'}
          </Button>
        ) : (
          <Button
            variant={attendance.active ? 'secondary' : 'primary'}
            icon={attendance.active ? 'logout' : 'play'}
            disabled={disabled}
            onClick={() =>
              void (attendance.active ? attendance.stop() : attendance.start()).catch(
                () => undefined,
              )
            }
          >
            {attendance.busy
              ? 'Guardando…'
              : attendance.active
                ? 'Fichar salida'
                : 'Fichar entrada'}
          </Button>
        )}
        {!compact ? <ManualAttendanceButton /> : null}
      </div>
      {!compact && attendance.pending ? (
        <p className="muted attendance-controls__message" role="status">
          Hay una operación pendiente de confirmar. Reintentar conserva el mismo fichaje.
        </p>
      ) : null}
      {!compact && attendance.error ? (
        <p className="form-error attendance-controls__message" role="alert">
          {attendance.error}
        </p>
      ) : null}
    </div>
  );
}
