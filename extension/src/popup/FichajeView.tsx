import { useEffect, useState } from 'react';
import { DateTime } from 'luxon';
import { ask } from '../shared/messages';
import type { HeraSyncResult, HeraWeekPreview, HeraWeekResult } from '../shared/messages';
import { HERA_ORIGIN, HERA_URL } from '../shared/hera';
import type { AttendanceRow } from '../shared/hera';
import { originPattern } from '../shared/patterns';
import { Button, ErrorText, Notice } from '../shared/ui';
import { errorMessage } from '../shared/feedback';

const KIND = { entrada: 'Entrada', salida: 'Salida' } as const;

function WeekPreview({
  preview,
  syncing,
  applying,
  onApply,
  onCancel,
}: {
  preview: HeraWeekPreview;
  syncing: boolean;
  applying: boolean;
  onApply: () => void;
  onCancel: () => void;
}) {
  const time = (iso: string) => DateTime.fromISO(iso, { zone: preview.zone }).toFormat('HH:mm');
  const range = ({ inicio_en, fin_en }: Pick<AttendanceRow, 'inicio_en' | 'fin_en'>) =>
    `${time(inicio_en)}–${fin_en ? time(fin_en) : 'abierto'}`;
  const count = preview.days.reduce((sum, day) => sum + day.create.length + day.update.length, 0);

  return (
    <div className="panel stack stack--tight">
      <h3>Vista previa de la semana</h3>
      <ErrorText>{preview.requestsError}</ErrorText>
      {preview.days.map((day) => {
        const date = DateTime.fromISO(day.date, { zone: preview.zone, locale: 'es' });
        const details = [
          day.segments.length ? `Hera: ${day.segments.map(range).join(', ')}` : '',
          ...day.create.map((segment) => `+ ${range(segment)}`),
          ...day.update.map(({ row, segment }) => `~ ${range(row)} → ${range(segment)}`),
          ...day.same.map(({ segment }) => `= ${range(segment)}`),
          day.onlyChambapp.length
            ? `Solo en Chambapp: ${day.onlyChambapp.map(range).join(', ')}`
            : '',
          day.status === 'incomplete' ? `Incompleto en Hera. ${day.message}` : day.message,
          day.pendingRequests === 1
            ? '1 solicitud pendiente'
            : day.pendingRequests > 1
              ? `${day.pendingRequests} solicitudes pendientes`
              : '',
        ].filter(Boolean);
        return (
          <p key={day.date}>
            <strong>{date.toFormat('cccc dd/MM/yyyy')}</strong>{' '}
            <span className="dim">{details.join(' · ')}</span>
          </p>
        );
      })}
      <div className="row row--wrap">
        <Button variant="primary" disabled={syncing || applying || count === 0} onClick={onApply}>
          {applying ? 'Aplicando…' : `Aplicar ${count} ${count === 1 ? 'cambio' : 'cambios'}`}
        </Button>
        <Button disabled={applying} onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}

/** Adds the last clock-in/out shown in Hera as an attendance in Chambapp. */
export function FichajeView() {
  const [permission, setPermission] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<HeraSyncResult | null>(null);
  const [weekBusy, setWeekBusy] = useState<'preview' | 'apply' | 'requests' | null>(null);
  const [preview, setPreview] = useState<HeraWeekPreview | null>(null);
  const [weekResult, setWeekResult] = useState<HeraWeekResult | null>(null);
  const [requestsCount, setRequestsCount] = useState<number | null>(null);
  const origins = [originPattern(HERA_ORIGIN)];

  useEffect(() => {
    void chrome.permissions.contains({ origins: [originPattern(HERA_ORIGIN)] }).then(setPermission);
  }, []);

  async function grant() {
    setError('');
    try {
      setPermission(await chrome.permissions.request({ origins }));
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }

  async function sync() {
    setBusy(true);
    setError('');
    setResult(null);
    try {
      setResult(await ask<HeraSyncResult>({ type: 'hera-sync' }));
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  async function previewWeek() {
    setWeekBusy('preview');
    setError('');
    setPreview(null);
    setWeekResult(null);
    setRequestsCount(null);
    try {
      setPreview(await ask<HeraWeekPreview>({ type: 'hera-week-preview' }));
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setWeekBusy(null);
    }
  }

  async function refreshRequests() {
    setWeekBusy('requests');
    setError('');
    setRequestsCount(null);
    try {
      const { count } = await ask<{ count: number }>({ type: 'hera-requests-refresh' });
      setRequestsCount(count);
      setPreview((current) => (current ? { ...current, requestsError: undefined } : null));
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setWeekBusy(null);
    }
  }

  async function applyWeek(previewId: string) {
    setWeekBusy('apply');
    setError('');
    try {
      const applied = await ask<HeraWeekResult>({ type: 'hera-week-apply', previewId });
      setWeekResult(applied);
      if (applied.error) setError(applied.error);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setPreview(null);
      setWeekBusy(null);
    }
  }

  return (
    <section className="stack">
      <div>
        <p className="eyebrow">Fichaje</p>
        <h2>Añadir la hora fichada</h2>
        <p className="dim">
          Lee tu última acción en Hera ({new URL(HERA_URL).host}) y la registra en Chambapp: una
          entrada abre un fichaje y una salida cierra el que está abierto.
        </p>
      </div>
      {permission === false ? (
        <Notice title="Falta un permiso">
          <p className="dim">La extensión necesita poder leer Hera.</p>
          <Button onClick={() => void grant()}>Conceder permiso</Button>
        </Notice>
      ) : null}
      <Button
        variant="primary"
        block
        disabled={busy || weekBusy !== null || permission !== true}
        onClick={() => void sync()}
      >
        {busy ? 'Leyendo Hera…' : 'Añadir mi último fichaje'}
      </Button>
      <Button
        block
        disabled={busy || weekBusy !== null || permission !== true}
        onClick={() => void previewWeek()}
      >
        {weekBusy === 'preview' ? 'Leyendo la semana en Hera…' : 'Recuperar fichajes de la semana'}
      </Button>
      <div className="row row--wrap">
        <Button
          variant="ghost"
          disabled={busy || weekBusy !== null || permission !== true}
          onClick={() => void refreshRequests()}
        >
          {weekBusy === 'requests' ? 'Leyendo solicitudes…' : 'Actualizar solicitudes'}
        </Button>
        {requestsCount !== null ? (
          <span className="dim" role="status">
            {requestsCount === 1 ? '1 solicitud leída' : `${requestsCount} solicitudes leídas`}
          </span>
        ) : null}
      </div>
      <ErrorText>{error}</ErrorText>
      {preview ? (
        <WeekPreview
          preview={preview}
          syncing={busy || weekBusy === 'requests'}
          applying={weekBusy === 'apply'}
          onApply={() => void applyWeek(preview.id)}
          onCancel={() => setPreview(null)}
        />
      ) : null}
      {weekResult ? (
        <p className={weekResult.error ? 'dim' : 'form-ok'} role="status">
          {weekResult.created} creados, {weekResult.updated} actualizados
          {weekResult.remaining > 0 ? `. Cambios sin confirmar: ${weekResult.remaining}.` : '.'}
        </p>
      ) : null}
      {result ? (
        <div className="panel stack stack--tight" role="status">
          <p className="eyebrow">Hera</p>
          <p>
            <strong>{KIND[result.action.kind]}</strong>{' '}
            <span className="mono">
              {result.action.date.split('-').reverse().join('/')} {result.action.time}
            </span>
          </p>
          <p className={result.outcome === 'already' ? 'dim' : 'form-ok'}>{result.message}</p>
        </div>
      ) : null}
    </section>
  );
}
