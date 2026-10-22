import { useState } from 'react';
import { Button, IconButton } from '../../shared/ui/Button';
import { Icon } from '../../shared/ui/Icon';
import { Badge } from '../../shared/ui/Panel';
import { IdentifierValidator } from './IdentifierValidator';
import { fakeDataToText, generateFakeData } from './fakeData.model';
import type { FakeDataOptions, FakeDataRecord } from './fakeData.model';
import './property-tools.css';

type PropertyCategory = 'properties' | 'cups';
type Variant = { id: string; title: string; action: string; options: FakeDataOptions };
const cadastralVariants: readonly Variant[] = [
  {
    id: 'urban',
    title: 'Referencia catastral urbana',
    action: 'Generar urbana',
    options: { cadastralKind: 'urban' },
  },
  {
    id: 'rural',
    title: 'Referencia catastral rústica',
    action: 'Generar rústica',
    options: { cadastralKind: 'rural' },
  },
];
const cupsVariants: readonly Variant[] = [
  {
    id: 'electricity',
    title: 'CUPS de luz',
    action: 'Generar CUPS de luz',
    options: { supplyKind: 'electricity' },
  },
  {
    id: 'gas',
    title: 'CUPS de gas',
    action: 'Generar CUPS de gas',
    options: { supplyKind: 'gas' },
  },
];

export function PropertyDataTools({
  category,
  count,
  onCopy,
  onDownload,
}: {
  category: PropertyCategory;
  count: number;
  onCopy: (value: string, message?: string) => Promise<void>;
  onDownload: (records: FakeDataRecord[], extension: 'json' | 'csv') => void;
}) {
  const variants = category === 'properties' ? cadastralVariants : cupsVariants;
  const [batches, setBatches] = useState(() =>
    variants.map((variant) => generateFakeData(category, count, variant.options)),
  );
  const [revision, setRevision] = useState(0);
  const records = batches.flat();
  const label = category === 'properties' ? 'Referencias catastrales' : 'CUPS de luz y gas';

  function regenerate(index: number) {
    const replacement = generateFakeData(category, count, variants[index]!.options);
    setBatches(batches.map((batch, position) => (position === index ? replacement : batch)));
    setRevision((value) => value + 1);
  }

  return (
    <section className="property-tools" aria-label={label}>
      <div className="fake-data-results__toolbar">
        <div>
          <p className="eyebrow">Listos para tus pruebas</p>
          <h2>
            {label}
            <span className="fake-data-count mono">{records.length}</span>
          </h2>
        </div>
        <div className="fake-data-results__exports">
          <Button
            icon="copy"
            onClick={() => void onCopy(fakeDataToText(records), 'Códigos copiados.')}
          >
            Copiar todo
          </Button>
          <div className="fake-data-downloads" role="group" aria-label="Descargar códigos">
            <Button
              icon="download"
              aria-label="Descargar códigos en JSON"
              onClick={() => onDownload(records, 'json')}
            >
              JSON
            </Button>
            <Button
              icon="download"
              aria-label="Descargar códigos en CSV"
              onClick={() => onDownload(records, 'csv')}
            >
              CSV
            </Button>
          </div>
        </div>
      </div>
      <p className="property-tools__description">
        {category === 'properties'
          ? 'Genera referencias urbanas y rústicas y comprueba sus caracteres de control.'
          : 'Genera códigos de suministro de electricidad y gas y verifica su estructura.'}{' '}
        <span>
          {count} {count === 1 ? 'código' : 'códigos'} por tipo.
        </span>
      </p>
      <div className="property-tools__grid">
        {variants.map((variant, index) => (
          <section className="panel property-code-card" key={variant.id} aria-label={variant.title}>
            <div className="property-code-card__heading">
              <h3>
                <Icon
                  name={
                    category === 'properties'
                      ? 'home'
                      : variant.id === 'electricity'
                        ? 'zap'
                        : 'activity'
                  }
                  size={18}
                />
                {variant.title}
              </h3>
              <Badge tone="accent">Ficticio</Badge>
            </div>
            <ol className="property-code-list">
              {batches[index]!.map((record, position) => (
                <li key={position}>
                  <span className="mono">{record.title}</span>
                  <IconButton
                    icon="copy"
                    label={`Copiar ${variant.title.toLowerCase()} ${position + 1}`}
                    onClick={() => void onCopy(record.title, 'Código copiado.')}
                  />
                </li>
              ))}
            </ol>
            <Button icon="refresh" onClick={() => regenerate(index)}>
              {variant.action}
            </Button>
          </section>
        ))}
        <IdentifierValidator
          kind={category === 'properties' ? 'cadastral' : 'cups'}
          sample={records[0]!.title}
          inline
        />
      </div>
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {revision ? `Generación ${revision}: códigos actualizados.` : ''}
      </p>
    </section>
  );
}
