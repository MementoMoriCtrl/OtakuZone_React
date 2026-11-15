# OtakuZone — corrección CORS de origen local

Fecha: 14 de noviembre de 2026, America/Lima.

## Resultado y causa raíz

**Corregido y validado por HTTP:** el backend activo en `http://127.0.0.1:4000` ya responde 200 a los siete endpoints solicitados con Origin `http://localhost:5174`, reflejando ese origen exacto y Access-Control-Allow-Credentials=true. Un origen externo sigue recibiendo 403 y CORS_ORIGIN_DENIED.

El frontend había pasado de 5173 a 5174. La lista predeterminada de desarrollo de `backend/src/config/env.js` incluía ambos hosts para 5173 y para la vista previa 4173, pero no 5174.

`backend/src/app.js` genera CORS_ORIGIN_DENIED cuando existe un Origin que no aparece en config.origins. El middleware `browserMutation` de `middlewares/auth.js` usa esa misma lista para validar el origen de escrituras, además de mantener JSON y CSRF. Ninguno de esos middlewares se modificó.

`loadEnvironment()` carga backend/.env por ruta absoluta, sin sobrescribir variables ya exportadas. `loadConfig()` usa CORS_ORIGINS explícito si existe; en su ausencia aplica los valores locales solo fuera de producción. La inspección efectiva confirmó NODE_ENV=development y ausencia de CORS_ORIGINS explícito. Por eso bastó corregir el valor predeterminado: **no se editó backend/.env ni se mostraron sus secretos**.

## Cambio mínimo y configuración

Archivos modificados o añadidos exclusivamente para esta corrección:

- `backend/src/config/env.js`: añade los dos orígenes de 5174 a developmentOrigins.
- `backend/.env.example`: documenta la misma lista explícita.
- `backend/tests/cors-local.test.js`: cuatro pruebas de configuración, HTTP, preflight y seguridad, sin conexión a MySQL real.
- `CORRECCION_CORS_ORIGEN_LOCAL.md`: este informe.

Antes:

```text
http://127.0.0.1:5173,http://localhost:5173,http://127.0.0.1:4173,http://localhost:4173
```

Ahora, en desarrollo sin override:

```text
http://127.0.0.1:5173,http://localhost:5173,http://127.0.0.1:5174,http://localhost:5174,http://127.0.0.1:4173,http://localhost:4173
```

Se conservan los dos orígenes de preview 4173 ya autorizados. Los cuatro orígenes solicitados están incluidos literalmente; no hay comodines, expresiones regulares de confianza ni aceptación indiscriminada.

Si otra instalación declara CORS_ORIGINS en backend/.env o en el entorno del proceso, esa lista sustituye al valor predeterminado. Para esa configuración local, el operador puede utilizar:

```dotenv
CORS_ORIGINS=http://127.0.0.1:5173,http://localhost:5173,http://127.0.0.1:5174,http://localhost:5174,http://127.0.0.1:4173,http://localhost:4173
```

Usar orígenes exactos, sin paths ni barra final. Tras modificar configuración, reiniciar Express si no se recarga automáticamente. No se detuvieron ni reiniciaron manualmente procesos ajenos: el proceso activo se comprobó antes y después mediante HTTP y ya reflejaba la corrección.

## Producción y protecciones conservadas

La rama de producción no cambia: exige CORS_ORIGINS explícito y HTTPS; nunca recibe automáticamente la lista de localhost. Una lista explícita personalizada tampoco se amplía silenciosamente con los valores nuevos. Los tests comprueban ambas condiciones.

Se mantienen:

- CORS por inclusión exacta y CORS_ORIGIN_DENIED para orígenes externos; peticiones sin Origin siguen funcionando como antes.
- credentials=true, métodos/headers permitidos, Vary: Origin y preflight.
- JWT y firma, cookies HttpOnly, SameSite=Lax y Secure según el entorno.
- CSRF de sesión y validación de origen en mutaciones.
- Helmet, rate limiting, Zod y autorización por roles.
- Autenticación, endpoints comerciales/administrativos, pool MySQL y migraciones.

No se cambió app.js, auth.js, configuración JWT/cookies, componentes React, lógica de negocio ni credenciales.

## Pruebas ejecutadas

### Diagnóstico HTTP antes de editar

Contra el proceso real de :4000, GET /api/v1/products:

| Origin | Resultado |
| --- | --- |
| Ausente | 200 |
| http://localhost:5174 | 403, CORS_ORIGIN_DENIED |
| https://blocked.example | 403, CORS_ORIGIN_DENIED |

La configuración efectiva anterior mostraba únicamente los cuatro orígenes 5173/4173.

### Automatizadas nuevas

Cuatro pruebas nuevas con Express HTTP real, SQL de lectura simulado y servicio AniList simulado explícitamente. No crean usuarios ni escriben en MySQL:

1. Desarrollo/test incluyen los cuatro orígenes 5173/5174. Se conserva 4173; override explícito no se amplía; producción exige su lista HTTPS; wildcard sigue rechazado.
2. Los siete endpoints públicos devuelven 200 para cada uno de los cuatro orígenes, con Allow-Origin exacto y Allow-Credentials=true. También funcionan sin Origin y rechazan el externo con 403/CORS_ORIGIN_DENIED. Se rechazan puerto 51740, host parecido, HTTPS local no declarado y Origin null.
3. OPTIONS/preflight admite los cuatro orígenes con credenciales, PUT y cabecera CSRF, sin comodín.
4. Carrito/pedidos/ADMIN sin sesión siguen en 401. Cookie JWT de fixture permite consultar sesión; CLIENTE recibe 403/FORBIDDEN al consultar o intentar crear productos ADMIN; ADMIN puede consultar overview. CSRF incorrecto sigue en 403/CSRF_REJECTED y JWT falsificado en 401. Opciones HttpOnly/Lax/Secure conservadas.

