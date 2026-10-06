import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { InputField, SelectField } from '../../shared/ui/FormField';
import { Button } from '../../shared/ui/Button';
import { Panel } from '../../shared/ui/Panel';
import { useCommand } from '../workspace/useCommand';
import { fetchHolidays, selectedHolidays } from './holidayApi';

const spanishRegions: Record<string, string> = {
  'ES-AN': 'Andalucía',
  'ES-AR': 'Aragón',
  'ES-AS': 'Asturias',
  'ES-CB': 'Cantabria',
  'ES-CL': 'Castilla y León',
  'ES-CM': 'Castilla-La Mancha',
  'ES-CN': 'Canarias',
  'ES-CT': 'Cataluña',
  'ES-EX': 'Extremadura',
  'ES-GA': 'Galicia',
  'ES-IB': 'Illes Balears',
  'ES-MC': 'Región de Murcia',
  'ES-MD': 'Comunidad de Madrid',
  'ES-NC': 'Navarra',
  'ES-PV': 'País Vasco',
  'ES-RI': 'La Rioja',
  'ES-VC': 'Comunitat Valenciana',
  'ES-CE': 'Ceuta',
  'ES-ML': 'Melilla',
};

export function HolidaySync({ year }: { year: number }) {
  const [country, setCountry] = useState('ES');
  const [region, setRegion] = useState('');
  const [message, setMessage] = useState('');
  const { run, pending } = useCommand();
  const holidays = useQuery({
    queryKey: ['public-holidays', year, country],
    queryFn: ({ signal }) => fetchHolidays(year, country, signal),
    enabled: /^[A-Z]{2}$/.test(country),
    retry: false,
    staleTime: 3600_000,
  });
  const regions = [
    ...new Set(holidays.data?.flatMap((holiday) => holiday.counties ?? []) ?? []),
  ].sort();
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
      <div className="toolbar">
        <InputField
          label="País (código ISO, p. ej. ES, PT, FR)"
          maxLength={2}
          value={country}
          disabled={pending}
          onChange={(e) => {
            setCountry(e.target.value.toUpperCase());
            setRegion('');
            setMessage('');
          }}
        />
        <SelectField
          label="Región"
          value={region}
          disabled={pending || holidays.isFetching}
          onChange={(e) => {
            setRegion(e.target.value);
            setMessage('');
          }}
        >
          <option value="">Solo nacionales</option>
          {regions.map((code) => (
            <option key={code} value={code}>
              {spanishRegions[code] ?? code}
            </option>
          ))}
        </SelectField>
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
