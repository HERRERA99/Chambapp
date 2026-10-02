import { useState } from 'react';
import { DateTime } from 'luxon';
import type { Attendance } from '../../domain/models';
import { Button } from '../../shared/ui/Button';
import { useWorkspace } from '../workspace/useWorkspace';
import { useAttendance } from './useAttendance';
import { AttendanceEditor } from './AttendanceEditor';

export function ManualAttendanceButton() {
  const attendance = useAttendance();
  const { data, error } = useWorkspace();
  const [editor, setEditor] = useState<
    { mode: 'entry' } | { mode: 'exit'; record: Attendance } | null
  >(null);
  if (!data) return null;
  const today = DateTime.fromISO(attendance.now, {
    zone: data.profile.zona_horaria,
  }).toISODate()!;

  return (
    <>
      <Button
        icon="edit"
        disabled={attendance.busy || attendance.pending || !!error}
        onClick={() =>
          setEditor(
            attendance.active ? { mode: 'exit', record: attendance.active } : { mode: 'entry' },
          )
        }
      >
        {attendance.active ? 'Salida manual' : 'Entrada manual'}
      </Button>
      {editor ? (
        <AttendanceEditor
          data={data}
          mode={editor.mode}
          record={editor.mode === 'exit' ? editor.record : undefined}
          date={today}
          onClose={() => setEditor(null)}
        />
      ) : null}
    </>
  );
}
