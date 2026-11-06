import { useId, useState } from 'react';
import { Modal } from '../../../shared/ui/Modal';
import { Button } from '../../../shared/ui/Button';
import { MAX_ODOO_DESCRIPTION } from '../../extension/protocol';

/**
 * Lets the user pick the single description of the Odoo line when the entries
 * have several (or none), and edit it before sending.
 */
export function OdooDescriptionDialog({
  open,
  title,
  detail,
  choices,
  fallback,
  onClose,
  onConfirm,
}: {
  open: boolean;
  title: string;
  /** Task, date and hours of the line. */
  detail: string;
  /** Distinct descriptions of the entries (may be empty). */
  choices: readonly string[];
  /** Initial text when the entries have no description (the task title). */
  fallback: string;
  onClose: () => void;
  /** Resolves to the problem when sending did not start (the dialog stays open), else null. */
  onConfirm: (descripcion: string) => Promise<string | null>;
}) {
  const id = useId();
  const [text, setText] = useState(choices[0] ?? fallback);
  const [picked, setPicked] = useState<number | 'other'>(choices.length ? 0 : 'other');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const length = [...text].length;
  const valid = !!text.trim() && length <= MAX_ODOO_DESCRIPTION;

  function pick(choice: number | 'other') {
    setPicked(choice);
    if (choice !== 'other') setText(choices[choice]!);
  }

  async function confirm() {
    if (!valid || pending) return;
    setPending(true);
    setError('');
    try {
      const problem = await onConfirm(text.trim());
      if (problem) setError(problem);
      else onClose();
    } finally {
      setPending(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={() => {
        if (!pending) onClose();
      }}
      title={title}
      description={detail}
    >
      <div className="form-stack">
        {choices.length > 1 ? (
          <fieldset className="choice-fieldset" disabled={pending}>
            <legend>Los partes tienen descripciones distintas: elige una</legend>
            <div className="choice-grid odoo-description__choices">
              {choices.map((choice, index) => (
                <label
                  key={choice}
                  className={`choice-card ${picked === index ? 'choice-card--selected' : ''}`}
                >
                  <input
                    type="radio"
                    name={`${id}-choice`}
                    checked={picked === index}
                    onChange={() => pick(index)}
                  />
                  <span>{choice}</span>
                </label>
              ))}
              <label className={`choice-card ${picked === 'other' ? 'choice-card--selected' : ''}`}>
                <input
                  type="radio"
                  name={`${id}-choice`}
                  checked={picked === 'other'}
                  onChange={() => pick('other')}
                />
                <span>Escribir otra</span>
              </label>
            </div>
          </fieldset>
        ) : null}
        <div className="field">
          <label htmlFor={`${id}-text`}>Descripción en Odoo</label>
          <textarea
            id={`${id}-text`}
            rows={3}
            value={text}
            disabled={pending}
            aria-invalid={!valid}
            aria-describedby={`${id}-hint`}
            onChange={(event) => {
              setText(event.target.value);
              const index = choices.indexOf(event.target.value);
              setPicked(index >= 0 ? index : 'other');
            }}
          />
          <span id={`${id}-hint`} className="field__hint">
            {choices.length
              ? 'Puedes modificarla antes de enviar. '
              : 'Ningún parte tiene descripción: escribe la que quieras ver en Odoo. '}
            {length}/{MAX_ODOO_DESCRIPTION}
          </span>
        </div>
      </div>
      {error ? (
        <p role="alert" className="form-error">
          {error}
        </p>
      ) : null}
      <div className="form-actions">
        <Button variant="ghost" disabled={pending} onClick={onClose}>
          Cancelar
        </Button>
        <Button disabled={!valid || pending} onClick={() => void confirm()}>
          {pending ? 'Enviando…' : 'Enviar a Odoo'}
        </Button>
      </div>
    </Modal>
  );
}
