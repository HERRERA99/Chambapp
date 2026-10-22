import { useState } from 'react';
import { Button } from '../../shared/ui/Button';
import { InputField } from '../../shared/ui/FormField';
import { Icon } from '../../shared/ui/Icon';
import { validateIsin, validateLei } from './identifiers';

export function IdentifierValidator({ kind, sample }: { kind: 'lei' | 'isin'; sample: string }) {
  const [value, setValue] = useState('');
  const [result, setResult] = useState<boolean | null>(null);
  const label = kind.toUpperCase();
  const validate = kind === 'lei' ? validateLei : validateIsin;

  return (
    <details className="panel fake-data-validator">
      <summary>
        <Icon name="shield" size={19} />
        <span>Validar un código {label}</span>
        <Icon name="chevron" size={17} />
      </summary>
      <div className="fake-data-validator__body">
        <p className="muted">Comprueba el formato y los dígitos de control de un {label}.</p>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            setResult(validate(value));
          }}
        >
          <InputField
            label={`Código ${label}`}
            placeholder={`Introduce un ${label} de ${kind === 'lei' ? 20 : 12} caracteres`}
            value={value}
            required
            maxLength={64}
            spellCheck={false}
            autoComplete="off"
            onChange={(event) => {
              setValue(event.target.value);
              setResult(null);
            }}
          />
          <Button type="submit" icon="verified">
            Validar código
          </Button>
        </form>
        <Button
          variant="ghost"
          icon="copy"
          onClick={() => {
            setValue(sample);
            setResult(validate(sample));
          }}
        >
          Usar el código generado
        </Button>
        <div role="status" aria-live="polite" aria-atomic="true">
          {result === null ? null : (
            <p
              className={`fake-data-validator__result ${result ? 'fake-data-validator__result--valid' : ''}`}
            >
              <Icon name={result ? 'verified' : 'close'} size={17} />
              {result
                ? 'Formato y dígitos de control correctos.'
                : 'El formato o los dígitos de control no son correctos.'}
            </p>
          )}
        </div>
        <p className="field__hint">
          La comprobación no acredita que el código esté asignado o registrado.
        </p>
      </div>
    </details>
  );
}
