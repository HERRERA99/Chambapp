import { useState } from 'react';
import { Button } from '../../shared/ui/Button';
import { InputField } from '../../shared/ui/FormField';
import { Icon } from '../../shared/ui/Icon';
import { validateIsin, validateLei } from './identifiers';
import { validateCadastralReference, validateCups } from './propertyIdentifiers';

type IdentifierKind = 'lei' | 'isin' | 'cadastral' | 'cups';
const configurations = {
  lei: {
    title: 'Validar un código LEI',
    label: 'Código LEI',
    placeholder: 'Introduce un LEI de 20 caracteres',
    validate: validateLei,
  },
  isin: {
    title: 'Validar un código ISIN',
    label: 'Código ISIN',
    placeholder: 'Introduce un ISIN de 12 caracteres',
    validate: validateIsin,
  },
  cadastral: {
    title: 'Verificar referencia catastral',
    label: 'Referencia catastral',
    placeholder: 'Introduce una referencia de 20 caracteres',
    validate: validateCadastralReference,
  },
  cups: {
    title: 'Verificar código CUPS',
    label: 'Código CUPS',
    placeholder: 'Introduce un CUPS de 20 o 22 caracteres',
    validate: validateCups,
  },
} as const;

export function IdentifierValidator({
  kind,
  sample,
  inline = false,
}: {
  kind: IdentifierKind;
  sample: string;
  inline?: boolean;
}) {
  const [value, setValue] = useState('');
  const [result, setResult] = useState<boolean | null>(null);
  const config = configurations[kind];
  const validate = config.validate;

  const body = (
    <div className="fake-data-validator__body">
      <p className="muted">Comprueba el formato y los caracteres de control.</p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          setResult(validate(value));
        }}
      >
        <InputField
          label={config.label}
          placeholder={config.placeholder}
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
          {inline ? 'Verificar' : 'Validar código'}
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
        La comprobación es estructural y no acredita que el código esté asignado o registrado.
      </p>
    </div>
  );
  return inline ? (
    <section
      className="panel fake-data-validator fake-data-validator--inline"
      aria-label={config.title}
    >
      <h3>
        <Icon name="shield" size={18} />
        {config.title}
      </h3>
      {body}
    </section>
  ) : (
    <details className="panel fake-data-validator">
      <summary>
        <Icon name="shield" size={19} />
        <span>{config.title}</span>
        <Icon name="chevron" size={17} />
      </summary>
      {body}
    </details>
  );
}
