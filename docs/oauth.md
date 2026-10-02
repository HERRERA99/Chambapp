# Acceso social con Supabase Auth

## Estado de Chambapp

Comprobado el 2 de octubre de 2026 mediante el endpoint público `GET /auth/v1/settings` del proyecto `azylnnujzpqwpzedkoxv`: correo habilitado, registro habilitado y confirmación de correo requerida. Todos los proveedores sociales publicados están deshabilitados; `x` todavía no aparece en esa respuesta. La consulta no muestra ni cambia credenciales.

La interfaz de `/login` y `/registro` muestra únicamente los proveedores del catálogo cuyo indicador `external.<proveedor>` sea exactamente `true`. Una consulta fallida ofrece reintento. Las opciones deshabilitadas no se anuncian como accesos operativos. Tras activar un proveedor y guardar su configuración en Supabase, recargar la página actualiza la lista.

El mismo `signInWithOAuth` sirve para acceder y para dar de alta a usuarios nuevos. Supabase crea la cuenta si el registro está permitido; Chambapp pide completar el perfil y la jornada en su onboarding. Cuando `disable_signup` es `true`, la pantalla de registro oculta los métodos sociales, y el acceso de usuarios existentes permanece disponible en `/login`. [Referencia del SDK](https://supabase.com/docs/reference/javascript/auth-signinwithoauth), [usuarios de Supabase](https://supabase.com/docs/guides/auth/users).

No se ha activado ningún proveedor remoto ni se han añadido secretos. Para poner Google u otra plataforma en funcionamiento faltan las aplicaciones OAuth y sus credenciales de proveedor, y confirmar el dominio de producción de Chambapp. Un indicador habilitado permite mostrar el botón; la autorización completa exige también una aplicación correctamente configurada y una cuenta de prueba del proveedor.

## Callback del proveedor y regreso a Chambapp

Son dos destinos distintos:

1. **Proveedor → Supabase:** registrar esta URL exacta en cada aplicación del proveedor:

   ```text
   https://azylnnujzpqwpzedkoxv.supabase.co/auth/v1/callback
   ```

   Copiar siempre el callback mostrado por **Authentication → Sign In / Providers** en el [proyecto de Chambapp](https://supabase.com/dashboard/project/azylnnujzpqwpzedkoxv/auth/providers), especialmente si se configura un dominio personalizado de Supabase.

2. **Supabase → Chambapp:** el código usa el origen actual del navegador y `/login?returnTo=<destino codificado>`. Configurar **Authentication → URL Configuration** con la URL de producción en `Site URL` y una entrada del mismo host que acepte `/login` y sus parámetros, por ejemplo `https://DOMINIO-DE-CHAMBAPP/login**`. Para desarrollo local, añadir `http://127.0.0.1:5173/login**`; si se utiliza `localhost` u otro puerto, añadir ese origen explícitamente. Conservar también los destinos existentes de recuperación de contraseña.

La allowlist debe limitarse a los orígenes reales de Chambapp. El comodín del ejemplo permite los parámetros del callback; no añadir comodines que acepten cualquier host. `returnTo` se valida contra las rutas internas conocidas antes de iniciar OAuth y antes de navegar tras la sesión. Los errores y la cancelación del proveedor se muestran en el formulario. [Configuración oficial de redirecciones](https://supabase.com/docs/guides/auth/redirect-urls).

Chambapp usa `@supabase/supabase-js` 2.117.1, una SPA con `detectSessionInUrl: true`. El cliente actual gestiona el retorno del flujo implícito; no se ha añadido un callback de servidor ni cambiado el flujo de recuperación existente.

## Activar los proveedores principales

Completar la aplicación de cada proveedor, registrar el callback anterior, copiar su identificación y secreto **dentro del panel de Supabase**, habilitar el proveedor y guardar. Los secretos no deben añadirse a `VITE_*`, archivos públicos, código cliente ni mensajes del chat.

### Google (`google`)

En [Google Auth Platform](https://console.cloud.google.com/auth/overview), crear o elegir proyecto, configurar audiencia, marca y pantalla de consentimiento. Añadir los scopes de identidad `openid`, correo y perfil. Crear un cliente OAuth de tipo **Web application**; registrar el origen de Chambapp en **Authorized JavaScript origins** y el callback de Supabase en **Authorized redirect URIs**. Guardar **Client ID** y **Client secret** en el proveedor Google de Supabase. Si la app está en pruebas, añadir los usuarios de prueba; publicar la audiencia cuando proceda. Se necesita acceso al proyecto de Google Cloud y el dominio/origen de Chambapp. [Guía de Google en Supabase](https://supabase.com/docs/guides/auth/social-login/auth-google).

### Apple (`apple`)

Se requiere Apple Developer. Crear un **App ID** con Sign in with Apple, un **Services ID** asociado para la web y una clave de firma `.p8`. En Website URLs del Services ID registrar el dominio `azylnnujzpqwpzedkoxv.supabase.co` y el callback completo. Generar el secreto JWT con Team ID, Key ID y la clave de firma; guardar en Supabase el Services ID como primer Client ID y ese secreto. Renovar el secreto antes de su vencimiento, como máximo cada seis meses. Apple puede no devolver el nombre; el usuario puede completarlo en el onboarding. Se necesitan los identificadores de Apple y la clave privada, gestionados fuera del frontend. [Guía de Apple en Supabase](https://supabase.com/docs/guides/auth/social-login/auth-apple).

### Microsoft Entra / Azure (`azure`)

En [Microsoft Entra](https://portal.azure.com/), crear **App registration**, elegir los tipos de cuenta admitidos y registrar el callback de tipo **Web**. Copiar **Application (client) ID** y crear un client secret; guardar su **Value**, no su Secret ID, en el proveedor Azure de Supabase. Elegir URL del tenant: `common`, `consumers` para cuentas personales o el tenant de la organización. Chambapp solicita explícitamente el scope `email`, requerido por Supabase. La guía recomienda el claim opcional `xms_edov` para verificar el correo. Se necesita acceso a Entra y decidir si se admitirán cuentas personales, organizaciones o un tenant específico. [Guía de Azure en Supabase](https://supabase.com/docs/guides/auth/social-login/auth-azure).

### GitHub (`github`)

En [Developer settings → OAuth Apps](https://github.com/settings/developers), crear una **OAuth app**, indicar Homepage URL de Chambapp y el callback de Supabase en **Authorization callback URL**. Copiar el Client ID, generar un client secret y guardarlos en Supabase → GitHub. Se necesita acceso a la cuenta u organización propietaria de la OAuth app. El acceso de identidad no pide scopes de repositorios. [Guía de GitHub en Supabase](https://supabase.com/docs/guides/auth/social-login/auth-github).

### Facebook (`facebook`)

En [Meta for Developers](https://developers.facebook.com/apps/), crear una app con Facebook Login. Registrar el callback en **Valid OAuth Redirect URIs**. En los casos de uso, habilitar los permisos `public_profile` y `email`; Supabase necesita recibir el correo. Copiar **App ID** y **App Secret** desde Basic Settings a Supabase → Facebook. Completar los datos y revisiones que Meta solicite para permitir usuarios fuera de los roles de desarrollo. Se necesita administrar la aplicación Meta y proporcionar sus URLs públicas requeridas, como privacidad. [Guía de Facebook en Supabase](https://supabase.com/docs/guides/auth/social-login/auth-facebook).

### X / Twitter (`x`; legado `twitter`)

Preferir **OAuth 2.0**, con identificador `x`. En [X Developer Dashboard](https://developer.x.com/en/portal/dashboard), crear proyecto y app, configurar User authentication, permitir la solicitud del correo del usuario y registrar callback y Website URL. Guardar el **OAuth 2.0 Client ID** y **Client Secret** en Supabase → X / Twitter (OAuth 2.0). Las API Key/Secret del flujo OAuth 1.0a no sustituyen estas credenciales. La variante `twitter` se conserva sólo para proyectos que la tengan habilitada y se etiqueta como clásica. Se necesita una app de X y sus permisos de autenticación. [Guía actual de X en Supabase](https://supabase.com/docs/guides/auth/social-login/auth-twitter).

### LinkedIn (`linkedin_oidc`)

En [LinkedIn Developers](https://www.linkedin.com/developers/apps), crear app asociada a la página de LinkedIn y añadir el producto **Sign In with LinkedIn using OpenID Connect**. En Auth, registrar el callback y obtener Client ID/Secret; comprobar los scopes de identidad disponibles y guardar las credenciales en Supabase → LinkedIn (OIDC). Se necesita administrar la app/página y obtener acceso al producto OIDC. Chambapp no muestra el antiguo identificador `linkedin`, retirado según la documentación oficial. [Guía de LinkedIn en Supabase](https://supabase.com/docs/guides/auth/social-login/auth-linkedin).

### Discord (`discord`)

En [Discord Developer Portal](https://discord.com/developers/applications), crear una Application. En OAuth2 registrar el callback en Redirects y copiar Client ID/Secret desde Client information. Guardarlos y habilitar Discord en Supabase. Se necesita acceso a la aplicación de Discord; no es necesario crear un bot para el inicio de sesión. [Guía de Discord en Supabase](https://supabase.com/docs/guides/auth/social-login/auth-discord).

## Otros métodos incluidos

El catálogo también reconoce GitLab, Bitbucket, Slack OIDC, Notion, Figma, Spotify, Twitch, Zoom, Kakao, Keycloak, WorkOS, Fly.io y Slack clásico. Se muestran sólo si sus indicadores públicos están habilitados. Las versiones OIDC y OAuth 2.0 preceden a las clásicas. [Catálogo y guías oficiales de acceso social](https://supabase.com/docs/guides/auth/social-login).

No se presentan como OAuth los indicadores de correo, teléfono, usuarios anónimos ni plataformas ajenas al SDK instalado. Los proveedores OAuth/OIDC personalizados requieren registrar su identificador y nombre en el catálogo de Chambapp antes de ofrecerlos en la UI. [Proveedores personalizados](https://supabase.com/docs/guides/auth/custom-oauth-providers).

## Verificación

La suite `tests/oauth.test.ts` comprueba disponibilidad dinámica, ausencia de métodos no habilitados, bloqueo de alta, scope de Microsoft, destinos seguros, igualdad del flujo de registro/acceso y errores de callback. Se han consultado la documentación oficial actual y los tipos del SDK instalado. La autorización completa contra una cuenta de Google, Apple u otro proveedor queda pendiente de la activación y credenciales de la aplicación correspondiente.

Después de configurar cada proveedor, comprobar una cuenta nueva y otra existente, regreso a una ruta solicitada, cancelación del consentimiento y mantenimiento de la sesión al recargar. Confirmar que el proyecto de Supabase devuelve `external.<proveedor>: true` sin consultar ni mostrar secretos.

La revisión del proyecto detectó una advertencia preexistente: la protección frente a contraseñas filtradas está deshabilitada. No se cambió esa configuración remota; revisar su activación en Supabase conforme a [Password security](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).
