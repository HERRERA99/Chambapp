import { useEffect, useMemo, useState } from 'react';
import { useFeedback } from '../../shared/feedback/FeedbackContext';
import { Button } from '../../shared/ui/Button';
import { SelectField } from '../../shared/ui/FormField';
import { Icon } from '../../shared/ui/Icon';
import type { IconName } from '../../shared/ui/Icon';
import { PageHeader } from '../../shared/ui/PageHeader';
import { Badge } from '../../shared/ui/Panel';
import { SegmentedControl } from '../../shared/ui/SegmentedControl';
import { FakeDataRecordCard } from './FakeDataRecordCard';
import { UserProfileCard } from './UserProfileCard';
import { PropertyDataTools } from './PropertyDataTools';
import { IdentifierValidator } from './IdentifierValidator';
import { DOCUMENT_TYPES, EUROPEAN_TAX_COUNTRIES } from './identifiers';
import type { DocumentType, TaxCountry } from './identifiers';
import {
  FAKE_DATA_CATEGORIES,
  TEST_CARD_SOURCE_URL,
  fakeDataToCsv,
  fakeDataToJson,
  fakeDataToText,
  generateFakeData,
  formatFakeDataRecords,
} from './fakeData.model';
import type {
  FakeDataCategoryId,
  FakeDataOptions,
  FakeDataRecord,
  FakeDataTextCase,
} from './fakeData.model';
import './fake-data.css';
import { DeveloperGenerators } from './DeveloperGenerators';

const categoryIcons: Record<FakeDataCategoryId, IconName> = {
  personal: 'user',
  banking: 'bank',
  companies: 'building',
  properties: 'home',
  cups: 'zap',
  documents: 'file',
  passport: 'file',
  socialSecurity: 'shield',
  europeanTaxIds: 'globe',
  lei: 'verified',
  isin: 'activity',
};

const categoryGroups: readonly {
  id: string;
  label: string;
  icon: IconName;
  categories: readonly FakeDataCategoryId[];
}[] = [
  { id: 'users', label: 'Usuarios', icon: 'user', categories: ['personal'] },
  {
    id: 'documents',
    label: 'Documentos personales',
    icon: 'file',
    categories: ['documents', 'passport', 'socialSecurity', 'europeanTaxIds'],
  },
  {
    id: 'business',
    label: 'Bancos y empresas',
    icon: 'bank',
    categories: ['banking', 'companies', 'lei', 'isin'],
  },
  { id: 'properties', label: 'Inmuebles', icon: 'home', categories: ['properties', 'cups'] },
];
const textCases: readonly { value: FakeDataTextCase; label: string }[] = [
  { value: 'original', label: 'Original' },
  { value: 'upper', label: 'MAYÚSCULAS' },
  { value: 'lower', label: 'minúsculas' },
  { value: 'camel', label: 'Camel Case' },
];

type GeneratedBatch = { category: FakeDataCategoryId; records: FakeDataRecord[] };

