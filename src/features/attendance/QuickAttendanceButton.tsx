import { useState } from 'react';
import type { Attendance } from '../../domain/models';
import { DateTime } from 'luxon';
import { Button } from '../../shared/ui/Button';
import { Modal } from '../../shared/ui/Modal';
import { readableError } from '../../lib/supabase/errors';
import { useWorkspace } from '../workspace/useWorkspace';
import { useAttendance } from './useAttendance';
import { AttendanceEditor } from './AttendanceEditor';

/** Header clock-in/out: one button that asks for "right now" or another time. */
export function QuickAttendanceButton({ disabled }: { disabled: boolean }) {
  const attendance = useAttendance();
  const { data } = useWorkspace();
  const [step, setStep] = useState<'closed' | 'choose' | 'other'>('closed');
  const [error, setError] = useState('');
  // Snapshot taken when the manual editor opens, so a later refresh cannot change
  // the record (and version) it saves against.
  const [editor, setEditor] = useState<{ mode: 'entry' } | { mode: 'exit'; record: Attendance }>({
    mode: 'entry',
  });
  if (!data) return null;
  const zone = data.profile.zona_horaria;
  const exit = !!attendance.active;
  const verb = exit ? 'Fichar salida' : 'Fichar entrada';
  const today = DateTime.fromISO(attendance.now, { zone }).toISODate()!;

  async function now() {
    setError('');
    try {
      await (exit ? attendance.stop() : attendance.start());
      setStep('closed');
    } catch (cause) {
      setError(readableError(cause));
    }
  }

  return (
    <>
      {attendance.pending && step === 'closed' ? (
        <Button
          variant="primary"
          disabled={attendance.busy}
          onClick={() => void attendance.retry().catch(() => undefined)}
        >
          {attendance.busy ? 'Confirmando…' : 'Reintentar fichaje'}
        </Button>
      ) : (
        <Button
          variant={exit ? 'secondary' : 'primary'}
          icon={exit ? 'logout' : 'play'}
          disabled={disabled || step !== 'closed'}
          onClick={() => {
            setError('');
            setStep('choose');
          }}
        >
          {attendance.busy ? 'Guardando…' : verb}
        </Button>
      )}
      {step === 'choose' ? (
        <Modal
          open
          title={verb}
          description={`¿A qué hora? Zona horaria ${zone}.`}
          onClose={() => {
            if (!attendance.busy) setStep('closed');
          }}
        >
          <div className="quick-attendance">
            <Button
              variant="primary"
              icon="clock"
              disabled={attendance.busy || attendance.pending}
              onClick={() => void now()}
            >
              {attendance.busy
                ? 'Guardando…'
                : `Ahora mismo (${DateTime.fromISO(attendance.now, { zone }).toFormat('HH:mm')})`}
            </Button>
            <Button
              icon="edit"
              disabled={attendance.busy}
              onClick={() => {
                setEditor(
                  attendance.active
                    ? { mode: 'exit', record: attendance.active }
                    : { mode: 'entry' },
                );
                setStep('other');
              }}
            >
              Otra hora…
            </Button>
          </div>
          {error ? (
            <p role="alert" className="form-error">
              {error}
            </p>
          ) : null}
        </Modal>
      ) : null}
      {step === 'other' ? (
        <AttendanceEditor
          data={data}
          mode={editor.mode}
          record={editor.mode === 'exit' ? editor.record : undefined}
          date={today}
          onClose={() => setStep('closed')}
        />
      ) : null}
    </>
  );
}
