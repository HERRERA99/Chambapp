import { DateTime } from 'luxon';
import { validHolidayCountry } from '../../../domain/holidayPreference';
import { Panel, Badge } from '../../../shared/ui/Panel';
import { InputField, SelectField } from '../../../shared/ui/FormField';
import { holidayRegionName, usePublicHolidays } from '../../calendar/usePublicHolidays';
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
  active,
  value,
  onChange,
  disabled,
}: {
  active: boolean;
  value: ProfileDraft;
  onChange: (value: ProfileDraft) => void;
  disabled: boolean;
}) {
  const options = zones.includes(value.zonaHoraria) ? zones : [value.zonaHoraria, ...zones];
  const { pais, region } = value.holidays;
  const year = DateTime.now().setZone(value.zonaHoraria).year;
  const { holidays, regions } = usePublicHolidays(year, pais, active);
  const missingRegion = region && !regions.includes(region);
  return (
    <Panel
      id="perfil"
      title="Perfil y zona horaria"
      icon="globe"
      action={<Badge>{value.zonaHoraria.replaceAll('_', ' ')}</Badge>}
    >
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
          hint="Se aplica a las jornadas nuevas; las existentes conservan su zona."
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
        <InputField
          label="País de los festivos"
          hint="Código ISO de dos letras, p. ej. ES."
          value={pais}
          maxLength={2}
          aria-invalid={pais !== '' && !validHolidayCountry(pais)}
          onChange={(event) => {
            const country = event.target.value.trim().toUpperCase();
            if (country !== pais) onChange({ ...value, holidays: { pais: country, region: '' } });
          }}
          disabled={disabled}
        />
        <SelectField
          label="Región"
          hint={holidays.isFetching ? 'Consultando regiones…' : holidays.error?.message}
          value={region}
          onChange={(event) =>
            onChange({ ...value, holidays: { pais, region: event.target.value } })
          }
          disabled={disabled || !validHolidayCountry(pais) || holidays.isFetching}
        >
          <option value="">Solo nacionales</option>
          {missingRegion ? <option value={region}>{holidayRegionName(region)}</option> : null}
          {regions.map((code) => (
            <option key={code} value={code}>
              {holidayRegionName(code)}
            </option>
          ))}
        </SelectField>
      </div>
    </Panel>
  );
}
