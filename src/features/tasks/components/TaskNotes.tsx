import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../../../shared/ui/Icon';
import { Button } from '../../../shared/ui/Button';
import { useWorkspace } from '../../workspace/useWorkspace';
import { useNotes } from '../../notes/useNotes';
import { useVault } from '../../vault/useVault';
import { VaultUnlockCard } from '../../vault/VaultGate';

/** Notes linked to a task; each opens in Notes (`/notas?nota=<id>`). */
export function TaskNotes({ taskId }: { taskId: string }) {
  const { data } = useWorkspace();
  const vault = useVault();
  const decrypted = useNotes();
  const [unlocking, setUnlocking] = useState(false);
  // Links are not encrypted, so the count is known while the vault is locked.
  const count = (data?.notes ?? []).filter((note) => note.tarea_ids.includes(taskId)).length;
  const linked = decrypted.notes
    .filter((note) => note.tarea_ids.includes(taskId))
    .sort((a, b) => b.actualizado_en.localeCompare(a.actualizado_en));
  const locked = vault.status !== 'unlocked';
  return (
    <section className="task-notes" aria-labelledby={`task-notes-${taskId}`}>
      <h3 id={`task-notes-${taskId}`}>
        Notas asociadas <span className="dim">· {count}</span>
      </h3>
      {locked && count ? (
        unlocking && (vault.status === 'locked' || vault.status === 'missing') ? (
          <VaultUnlockCard purpose="Tus notas" compact />
        ) : (
          <p className="dim task-notes__locked">
            <Icon name="lock" size={15} />
            {count === 1 ? 'Una nota cifrada.' : `${count} notas cifradas.`}
            <Button variant="ghost" icon="unlock" onClick={() => setUnlocking(true)}>
              Desbloquear
            </Button>
          </p>
        )
      ) : linked.length ? (
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
      ) : count && !locked ? (
        <p className="dim">Descifrando notas…</p>
      ) : (
        <p className="dim">Esta tarea no tiene notas asociadas.</p>
      )}
    </section>
  );
}
