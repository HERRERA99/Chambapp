import { useId } from 'react';
import type { ProfileDraft } from '../settingsDraft';
import { SettingRow, SettingsSection } from './SettingRow';

const zones = [
  'Europe/Madrid',
  'Europe/London',
  'Europe/Paris',
  'America/New_York',
  'America/Mexico_City',
  'America/Bogota',
  'America/Argentina/Buenos_Aires',
  'Asia/Tokyo',
  'UTC',
];

export function RegionalSettings({
  value,
  baseline,
  onChange,
  disabled,
  hidden,
  showErrors,
}: {
  value: ProfileDraft;
  baseline: ProfileDraft;
  onChange: (value: ProfileDraft) => void;
  disabled: boolean;
  hidden: boolean;
  showErrors: boolean;
}) {
  const id = useId();
  const options = zones.includes(value.zonaHoraria) ? zones : [value.zonaHoraria, ...zones];
  const nameError = showErrors && !value.nombre.trim() ? 'Escribe tu nombre.' : undefined;
  const workspaceError =
    showErrors && !value.workspace.trim() ? 'Escribe un nombre para el espacio.' : undefined;
  return (
    <SettingsSection
      id="regional"
      title="Perfil y región"
      description="Cómo te identificas en Chambapp y la zona horaria de tus próximas jornadas."
      hidden={hidden}
    >
      <SettingRow
        label="Nombre completo"
        htmlFor={`${id}-name`}
        modified={value.nombre !== baseline.nombre}
      >
        <input
          id={`${id}-name`}
          value={value.nombre}
          onChange={(event) => onChange({ ...value, nombre: event.target.value })}
          autoComplete="name"
          maxLength={200}
          required
          disabled={disabled}
          aria-invalid={nameError ? true : undefined}
          aria-describedby={nameError ? `${id}-name-error` : undefined}
        />
        {nameError ? (
          <span id={`${id}-name-error`} className="field__error">
            {nameError}
          </span>
        ) : null}
      </SettingRow>
      <SettingRow
        label="Nombre del espacio de trabajo"
        description="Aparece en tus exportaciones y en la configuración inicial."
        htmlFor={`${id}-workspace`}
        modified={value.workspace !== baseline.workspace}
      >
        <input
          id={`${id}-workspace`}
          value={value.workspace}
          onChange={(event) => onChange({ ...value, workspace: event.target.value })}
          maxLength={200}
          required
          disabled={disabled}
          aria-invalid={workspaceError ? true : undefined}
          aria-describedby={workspaceError ? `${id}-workspace-error` : undefined}
        />
        {workspaceError ? (
          <span id={`${id}-workspace-error`} className="field__error">
            {workspaceError}
          </span>
        ) : null}
      </SettingRow>
      <SettingRow
        label="Especialidad"
        description="Opcional."
        htmlFor={`${id}-specialty`}
        modified={value.especialidad !== baseline.especialidad}
      >
        <input
          id={`${id}-specialty`}
          value={value.especialidad}
          onChange={(event) => onChange({ ...value, especialidad: event.target.value })}
          maxLength={200}
          disabled={disabled}
        />
      </SettingRow>
      <SettingRow
        label="Zona horaria"
        description="Se aplica a las jornadas nuevas. Los registros existentes conservan la zona con la que se crearon."
        htmlFor={`${id}-zone`}
        modified={value.zonaHoraria !== baseline.zonaHoraria}
      >
        <select
          id={`${id}-zone`}
          value={value.zonaHoraria}
          onChange={(event) => onChange({ ...value, zonaHoraria: event.target.value })}
          disabled={disabled}
        >
          {options.map((zone) => (
            <option key={zone} value={zone}>
              {zone.replaceAll('_', ' ')}
            </option>
          ))}
        </select>
      </SettingRow>
    </SettingsSection>
  );
}
