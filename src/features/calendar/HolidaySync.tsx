import { useState } from 'react';
import { Link } from 'react-router-dom';
import { paths } from '../../app/paths';
import type { HolidayPreference } from '../../domain/holidayPreference';
import { InputField, SelectField } from '../../shared/ui/FormField';
import { Button } from '../../shared/ui/Button';
import { Panel } from '../../shared/ui/Panel';
import { useCommand } from '../workspace/useCommand';
import { selectedHolidays } from './holidayApi';
import { holidayRegionName, usePublicHolidays } from './usePublicHolidays';

const countryNames = new Intl.DisplayNames('es', { type: 'region' });

export function HolidaySync({
  year,
  preference,
}: {
  year: number;
  preference: HolidayPreference | null;
}) {
  const [manualCountry, setManualCountry] = useState('ES');
  const [manualRegion, setManualRegion] = useState('');
  const country = preference?.pais ?? manualCountry;
  const region = preference?.region ?? manualRegion;
  const [message, setMessage] = useState('');
  const { run, pending } = useCommand();
  const { holidays, regions } = usePublicHolidays(year, country);
  const selected = selectedHolidays(holidays.data ?? [], region);
  async function sync() {
    setMessage('');
    try {
      const result = await run<{ sincronizados: number }>('sincronizar_festivos', {
        ambito: region ? `${country}:${region}` : country,
        anio: year,
        festivos: selected,
      });
      setMessage(
        `${result.sincronizados} festivos sincronizados. Los registros manuales se conservan.`,
      );
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : 'No se pudo sincronizar.');
    }
  }
  return (
    <Panel title="Sincronizar festivos" icon="globe">
      <p className="muted">
        Consulta Nager para {year}. Incluye los festivos nacionales y los de la región seleccionada.
        Añade manualmente los locales que falten. Los ámbitos importados anteriormente se conservan;
        puedes eliminar sus fechas desde el calendario.
      </p>
      {preference ? (
        <p className="muted">
          Festivos de {countryNames.of(country) ?? country}
          {region ? ` / ${holidayRegionName(region)}` : ''} ·{' '}
          <Link className="text-button" to={`${paths.settings}#perfil`}>
            Cambiar en Ajustes
          </Link>
        </p>
      ) : null}
      <div className="toolbar">
        {!preference ? (
          <>
            <InputField
              label="País (código ISO, p. ej. ES, PT, FR)"
              maxLength={2}
              value={country}
              disabled={pending}
              onChange={(e) => {
                setManualCountry(e.target.value.toUpperCase());
                setManualRegion('');
                setMessage('');
              }}
            />
            <SelectField
              label="Región"
              value={region}
              disabled={pending || holidays.isFetching}
              onChange={(e) => {
                setManualRegion(e.target.value);
                setMessage('');
              }}
            >
              <option value="">Solo nacionales</option>
              {regions.map((code) => (
                <option key={code} value={code}>
                  {holidayRegionName(code)}
                </option>
              ))}
            </SelectField>
          </>
        ) : null}
        <Button
          icon="activity"
          disabled={pending || holidays.isFetching}
          onClick={() => void holidays.refetch()}
        >
          Actualizar consulta
        </Button>
      </div>
      {holidays.isFetching ? <p role="status">Consultando festivos…</p> : null}
      {holidays.error ? (
        <p role="alert" className="form-error">
          {holidays.error.message}
        </p>
      ) : null}
      {holidays.data ? (
        <>
          <p className="muted">
            {selected.length} festivos para importar. Repetir la sincronización actualiza los
            nombres sin duplicar fechas del mismo ámbito.
          </p>
          <div className="holiday-sync-preview">
            {selected.map((holiday) => (
              <div key={holiday.fecha}>
                <span className="mono">{holiday.fecha}</span>
                <span>{holiday.titulo}</span>
              </div>
            ))}
          </div>
          <Button
            variant="primary"
            disabled={pending || holidays.isFetching || !selected.length || !!holidays.error}
            onClick={() => void sync()}
          >
            {pending ? 'Sincronizando…' : 'Sincronizar estos festivos'}
          </Button>
        </>
      ) : null}
      {message ? <p role="status">{message}</p> : null}
    </Panel>
  );
}
