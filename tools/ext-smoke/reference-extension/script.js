<!doctype html>
<html lang="es">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Partes de Horas - Registro</title>
    <link rel="stylesheet" href="styles.css">
    <meta name="description" content="Registro y gestión de partes de horas">
</head>
<body>
    <header class="site-header">
        <div class="container site-header-content">
            <div class="site-title-group">
                <h1 class="site-title">Partes de Horas</h1>
                <p class="site-sub">Registro y gestión de horas</p>
            </div>
            <nav class="view-tabs">
                <button class="tab-btn active" data-view="registros">Registros</button>
                <button class="tab-btn" data-view="planificador">Planificador</button>
            </nav>
            <div class="search-container">
                <input type="search" id="searchInput" placeholder="Buscar (p:, i:, u:, d:, c:, f:, m:)" aria-label="Buscar tareas">
                <div id="searchResults" class="search-results" aria-live="polite"></div>
            </div>
            <button id="openPlannerSettings" type="button" class="settings-trigger" title="Configuración de la aplicación">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19.14 12.94c.04-.31.06-.62.06-.94s-.02-.63-.07-.94l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.61-.22l-2.39.96a7.25 7.25 0 0 0-1.63-.94L14.36 2.78A.5.5 0 0 0 13.86 2h-3.84a.5.5 0 0 0-.5.42l-.36 2.54c-.59.24-1.13.56-1.63.94l-2.39-.96a.5.5 0 0 0-.61.22L2.61 8.48a.5.5 0 0 0 .12.64l2.03 1.58c-.04.31-.08.63-.08.95s.03.63.08.94l-2.03 1.58a.5.5 0 0 0-.12.64l1.92 3.32a.5.5 0 0 0 .61.22l2.39-.96c.5.38 1.04.7 1.63.94l.36 2.54c.04.24.25.42.5.42h3.84c.25 0 .46-.18.5-.42l.36-2.54c.59-.24 1.13-.55 1.63-.94l2.39.96a.5.5 0 0 0 .61-.22l1.92-3.32a.5.5 0 0 0-.12-.64l-2.02-1.58ZM12 15.5A3.5 3.5 0 1 1 12 8a3.5 3.5 0 0 1 0 7.5Z"/></svg>
                <span>Ajustes</span>
            </button>
        </div>
    </header>

    <div id="plannerSettingsPanel" class="modal planner-settings-modal" aria-hidden="true" style="display:none">
        <div class="modal-backdrop" tabindex="-1"></div>
        <section class="modal-content planner-settings-content" role="dialog" aria-modal="true" aria-labelledby="plannerSettingsTitle">
        <div class="modal-heading">
            <div>
                <p class="modal-kicker">PARTES DE HORAS</p>
                <h3 id="plannerSettingsTitle">Ajustes</h3>
            </div>
            <button id="closePlannerSettings" type="button" class="modal-close" aria-label="Cerrar ajustes">×</button>
        </div>
        <div class="settings-grid">
            <label>Horas semanales
                <input type="number" id="weeklyHoursGoal" value="39" min="0" step="0.5">
            </label>
            <label>Duración del descanso (minutos)
                <input type="number" id="automaticBreakMinutes" value="20" min="0" step="5">
            </label>
            <label>Días laborables por semana
                <input type="number" id="workingDaysPerWeek" value="5" min="1" max="6" step="1">
            </label>
        </div>
        <label class="settings-checkbox"><input type="checkbox" id="automaticBreakEnabled"> Añadir el descanso al calcular la salida sugerida</label>
        <label class="settings-checkbox">Procesos Odoo simultáneos
            <input type="number" id="odooMaxConcurrent" min="1" max="5" step="1" value="5">
        </label>
        <div class="settings-actions">
            <button id="savePlannerSettings" type="button" class="btn primary">Guardar ajustes</button>
            <button id="exportBackup" type="button" class="btn">Exportar copia</button>
            <button id="importBackup" type="button" class="btn">Importar copia</button>
            <input id="importBackupFile" type="file" accept="application/json,.json" hidden>
        </div>
        <p id="backupStatus" class="backup-status" aria-live="polite">La importación reemplaza los datos actuales de Partes de Horas.</p>
        </section>
    </div>

    <div id="view-registros">
        <div class="form-fixed">
        <form id="time-form" class="form container" onsubmit="return false;">
            <div class="left">
                <div id="fecha" class="fecha-label" aria-live="polite"></div>
                <div id="contenedorFecha" class="contenedor-fecha" aria-hidden="false"></div>
                <button id="toggleFecha" type="button" class="btn icon" title="Cambiar vista de fecha">📅</button>
            </div>

            <div class="grid">
                <input type="text" id="proyecto" name="proyecto" placeholder="Proyecto (tarea1)" aria-label="Proyecto">
                <input type="text" id="identificador" name="identificador" placeholder="Identificador" aria-label="Identificador">
                <input type="url" id="url" name="url" placeholder="URL (opcional)" aria-label="URL">
                <div class="descripcion-wrapper" style="display:flex;gap:6px;align-items:center;min-width:0">
                    <input type="text" id="descripcion" name="descripcion" placeholder="Descripción (opcional)" aria-label="Descripción">
                    <button id="openDescModal" type="button" class="btn icon" title="Editar descripción">
                        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" width="16" height="16"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
                    </button>
                </div>
                <input type="time" id="inicio" name="inicio" aria-label="Hora inicio">
                <input type="time" id="fin" name="fin" aria-label="Hora fin">
            </div>

            <div class="actions">
                <button id="agregar" class="btn primary">Agregar</button>
                <button id="limpiar" type="button" class="btn">Limpiar</button>
                <button id="cancelar" type="button" class="btn danger" style="display:none">Cancelar</button>
                <button id="descanso" type="button" class="btn">Descanso</button>
            </div>
        </form>
    </div>

    <main class="container main-content">
        <section aria-labelledby="tabla-title">
            <h2 id="tabla-title">Registros</h2>
            <div class="table-wrapper">
                <table id="tabla" class="table" aria-describedby="tabla-title">
                    <thead>
                        <tr>
                            <th class="select-col"><input type="checkbox" id="selectAll" title="Seleccionar todo"></th>
                            <th>Proyecto</th>
                            <th>Identificador</th>
                            <th>Descripción</th>
                            <th>Inicio</th>
                            <th>Fin</th>
                            <th>Marcado</th>
                            <th>Acciones</th>
                        </tr>
                    </thead>
                    <tbody></tbody>
                </table>
            </div>
        </section>

        <section aria-labelledby="parte-title">
            <h2 id="parte-title">Parte de Horas <button id="toggleAgruparURL" class="small-btn">Agrupar por URL</button></h2>
            <div id="totalHorasDia" class="total-horas-dia" aria-live="polite"></div>
            <div class="table-wrapper">
                <table id="parteHoras" class="table">
                    <thead>
                        <tr>
                            <th>Proyecto</th>
                            <th>Identificador / URL</th>
                            <th>Descripción</th>
                            <th>Horas</th>
                            <th>Hecho</th>
                            <th>Odoo</th>
                        </tr>
                    </thead>
                    <tbody></tbody>
                </table>
            </div>
        </section>

        <section aria-labelledby="mispendientes-title">
            <h2 id="mispendientes-title">Pendientes <small style="font-weight:400;color:var(--muted);margin-left:8px">(tareas por hacer)</small>
                <button id="toggleMinimizePendientes" class="small-btn" style="margin-left:12px">Minimizar</button>
            </h2>
            <div id="misPendientes" class="panel">
                <form id="pendiente-form" class="pendiente-form" onsubmit="return false;" style="display:flex;flex-direction:column;gap:8px;margin-bottom:10px">
                    <div style="display:flex;gap:8px;flex-wrap:wrap">
                        <input type="text" id="pendienteProyecto" placeholder="Proyecto" style="flex:1;min-width:120px">
                        <input type="text" id="pendienteIdentificador" placeholder="Identificador" style="flex:1;min-width:120px">
                        <input type="url" id="pendienteUrl" placeholder="URL (opcional)" style="flex:1;min-width:160px">
                    </div>
                    <input type="text" id="pendienteDescripcion" placeholder="Descripción (opcional)">
                    <textarea id="pendienteNotas" rows="3" placeholder="Notas (opcional)"></textarea>
                    <div style="display:flex;gap:8px;justify-content:flex-end">
                        <input type="hidden" id="pendienteEditingId" value="">
                        <button id="pendienteAdd" class="btn primary">Agregar pendiente</button>
                        <button id="pendienteClear" type="button" class="btn">Limpiar</button>
                    </div>
                </form>
                <div id="pendientesList"></div>
            </div>
            <div id="pendienteMinimizedBar" class="panel oculto" style="display:none;align-items:center;justify-content:space-between;">
                <div style="display:flex;gap:10px;align-items:center">
                    <div id="pendienteMinimizedCount" style="font-weight:700;color:var(--muted)"></div>
                    <div style="color:var(--muted);font-size:0.95rem">Pendientes</div>
                </div>
                <div>
                    <button id="pendienteExpandBtn" class="btn">Abrir</button>
                </div>
            </div>
        </section>

        <section aria-labelledby="pendientes-title">
            <h2 id="pendientes-title">Partes pendientes Odoo <button id="togglePendientes" class="small-btn">Mostrar/Ocultar</button></h2>
            <div class="odoo-queue-actions">
                <button id="seleccionarTodosOdoo" type="button" class="small-btn">Seleccionar todo</button>
                <button id="deseleccionarTodosOdoo" type="button" class="small-btn">Deseleccionar todo</button>
                <button id="procesarSeleccionadosOdoo" type="button" class="small-btn primary">Procesar seleccionados</button>
                <select id="filtroEstadoOdoo" aria-label="Filtrar partes Odoo">
                    <option value="pending">No procesados</option>
                    <option value="all">Todos</option>
                    <option value="success">Procesados</option>
                    <option value="error">Fallidos</option>
                    <option value="processing">Procesando</option>
                </select>
            </div>
            <div id="pendientes" class="oculto panel"></div>
        </section>
    </main>
    </div>

    <div id="view-planificador" style="display:none">
        <div class="container main-content">
            <header class="planner-header">
                <div class="planner-nav">
                    <button id="prevWeek" class="btn">◀ Anterior</button>
                    <h2 id="currentWeekRange">Semana del ...</h2>
                    <button id="nextWeek" class="btn">Siguiente ▶</button>
                </div>
                <div class="planner-settings">
                    <div class="setting-item">
                        <label for="hoursImputedTotal">Horas Imputadas:</label>
                        <input type="text" id="hoursImputedTotal" readonly class="small-input readonly" placeholder="00:00">
                    </div>
                </div>
            </header>

            <section class="planner-section">
                <div class="table-wrapper">
                    <table id="plannerTable" class="table planner-table">
                        <thead>
                            <tr>
                                <th>Concepto</th>
                                <th data-day-name="1">Lunes</th>
                                <th data-day-name="2">Martes</th>
                                <th data-day-name="3">Miércoles</th>
                                <th data-day-name="4">Jueves</th>
                                <th data-day-name="5">Viernes</th>
                                <th data-day-name="6">Sábado</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr class="row-entrada">
                                <td>Entrada</td>
                                <td><input type="time" data-day="1" class="planner-input entry"></td>
                                <td><input type="time" data-day="2" class="planner-input entry"></td>
                                <td><input type="time" data-day="3" class="planner-input entry"></td>
                                <td><input type="time" data-day="4" class="planner-input entry"></td>
                                <td><input type="time" data-day="5" class="planner-input entry"></td>
                                <td><input type="time" data-day="6" class="planner-input entry"></td>
                            </tr>
                            <tr class="row-salida">
                                <td>Salida</td>
                                <td><input type="time" data-day="1" class="planner-input exit"></td>
                                <td><input type="time" data-day="2" class="planner-input exit"></td>
                                <td><input type="time" data-day="3" class="planner-input exit"></td>
                                <td><input type="time" data-day="4" class="planner-input exit"></td>
                                <td><input type="time" data-day="5" class="planner-input exit"></td>
                                <td><input type="time" data-day="6" class="planner-input exit"></td>
                            </tr>
                            <tr class="row-entrada">
                                <td>Entrada 2</td>
                                <td><input type="time" data-day="1" class="planner-input entry2"></td>
                                <td><input type="time" data-day="2" class="planner-input entry2"></td>
                                <td><input type="time" data-day="3" class="planner-input entry2"></td>
                                <td><input type="time" data-day="4" class="planner-input entry2"></td>
                                <td><input type="time" data-day="5" class="planner-input entry2"></td>
                                <td><input type="time" data-day="6" class="planner-input entry2"></td>
                            </tr>
                            <tr class="row-salida">
                                <td>Salida 2</td>
                                <td><input type="time" data-day="1" class="planner-input exit2"></td>
                                <td><input type="time" data-day="2" class="planner-input exit2"></td>
                                <td><input type="time" data-day="3" class="planner-input exit2"></td>
                                <td><input type="time" data-day="4" class="planner-input exit2"></td>
                                <td><input type="time" data-day="5" class="planner-input exit2"></td>
                                <td><input type="time" data-day="6" class="planner-input exit2"></td>
                            </tr>
                            <tr class="row-permanencia">
                                <td>Imputadas (Fichado)</td>
                                <td data-day="1">00:00</td>
                                <td data-day="2">00:00</td>
                                <td data-day="3">00:00</td>
                                <td data-day="4">00:00</td>
                                <td data-day="5">00:00</td>
                                <td data-day="6">00:00</td>
                            </tr>
                            <tr class="row-estimadas">
                                <td>Horas Estimadas</td>
                                <td><input type="text" data-day="1" class="planner-input estimate" placeholder="00:00"></td>
                                <td><input type="text" data-day="2" class="planner-input estimate" placeholder="00:00"></td>
                                <td><input type="text" data-day="3" class="planner-input estimate" placeholder="00:00"></td>
                                <td><input type="text" data-day="4" class="planner-input estimate" placeholder="00:00"></td>
                                <td><input type="text" data-day="5" class="planner-input estimate" placeholder="00:00"></td>
                                <td><input type="text" data-day="6" class="planner-input estimate" placeholder="00:00"></td>
                            </tr>
                            <tr class="row-imputadas">
                                <td>Partes (Tareas)</td>
                                <td data-day="1">00:00</td>
                                <td data-day="2">00:00</td>
                                <td data-day="3">00:00</td>
                                <td data-day="4">00:00</td>
                                <td data-day="5">00:00</td>
                                <td data-day="6">00:00</td>
                            </tr>
                            <tr class="row-porcentaje">
                                <td>% Partes / Imputadas</td>
                                <td data-day="1">0%</td>
                                <td data-day="2">0%</td>
                                <td data-day="3">0%</td>
                                <td data-day="4">0%</td>
                                <td data-day="5">0%</td>
                                <td data-day="6">0%</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </section>

            <section class="planner-results">
                <div class="result-card">
                    <h3>Hoy debe salir a las:</h3>
                    <div id="suggestedExitTime" class="exit-time-value">--:--</div>
                    <label class="daily-goal-label" for="desiredTodayHours">
                        Horas que quiero hacer hoy
                        <input type="time" id="desiredTodayHours" step="900" aria-describedby="exitCalculationNote">
                    </label>
                    <p id="exitCalculationNote" class="small-note">Indica las horas para ver tu salida.</p>
                </div>
                <div class="result-card">
                    <h3>Total Imputado (Fichado) esta semana:</h3>
                    <div id="totalWeeklyWorked" class="exit-time-value">00:00</div>
                    <p id="weeklyBalance" class="small-note">Faltan --:-- para el objetivo</p>
                </div>
            </section>
        </div>
    </div>
    <footer class="site-footer">
        <div class="container">© <span id="year"></span> Partes de Horas</div>
    </footer>

    <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
    <script src="script.js"></script>
    <!-- Modal para editar descripción (opcional) -->
    <div id="descModal" class="modal" aria-hidden="true" style="display:none;">
        <div class="modal-backdrop" tabindex="-1"></div>
        <div class="modal-content" role="dialog" aria-modal="true" aria-labelledby="descModalTitle">
            <h3 id="descModalTitle">Descripción</h3>
            <textarea id="descripcionModal" rows="6" placeholder="Escribe la descripción aquí..."></textarea>
            <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:8px;">
                <button id="closeDescModal" type="button" class="btn">Cerrar</button>
                <button id="saveDescModal" type="button" class="btn primary">Guardar</button>
            </div>
        </div>
    </div>
</body>
</html>