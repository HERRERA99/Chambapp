import { useState } from 'react';
import { Button } from '../../shared/ui/Button';
import { InputField } from '../../shared/ui/FormField';
import { useFeedback } from '../../shared/feedback/FeedbackContext';
import { generatePlainText } from './plainText';
import '../developer/developer.css';

export function DeveloperGenerators() {
  const notify = useFeedback();
  const [count, setCount] = useState('1');
  const [length, setLength] = useState('500');
  const [uuids, setUuids] = useState('');
  const [text, setText] = useState('');
  const validCount = Number.isInteger(Number(count)) && Number(count) >= 1 && Number(count) <= 100;
  const validLength =
    Number.isInteger(Number(length)) && Number(length) >= 1 && Number(length) <= 100000;
  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      notify('Copiado.');
    } catch {
      notify('No se pudo copiar. Puedes seleccionar el texto.');
    }
  }
  return (
    <details className="panel dev-panel">
      <summary>
        <strong>UUID y texto de prueba</strong>
        <span className="muted"> · Generadores para desarrollo</span>
      </summary>
      <div className="dev-columns" style={{ marginTop: 24 }}>
        <section>
          <h3>Generador UUID v4</h3>
          <p className="muted">Identificadores aleatorios, uno por línea.</p>
          <div className="dev-toolbar">
            <InputField
              label="Cantidad de UUID"
              type="number"
              min={1}
              max={100}
              value={count}
              onChange={(e) => setCount(e.target.value)}
            />
            <Button
              variant="primary"
              disabled={!validCount}
              onClick={() =>
                setUuids(
                  Array.from({ length: Number(count) }, () => crypto.randomUUID()).join('\n'),
                )
              }
            >
              Generar UUID
            </Button>
            <Button disabled={!uuids} onClick={() => void copy(uuids)}>
              Copiar UUID
            </Button>
          </div>
          {!validCount ? <p role="alert">Introduce de 1 a 100 UUID.</p> : null}
          <pre className="dev-output">{uuids || 'Tus UUID aparecerán aquí.'}</pre>
        </section>
        <section>
          <h3>Generador de texto plano</h3>
          <p className="muted">Longitud exacta en caracteres, incluidos espacios y signos.</p>
          <div className="dev-toolbar">
            <InputField
              label="Longitud del texto"
              type="number"
              min={1}
              max={100000}
              value={length}
              onChange={(e) => setLength(e.target.value)}
            />
            <Button
              variant="primary"
              disabled={!validLength}
              onClick={() => setText(generatePlainText(Number(length)))}
            >
              Generar texto
            </Button>
            <Button disabled={!text} onClick={() => void copy(text)}>
              Copiar texto
            </Button>
          </div>
          {!validLength ? <p role="alert">Introduce entre 1 y 100.000 caracteres.</p> : null}
          <p className="muted" role="status">
            {text.length.toLocaleString('es-ES')} caracteres generados
          </p>
          <pre className="dev-output">{text || 'Tu texto aparecerá aquí.'}</pre>
        </section>
      </div>
    </details>
  );
}
