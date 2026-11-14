# OtakuZone — Fase 6: autenticación y seguridad

## Implementación

Se reutilizan `usuarios` y `roles`, las cuatro migraciones anteriores y el pool mysql2. La migración incremental `005_auth_sessions.sql` añade únicamente `auth_sesiones`: identificador aleatorio, usuario, fechas de creación, expiración y revocación. Su FK elimina sesiones al eliminar un usuario. No guarda contraseñas ni tokens JWT. Registro y creación de sesión se confirman juntos en una transacción.

Capas independientes: configuración, SQL parametrizado, repositorio, servicio, validadores Zod, middleware, controlador y rutas. `AuthProvider` centraliza sesión y operaciones del frontend; `RequireAuth` protege `/perfil` y `/admin`. Las cinco rutas originales siguen disponibles. Cuenta conecta registro, login, perfil y logout reales; favoritos siguen siendo locales al navegador y no se sincronizan con la cuenta. Jikan, JSON Server y catálogo se conservan.

## Ejecución reproducible

Desde la raíz, instalar ambos lockfiles con `npm ci` y `npm --prefix backend ci`. Configurar **exclusivamente** `backend/.env`, ignorado por Git, usando `.env.example`: acceso MySQL local, `DB_NAME=otakuzone_db`, `CATALOG_SOURCE=mysql`, `AUTH_ENABLED=true`. No sobrescribir un `.env` existente. No guardar secretos en variables `VITE_*`.

```sh
npm --prefix backend run auth:secret
npm --prefix backend run db:migrate
npm --prefix backend run db:check
npm --prefix backend run dev
```

`auth:secret` genera un secreto aleatorio local si falta; no imprime ni reemplaza uno existente. El backend falla si se habilita autenticación sin secreto válido o sin MySQL preparado. En otra terminal:

```sh
npm run dev -- --host 127.0.0.1 --port 5173 --strictPort
```

Frontend: http://127.0.0.1:5173. API: http://127.0.0.1:4000/api/v1. `VITE_AUTH_API_URL` apunta a esta API independientemente del proveedor del catálogo; JSON Server opcional sigue en 3001 con `npm run api`. Usar el mismo hostname para frontend y API; no mezclar localhost y 127.0.0.1. CORS permite orígenes exactos mediante `CORS_ORIGINS`, credenciales y el encabezado CSRF. No se usa `*` con cookies.

## Contrato HTTP

Respuestas exitosas: `{ "success": true, "data": ... }`. Errores mantienen el contrato centralizado del backend, sin SQL, trazas ni hashes. El perfil público contiene solo `id`, `name`, `email`, `bio` y `role`.

| Método y ruta bajo /api/v1 | Acceso y resultado |
| --- | --- |
| POST /auth/register | Público; 201, usuario y sesión. Recibe name, email, password |
| POST /auth/login | Público; 200, usuario y sesión. Recibe email, password |
| GET /auth/session | 200; sesión actual o user:null si no está autenticado |
| GET /auth/me | Autenticado; perfil |
| PATCH /auth/me | Autenticado y CSRF; solo name, bio |
| POST /auth/logout | Autenticado y CSRF; revoca sesión y elimina cookie |
| GET /admin/overview | Solo ADMIN; contadores, sin credenciales ni listado de usuarios |

Ejemplo de registro de prueba con cliente HTTP, sin credenciales reales: enviar JSON `{"name":"Cuenta de prueba","email":"prueba@example.test","password":"<contraseña elegida localmente>"}` a POST `/api/v1/auth/register`, con `Origin: http://127.0.0.1:5173`, `Content-Type: application/json` y `X-OtakuZone-CSRF: 1`. Login usa los mismos encabezados y únicamente email/password. El navegador envía `credentials: include`; no lee Set-Cookie.

Registro/login/session devuelven `data.user`, `data.csrfToken` y `data.expiresAt`. Ejemplo parcial de perfil: `{"success":true,"data":{"id":1,"name":"Cuenta de prueba","email":"prueba@example.test","bio":"","role":"CLIENTE"}}`. PATCH envía `{"name":"Nombre actualizado","bio":"Mi presentación"}` y el valor CSRF de la sesión en `X-OtakuZone-CSRF`; logout envía `{}` con ese mismo encabezado. Sin sesión: 401; sin permisos o CSRF válido: 403; entrada inválida: 400; registro no disponible: 409; límite: 429. No copiar cookies ni tokens a documentación o logs.

## Decisiones de seguridad

