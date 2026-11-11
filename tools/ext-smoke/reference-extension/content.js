const COLA_KEY = 'odoo_cola_v1';
const AJUSTES_KEY = 'odoo_ajustes_v1';
const MAX_CONCURRENCIA_DEFECTO = 5;
const TIMEOUT_PROCESO = 90000;
const uiTabs = new Set();
let ejecutando = false;
let actualizaciones = Promise.resolve();

const UMBRAL_ADVERTENCIA_ODOO_MINUTOS = 5 * 60;

function obtenerMinutosParteOdoo(parte) {
  const coincidencia = String(parte?.horasFormato || '').trim().match(/^(\d+):([0-5]\d)$/);
  if (!coincidencia) return null;
  const minutos = Number(coincidencia[1]) * 60 + Number(coincidencia[2]);
  if (!Number.isSafeInteger(minutos)) return null;
  if (parte?.horas !== undefined && parte.horas !== null && String(parte.horas).trim() !== '') {
    const horas = Number(parte.horas);
    if (!Number.isFinite(horas) || horas <= 0) return null;
  }
  return minutos;
}

function validarParteOdoo(parte) {
  const errores = [];
  if (!String(parte?.fecha || '').trim()) errores.push('la fecha está vacía');
  if (!String(parte?.descripcion || '').trim()) errores.push('la descripción está vacía');
  if (!String(parte?.url || '').trim()) errores.push('la URL de Odoo está vacía');
  const minutos = obtenerMinutosParteOdoo(parte);
  if (minutos === null || minutos <= 0) errores.push('el tiempo debe ser mayor que 00:00');
  if (minutos > UMBRAL_ADVERTENCIA_ODOO_MINUTOS && parte?.confirmacionHorasLargas !== true) {
    errores.push('el parte supera las 5 horas y requiere confirmación');
  }
  return { ok: errores.length === 0, errores };
}

function nuevoId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

async function leerCola() {
  const { [COLA_KEY]: cola = [] } = await chrome.storage.local.get(COLA_KEY);
  return Array.isArray(cola) ? cola : [];
}

async function guardarCola(cola) {
  await chrome.storage.local.set({ [COLA_KEY]: cola });
  notificarUI({ type: 'odoo-cola-actualizada', cola });
}

async function limiteConcurrencia() {
  const { [AJUSTES_KEY]: ajustes = {} } = await chrome.storage.local.get(AJUSTES_KEY);
  const valor = Number(ajustes.maxConcurrent);
  return Math.min(5, Math.max(1, Number.isFinite(valor) ? Math.round(valor) : MAX_CONCURRENCIA_DEFECTO));
}

function notificarUI(mensaje) {
  for (const tabId of uiTabs) {
    chrome.tabs.sendMessage(tabId, mensaje, () => void chrome.runtime.lastError);
  }
}

function enviar(tabId, mensaje, timeout = TIMEOUT_PROCESO) {
  return new Promise((resolve, reject) => {
    let terminado = false;
    const temporizador = setTimeout(() => {
      if (!terminado) { terminado = true; reject(new Error('Tiempo de espera agotado procesando el parte.')); }
    }, timeout);
    chrome.tabs.sendMessage(tabId, mensaje, respuesta => {
      if (terminado) return;
      terminado = true;
      clearTimeout(temporizador);
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve(respuesta);
    });
  });
}

