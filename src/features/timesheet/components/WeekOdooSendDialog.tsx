import { useState } from 'react';
import { DateTime } from 'luxon';
import { Modal } from '../../../shared/ui/Modal';
import { Button } from '../../../shared/ui/Button';
import { Icon } from '../../../shared/ui/Icon';
import { formatHoursMinutes, MAX_ODOO_DESCRIPTION, odooMinutes } from '../../extension/protocol';
import type { WeekOdooSendRow } from '../timesheet.model';

export type WeekOdooSendSelection = {
  row: WeekOdooSendRow;
  descripcion: string;
};

function shortDay(date: string) {
  return DateTime.fromISO(date, { zone: 'UTC' }).setLocale('es').toFormat('ccc d');
}

function descriptionProblem(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) return 'Escribe una descripción.';
  if ([...trimmed].length > MAX_ODOO_DESCRIPTION)
    return `Máximo ${MAX_ODOO_DESCRIPTION} caracteres.`;
  return null;
}

/**
 * Reviews every pending group of the visible week before handing the selected
 * lines one by one to the browser extension.
 */
export function WeekOdooSendDialog({
  open,
  weekLabel,
  rows,
  onClose,
  onConfirm,
}: {
  open: boolean;
  weekLabel: string;
  rows: readonly WeekOdooSendRow[];
  onClose: () => void;
  onConfirm: (items: WeekOdooSendSelection[]) => Promise<void>;
}) {
  const sendable = rows.filter((row) => row.exclusionReason === null && row.request !== null);
  const excluded = rows.filter((row) => row.exclusionReason !== null || row.request === null);

  const [checked, setChecked] = useState<ReadonlySet<string>>(
    () => new Set(sendable.map((row) => row.group.key)),
  );
  const [descriptions, setDescriptions] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const row of sendable) {
      // Same default as a single send: the one description, the joined ones or the task title.
      initial[row.group.key] = row.request?.descripcion ?? row.choices[0] ?? '';
    }
    return initial;
  });
  const [submitting, setSubmitting] = useState(false);

  const checkedRows = sendable.filter((row) => checked.has(row.group.key));
  const checkedCount = checkedRows.length;
  const checkedMinutes = checkedRows.reduce((sum, row) => sum + (row.request?.minutos ?? 0), 0);
  const longCheckedCount = checkedRows.filter((row) => row.isLong).length;
  const hasInvalidChecked = checkedRows.some(
    (row) => descriptionProblem(descriptions[row.group.key] ?? '') !== null,
  );
  const allChecked = sendable.length > 0 && checkedCount === sendable.length;
  const canConfirm = !submitting && checkedCount > 0 && !hasInvalidChecked;

  function toggleRow(key: string, nextChecked: boolean) {
    setChecked((current) => {
      const next = new Set(current);
      if (nextChecked) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  function toggleAll(nextChecked: boolean) {
    setChecked(nextChecked ? new Set(sendable.map((row) => row.group.key)) : new Set());
  }

  function setDescription(key: string, value: string) {
    setDescriptions((current) => ({ ...current, [key]: value }));
  }

  async function handleConfirm() {
    if (!canConfirm) return;
    setSubmitting(true);
    try {
      await onConfirm(
        checkedRows.map((row) => ({
          row,
          descripcion: (descriptions[row.group.key] ?? '').trim(),
        })),
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={() => {
        if (!submitting) onClose();
      }}
      title="Enviar semana a Odoo"
      description={weekLabel}
      size="wide"
      className="week-odoo-dialog"
    >
      <div className="week-odoo-dialog__table-wrap">
        <table className="week-odoo-dialog__table">
          <thead>
            <tr>
              <th className="week-odoo-dialog__col-check">
                <input
                  type="checkbox"
                  checked={allChecked}
                  disabled={submitting || sendable.length === 0}
                  aria-label="Seleccionar todas las líneas enviables"
                  onChange={(event) => toggleAll(event.target.checked)}
                />
              </th>
              <th className="week-odoo-dialog__col-day">Día</th>
              <th className="week-odoo-dialog__col-task">Tarea</th>
              <th className="week-odoo-dialog__col-hours">Horas</th>
              <th className="week-odoo-dialog__col-desc">Descripción</th>
            </tr>
          </thead>
          <tbody>
            {sendable.map((row) => {
              const key = row.group.key;
              const isChecked = checked.has(key);
              const text = descriptions[key] ?? '';
              const problem = isChecked ? descriptionProblem(text) : null;
              const choiceIndex = row.choices.indexOf(text);
              const selectValue = choiceIndex >= 0 ? String(choiceIndex) : 'other';
              return (
                <tr
                  key={key}
                  className={`week-odoo-dialog__row ${row.isLong ? 'week-odoo-dialog__row--long' : ''}`}
                >
                  <td className="week-odoo-dialog__col-check">
                    <input
                      type="checkbox"
                      checked={isChecked}
                      disabled={submitting}
                      aria-label={`Incluir ${row.group.title} (${shortDay(row.group.date)})`}
                      onChange={(event) => toggleRow(key, event.target.checked)}
                    />
                  </td>
                  <td className="week-odoo-dialog__col-day">{shortDay(row.group.date)}</td>
                  <td className="week-odoo-dialog__col-task">
                    <span className="week-odoo-dialog__task">
                      <span>{row.group.title}</span>
                      {row.group.odooId ? (
                        <span className="timesheet__odoo-id mono" title={row.group.odooId}>
                          {row.group.odooId}
                        </span>
                      ) : null}
                    </span>
                  </td>
                  <td className="week-odoo-dialog__col-hours">
                    <span className="week-odoo-dialog__hours">
                      <span className="mono">{row.request!.horasFormato}</span>
                      {row.isLong ? (
                        <span className="badge badge--warning" title="Supera las 5 horas">
                          &gt; 5 h
                        </span>
                      ) : null}
                    </span>
                  </td>
                  <td className="week-odoo-dialog__col-desc">
                    {row.needsDescription ? (
                      <div className="week-odoo-dialog__desc-controls">
                        {row.choices.length > 1 ? (
                          <select
                            aria-label={`Elegir descripción para ${row.group.title} (${shortDay(row.group.date)})`}
                            value={selectValue}
                            disabled={submitting}
                            onChange={(event) => {
                              if (event.target.value !== 'other') {
                                setDescription(key, row.choices[Number(event.target.value)] ?? '');
                              }
                            }}
                          >
                            {row.choices.map((choice, index) => (
                              <option key={choice} value={String(index)}>
                                {choice}
                              </option>
                            ))}
                            <option value="other">Escribir otra…</option>
                          </select>
                        ) : null}
                        <input
                          type="text"
                          value={text}
                          disabled={submitting}
                          maxLength={MAX_ODOO_DESCRIPTION}
                          placeholder="Escribe una descripción…"
                          aria-label={`Descripción para ${row.group.title} (${shortDay(row.group.date)})`}
                          aria-invalid={problem !== null}
                          onChange={(event) => setDescription(key, event.target.value)}
                        />
                        {problem ? (
                          <span className="week-odoo-dialog__field-error" role="alert">
                            {problem}
                          </span>
                        ) : null}
                      </div>
                    ) : (
                      <span className="week-odoo-dialog__desc-text">{text}</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {excluded.map((row) => (
              <tr
                key={row.group.key}
                className="week-odoo-dialog__row week-odoo-dialog__row--excluded"
              >
                <td className="week-odoo-dialog__col-check" />
                <td className="week-odoo-dialog__col-day">{shortDay(row.group.date)}</td>
                <td className="week-odoo-dialog__col-task">
                  <span className="week-odoo-dialog__task">
                    <span>{row.group.title}</span>
                    {row.group.odooId ? (
                      <span className="timesheet__odoo-id mono" title={row.group.odooId}>
                        {row.group.odooId}
                      </span>
                    ) : null}
                  </span>
                </td>
                <td className="week-odoo-dialog__col-hours">
                  <span className="mono dim">
                    {formatHoursMinutes(odooMinutes(row.group.pendingLoggedSeconds))}
                  </span>
                </td>
                <td className="week-odoo-dialog__col-desc">
                  <span className="week-odoo-dialog__reason">{row.exclusionReason}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {longCheckedCount > 0 ? (
        <p className="week-odoo-dialog__long-warning" role="note">
          <Icon name="info" size={14} />
          <span>
            {longCheckedCount === 1
              ? 'Hay 1 línea que supera las 5 horas. Al confirmar aceptas imputarla en Odoo.'
              : `Hay ${longCheckedCount} líneas que superan las 5 horas. Al confirmar aceptas imputarlas en Odoo.`}
          </span>
        </p>
      ) : null}

      <div className="week-odoo-dialog__footer">
        <p className="week-odoo-dialog__summary" aria-live="polite">
          Total marcado: <strong className="mono">{formatHoursMinutes(checkedMinutes)}</strong> (
          {checkedCount} {checkedCount === 1 ? 'línea' : 'líneas'})
        </p>
        <p className="week-odoo-dialog__notice dim">
          La extensión abre Odoo y envía las líneas de una en una; no cierres el navegador mientras
          tanto.
        </p>
      </div>

      <div className="form-actions">
        <Button variant="ghost" disabled={submitting} onClick={onClose}>
          Cancelar
        </Button>
        <Button
          id="week-odoo-dialog-confirm"
          variant="primary"
          disabled={!canConfirm}
          onClick={() => void handleConfirm()}
        >
          {submitting
            ? 'Enviando…'
            : `Enviar ${checkedCount} ${checkedCount === 1 ? 'línea' : 'líneas'}`}
        </Button>
      </div>
    </Modal>
  );
}
