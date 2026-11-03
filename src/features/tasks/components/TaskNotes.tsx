import { Link } from 'react-router-dom';
import type { Note } from '../../../domain/models';
import { Icon } from '../../../shared/ui/Icon';

/** Notes linked to a task; each opens in Notes (`/notas?nota=<id>`). */
export function TaskNotes({ taskId, notes }: { taskId: string; notes: readonly Note[] }) {
  const linked = notes
    .filter((note) => note.tarea_ids.includes(taskId))
    .sort((a, b) => b.actualizado_en.localeCompare(a.actualizado_en));
  return (
    <section className="task-notes" aria-labelledby={`task-notes-${taskId}`}>
      <h3 id={`task-notes-${taskId}`}>
        Notas asociadas <span className="dim">· {linked.length}</span>
      </h3>
      {linked.length ? (
        <ul>
          {linked.map((note) => (
            <li key={note.id}>
              <Link className="task-notes__note" to={`/notas?nota=${encodeURIComponent(note.id)}`}>
                <Icon name="file" size={15} />
                <span className="task-notes__text">
                  <strong>{note.titulo || 'Sin título'}</strong>
                  <span className="dim">
                    {note.contenido_md.trim().split('\n')[0]?.slice(0, 120) || 'Sin contenido'}
                  </span>
                </span>
                <time className="mono dim" dateTime={note.actualizado_en}>
                  {new Date(note.actualizado_en).toLocaleDateString('es', {
                    day: 'numeric',
                    month: 'short',
                  })}
                </time>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="dim">Esta tarea no tiene notas asociadas.</p>
      )}
    </section>
  );
}
