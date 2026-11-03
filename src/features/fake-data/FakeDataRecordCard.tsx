import { copyOnClick } from './copyOnClick';
import { Button, IconButton } from '../../shared/ui/Button';
import { Icon } from '../../shared/ui/Icon';
import type { IconName } from '../../shared/ui/Icon';
import { Badge } from '../../shared/ui/Panel';
import { fakeDataToText } from './fakeData.model';
import type { FakeDataField, FakeDataRecord } from './fakeData.model';

const fieldSections = [
  { id: 'identity', title: 'Identidad personal', icon: 'user' },
  { id: 'company', title: 'Datos de la empresa', icon: 'building' },
  { id: 'property', title: 'Datos del inmueble', icon: 'home' },
  { id: 'contact', title: 'Contacto y dirección', icon: 'globe' },
  { id: 'access', title: 'Acceso de prueba', icon: 'lock' },
  { id: 'banking', title: 'Cuenta y tarjeta de prueba', icon: 'bank' },
  { id: 'identifier', title: 'Datos del identificador', icon: 'file' },
] as const;

function sectionFor(record: FakeDataRecord, key: string) {
  if (record.category === 'banking') return 'banking';
  if (!['personal', 'companies', 'properties'].includes(record.category)) return 'identifier';
  if (['username', 'password'].includes(key)) return 'access';
  if (
    [
      'holder',
      'bankName',
      'iban',
      'bic',
      'ccc',
      'bankCode',
      'branchCode',
      'accountNumber',
      'cardBrand',
      'cardNumber',
      'cardExpiry',
      'cardCvc',
      'currency',
    ].includes(key)
  )
    return 'banking';
  if (
    [
      'email',
      'phone',
      'fax',
      'website',
      'address',
      'fullAddress',
      'postalCode',
      'city',
      'province',
      'country',
    ].includes(key)
  )
    return 'contact';
  return record.category === 'companies'
    ? 'company'
    : record.category === 'properties'
      ? 'property'
      : 'identity';
}

function RecordField({
  field,
  index,
  onCopy,
}: {
  field: FakeDataField;
  index: number;
  onCopy: (value: string, message?: string) => Promise<void>;
}) {
  const wide = [
    'iban',
    'address',
    'fullAddress',
    'website',
    'fullName',
    'name',
    'activity',
    'lei',
    'isin',
  ].includes(field.key);
  const mono = [
    'dni',
    'taxId',
    'documentNumber',
    'passport',
    'socialSecurity',
    'iban',
    'bic',
    'ccc',
    'bankCode',
    'branchCode',
    'accountNumber',
    'cardNumber',
    'cardExpiry',
    'cardCvc',
    'reference',
    'lei',
    'isin',
    'password',
    'username',
    'cnae',
  ].includes(field.key);
  return (
    <div className={`fake-data-field ${wide ? 'fake-data-field--wide' : ''}`}>
      <dt>{field.label}</dt>
      <dd>
        <span
          {...copyOnClick(() => void onCopy(field.value, `${field.label}: copiado.`))}
          className={`fake-copyable ${mono ? 'mono' : ''}`}
        >
          {field.value}
        </span>
        <IconButton
          icon="copy"
          label={`Copiar ${field.label.toLowerCase()} de la ficha ${index + 1}`}
          onClick={() => void onCopy(field.value, `${field.label}: copiado.`)}
        />
      </dd>
    </div>
  );
}

function BankCardPreview({ record }: { record: FakeDataRecord }) {
  const field = (key: string) => record.fields.find((item) => item.key === key)?.value ?? '';
  return (
    <div className="fake-bank-card" aria-hidden="true">
      <div className="fake-bank-card__brand">
        <Icon name="creditCard" size={23} />
        <span>{field('cardBrand')}</span>
      </div>
      <span className="fake-bank-card__test">TARJETA DE PRUEBA</span>
      <span className="fake-bank-card__number">{field('cardNumber')}</span>
      <div className="fake-bank-card__footer">
        <span>{field('holder')}</span>
        <span>{field('cardExpiry')}</span>
      </div>
    </div>
  );
}

export function FakeDataRecordCard({
  record,
  index,
  icon,
  onCopy,
  onRegenerate,
}: {
  record: FakeDataRecord;
  index: number;
  icon: IconName;
  onCopy: (value: string, message?: string) => Promise<void>;
  onRegenerate: () => void;
}) {
  const initials = record.title
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();

  return (
    <article className="panel fake-record" aria-label={`Ficha ${index + 1}: ${record.title}`}>
      <div className="fake-record__identity">
        <div className="fake-record__identity-sticky">
          <div className="fake-record__top">
            <span className="eyebrow">Ficha {String(index + 1).padStart(2, '0')}</span>
            <Badge tone="accent">Ficticio</Badge>
          </div>
          {record.category === 'banking' ? (
            <BankCardPreview record={record} />
          ) : (
            <div
              className={`fake-record__art fake-record__art--${record.category}`}
              aria-hidden="true"
            >
              <span className="fake-record__avatar">
                {record.category === 'personal' ? initials : <Icon name={icon} size={35} />}
              </span>
              <span className="fake-record__art-line" />
              <span className="fake-record__art-line" />
            </div>
          )}
          <h3>{record.title}</h3>
          <p className="fake-record__subtitle">{record.subtitle}</p>
          <div className="fake-record__actions">
            <Button
              icon="copy"
              onClick={() => void onCopy(fakeDataToText([record]), 'Ficha copiada.')}
            >
              Copiar ficha
            </Button>
            <IconButton
              icon="refresh"
              label={`Regenerar ficha ${index + 1}`}
              onClick={onRegenerate}
            />
          </div>
        </div>
      </div>

      <div className="fake-record__sections">
        {fieldSections.map((section) => {
          const fields = record.fields.filter(
            (field) => sectionFor(record, field.key) === section.id,
          );
          if (!fields.length) return null;
          return (
            <section className="fake-record__section" key={section.id} aria-label={section.title}>
              <h4>
                <Icon name={section.icon} size={15} />
                {section.title}
              </h4>
              <dl className="fake-record__fields">
                {fields.map((field) => (
                  <RecordField key={field.key} field={field} index={index} onCopy={onCopy} />
                ))}
              </dl>
            </section>
          );
        })}
      </div>
    </article>
  );
}
