import { useMemo, useState } from 'react';
import { PageHeader } from '../../shared/ui/PageHeader';
import { Button } from '../../shared/ui/Button';
import { SegmentedControl } from '../../shared/ui/SegmentedControl';
import { SelectField } from '../../shared/ui/FormField';
import { useFeedback } from '../../shared/feedback/FeedbackContext';
import { compareJson, entries, parseJson, summary } from './json.model';
import type { Json } from './json.model';
import './developer.css';

const example =
  '{"proyecto":"Chambapp","activo":true,"usuarios":[{"nombre":"Ana","horas":8},{"nombre":"Luis","horas":6}],"notas":null}';
function Editor({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="dev-editor">
      <span className="eyebrow">{label}</span>
      <textarea
        spellCheck={false}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Pega aquí tu JSON…"
      />
    </label>
  );
}
export default function DeveloperPage() {
  const notify = useFeedback();
  const [tab, setTab] = useState<'view' | 'format' | 'compare'>('view');
  const [view, setView] = useState<'tree' | 'graph'>('tree');
  const [source, setSource] = useState(example);
  const [other, setOther] = useState('');
  const [indent, setIndent] = useState('2');
  const [closed, setClosed] = useState<Set<string>>(new Set());
  const [zoom, setZoom] = useState(1);
  const parsed = useMemo(() => {
    try {
      return { value: parseJson(source), error: '' };
    } catch (e) {
      return { value: null, error: (e as Error).message };
    }
  }, [source]);
  const comparison = useMemo(() => {
    if (tab !== 'compare') return { diff: [], error: '' };
    try {
      return { diff: compareJson(parseJson(source), parseJson(other)), error: '' };
    } catch (e) {
      return { diff: [], error: (e as Error).message };
    }
  }, [source, other, tab]);
  const output = parsed.error
    ? ''
    : JSON.stringify(parsed.value, null, indent === 'tab' ? '\t' : Number(indent));
  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      notify('Copiado.');
    } catch {
      notify('No se pudo copiar. Selecciona el texto para copiarlo.');
    }
  }
  function toggle(path: string) {
    setClosed((old) => {
      const next = new Set(old);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }
  function allPaths(value: Json, path = '$'): string[] {
    return [
      path,
      ...entries(value).flatMap(([key, v]) => allPaths(v, `${path}/${encodeURIComponent(key)}`)),
    ];
  }
  function tree(value: Json, path: string, label: string) {
    const children = entries(value);
    return (
      <li key={path}>
        <div className="dev-tree-row">
          {children.length ? (
            <button
              type="button"
              aria-expanded={!closed.has(path)}
              onClick={() => toggle(path)}
              aria-label={`${closed.has(path) ? 'Expandir' : 'Colapsar'} ${label}`}
            >
              {closed.has(path) ? '▸' : '▾'}
            </button>
          ) : (
            <span>·</span>
          )}
          <strong>{label}</strong>
          <code className={`dev-value dev-value--${value === null ? 'null' : typeof value}`}>
            {summary(value)}
          </code>
        </div>
        {children.length && !closed.has(path) ? (
          <ul>{children.map(([key, v]) => tree(v, `${path}/${encodeURIComponent(key)}`, key))}</ul>
        ) : null}
      </li>
    );
  }
  const graph = useMemo(() => {
    const nodes: {
      path: string;
      label: string;
      value: Json;
      x: number;
      y: number;
      parent: number;
    }[] = [];
    function visit(value: Json, path: string, label: string, depth: number, parent: number) {
      const index = nodes.length;
      nodes.push({ path, label, value, x: depth * 290 + 20, y: index * 82 + 20, parent });
      if (!closed.has(path))
        entries(value).forEach(([key, v]) =>
          visit(v, `${path}/${encodeURIComponent(key)}`, key, depth + 1, index),
        );
    }
    if (!parsed.error) visit(parsed.value, '$', 'raíz', 0, -1);
    return nodes;
  }, [parsed, closed]);
  return (
    <div className="page-stack dev-page">
      <PageHeader
        eyebrow="Herramientas / Desarrollo"
        title="Tu JSON, más claro."
        description="Explora estructuras, da formato y encuentra diferencias. Todo se procesa en tu navegador."
      />
      <SegmentedControl
        label="Utilidad JSON"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'view', label: 'Visualizar' },
          { value: 'format', label: 'Formatear' },
          { value: 'compare', label: 'Comparar' },
        ]}
      />
      <section className="panel dev-panel">
        <div className="dev-toolbar">
          <div>
            <h2>{tab === 'compare' ? 'Compara dos JSON' : 'Espacio de trabajo JSON'}</h2>
            <p className="muted">Hasta 500.000 caracteres · 5.000 elementos · 60 niveles</p>
          </div>
          <Button
            onClick={() => {
              setSource(example);
              setClosed(new Set());
            }}
          >
            Cargar ejemplo
          </Button>
          <Button
            onClick={() => {
              setSource('');
              setOther('');
              setClosed(new Set());
            }}
          >
            Limpiar
          </Button>
        </div>
        <div className="dev-columns">
          <Editor
            label={tab === 'compare' ? 'JSON original' : 'JSON de entrada'}
            value={source}
            onChange={(v) => {
              setSource(v);
              setClosed(new Set());
            }}
          />
          {tab === 'compare' ? (
            <Editor label="JSON nuevo" value={other} onChange={setOther} />
          ) : null}
        </div>
        {parsed.error ? (
          <p className="dev-error" role="alert">
            JSON de entrada: {parsed.error}
          </p>
        ) : (
          <p className="dev-valid">✓ JSON válido</p>
        )}
      </section>
      {tab === 'view' && !parsed.error ? (
        <section className="panel dev-panel">
          <div className="dev-toolbar">
            <SegmentedControl
              label="Vista JSON"
              value={view}
              onChange={setView}
              options={[
                { value: 'tree', label: 'Árbol' },
                { value: 'graph', label: 'Grafo' },
              ]}
            />
            <Button onClick={() => setClosed(new Set())}>Expandir todo</Button>
            <Button onClick={() => setClosed(new Set(allPaths(parsed.value)))}>
              Colapsar todo
            </Button>
            {view === 'graph' ? (
              <>
                <Button
                  aria-label="Reducir zoom"
                  onClick={() => setZoom((v) => Math.max(0.3, v - 0.1))}
                >
                  −
                </Button>
                <span>{Math.round(zoom * 100)} %</span>
                <Button
                  aria-label="Ampliar zoom"
                  onClick={() => setZoom((v) => Math.min(2, v + 0.1))}
                >
                  +
                </Button>
              </>
            ) : null}
          </div>
          {view === 'tree' ? (
            <ul className="dev-tree">{tree(parsed.value, '$', 'raíz')}</ul>
          ) : (
            <div
              className="dev-graph"
              tabIndex={0}
              role="region"
              aria-label="Grafo JSON; desplázate para explorar"
            >
              <svg
                width={(Math.max(0, ...graph.map((n) => n.x)) + 290) * zoom}
                height={(graph.length * 82 + 40) * zoom}
                role="group"
                aria-label="Conexiones entre los elementos JSON"
              >
                <g transform={`scale(${zoom})`}>
                  {graph
                    .filter((n) => n.parent >= 0)
                    .map((n) => {
                      const p = graph[n.parent]!;
                      return (
                        <path
                          key={n.path}
                          d={`M${p.x + 250},${p.y + 30} C${p.x + 270},${p.y + 30} ${n.x - 20},${n.y + 30} ${n.x},${n.y + 30}`}
                          fill="none"
                          stroke="var(--muted)"
                        />
                      );
                    })}
                  {graph.map((n) => (
                    <g key={n.path} transform={`translate(${n.x},${n.y})`}>
                      <rect
                        width="250"
                        height="60"
                        rx="8"
                        fill="var(--surface)"
                        stroke="var(--accent)"
                      />
                      <foreignObject width="250" height="60">
                        <button
                          className="dev-node"
                          title={`${n.label}: ${summary(n.value)}`}
                          onClick={() => toggle(n.path)}
                          aria-expanded={entries(n.value).length ? !closed.has(n.path) : undefined}
                        >
                          <strong>
                            {entries(n.value).length ? (closed.has(n.path) ? '▸ ' : '▾ ') : ''}
                            {n.label}
                          </strong>
                          <span>{summary(n.value)}</span>
                        </button>
                      </foreignObject>
                    </g>
                  ))}
                </g>
              </svg>
            </div>
          )}
        </section>
      ) : null}
      {tab === 'format' ? (
        <section className="panel dev-panel">
          <div className="dev-toolbar">
            <h2>JSON formateado</h2>
            <SelectField label="Sangría" value={indent} onChange={(e) => setIndent(e.target.value)}>
              <option value="2">2 espacios</option>
              <option value="4">4 espacios</option>
              <option value="tab">Tabulaciones</option>
              <option value="0">Compacto</option>
            </SelectField>
            <Button disabled={!!parsed.error} onClick={() => void copy(output)}>
              Copiar resultado
            </Button>
          </div>
          <pre className="dev-output">{output || 'El resultado aparecerá aquí.'}</pre>
        </section>
      ) : null}
      {tab === 'compare' ? (
        <section className="panel dev-panel">
          <h2>Resultado de la comparación</h2>
          <p className="muted">
            Ignora el orden de las claves. En las listas, compara por posición. Las rutas usan JSON
            Pointer.
          </p>
          {comparison.error ? (
            <p role="alert" className="dev-error">
              Revisa los JSON: {comparison.error}
            </p>
          ) : (
            <>
              <p role="status" className="dev-valid">
                {comparison.diff.length
                  ? `${comparison.diff.length} diferencias`
                  : 'Los JSON son equivalentes.'}
              </p>
              {comparison.diff.map((d) => (
                <article className="dev-diff" key={d.path}>
                  <strong>
                    {d.kind} <code>{d.path}</code>
                  </strong>
                  <div className="dev-columns">
                    <pre>
                      Antes:{' '}
                      {d.before === undefined ? 'No existe' : JSON.stringify(d.before, null, 2)}
                    </pre>
                    <pre>
                      Después:{' '}
                      {d.after === undefined ? 'No existe' : JSON.stringify(d.after, null, 2)}
                    </pre>
                  </div>
                </article>
              ))}
            </>
          )}
        </section>
      ) : null}
    </div>
  );
}
