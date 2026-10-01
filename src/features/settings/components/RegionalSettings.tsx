import { Panel, Badge, Notice } from '../../../shared/ui/Panel';
import { InputField, SelectField } from '../../../shared/ui/FormField';
import type { ProfileDraft } from '../settingsDraft';

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
  onChange,
  disabled,
}: {
  value: ProfileDraft;
  onChange: (value: ProfileDraft) => void;
  disabled: boolean;
}) {
  const options = zones.includes(value.zonaHoraria) ? zones : [value.zonaHoraria, ...zones];
  return (
    <Panel
      id="regional"
      title="Perfil & Zona Horaria"
      icon="globe"
      action={<Badge>{value.zonaHoraria.replaceAll('_', ' ')}</Badge>}
    >
      <p className="muted section-intro">
        Personaliza tu perfil y la zona horaria de las próximas jornadas.
      </p>
      <div className="form-grid">
        <InputField
          label="Nombre completo"
          value={value.nombre}
          onChange={(event) => onChange({ ...value, nombre: event.target.value })}
          autoComplete="name"
          maxLength={200}
          required
          disabled={disabled}
        />
        <InputField
          label="Nombre del Workspace"
          value={value.workspace}
          onChange={(event) => onChange({ ...value, workspace: event.target.value })}
          maxLength={200}
          required
          disabled={disabled}
        />
        <InputField
          label="Especialidad"
          value={value.especialidad}
          onChange={(event) => onChange({ ...value, especialidad: event.target.value })}
          maxLength={200}
          disabled={disabled}
        />
        <SelectField
          label="Huso horario operativo"
          value={value.zonaHoraria}
          onChange={(event) => onChange({ ...value, zonaHoraria: event.target.value })}
          disabled={disabled}
        >
          {options.map((zone) => (
            <option key={zone} value={zone}>
              {zone.replaceAll('_', ' ')}
            </option>
          ))}
        </SelectField>
      </div>
      <Notice title="Las jornadas conservan su zona" icon="clock">
        Las horas exactas de los registros existentes se muestran en la zona guardada en cada
        jornada. La nueva zona se aplica cuando se crean jornadas nuevas.
      </Notice>
    </Panel>
  );
}
