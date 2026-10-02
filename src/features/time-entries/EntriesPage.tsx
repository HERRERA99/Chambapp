import { useState } from 'react';
import type { TimeEntry } from '../../domain/models';
import { formatDuration, formatTime } from '../../domain/time';
import { downloadCsv } from '../../lib/export';
import { PageHeader } from '../../shared/ui/PageHeader';
import { Button, ButtonLink } from '../../shared/ui/Button';
import { StatGrid } from '../../shared/ui/StatGrid';
import { Panel, Notice } from '../../shared/ui/Panel';
import { InputField, SelectField } from '../../shared/ui/FormField';
import { SegmentedControl } from '../../shared/ui/SegmentedControl';
import { ConfirmDialog } from '../../shared/ui/ConfirmDialog';
import { useFeedback } from '../../shared/feedback/FeedbackContext';
import { useWorkspace } from '../workspace/useWorkspace';
import { useCommand } from '../workspace/useCommand';
import { useTracker } from '../tracker/useTracker';
import { EntryModal } from './components/EntryModal';
import { EntriesTable } from './components/EntriesTable';
import { RoundingPreview } from './components/RoundingPreview';
import { entryTotals } from './entryTotals';

type StatusFilter = 'all' | 'live' | 'finished';
type OdooFilter = 'all' | 'pending' | 'imputed';

