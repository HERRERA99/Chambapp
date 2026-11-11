# Extensión de navegador

La extensión de Chambapp (Chrome, Edge y Firefox 140 o superior; Manifest V3) añade tres funciones:

1. **Importar tareas de Odoo.** En la ficha de una tarea de tu Odoo el icono muestra `+`; el popup permite añadirla a Chambapp con su título, ID `T…`, enlace y proyecto.
2. **Enviar partes a Odoo** desde **Parte semanal** («Enviar seleccionados» / «Enviar todos»). La extensión abre la tarea en Odoo, crea la línea en «Partes de horas» usando la propia web (sin API), recarga y comprueba que la línea quedó guardada, y solo entonces marca los partes como imputados.
3. **Gestor de contraseñas** conectado a la bóveda de Chambapp: desbloqueo con la clave maestra, autobloqueo, búsqueda, sugerencias para la web actual, rellenar usuario y contraseña, copiar, generar, crear y editar.

El código está en `extension/`. Reutiliza módulos de la app (cifrado, modelo de credenciales, validaciones, redondeo) y su estética (`src/styles/tokens.css`, iconos).

## Descargarla desde la web

En la app, el menú lateral tiene **Descargar extensión** (debajo de la zona horaria). Descarga `chambapp-extension.zip` y abre un tutorial interactivo paso a paso que detecta la extensión en cuanto se carga. El tutorial se puede volver a ver en **Ajustes → Extensión** (también se abre pulsando el indicador «Extensión» de la cabecera, verde si está instalada y roja si no).

El zip lo genera `npm run ext:pack` en `public/downloads/` (ignorado por git); `npm run build` lo ejecuta antes de compilar la app, así que cada despliegue sirve la última versión. En desarrollo, ejecuta `npm run ext:pack` una vez para que la descarga funcione en `npm run dev`.

## Firefox

`npm run ext:build` genera también `extension/dist-firefox`. Es el mismo código con un manifest propio:

- El fondo se declara con `background.scripts`, porque Firefox no tiene service worker de extensión y ejecuta el mismo módulo como página de fondo.
- El ID es `extension@chambapp-tracker.vercel.app`.
- La declaración de datos que pide Mozilla para extensiones nuevas: datos de acceso, correo de la cuenta y contenido de las tareas de Odoo, todo enviado a la cuenta de Chambapp del usuario.
- Los patrones de URL van sin puerto, porque Firefox ignora los que lo llevan. La extensión sigue comprobando el origen exacto.

`npm run ext:pack` crea `public/downloads/chambapp-extension-firefox.xpi` y `extension.json`.

### Firmarla con Mozilla

Firefox normal solo instala extensiones firmadas por Mozilla. Sin firma, el `.xpi` solo sirve como complemento temporal (`about:debugging` → «Cargar complemento temporal…»), que desaparece al cerrar Firefox. El tutorial de la web explica ese camino mientras no haya versión firmada.

