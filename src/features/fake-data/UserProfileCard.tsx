import { Button, IconButton } from '../../shared/ui/Button';
import { Badge } from '../../shared/ui/Panel';
import { fakeDataToText } from './fakeData.model';
import type { FakeDataField, FakeDataRecord } from './fakeData.model';
import './user-profile.css';

const profileFields = [
  { key: 'dni', label: 'DOI', span: 3 },
  { key: 'firstName', label: 'Nombre', span: 3 },
  { key: 'firstSurname', label: 'Primer apellido', span: 3 },
  { key: 'secondSurname', label: 'Segundo apellido', span: 3 },
  { key: 'fullName', label: 'Nombre completo', span: 6 },
  { key: 'surnames', label: 'Apellidos', span: 3 },
  { key: 'birthDate', label: 'Fecha de nacimiento', span: 3 },
  { key: 'email', label: 'Email', span: 6 },
  { key: 'phone', label: 'Teléfono', span: 2 },
  { key: 'passport', label: 'Pasaporte', span: 2 },
  { key: 'socialSecurity', label: 'Seguridad social', span: 2 },
  { key: 'address', label: 'Dirección', span: 4 },
  { key: 'postalCode', label: 'CP', span: 2 },
  { key: 'city', label: 'Municipio', span: 3 },
  { key: 'province', label: 'Provincia', span: 3 },
  { key: 'fullAddress', label: 'Dirección completa', span: 12 },
  { key: 'username', label: 'Nombre de usuario', span: 6 },
  { key: 'password', label: 'Contraseña de prueba', span: 6 },
  { key: 'cardNumber', label: 'Número de tarjeta', span: 3 },
  { key: 'cardExpiry', label: 'Caducidad', span: 2 },
  { key: 'cardCvc', label: 'CVV', span: 1 },
  { key: 'iban', label: 'IBAN', span: 4 },
  { key: 'bic', label: 'BIC (SWIFT)', span: 2 },
] as const;

const textFields = new Set([
  'firstName',
  'firstSurname',
  'secondSurname',
  'fullName',
  'surnames',
  'address',
  'city',
  'province',
  'fullAddress',
  'profession',
  'country',
  'holder',
  'bankName',
]);

type ProfileCardProps = {
  record: FakeDataRecord;
  index: number;
  onCopy: (value: string, message?: string) => Promise<void>;
  onRegenerate: () => void;
};

function ProfileField({
  field,
  index,
  onCopy,
  span = 3,
}: {
  field: FakeDataField;
  span?: number;
} & Pick<ProfileCardProps, 'index' | 'onCopy'>) {
  const emailAt = field.key === 'email' ? field.value.lastIndexOf('@') : -1;

  return (
    <div
      className={`fake-user-profile__field fake-user-profile__field--${span} fake-user-profile__field--${field.key}`}
    >
      <dt>
        <span>{field.label}</span>
        <IconButton
          icon="copy"
          label={`Copiar ${field.label.toLowerCase()} de la ficha ${index + 1}`}
          onClick={() => void onCopy(field.value, `${field.label}: copiado.`)}
        />
      </dt>
      <dd className={textFields.has(field.key) ? undefined : 'mono'}>
        {emailAt > 0 ? (
          <>
            {field.value.slice(0, emailAt)}
            <wbr />
            <span className="fake-user-profile__email-domain">{field.value.slice(emailAt)}</span>
          </>
        ) : (
          field.value
        )}
      </dd>
    </div>
  );
}

export function UserProfileCard({ record, index, onCopy, onRegenerate }: ProfileCardProps) {
  const primaryKeys = new Set<string>(profileFields.map((field) => field.key));
  const additionalFields = record.fields.filter((field) => !primaryKeys.has(field.key));

  return (
    <article className="panel fake-user-profile" aria-label={`Ficha ${index + 1}: ${record.title}`}>
      <header className="fake-user-profile__header">
        <div className="fake-user-profile__heading">
          <span className="eyebrow">Ficha {String(index + 1).padStart(2, '0')}</span>
          <h3>Perfil de usuario</h3>
          <Badge tone="accent">Ficticio</Badge>
        </div>
        <div className="fake-user-profile__actions">
          <Button
            icon="copy"
            onClick={() => void onCopy(fakeDataToText([record]), 'Ficha copiada.')}
          >
            Copiar ficha
          </Button>
          <Button
            icon="refresh"
            variant="primary"
            aria-label={`Regenerar ficha ${index + 1}`}
            onClick={onRegenerate}
          >
            Nuevo perfil
          </Button>
        </div>
      </header>

      <dl className="fake-user-profile__fields">
        {profileFields.map(({ key, label, span }) => {
          const field = record.fields.find((item) => item.key === key);
          return field ? (
            <ProfileField
              key={key}
              field={{ ...field, label }}
              span={span}
              index={index}
              onCopy={onCopy}
            />
          ) : null;
        })}
      </dl>

      {additionalFields.length > 0 ? (
        <details className="fake-user-profile__more">
          <summary>Más datos del perfil</summary>
          <dl className="fake-user-profile__fields">
            {additionalFields.map((field) => (
              <ProfileField key={field.key} field={field} index={index} onCopy={onCopy} />
            ))}
          </dl>
        </details>
      ) : null}
    </article>
  );
}