- bcryptjs 3.0.3, coste 12 por defecto; mínimo 8 caracteres con letra y número, máximo 72 bytes UTF-8 para evitar truncamiento. Confirmación en frontend. Correo normalizado y unicidad MySQL. Login desconocido ejecuta comparación bcrypt con hash de coste equivalente y usa el mismo mensaje que contraseña incorrecta.
- JWT jsonwebtoken 9.0.3, firma HS256 con algoritmo, issuer, audience y expiración comprobados. TTL predeterminado 1800 segundos, sin refresh automático. JWT en cookie HttpOnly, host-only, SameSite=Lax y Path=/; nunca en localStorage ni en el JSON de respuesta.
- En producción, cookie `__Host-otakuzone_session`, Secure y orígenes HTTPS explícitos. En desarrollo HTTP se usa `otakuzone_session` sin Secure. El despliegue TLS real queda pendiente; no se declara probado desde este entorno local.
- Cada petición privada consulta sesión vigente, usuario activo y rol actual en MySQL. Logout revoca la sesión: reutilizar la cookie anterior devuelve 401. Los cambios administrativos de rol afectan a JWT ya emitidos. Rotar el secreto invalida los JWT existentes.
- Toda escritura de autenticación requiere Origin permitido, JSON y encabezado personalizado: registro/login usan marcador 1 y preflight CORS; perfil/logout exigen además CSRF HMAC vinculado a la sesión. CSRF se mantiene en memoria y se recupera desde session al recargar. SameSite complementa estas comprobaciones. No se configura este flujo para sitios realmente cross-site.
- Limitador específico de registro/login: 10 intentos por IP cada 15 minutos, además del global. Helmet y errores sanitizados se conservan. No se registran cuerpos con contraseñas.
- Objetos Zod estrictos evitan asignación masiva. Registro siempre obtiene CLIENTE desde el servidor; perfil no acepta email, role ni privilegios. ADMIN corresponde al código existente administrador; CLIENTE al código cliente. No se añaden roles duplicados ni un administrador predeterminado.

Para designar el primer administrador, registrar una cuenta propia y ejecutar con acceso SQL de mantenimiento `node backend/scripts/promote-admin.js operador@example.test`. Es una operación privilegiada local, no un endpoint público; cambiar el correo de ejemplo por la cuenta autorizada. No se promovió ninguna cuenta permanente durante las pruebas. Revisar los permisos mínimos en `backend/database/provisioning/application-user.example.sql`; la cuenta administrativa temporal de desarrollo no es una recomendación para producción.

## Validaciones ejecutadas realmente

Entorno local: MySQL **8.0.46**. Las cuatro migraciones previas se conservaron y se aplicó la quinta; repetir migraciones no vuelve a insertar semillas. `db:check` comprobó **15 tablas InnoDB, 13 FK, 19 CHECK y 5 versiones**. `.env` está ignorado y no versionado.

| Comprobación | Resultado |
| --- | --- |
| npm --prefix backend run db:verify | PASS: consultas, insert/update/delete, commit, rollback, UNIQUE/FK/CHECK, CASCADE y RESTRICT en MySQL real |
| npm --prefix backend run auth:verify | PASS: 35 solicitudes HTTP reales con MySQL; registro, duplicados, bcrypt persistido, login correcto/incorrecto/desconocido, sesión, perfil y logout |
| Mismo script auth:verify | PASS: 401 privado, CLIENTE 403, ADMIN 200, degradación de rol efectiva, JWT alterado/algoritmo incorrecto/caducado rechazados, CSRF/Origin y asignación masiva rechazados, cookie revocada y 429 |
| npm --prefix backend run check:http | PASS: 21 solicitudes HTTP de catálogo, errores, validación y CORS |
| npm --prefix backend test | PASS: 18 pruebas; incluye dobles unitarios explícitos, no sustituyen las anteriores |
| npm test | PASS: 18 pruebas frontend/dominio |
| npm run build / npm run lint | PASS |
| node scripts/audit-auth-browser.mjs | PASS en Chrome real: registro, recarga de sesión, perfil persistido, login erróneo/correcto, logout, controles ADMIN y favoritos conservados |
| Mismo navegador | PASS: cookie no visible mediante document.cookie, sin tokens/contraseñas en localStorage, responsive 320/390/768/1440 y sin excepciones de aplicación |
| node scripts/audit-interactivity.mjs | PASS: búsqueda demo con debounce, filtros, ordenamiento, vacío, favoritos, modal/foco, storage bloqueado/corrupto y responsive; Jikan no entregó resultados y sigue pendiente externo |

Los scripts de integración crean cuentas técnicas aleatorias en el motor real y eliminan exclusivamente sus propios registros y sesiones al finalizar. No simulan una conexión exitosa. Las promociones/degradaciones de rol de prueba afectan únicamente a esas cuentas temporales. Las pruebas de datos anteriores se volvieron a ejecutar tras añadir la migración de sesión.

## Límites y pendientes

No se implementan recuperación/verificación de correo, MFA, renovación de tokens, revocación de todas las sesiones ni mantenimiento programado de sesiones vencidas. El limitador en memoria exige almacenamiento compartido si se despliega en varias instancias. Evaluar proxy de confianza según el despliegue, sin habilitarlo indiscriminadamente. Registro devuelve 409 genérico ante conflicto; el cambio de estado HTTP respecto de un alta exitosa sigue permitiendo inferir disponibilidad de una dirección, mitigado con límites de solicitudes.

Jikan se mantiene con el manejo explícito de indisponibilidad y modo demostrativo; esta fase no acredita la integración externa. Los favoritos continúan locales y los antiguos perfiles demostrativos locales no se importan como cuentas reales. No se implementan operaciones comerciales de administración ni se avanza a Fase 7.
