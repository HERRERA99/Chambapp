import { IconButton } from '../../../shared/ui/Button';
import './task-pagination.css';

export function TaskPagination({
  page,
  pages,
  total,
  pageSize,
  noun = 'tareas',
  onChange,
}: {
  page: number;
  pages: number;
  total: number;
  pageSize: number;
  /** Plural noun for the counter and labels, e.g. «notas». */
  noun?: string;
  onChange: (page: number) => void;
}) {
  return (
    <nav className="task-pagination" aria-label={`Paginación de ${noun}`}>
      <div className="task-pagination__controls">
        <IconButton
          icon="left"
          label={`Página anterior de ${noun}`}
          disabled={page === 1}
          onClick={() => onChange(page - 1)}
        />
        <span className="task-pagination__page" role="status" aria-live="polite">
          Página <strong>{page}</strong> de {pages}
        </span>
        <IconButton
          icon="right"
          label={`Página siguiente de ${noun}`}
          disabled={page === pages}
          onClick={() => onChange(page + 1)}
        />
      </div>
      <p className="task-pagination__count">
        {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} de {total} {noun}
      </p>
    </nav>
  );
}
