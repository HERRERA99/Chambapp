import { useState } from 'react';
import { Button } from '../../shared/ui/Button';
import { InputField } from '../../shared/ui/FormField';
import { Icon } from '../../shared/ui/Icon';
import { Badge } from '../../shared/ui/Panel';
import { useFeedback } from '../../shared/feedback/FeedbackContext';
import { generatePlainText } from './plainText';
import './developer-generators.css';

const tools = [
  {
    id: 'uuid',
    title: 'UUID v4',
    description: 'Identificadores únicos para tus pruebas y proyectos.',
    icon: 'dice',
  },
  {
    id: 'text',
    title: 'Texto plano',
    description: 'Contenido de ejemplo con una longitud exacta.',
    icon: 'file',
  },
] as const;

export function DeveloperGenerators() {
  const notify = useFeedback();
  const [tool, setTool] = useState<'uuid' | 'text'>('uuid');
  const [count, setCount] = useState('1');
  const [length, setLength] = useState('500');
  const [uuids, setUuids] = useState<string[]>([]);
  const [text, setText] = useState('');
  const isUuid = tool === 'uuid';
  const amount = Number(isUuid ? count : length);
  const valid = Number.isInteger(amount) && amount >= 1 && amount <= (isUuid ? 100 : 100000);
  const output = isUuid ? uuids.join('\n') : text;
  const selected = tools.find((item) => item.id === tool)!;
  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      notify('Copiado.', 'success');
    } catch {
      notify('No se pudo copiar. Puedes seleccionar el texto.');
    }
  }
  function generate() {
    if (!valid) return;
    if (isUuid) setUuids(Array.from({ length: amount }, () => crypto.randomUUID()));
    else setText(generatePlainText(amount));
  }
  return (
    <div className="fake-generator-stack">
      <div
        className="fake-data-categories fake-data-categories--two"
        role="group"
        aria-label="Generadores de desarrollo"
      >
        {tools.map((item) => (
          <button
            key={item.id}
            type="button"
            className="fake-data-category"
            aria-pressed={tool === item.id}
            onClick={() => setTool(item.id)}
          >
            <span className="fake-data-category__top">
              <span className="fake-data-category__icon">
                <Icon name={item.icon} size={22} />
              </span>
              <span className="fake-data-category__selected" aria-hidden="true">
                <Icon name="check" size={13} />
              </span>
            </span>
            <strong>{item.title}</strong>
            <span>{item.description}</span>
          </button>
        ))}
      </div>
      <section
        className="panel fake-data-controls"
        aria-label="Opciones de generación de desarrollo"
      >
        <div className="fake-data-controls__intro">
          <span className="fake-data-controls__icon">
            <Icon name={selected.icon} size={23} />
          </span>
          <div>
            <p className="eyebrow">Generadores para desarrollo</p>
            <h2>{isUuid ? 'Identificadores listos para usar' : 'El texto que necesitas'}</h2>
            <p>
              {isUuid
                ? 'Genera de 1 a 100 UUID v4, uno por línea.'
                : 'De 1 a 100.000 caracteres, incluidos espacios y signos.'}
            </p>
          </div>
        </div>
        <div className="fake-data-controls__actions">
          <InputField
            label={isUuid ? 'Cantidad de UUID' : 'Longitud del texto'}
            type="number"
            min={1}
            max={isUuid ? 100 : 100000}
            value={isUuid ? count : length}
            onChange={(event) =>
              isUuid ? setCount(event.target.value) : setLength(event.target.value)
            }
          />
          <Button variant="primary" icon="refresh" disabled={!valid} onClick={generate}>
            {isUuid ? 'Generar UUID' : 'Generar texto'}
          </Button>
        </div>
        {!valid ? (
          <p className="field__hint" role="alert">
            {isUuid ? 'Introduce de 1 a 100 UUID.' : 'Introduce entre 1 y 100.000 caracteres.'}
          </p>
        ) : null}
      </section>
      <section className="fake-data-results" aria-labelledby="developer-results-title">
        <div className="fake-data-results__toolbar">
          <div>
            <p className="eyebrow">Listos para copiar</p>
            <h2 id="developer-results-title">
              {selected.title}
              <span className="fake-data-count mono">
                {isUuid ? uuids.length : text.length.toLocaleString('es-ES')}
              </span>
            </h2>
          </div>
          <Button icon="copy" disabled={!output} onClick={() => void copy(output)}>
            {isUuid ? 'Copiar todos' : 'Copiar texto'}
          </Button>
        </div>
        <div className="panel fake-generator-result">
          {output ? (
            isUuid ? (
              <ol className="fake-generator-uuids">
                {uuids.map((uuid, index) => (
                  <li key={uuid}>
                    <span className="eyebrow">{String(index + 1).padStart(2, '0')}</span>
                    <code>{uuid}</code>
                    <Button
                      icon="copy"
                      aria-label={`Copiar UUID ${index + 1}`}
                      onClick={() => void copy(uuid)}
                    >
                      Copiar
                    </Button>
                  </li>
                ))}
              </ol>
            ) : (
              <>
                <Badge>{text.length.toLocaleString('es-ES')} caracteres</Badge>
                <pre className="fake-generator-text">{text}</pre>
              </>
            )
          ) : (
            <div className="fake-generator-empty">
              <Icon name={selected.icon} size={30} />
              <h3>{isUuid ? 'Tus próximos identificadores' : 'Un espacio para tus ejemplos'}</h3>
              <p>
                Ajusta {isUuid ? 'la cantidad' : 'la longitud'} y pulsa{' '}
                {isUuid ? 'Generar UUID' : 'Generar texto'} para empezar.
              </p>
            </div>
          )}
        </div>
        <p className="sr-only" role="status">
          {output
            ? isUuid
              ? `${uuids.length} UUID generados.`
              : `${text.length} caracteres generados.`
            : ''}
        </p>
      </section>
    </div>
  );
}