1. Crea una cuenta de desarrollador en [addons.mozilla.org](https://addons.mozilla.org/developers/) y genera las credenciales de API en [Manage API Keys](https://addons.mozilla.org/developers/addon/api/key/).
2. Añádelas a `.env.local` (nunca a variables `VITE_`):
   ```
   AMO_API_KEY=user:12345:67
   AMO_API_SECRET=...
   ```
3. `npm run ext:sign:firefox`. Compila, sube la extensión al canal «no listado» (no aparece en la tienda; se distribuye desde Chambapp) junto con el código fuente y las instrucciones de compilación (Mozilla las pide porque el código está empaquetado con Vite), y guarda el resultado en `extension/signed/chambapp-firefox-<versión>.xpi`.
4. Haz commit de ese archivo. `npm run ext:pack` (y por tanto `npm run build`) lo usa en lugar del paquete sin firmar, y el tutorial cambia solo al flujo de instalación con un clic.

Mozilla solo firma una vez cada versión. Para publicar cambios, sube `version` en `extension/manifest.json` y vuelve a firmar. `vercel.json` sirve los `.xpi` con `Content-Type: application/x-xpinstall`, que es lo que hace que Firefox ofrezca instalarlos directamente.

## Compilar y cargar

```bash
npm install
npm run ext:build        # genera extension/dist (usa VITE_SUPABASE_* de .env.local)
npm run ext:watch        # recompila al guardar
```

1. Abre `chrome://extensions` (o `edge://extensions`) y activa **Modo de desarrollador**.
2. **Cargar descomprimida** → elige la carpeta `extension/dist`.
3. Fija el icono de Chambapp en la barra.

El manifiesto lleva una clave fija, así que el ID es siempre `bpaahhebkaiaihnkjhgnkojhagpaepoc`. Tras recompilar, pulsa **Recargar** en la tarjeta de la extensión y recarga las pestañas de Chambapp y de Odoo.

## Configuración

### Fichaje (Hera)

La pestaña **Fichaje** del popup añade tu último fichaje de Hera (`https://netkia.heraempleados.es/`) a Chambapp, en la conexión activa (nube o local). Al pulsar «Añadir mi último fichaje», la extensión lee el texto `Última acción: ENTRADA|SALIDA dd/mm/aaaa hh:mm` (elemento `#ultima_accion_flexible`). Lo toma de una pestaña de Hera abierta o, si no hay ninguna, de una pestaña en segundo plano que cierra al terminar. Hay que tener la sesión iniciada en Hera.

- Una **ENTRADA** abre un fichaje a esa hora (en tu zona horaria).
- Una **SALIDA** cierra el fichaje abierto a esa hora.

Si ya está registrado, no lo duplica. Si no encaja (por ejemplo, una salida sin entrada abierta, una entrada con otra abierta o anterior a fichajes ya guardados), lo explica y no cambia nada. Necesita el permiso de host para Hera, incluido en el manifiesto; en Firefox, si falta, la sección ofrece «Conceder permiso».

### Conexión: nube o Chambapp local

En **Opciones → Conexión** se elige dónde están los datos. **Nube** es tu cuenta de Chambapp (con inicio de sesión). **Local** es una instalación de [Chambapp local](../docker/README.md), sin cuentas: indica su dirección (por defecto `http://127.0.0.1:47800`) y concede el permiso que pide el navegador para ella. En modo local:

- El popup no pide iniciar sesión. Si la instalación no responde, explica que Docker no está en marcha o que la dirección no es correcta.
- La extensión reconoce las pestañas de la app local (el puente se registra para esa dirección) y la app la muestra como conectada.
- Todas las instalaciones locales comparten el mismo usuario. Por eso la extensión distingue la cuenta por conexión, dirección, instalación y generación de datos (cambia al restaurar una copia). Los envíos a Odoo, la bóveda y las contraseñas en caché son de esa cuenta: al cambiar de conexión se bloquea la bóveda, los intentos en curso se detienen como al cerrar sesión (conservando su estado según lo que llegó a Odoo) y los envíos de otra cuenta quedan apartados hasta volver a ella.
- Cada escritura lleva la generación de datos: si se restauró una copia, el servidor la rechaza.

Prueba en navegador del modo local contra una instalación de prueba: `node tools/docker-smoke/smoke.mjs --build --keep` y después `node tools/ext-smoke/run-local.mjs`.

### Supabase (solo para entrar con Google u otros proveedores)

En **Authentication → URL Configuration → Redirect URLs** añade:

```
https://bpaahhebkaiaihnkjhgnkojhagpaepoc.chromiumapp.org/**
https://b84d062fe84471ab416dc8de220d143c6097ad44.extensions.allizom.org/**
```

La primera es la de Chrome y Edge; la segunda, la de Firefox. Las dos dependen solo del ID de la extensión, así que no cambian.

El acceso con correo y contraseña no necesita nada más. La extensión tiene su propia sesión: no comparte la de la pestaña de la app (Supabase rota los tokens y compartirla cerraría la sesión en ambos sitios).

### Odoo

Icono → menú → **Ajustes** → «Dirección de Odoo» (por ejemplo `https://empresa.odoo.com`) → **Guardar y conceder permiso**. La extensión solo pide permiso para ese origen. Elige también el **formato de fecha** con el que tu Odoo muestra los partes (por defecto `dd/mm/aaaa`): se usa para escribir la fecha y comprobar la línea guardada. Para que Parte semanal pueda enviar, el enlace de Odoo de la tarea debe ser de ese mismo origen.

## Cómo probarla

### Pruebas automáticas

```bash
npm run typecheck && npm run lint && npm test && npm run ext:build
```

Los tests `tests/extension*.test.ts` cubren el protocolo app↔extensión, la cola (deduplicación, estados, recuperación tras interrupciones, revalidación), la detección de tareas de Odoo, la coincidencia de webs para rellenar, la importación sin duplicados y el redondeo del tiempo enviado.

### Prueba en navegador con un Odoo falso

`tools/ext-smoke/odoo-task.html` imita la ficha de una tarea de Odoo (modos normal, lento, rechazado, campo inválido y paginado). `tools/ext-smoke/run.mjs` carga la extensión en Edge, ejecuta el envío contra cada modo, compara los clics con la extensión de referencia (`tools/ext-smoke/reference-extension`), comprueba la detección, el recuento paginado y el autocompletado:

```bash
npm i --no-save playwright-core
npm run ext:build
node tools/ext-smoke/run.mjs            # opcional: ruta del navegador
```

Chrome estable ya no acepta `--load-extension`; Edge sí. El script deja capturas en una carpeta temporal.

### Prueba en Firefox

`tools/ext-smoke/run-firefox.mjs` instala la versión de Firefox en Firefox real y prueba lo siguiente: la página de fondo, los permisos, los ajustes de Odoo, el popup, la detección y la insignia, la inyección de scripts, el autocompletado, la automatización de Odoo (normal, paginada y rechazada) y el indicador verde de la web con el tutorial de Firefox.

```bash
npm i --no-save selenium-webdriver
npm run ext:build
npx vite tools/ui-smoke --config tools/ui-smoke/vite.config.ts      # en otra terminal
MOZ_REMOTE_ALLOW_SYSTEM_ACCESS=1 node tools/ext-smoke/run-firefox.mjs
```

### Prueba manual con tu cuenta

1. **Acceso.** Abre el popup e inicia sesión con tu cuenta de Chambapp. La sesión de la web no se cierra.
2. **Importar tarea.** Configura tu Odoo, abre una tarea: el icono muestra `+`. Abre el popup → pestaña Odoo → revisa nombre y proyecto → **Añadir a Chambapp**. La tarea aparece en Chambapp (recarga si no la ves). Volver a abrir el popup en esa tarea muestra «Ya está en Chambapp».
3. **Enviar a Odoo.** Con `npm run dev` (http://127.0.0.1:5173) o en producción, ve a **Parte semanal**, despliega una tarea con enlace de Odoo y pulsa **Enviar seleccionados** o **Enviar todos**. Se abre una ventana de Odoo en primer plano: Odoo no termina de cargar en una ventana de fondo, así que la extensión la mantiene delante (como mucho 75 s) hasta que se ve la tarea; después puedes volver a lo que estabas haciendo. Al terminar se cierra y los partes quedan como imputados. En la tarea de Odoo verás una sola línea nueva con la fecha, la descripción y el tiempo redondeado. Mientras se envía, esos partes no se pueden editar ni marcar.
   - Si Odoo muestra un error o el resultado no se puede comprobar, el grupo muestra **Revisa Odoo** con «No se creó: reintentar» / «Sí se creó: marcar». Nunca se reenvía solo.
   - Si los partes tienen descripciones distintas, o ninguno tiene descripción, se abre un diálogo para elegir una o escribirla (también se puede modificar la elegida). Odoo recibe una sola descripción.
   - Más de 5 horas pide confirmación.
4. **Contraseñas.** Pestaña Contraseñas → clave maestra de Chambapp → **Desbloquear**. En una web de login con entrada guardada aparece en «Esta web»: pulsa la flecha para rellenar. Prueba también copiar, mostrar, crear una entrada nueva (se ve después en Chambapp → Contraseñas) y el bloqueo automático (Ajustes). Al cerrar el navegador se vuelve a pedir la clave.

### Datos guardados en el navegador

Con proyectos locales (ver [datos-locales.md](datos-locales.md)) la extensión pide los datos a una pestaña abierta de Chambapp de la misma cuenta, con la clave maestra desbloqueada: para listar proyectos al importar una tarea de Odoo, crearla en un proyecto local y revalidar y marcar los partes locales que envía. Sin esa pestaña lo avisa y no toca Odoo.

## Seguridad

- Permisos de host: solo Chambapp (`chambapp-tracker.vercel.app`, `127.0.0.1:5173`), Supabase y el Odoo configurado. Rellenar contraseñas usa `activeTab` (solo tras pulsar en el popup) y solo en el marco principal.
- Solo se rellena sin preguntar en el mismo host de la entrada (ignorando `www.`) y con HTTPS. Subdominios, otras webs y cualquier página sin HTTPS piden confirmación, ligada al origen exacto de la pestaña.
- Al bloquear la bóveda (a mano, por tiempo, al cerrar sesión o cambiar de cuenta) se borran las entradas descifradas y se cierran las vistas abiertas del popup.
- La clave de la bóveda se guarda únicamente en `chrome.storage.session` (memoria del navegador, inaccesible para los scripts de las páginas) y se borra al bloquear, cerrar sesión, cambiar de cuenta, caducar o cerrar el navegador.
- La página de Chambapp y la extensión se comunican con `postMessage` restringido a su propio origen; cada mensaje se valida en ambos lados. Ningún secreto pasa por ese canal.
- Antes de escribir en Odoo se vuelven a leer los partes y la tarea; si algo cambió no se toca Odoo. Antes del primer clic de guardado el service worker registra que la línea puede haberse escrito: tras una interrupción a partir de ese punto el envío queda «a revisar».

## Límites conocidos

- La automatización depende del HTML de Odoo (textos en español/inglés, ids de campos). Se reconoce el campo de proyecto como `project_id` o `display_project_id`, y el código `T…` de la tarea en el campo `code` o al principio del título (`[T457973] …`). El envío espera hasta 60 s a que Odoo muestre la tarea. Otras versiones pueden necesitar ajustar `extension/src/content/odoo-timesheet.ts`.
- El bloqueo de edición durante un envío solo afecta a las pestañas de Chambapp de este navegador. Importar la misma tarea a la vez desde dos navegadores podría duplicarla.
- Los tiempos con segundos (redondeo 0) se envían a Odoo redondeados al minuto superior.
- No hay captura automática de contraseñas al iniciar sesión en webs ni menú dentro de los campos.
- `tools/ext-smoke/reference-extension/` (antes `Extension_App/`) se conserva como referencia; sus archivos tienen los nombres cambiados (por ejemplo, `popup.css` contiene el manifest) y no carga tal cual.