export default function EntriesPage() {
  const { data, isLoading, error, reload } = useWorkspace();
  const { run, pending } = useCommand();
  const tracker = useTracker();
  const notify = useFeedback();
  const [query, setQuery] = useState('');
  const [project, setProject] = useState('all');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [odooStatus, setOdooStatus] = useState<OdooFilter>('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [simulationInterval, setSimulationInterval] = useState<string | null>(null);
  const [modal, setModal] = useState<TimeEntry | 'new' | null>(null);
  const [deleting, setDeleting] = useState<TimeEntry | null>(null);
  const [actionError, setActionError] = useState('');
  const [pageIndex, setPageIndex] = useState(1);
  const projects = data?.projects.filter((item) => !item.eliminado_en) ?? [];
  const tasks = data?.tasks.filter((item) => !item.eliminado_en) ?? [];
  const entries = data?.entries.filter((item) => !item.eliminado_en) ?? [];
  const projectById = new Map(projects.map((item) => [item.id, item]));
  const taskById = new Map(tasks.map((item) => [item.id, item]));
  const visible = entries
    .filter(
      (entry) =>
        (project === 'all' || project === entry.proyecto_id) &&
        (status === 'all' || (status === 'finished') === !!entry.fin_en) &&
        (odooStatus === 'all' || (odooStatus === 'imputed') === entry.imputado_en_odoo) &&
        (!from || entry.fecha >= from) &&
        (!to || entry.fecha <= to) &&
        `${projectById.get(entry.proyecto_id)?.nombre ?? ''} ${taskById.get(entry.tarea_id)?.titulo ?? ''} ${taskById.get(entry.tarea_id)?.odoo_id ?? ''} ${entry.descripcion ?? ''}`
          .toLocaleLowerCase('es')
          .includes(query.toLocaleLowerCase('es')),
    )
    .sort((a, b) => b.inicio_en.localeCompare(a.inicio_en));
  const totals = entryTotals(visible);
  const pages = Math.max(1, Math.ceil(visible.length / 25));
  const page = Math.min(pageIndex, pages);
  const pageEntries = visible.slice((page - 1) * 25, page * 25);
  const liveCount = visible.filter((entry) => !entry.fin_en).length;
  const busy = pending || tracker.busy || tracker.pending;
  const canCreate = tasks.some(
    (task) =>
      !task.archivado_en && !projects.find((item) => item.id === task.proyecto_id)?.archivado_en,
  );
  const interval = simulationInterval ?? String(data?.profile.intervalo_redondeo_minutos ?? 15);

  async function stop() {
    setActionError('');
    try {
      await tracker.stop();
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : 'No se pudo detener el cronómetro.');
    }
  }

  async function remove() {
    if (!deleting) return;
    await run('eliminar_parte', { id: deleting.id, version: deleting.version });
    notify('Parte eliminado de los informes.');
    setDeleting(null);
  }

  async function updateOdoo(entry: TimeEntry, checked: boolean) {
    if (busy) return;
    setActionError('');
    try {
      await run('editar_parte', {
        id: entry.id,
        version: entry.version,
        imputado_en_odoo: checked,
      });
      notify(
        checked ? 'Parte marcado como imputado en Odoo.' : 'Parte marcado como pendiente en Odoo.',
      );
    } catch (cause) {
      setActionError(
        cause instanceof Error ? cause.message : 'No se pudo guardar la marca de Odoo.',
      );
    }
  }

  function exportEntries() {
    downloadCsv(
      'partes-de-horas.csv',
      [
        'Fecha jornada',
        'Zona horaria',
        'Proyecto',
        'Tarea',
        'ID de Odoo',
        'Enlace de Odoo',
        'Imputado en Odoo',
        'Inicio exacto (ISO)',
        'Fin exacto (ISO)',
        'Duración real (s)',
        'Duración imputada (s)',
        'Redondeo (min)',
        'Descripción',
      ],
      visible.map((entry) => [
        entry.fecha,
        entry.zona_horaria,
        projectById.get(entry.proyecto_id)?.nombre ?? '',
        taskById.get(entry.tarea_id)?.titulo ?? '',
        taskById.get(entry.tarea_id)?.odoo_id ?? '',
        taskById.get(entry.tarea_id)?.odoo_url ?? '',
        entry.imputado_en_odoo ? 'Sí' : 'No',
        entry.inicio_en,
        entry.fin_en,
        entry.duracion_real_segundos,
        entry.duracion_imputada_segundos,
        entry.intervalo_redondeo_minutos,
        entry.descripcion,
      ]),
    );
  }

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Operaciones / Registro temporal / Partes de horas"
        title="Registro & Partes de Horas"
        description="Consulta instantes exactos y compara el tiempo real con la duración imputada de cada parte."
        actions={
          <>
            <Button icon="download" onClick={exportEntries} disabled={!visible.length}>
              Exportar CSV
            </Button>
            <ButtonLink to="/ajustes#redondeo" icon="settings">
              Reglas de redondeo
            </ButtonLink>
            <Button
              variant="primary"
              icon="plus"
              disabled={!canCreate || busy}
              onClick={() => setModal('new')}
            >
              Nuevo parte manual
            </Button>
          </>
        }
      />
      {error ? (
        <Notice title="No se pudieron cargar los partes">
          <p role="alert">{error.message}</p>
          <Button onClick={() => void reload()}>Reintentar</Button>
        </Notice>
      ) : null}
      {actionError ? (
        <p role="alert" className="warning">
          {actionError}
        </p>
      ) : null}
      <StatGrid
        stats={[
          {
            label: 'Tiempo real',
            value: formatDuration(totals.real),
            detail: 'Partes finalizados con los filtros actuales',
            icon: 'timer',
          },
          {
            label: 'Tiempo imputado',
            value: formatDuration(totals.logged),
            detail: 'Redondeo histórico de cada sesión',
            icon: 'wallet',
            accent: true,
          },
          {
            label: 'Partes registrados',
            value: String(visible.length),
            detail: `${liveCount} en curso · ${totals.count} finalizados`,
            icon: 'tasks',
          },
          {
            label: 'Diferencial de cómputo',
            value: `+${formatDuration(totals.logged - totals.real)}`,
            detail: 'Diferencia entre duración real e imputada',
            icon: 'activity',
          },
        ]}
      />
      <Panel className="filters-panel">
        <div className="form-grid">
          <InputField
            label="Buscar en partes"
            placeholder="Buscar tarea, ID de Odoo, proyecto o nota…"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setPageIndex(1);
            }}
          />
          <SelectField
            label="Proyecto / Cliente"
            value={project}
            onChange={(event) => {
              setProject(event.target.value);
              setPageIndex(1);
            }}
          >
            <option value="all">Todos los proyectos</option>
            {projects.map((item) => (
              <option key={item.id} value={item.id}>
                {item.nombre}
                {item.archivado_en ? ' (archivado)' : ''}
              </option>
            ))}
          </SelectField>
          <SelectField
            label="Imputación en Odoo"
            value={odooStatus}
            onChange={(event) => {
              setOdooStatus(event.target.value as OdooFilter);
              setPageIndex(1);
            }}
          >
            <option value="all">Todos los partes</option>
            <option value="pending">Pendientes en Odoo</option>
            <option value="imputed">Imputados en Odoo</option>
          </SelectField>
          <InputField
            label="Desde"
            type="date"
            value={from}
            onChange={(event) => {
              setFrom(event.target.value);
              setPageIndex(1);
            }}
          />
          <InputField
            label="Hasta"
            type="date"
            min={from || undefined}
            value={to}
            onChange={(event) => {
              setTo(event.target.value);
              setPageIndex(1);
            }}
          />
        </div>
        <div className="toolbar toolbar--flat">
          <SegmentedControl<StatusFilter>
            label="Estado del parte"
            value={status}
            onChange={(value) => {
              setStatus(value);
              setPageIndex(1);
            }}
            options={[
              { value: 'all', label: 'Todos' },
              { value: 'live', label: 'En curso' },
              { value: 'finished', label: 'Finalizados' },
            ]}
          />
          <span className="field__hint">
            Las fechas siguen la jornada y la zona histórica de cada parte.
          </span>
        </div>
      </Panel>
      <Panel className="table-panel">
        {isLoading && !data ? (
          <p role="status">Cargando partes…</p>
        ) : (
          <EntriesTable
            entries={pageEntries}
            projects={projects}
            tasks={tasks}
            elapsedSeconds={tracker.elapsedSeconds}
            busy={busy}
            onStop={() => void stop()}
            onEdit={setModal}
            onDelete={setDeleting}
            onOdooChange={(entry, checked) => void updateOdoo(entry, checked)}
          />
        )}
        {!isLoading && !visible.length ? (
          <div className="empty-state">
            <h3>
              {entries.length
                ? 'No hay partes con estos filtros'
                : 'Todavía no has registrado horas'}
            </h3>
            <p className="muted">Inicia una tarea o añade un intervalo de trabajo manual.</p>
            {entries.length ? (
              <Button
                onClick={() => {
                  setQuery('');
                  setProject('all');
                  setStatus('all');
                  setOdooStatus('all');
                  setFrom('');
                  setTo('');
                }}
              >
                Limpiar filtros
              </Button>
            ) : null}
          </div>
        ) : null}
        <div className="table-footer">
          <span className="mono dim">
            {visible.length ? `${(page - 1) * 25 + 1}–${Math.min(page * 25, visible.length)}` : '0'}{' '}
            de {visible.length} partes filtrados · {entries.length} en total
          </span>
          <div className="actions">
            <Button disabled={page <= 1} onClick={() => setPageIndex(page - 1)}>
              Anterior
            </Button>
            <span className="mono dim">
              Página {page} de {pages}
            </span>
            <Button disabled={page >= pages} onClick={() => setPageIndex(page + 1)}>
              Siguiente
            </Button>
          </div>
        </div>
      </Panel>
      <Panel
        title="Redondeo de la duración total"
        icon="settings"
        action={
          <SegmentedControl
            label="Intervalo de simulación"
            value={interval}
            onChange={setSimulationInterval}
            options={[
              { value: '0', label: 'Exacto' },
              { value: '5', label: '5 min' },
              { value: '10', label: '10 min' },
              { value: '15', label: '15 min' },
              { value: '30', label: '30 min' },
              { value: '60', label: '60 min' },
            ]}
          />
        }
      >
        <RoundingPreview interval={interval} />
      </Panel>
      {modal ? (
        <EntryModal
          open
          entry={modal === 'new' ? undefined : modal}
          onClose={() => setModal(null)}
        />
      ) : null}
      <ConfirmDialog
        key={deleting?.id ?? 'closed'}
        open={deleting !== null}
        title="Eliminar parte de horas"
        description={
          deleting
            ? `Se eliminará la sesión del ${deleting.fecha}, de ${formatTime(deleting.inicio_en, deleting.zona_horaria)} a ${formatTime(deleting.fin_en ?? deleting.inicio_en, deleting.zona_horaria)}. Sus horas dejarán de aparecer en los informes.`
            : ''
        }
        danger
        busy={pending}
        confirmLabel="Eliminar parte"
        onClose={() => {
          if (!pending) setDeleting(null);
        }}
        onConfirm={remove}
      />
    </div>
  );
}