async function enviarCuandoEsteListo(tabId, mensaje) {
  const inicio = Date.now();
  let ultimoError;
  while (Date.now() - inicio < TIMEOUT_PROCESO) {
    try {
      return await enviar(tabId, mensaje, TIMEOUT_PROCESO - (Date.now() - inicio));
    } catch (error) {
      ultimoError = error;
      if (!/Receiving end does not exist|Could not establish connection|No se pudo comunicar/i.test(error.message)) throw error;
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
  throw ultimoError || new Error('La pestaña de Odoo no estuvo disponible.');
}

async function encolar(partes) {
  const cola = await leerCola();
  const añadidos = [];
  for (const parte of partes) {
    if (!parte) continue;
    const clave = parte.queueKey || `${parte.fecha}|${parte.url}|${parte.descripcion}|${parte.horasFormato}`;
    const validacion = validarParteOdoo(parte);
    const existente = cola.find(item => item.queueKey === clave && ['pending', 'processing', 'success'].includes(item.status));
    if (existente) {
      if (existente.status === 'pending' && validacion.ok) {
        existente.parte = { ...parte };
        existente.updatedAt = Date.now();
      }
      añadidos.push(existente);
      continue;
    }
    const item = {
      id: nuevoId(), queueKey: clave, parte: { ...parte }, status: 'pending',
      attempts: 0, error: '', createdAt: Date.now(), updatedAt: Date.now(), tabId: null
    };
    if (!validacion.ok) {
      item.status = 'error';
      item.error = `No se puede crear el parte: ${validacion.errores.join('; ')}.`;
    }
    cola.push(item);
    añadidos.push(item);
  }
  await guardarCola(cola);
  procesarCola();
  return añadidos;
}

async function actualizarItem(id, cambios) {
  const operacion = actualizaciones.then(async () => {
    const cola = await leerCola();
    const item = cola.find(elemento => elemento.id === id);
    if (!item) return;
    Object.assign(item, cambios, { updatedAt: Date.now() });
    await guardarCola(cola);
  });
  actualizaciones = operacion.catch(() => {});
  return operacion;
}

async function procesarItem(item) {
  let ventana;
  let completado = false;
  try {
    const validacion = validarParteOdoo(item.parte);
    if (!validacion.ok) throw new Error(`No se puede crear el parte: ${validacion.errores.join('; ')}.`);
    ventana = await chrome.windows.create({ url: item.parte.url, focused: true, type: 'normal' });
    const pestaña = ventana.tabs?.[0];
    if (!pestaña?.id) throw new Error('No se pudo abrir la ventana de Odoo.');
    await actualizarItem(item.id, { status: 'processing', attempts: item.attempts + 1, tabId: pestaña.id, error: '' });
    await esperarCarga(pestaña.id);
    const respuesta = await enviarCuandoEsteListo(pestaña.id, { type: 'procesar-parte-odoo', parte: item.parte });
    if (!respuesta?.ok) throw new Error(respuesta?.error || 'Odoo no confirmó el guardado.');
    completado = true;
    await actualizarItem(item.id, { status: 'success', error: '', tabId: null, completedAt: Date.now() });
  } catch (error) {
    await actualizarItem(item.id, { status: 'error', error: error.message, tabId: null });
  } finally {
    // Mantener la ventana si falla para poder revisar Odoo y reintentar manualmente.
    if (completado && ventana?.id) chrome.windows.remove(ventana.id, () => void chrome.runtime.lastError);
  }
}

function esperarCarga(tabId, timeout = TIMEOUT_PROCESO) {
  return new Promise((resolve, reject) => {
    const inicio = Date.now();
    const comprobar = () => chrome.tabs.get(tabId, tab => {
      if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
      if (tab.status === 'complete') return resolve();
      if (Date.now() - inicio >= timeout) return reject(new Error('La página de Odoo no terminó de cargar.'));
      setTimeout(comprobar, 250);
    });
    comprobar();
  });
}

async function procesarCola() {
  if (ejecutando) return;
  ejecutando = true;
  try {
    while (true) {
      const cola = await leerCola();
      const activos = cola.filter(item => item.status === 'processing');
      const disponibles = Math.max(0, (await limiteConcurrencia()) - activos.length);
      const pendientes = cola.filter(item => item.status === 'pending').slice(0, disponibles);
      if (!pendientes.length) break;
      await Promise.all(pendientes.map(procesarItem));
    }
  } finally {
    ejecutando = false;
  }
}

chrome.runtime.onMessage.addListener((mensaje, sender, responder) => {
  if (sender.tab?.id) uiTabs.add(sender.tab.id);
  if (mensaje.type === 'guardar-ultimo-parte') {
    responder?.({ ok: true });
    chrome.storage.local.set({ ultimoParte: mensaje.parte });
    return;
  }
  if (mensaje.type === 'encolar-partes-odoo') {
    encolar(Array.isArray(mensaje.partes) ? mensaje.partes : [mensaje.parte])
      .then(items => responder({ ok: true, items }))
      .catch(error => responder({ ok: false, error: error.message }));
    return true;
  }
  if (mensaje.type === 'obtener-cola-odoo') {
    leerCola().then(cola => responder({ ok: true, cola }));
    return true;
  }
  if (mensaje.type === 'reintentar-partes-odoo') {
    responder?.({ ok: true });
    leerCola().then(async cola => {
      const ids = mensaje.ids || [];
      for (const item of cola) if (ids.includes(item.id)) {
        const parte = ids.length === 1 && mensaje.parte ? { ...mensaje.parte } : { ...item.parte };
        const minutos = obtenerMinutosParteOdoo(parte);
        parte.confirmacionHorasLargas = minutos > UMBRAL_ADVERTENCIA_ODOO_MINUTOS && mensaje.confirmarHorasLargas === true;
        item.parte = parte;
        item.status = 'pending'; item.error = ''; item.tabId = null;
      }
      await guardarCola(cola); procesarCola();
    });
    return;
  }
  if (mensaje.type === 'configurar-odoo') {
    responder?.({ ok: true });
    chrome.storage.local.set({ [AJUSTES_KEY]: { maxConcurrent: mensaje.maxConcurrent } })
      .then(() => { procesarCola(); });
    return;
  }
  if (mensaje.type === 'exportar-datos-json' && sender.tab?.id) {
    chrome.tabs.sendMessage(sender.tab.id, { type: 'leer-datos-json' }, responder);
    return true;
  }
});

chrome.tabs.onRemoved.addListener(tabId => {
  uiTabs.delete(tabId);
  leerCola().then(async cola => {
    let cambiado = false;
    for (const item of cola) if (item.tabId === tabId && item.status === 'processing') {
      item.status = 'error'; item.error = 'La pestaña de Odoo se cerró durante el proceso.'; item.tabId = null; cambiado = true;
    }
    if (cambiado) await guardarCola(cola);
    procesarCola();
  });
});

chrome.alarms.create('odoo-cola', { periodInMinutes: 1 });
chrome.alarms.onAlarm.addListener(alarm => { if (alarm.name === 'odoo-cola') procesarCola(); });
procesarCola();

