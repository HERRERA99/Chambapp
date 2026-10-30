import { useState } from 'react';
import type { FormEvent } from 'react';
import { DateTime } from 'luxon';
import type { TimeEntry, WorkspaceData } from '../../../domain/models';
import { localDateTimeToIso, todayInZone } from '../../../domain/time';
import { DataError } from '../../../lib/supabase/errors';
import { useFeedback } from '../../../shared/feedback/FeedbackContext';
import { useCommand } from '../../workspace/useCommand';

export function useEntryEditor({
  data,
  entry,
  taskId,
  date,
  onClose,
}: {
  data: WorkspaceData;
  entry?: TimeEntry | null;
  taskId?: string;
  date?: string;
  onClose: () => void;
}) {
  const { run, pending } = useCommand();
  const notify = useFeedback();
  const zone = entry?.zona_horaria ?? data.profile.zona_horaria;
  const projectById = new Map(data.projects.map((project) => [project.id, project]));
  const availableTasks = data.tasks.filter(
    (task) =>
      !task.eliminado_en &&
      ((!task.archivado_en &&
        projectById.has(task.proyecto_id) &&
        !projectById.get(task.proyecto_id)?.archivado_en) ||
        task.id === entry?.tarea_id),
  );
  const initialTask =
    availableTasks.find((task) => task.id === (entry?.tarea_id ?? taskId)) ?? availableTasks[0];
  const start = entry ? DateTime.fromISO(entry.inicio_en, { zone }) : null;
  const end = entry?.fin_en ? DateTime.fromISO(entry.fin_en, { zone }) : null;
  const [projectId, setProjectId] = useState(initialTask?.proyecto_id ?? '');
  const [selectedTask, setSelectedTask] = useState(initialTask?.id ?? '');
  const [startDate, setStartDate] = useState(start?.toISODate() ?? date ?? todayInZone(zone));
  const [endDate, setEndDate] = useState(end?.toISODate() ?? date ?? todayInZone(zone));
  const [startTime, setStartTime] = useState(start?.toFormat('HH:mm:ss') ?? '');
  const [endTime, setEndTime] = useState(end?.toFormat('HH:mm:ss') ?? '');
  const [description, setDescription] = useState(entry?.descripcion ?? '');
  const [imputedInOdoo, setImputedInOdoo] = useState(entry?.imputado_en_odoo ?? false);
  const [error, setError] = useState('');
  const [targetZone, setTargetZone] = useState<string | null>(null);
  const [acceptZone, setAcceptZone] = useState(false);
  const interval = entry?.intervalo_redondeo_minutos ?? data.profile.intervalo_redondeo_minutos;

  function updateProject(value: string) {
    setProjectId(value);
    setSelectedTask(availableTasks.find((task) => task.proyecto_id === value)?.id ?? '');
  }

  function updateStartDate(value: string) {
    setStartDate(value);
    setTargetZone(null);
    setAcceptZone(false);
  }

  function exactStart() {
    // Preserve server precision and the original offset for untouched timestamps.
    return entry && startDate === start?.toISODate() && startTime === start?.toFormat('HH:mm:ss')
      ? entry.inicio_en
      : localDateTimeToIso(startDate, startTime, zone);
  }

  function exactEnd() {
    return entry?.fin_en && endDate === end?.toISODate() && endTime === end?.toFormat('HH:mm:ss')
      ? entry.fin_en
      : localDateTimeToIso(endDate, endTime, zone);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    try {
      if (!selectedTask) throw new Error('Selecciona una tarea para este parte.');
      const inicio = exactStart();
      const fin = exactEnd();
      // Server-confirmed microsecond intervals can collapse to the same browser
      // millisecond. Keep them valid when only notes or Odoo status change.
      const unchangedInterval = entry?.inicio_en === inicio && entry.fin_en === fin;
      if (!unchangedInterval && Date.parse(fin) <= Date.parse(inicio))
        throw new Error('La fecha y hora de fin deben ser posteriores al inicio.');
      if (targetZone && !acceptZone)
        throw new Error('Confirma el cambio de zona horaria antes de guardar.');
      await run(entry ? 'editar_parte' : 'crear_parte', {
        ...(entry ? { id: entry.id, version: entry.version } : {}),
        tarea_id: selectedTask,
        inicio_en: inicio,
        fin_en: fin,
        descripcion: description.trim() || null,
        imputado_en_odoo: imputedInOdoo,
        ...(targetZone && acceptZone ? { confirmar_zona: targetZone } : {}),
      });
      notify(entry ? 'Parte actualizado.' : 'Parte de horas creado.', 'success');
      onClose();
    } catch (cause) {
      const raw =
        cause instanceof DataError
          ? (cause.rawMessage ?? cause.message)
          : cause instanceof Error
            ? cause.message
            : '';
      const nextZone = raw.match(/CONFIRMAR_CAMBIO_ZONA:([^\s]+)/)?.[1];
      if (nextZone) {
        setTargetZone(nextZone);
        setAcceptZone(false);
      }
      setError(cause instanceof Error ? cause.message : 'No se pudo guardar el parte.');
    }
  }

  let duration: number | null = null;
  try {
    const inicio = exactStart();
    const fin = exactEnd();
    const elapsed =
      entry?.inicio_en === inicio && entry.fin_en === fin
        ? entry.duracion_real_segundos
        : (Date.parse(fin) - Date.parse(inicio)) / 1000;
    if (elapsed !== null && Number.isFinite(elapsed) && elapsed > 0) duration = elapsed;
  } catch {
    /* The incomplete form is validated on submit. */
  }

  return {
    pending,
    submit,
    zone,
    interval,
    availableTasks,
    duration,
    projectId,
    updateProject,
    selectedTask,
    setSelectedTask,
    startDate,
    updateStartDate,
    endDate,
    setEndDate,
    startTime,
    setStartTime,
    endTime,
    setEndTime,
    description,
    setDescription,
    imputedInOdoo,
    setImputedInOdoo,
    error,
    targetZone,
    acceptZone,
    setAcceptZone,
  };
}