Los datos vacíos de AniList de estas pruebas son dobles de transporte para probar CORS, **no resultados reales del proveedor**. Las cookies/JWT de fixture no son sesiones de usuarios reales.

### HTTP real después de la corrección

Las siete peticiones con Origin `http://localhost:5174` al proceso activo devolvieron **200** con Allow-Origin=`http://localhost:5174` y Allow-Credentials=`true`:

```text
GET /api/v1/anime/popular
GET /api/v1/anime/genres
GET /api/v1/anime/season
GET /api/v1/products
GET /api/v1/promotions
GET /api/v1/plans
GET /api/v1/auth/session
```

También se ejecutaron las tres variantes sobre **/api/v1/anime/popular**:

| Origin | HTTP | Access-Control-Allow-Origin | Resultado |
| --- | --- | --- | --- |
| Ausente | 200 | Ausente | Consulta directa permitida |
| http://localhost:5174 | 200 | http://localhost:5174 | Origen local permitido, credenciales=true |
| https://blocked.example | 403 | Ausente | CORS_ORIGIN_DENIED |

Estas consultas reales fueron exclusivamente GET, sin cookies de usuarios ni escrituras. La matriz completa de cuatro orígenes por siete endpoints se ejecutó automatizadamente con los dobles antes descritos; no se atribuye a esa matriz una validación real de base de datos o proveedor remoto.

### Regresión

| Comando | Resultado ejecutado |
| --- | --- |
| npm test | 20/20 PASS |
| npm --prefix backend test | 30/30 PASS, incluidas las cuatro pruebas CORS nuevas |
| npm run lint | PASS sin diagnósticos |
| npm run build | PASS, Vite 8.3.8 y 2179 módulos |

Las suites se ejecutaron fuera del sandbox mediante autorización nativa para crear sus procesos HTTP locales. El backend se comprobó también por separado para conservar la salida completa de sus 30 pruebas. No se eliminaron ni relajaron pruebas existentes.

## Validación manual en PowerShell

Usar curl.exe explícitamente para evitar el alias Invoke-WebRequest de algunas versiones de PowerShell. `-i` muestra código HTTP y cabeceras; no imprimir cookies ni tokens reales.

Sin Origin, esperado 200 si AniList está disponible:

```powershell
curl.exe -i 'http://127.0.0.1:4000/api/v1/anime/popular'
```

Origin local, esperado 200 y origen exacto reflejado:

```powershell
curl.exe -i -H 'Origin: http://localhost:5174' 'http://127.0.0.1:4000/api/v1/anime/popular'
```

Origen externo, esperado 403 y CORS_ORIGIN_DENIED:

```powershell
curl.exe -i -H 'Origin: https://blocked.example' 'http://127.0.0.1:4000/api/v1/anime/popular'
```

Para aislar CORS de una eventual indisponibilidad/cuota de AniList, repetir esas mismas variantes sobre `/api/v1/products`. Un 429/502/503/504 de AniList con cabeceras CORS correctas sería un problema distinto del rechazo de origen.

## Chrome DevTools

1. Abrir http://localhost:5174 y DevTools → Network; limpiar la lista y recargar.
2. Filtrar por `/api/v1/` y revisar anime/popular, anime/genres, anime/season, products, promotions, plans y auth/session.
3. En Request Headers, comprobar Origin=`http://localhost:5174`. En Response Headers, Allow-Origin debe coincidir exactamente y Allow-Credentials ser true. Ya no debe aparecer CORS_ORIGIN_DENIED para ese origen.
4. Revisar status y Preview/Response. La sesión pública sin login puede devolver correctamente user=null con HTTP 200; no es un fallo de autenticación.
5. En operaciones que requieren sesión, comprobar que el navegador envía la cookie y la cabecera CSRF de la sesión cuando corresponda. Revisar la pestaña Cookies si Chrome marca una cookie excluida. No copiar sus valores a informes.

**Hosts y cookies:** el par localhost en frontend / 127.0.0.1 en backend usa nombres distintos. Si Chrome excluye la cookie por su política SameSite, no debilitarla para resolverlo: usar el mismo nombre de host para frontend y API. Por ejemplo, abrir el frontend bajo 127.0.0.1 junto con su API 127.0.0.1, o configurar las URLs públicas VITE_AUTH_API_URL/VITE_ANIME_API_URL/VITE_OTAKUZONE_API_URL con localhost junto al frontend localhost, y reiniciar Vite. Esto es una indicación manual; no se cambiaron esas URLs ni las cookies durante esta tarea.

## Limitaciones y cierre

No se ejecutó un login nuevo en Chrome ni se modificaron datos reales: el funcionamiento de sesión/cookies/roles se verificó con JWT y SQL de fixture en HTTP, además de la regresión existente. Las comprobaciones en DevTools anteriores son instrucciones manuales, no una sesión de navegador declarada como ejecutada en esta corrección.

La disponibilidad de AniList y las reglas de cookies del navegador son independientes de autorizar un Origin exacto. Puertos distintos de los declarados continúan bloqueados; producción y cualquier CORS_ORIGINS explícito conservan sus restricciones previas.

**Corrección CORS local resuelta. Sin commit, cambios de infraestructura/producción, datos reales o migraciones y sin avanzar a FASE 10. El trabajo se detiene aquí para revisión y autorización del usuario antes de continuar.**