function downloadData(contents: string, extension: 'json' | 'csv', category: FakeDataCategoryId) {
  const blob = new Blob([contents], {
    type: extension === 'json' ? 'application/json;charset=utf-8' : 'text/csv;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `chambapp-datos-ficticios-${category}.${extension}`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function FakeDataPage() {
  const [development, setDevelopment] = useState(false);
  const notify = useFeedback();
  const [batch, setBatch] = useState<GeneratedBatch>(() => ({
    category: 'personal',
    records: generateFakeData('personal'),
  }));
  const [generation, setGeneration] = useState(0);
  const [documentType, setDocumentType] = useState<DocumentType>('dni');
  const [taxCountry, setTaxCountry] = useState<TaxCountry>('DE');
  const [textCase, setTextCase] = useState<FakeDataTextCase>('upper');
  const [emailDomain, setEmailDomain] =
    useState<NonNullable<FakeDataOptions['emailDomain']>>('yopmail.com');
  const selected = FAKE_DATA_CATEGORIES.find((category) => category.id === batch.category)!;
  const group = categoryGroups.find((item) => item.categories.includes(batch.category))!;
  const quantity = batch.records.length;
  const isPropertyTool = batch.category === 'properties' || batch.category === 'cups';
  const hasEmail = batch.category === 'personal' || batch.category === 'companies';
  const showTextCase = ['personal', 'banking', 'companies'].includes(batch.category);
  const records = useMemo(
    () => formatFakeDataRecords(batch.records, showTextCase ? textCase : 'original'),
    [batch.records, textCase, showTextCase],
  );

  function generate(
    category = batch.category,
    count = quantity,
    changes: Pick<FakeDataOptions, 'documentType' | 'taxCountry' | 'emailDomain'> = {},
  ) {
    setBatch({
      category,
      records: generateFakeData(category, count, {
        documentType,
        taxCountry,
        emailDomain,
        ...changes,
      }),
    });
    setGeneration((previous) => previous + 1);
  }

  function regenerateRecord(index: number) {
    const replacement = generateFakeData(batch.category, 1, {
      documentType,
      taxCountry,
      emailDomain,
    })[0]!;
    setBatch({
      ...batch,
      records: batch.records.map((record, position) => (position === index ? replacement : record)),
    });
    notify(`Ficha ${index + 1} regenerada.`);
  }

  async function copy(value: string, message = 'Datos copiados.') {
    try {
      await navigator.clipboard.writeText(value);
      notify(message);
    } catch {
      notify('No se pudo copiar. Puedes seleccionar el texto y copiarlo manualmente.');
    }
  }

  // «G» regenerates (outside text fields), so new data is one key away.
  useEffect(() => {
    if (development) return;
    function onKey(event: KeyboardEvent) {
      if (event.key.toLowerCase() !== 'g' || event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable="true"], dialog[open]'))
        return;
      event.preventDefault();
      document.getElementById('fake-data-generate')?.click();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [development]);

  const typeOptions =
    showTextCase ||
    batch.category === 'documents' ||
    batch.category === 'europeanTaxIds' ||
    batch.category === 'isin';

  return (
    <div className="page-stack fake-data-page">
      <PageHeader
        eyebrow="Herramientas / Datos ficticios"
        title="Datos de prueba, en un clic."
        description="Perfiles completos, documentos e identificadores para tus formularios, prototipos y pruebas."
        actions={
          <Badge>
            <Icon name="globe" size={13} /> España y Europa
          </Badge>
        }
      />

      <div className="fake-data-picker">
        <div className="fake-data-groups" role="group" aria-label="Familia de generadores">
          {categoryGroups.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={!development && group.id === item.id}
              onClick={() => {
                setDevelopment(false);
                generate(item.categories[0]!);
              }}
            >
              <Icon name={item.icon} size={16} />
              <span>{item.label}</span>
            </button>
          ))}
          <button type="button" aria-pressed={development} onClick={() => setDevelopment(true)}>
            <Icon name="code" size={16} />
            <span>Desarrollo</span>
          </button>
        </div>
        {!development && group.categories.length > 1 ? (
          <div className="fake-data-categories" role="group" aria-label="Tipo de datos ficticios">
            {FAKE_DATA_CATEGORIES.filter((category) => group.categories.includes(category.id)).map(
              (category) => (
                <button
                  key={category.id}
                  type="button"
                  className="fake-data-category"
                  aria-pressed={batch.category === category.id}
                  title={category.description}
                  onClick={() => {
                    generate(category.id);
                  }}
                >
                  <span className="fake-data-category__icon">
                    <Icon name={categoryIcons[category.id]} size={18} />
                  </span>
                  <strong>{category.label}</strong>
                </button>
              ),
            )}
          </div>
        ) : null}
      </div>

      {development ? (
        <DeveloperGenerators />
      ) : (
        <>
          <section className="fake-data-bar" aria-label="Generar y copiar datos">
            <div className="fake-data-bar__title">
              <h2 id="fake-data-results-title">
                {batch.category === 'personal' ? 'Usuarios' : selected.label}
              </h2>
              <span className="fake-data-count mono">
                {isPropertyTool ? quantity * 2 : quantity}
              </span>
            </div>
            {typeOptions ? (
              <div className="fake-data-bar__options">
                {hasEmail ? (
                  <SelectField
                    label="Correo"
                    value={emailDomain}
                    onChange={(event) => {
                      const value = event.target.value as NonNullable<
                        FakeDataOptions['emailDomain']
                      >;
                      setEmailDomain(value);
                      generate(batch.category, quantity, { emailDomain: value });
                    }}
                  >
                    <option value="yopmail.com">yopmail.com</option>
                    <option value="example.com">example.com</option>
                  </SelectField>
                ) : null}
                {batch.category === 'documents' ? (
                  <SelectField
                    label="Documento"
                    value={documentType}
                    onChange={(event) => {
                      const value = event.target.value as DocumentType;
                      setDocumentType(value);
                      generate(batch.category, quantity, { documentType: value });
                    }}
                  >
                    {DOCUMENT_TYPES.map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </SelectField>
                ) : null}
                {batch.category === 'europeanTaxIds' || batch.category === 'isin' ? (
                  <SelectField
                    label="País"
                    value={taxCountry}
                    title={
                      batch.category === 'isin'
                        ? 'Prefijo de país del identificador de prueba.'
                        : EUROPEAN_TAX_COUNTRIES.find((country) => country.value === taxCountry)
                            ?.description
                    }
                    onChange={(event) => {
                      const value = event.target.value as TaxCountry;
                      setTaxCountry(value);
                      generate(batch.category, quantity, { taxCountry: value });
                    }}
                  >
                    {EUROPEAN_TAX_COUNTRIES.map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </SelectField>
                ) : null}
                {showTextCase ? (
                  <div
                    className="fake-data-case"
                    title="Se aplica a nombres y direcciones; los códigos conservan su formato."
                  >
                    <SegmentedControl
                      label="Formato del texto generado"
                      options={textCases}
                      value={textCase}
                      onChange={setTextCase}
                    />
                  </div>
                ) : null}
              </div>
            ) : null}
            <div className="fake-data-bar__actions">
              <SelectField
                className="fake-data-quantity"
                label={isPropertyTool ? 'Por tipo' : 'Cantidad'}
                value={quantity}
                onChange={(event) => generate(batch.category, Number(event.target.value))}
              >
                {[1, 5, 10, 20].map((count) => (
                  <option key={count} value={count}>
                    ×{count}
                  </option>
                ))}
              </SelectField>
              {isPropertyTool ? null : (
                <>
                  <Button
                    icon="copy"
                    onClick={() => void copy(fakeDataToText(records), 'Todas las fichas copiadas.')}
                  >
                    Copiar todo
                  </Button>
                  <div className="fake-data-downloads" role="group" aria-label="Descargar fichas">
                    <Button
                      icon="download"
                      aria-label="Descargar fichas en JSON"
                      onClick={() => downloadData(fakeDataToJson(records), 'json', batch.category)}
                    >
                      JSON
                    </Button>
                    <Button
                      icon="download"
                      aria-label="Descargar fichas en CSV"
                      onClick={() => downloadData(fakeDataToCsv(records), 'csv', batch.category)}
                    >
                      CSV
                    </Button>
                  </div>
                </>
              )}
              <Button
                id="fake-data-generate"
                variant="primary"
                icon="refresh"
                title="Atajo: tecla G"
                onClick={() => generate()}
              >
                {isPropertyTool ? 'Generar ambos tipos' : 'Generar de nuevo'}
              </Button>
            </div>
          </section>

          {batch.category === 'lei' || batch.category === 'isin' ? (
            <IdentifierValidator
              key={batch.category}
              kind={batch.category}
              sample={records[0]?.fields.find((field) => field.key === batch.category)?.value ?? ''}
            />
          ) : null}

          {isPropertyTool ? (
            <PropertyDataTools
              key={`${batch.category}-${quantity}-${generation}`}
              category={batch.category === 'properties' ? 'properties' : 'cups'}
              count={quantity}
              onCopy={copy}
              onDownload={(items, extension) =>
                downloadData(
                  extension === 'json' ? fakeDataToJson(items) : fakeDataToCsv(items),
                  extension,
                  batch.category,
                )
              }
            />
          ) : (
            <section className="fake-data-results" aria-labelledby="fake-data-results-title">
              <div className="fake-data-records">
                {records.map((record, index) =>
                  batch.category === 'personal' ? (
                    <UserProfileCard
                      key={`${batch.category}-${index}`}
                      record={record}
                      index={index}
                      onCopy={copy}
                      onRegenerate={() => regenerateRecord(index)}
                    />
                  ) : (
                    <FakeDataRecordCard
                      key={`${batch.category}-${index}`}
                      record={record}
                      index={index}
                      icon={categoryIcons[batch.category]}
                      onCopy={copy}
                      onRegenerate={() => regenerateRecord(index)}
                    />
                  ),
                )}
              </div>
            </section>
          )}

          <div className="fake-data-note">
            <Icon name="info" size={16} />
            <p>
              Datos sintéticos para pruebas.
              {batch.category === 'personal' || batch.category === 'companies'
                ? ` Los correos usan ${emailDomain} y los teléfonos son de ejemplo.`
                : null}
              {batch.category === 'banking' || batch.category === 'personal' ? (
                <>
                  {' '}
                  Los IBAN corresponden a una entidad ficticia y las tarjetas usan{' '}
                  <a href={TEST_CARD_SOURCE_URL} target="_blank" rel="noreferrer">
                    números de prueba
                  </a>
                  .
                </>
              ) : null}
            </p>
          </div>
          <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
            {generation > 0
              ? isPropertyTool
                ? `Lote ${generation} listo: ${quantity * 2} códigos, ${quantity} por tipo, de ${selected.label.toLowerCase()}.`
                : `Lote ${generation} listo: ${quantity} ${quantity === 1 ? 'ficha' : 'fichas'} de ${selected.label.toLowerCase()}.`
              : ''}
          </p>
        </>
      )}
    </div>
  );
}
