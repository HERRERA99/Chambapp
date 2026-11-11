<!doctype html>
<html lang="es">
<head><meta charset="utf-8"><title>Último parte</title><link rel="stylesheet" href="popup.css"></head>
<body>
  <h1>Último parte</h1>
  <div id="estado">Todavía no hay ningún parte exportado.</div>
  <dl id="datos" hidden>
    <dt>Fecha</dt><dd id="fecha"></dd>
    <dt>URL</dt><dd id="url"></dd>
    <dt>Descripción</dt><dd id="descripcion"></dd>
    <dt>Horas</dt><dd id="horas"></dd>
  </dl>
  <button id="copiar" hidden>Copiar JSON</button>
  <button id="pegar" hidden>Pegar en esta pestaña</button>
  <button id="importarTarea">Importar tarea actual a Pendientes</button>
  <hr>
  <h2>Cola Odoo</h2>
  <p id="colaResumen">Cargando…</p>
  <button id="reintentarFallidos">Reintentar fallidos</button>
  <p id="resultado" role="status"></p>
  <script src="popup.js"></script>
</body>
</html>
