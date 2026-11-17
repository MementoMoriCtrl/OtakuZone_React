# OtakuZone — Etapa 3.2: auditoría de política de correo electrónico

Fecha: **16 de noviembre de 2026**. Alcance: inspección del estado actual, consultas locales de lectura y pruebas existentes con dobles, sin implementación ni cambios de datos.

## 1. Resumen ejecutivo

**Dictamen: APROBADO CON CONDICIONES para la política ASCII normalizada sobre el dataset local observado. La habilitación de TiDB permanece BLOQUEADA.**

MySQL local 8.0.46 contiene una cuenta. No se encontraron correos no ASCII, espacios externos, mayúsculas, valores nulos/vacíos, incumplimientos del validador vigente ni duplicados potenciales de la clave canónica. No hay evidencia de que esa cuenta requiera corrección o vaya a perder acceso por esta política; no se probó su contraseña ni un login real.

**El estado del repositorio ya incluye la política ASCII**, incorporada en una etapa anterior: se rechaza Unicode original antes de trim/minúsculas, se valida formato con Zod y longitud máxima 254. Esta auditoría no la implementa de nuevo ni revierte cambios previos. El nombre de esta entrega corresponde a la solicitud actual y no sustituye los informes existentes de [3.2 implementada](DESPLIEGUE_ETAPA_3_2_CORREO_ASCII.md) y [3.3](DESPLIEGUE_ETAPA_3_3_COMPATIBILIDAD_UNICIDAD.md).

No se consultó ninguna instancia TiDB. La afirmación de que la collation falta en una «instancia evaluada» no puede corroborarse con evidencia remota disponible: los informes anteriores describen ausencia en el catálogo documental, sin conexión al servicio. No se inventa una versión ni un resultado SHOW COLLATION remoto.

Único archivo creado en esta auditoría: este informe. No se modificaron aplicación, entorno privado, seguridad, SQL, migraciones, índices, usuarios, contraseñas ni roles. No se ejecutó INSERT, UPDATE, DELETE, ALTER, DROP o TRUNCATE; tampoco provisioning, migraciones o commits.

## 2. Archivos y componentes revisados

### Rutas de aplicación

Todas las rutas siguientes tienen el prefijo `/api/v1` de `backend/src/app.js`.

| Ruta/operación | Archivos principales | Uso del correo |
| --- | --- | --- |
| POST `/auth/register` | `routes/auth.js`, `controllers/authController.js`, `validators/auth.js`, `services/authService.js`, `repositories/authRepository.js`, `db/authSql.js` | Canonicaliza y valida antes del SQL; inserta usuario y sesión en una transacción; conflicto UNIQUE se traduce a 409 |
| POST `/auth/login` | Mismos componentes | Canonicaliza con la misma función, busca `WHERE u.email = ?`, valida bcrypt y estado, crea sesión |
| GET `/auth/session`, GET `/auth/me` | Controlador, servicio, middleware y SQL auth | Devuelven correo almacenado; autentican mediante usuario/sesión, sin buscar la identidad por email |
| PATCH `/auth/me` | `validators/auth.js`, servicio/repositorio auth | Solo nombre y bio; esquema strict rechaza email adicional; SQL no cambia email |
| POST `/auth/logout` | Servicio/repositorio auth y middleware | Revoca por sesión/usuario, sin modificar correo |
| GET `/admin/users` | `routes/admin.js`, `controllers/adminController.js`, `services/adminService.js`, `repositories/adminRepository.js` | Lectura de correo para ADMIN; no se encontró ruta de creación/edición de email |
| GET `/admin/orders`, GET `/admin/orders/:id` | Mismos componentes administrativos | Incluyen email del usuario relacionado; no lo modifican |
| Recuperación de cuenta/contraseña | Búsqueda en rutas, servicios y frontend | No se encontró flujo implementado de recuperación, envío de enlace o restablecimiento por correo. No se puede certificar una funcionalidad ausente |

### Política y consumidores adicionales

- `backend/src/domain/emailPolicy.js`: exige string y ASCII original, luego trim/minúsculas. No translitera ni transforma IDN Unicode a punycode.
- `backend/src/validators/email.js`: `normalizeEmail` compartido, máximo 254 y `.email()` de Zod **4.6.7**. Registro/login usan `emailSchema`; servicio y repositorio vuelven a validar entradas directas.
- `backend/src/db/authSql.js`: inserción de email y búsqueda parametrizada; consultas por ID/sesión recuperan el valor almacenado. No se aplica LOWER a la columna en el lookup.
- `backend/scripts/promote-admin.js`: consulta por correo canonicalizado y después modifica rol. Solo inspeccionado; **no ejecutado**.
- `backend/src/db/emailAudit.js` y `backend/scripts/audit-email-ascii-readonly.js`: auditoría local acotada, salida agregada, comprobación de esquema/índice/historial y fixtures SELECT.
- `backend/src/db/verifyDatabase.js`, `backend/scripts/verify-auth.js`, `verify-commerce.js`, `verify-admin.js`, `verify-quality.js`: contienen cuentas de prueba o escrituras/limpieza. Inspeccionados como escritores operativos; **no ejecutados**. No todos esos escritores técnicos son una ruta de registro validada por la API.
- `src/domain/validation.js`: reutiliza el filtro ASCII, pero su regex de formato es más amplia que Zod; la autoridad final es el backend. No afirmar equivalencia completa entre las validaciones de interfaz y servidor.
- `src/components/account/RegistrationForm.jsx`, `LoginForm.jsx`, `ProfileForm.jsx` y `src/services/auth.js`: entrada/envío de correo; perfil muestra email como solo lectura. El formulario recorta el texto, mientras el servidor mantiene su comprobación obligatoria de ASCII.
- `src/services/localRepository.js`: snapshot de perfil local con trim/límite, sin el contrato completo del backend. No es una tabla de cuentas ni mecanismo de autenticación SQL; no sustituye al registro/login.
- `src/components/admin/UserManager.jsx`, `OrderManager.jsx`: presentación de correo, sin edición de identidad.

### Migraciones 001–007, leídas sin ejecutarlas

| Migración | Hallazgo relevante |
| --- | --- |
| 001 | CREATE DATABASE con default `utf8mb4_0900_ai_ci`; no es la collation específica del email |
| 002 | `usuarios.email VARCHAR(254) COLLATE utf8mb4_0900_as_ci NOT NULL`, UNIQUE completo `uq_usuarios_email`; no hay CHECK de formato/ASCII/canonicalización de email |
| 003 | Roles/planes iniciales; no crea cuentas |
| 004 | Catálogo demo; no contiene usuarios/email |
| 005 | Sesiones revocables referenciadas por usuario; email no forma parte de la clave de sesión |
| 006 | Comercio e historial; no cambia email |
| 007 | Inventario e historial administrativo; no cambia email |

También se revisaron `config/auth.js`, `middlewares/auth.js`, `db/transaction.js`, el preflight TiDB y su manifest. Se conserva el bloqueo por collation/catálogo; no se considera suficiente editar `status` para habilitar el motor.

## 3. Estado de los datos locales

### Ejecución realizada

Se utilizó la conexión privada local existente sin mostrarla. El auditor exige motor MySQL y host loopback, comprueba REPEATABLE-READ y usa `START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY`, SELECT/SHOW y cierre con rollback. Se revisó su código antes de ejecutarlo. La agregación se realiza en memoria con el mismo normalizador JavaScript para no confundir TRIM SQL con trim de JavaScript. No se imprimieron valores de cuentas, IDs, contraseñas, hashes o tokens.

Comando existente ejecutado:

```text
node backend/scripts/audit-email-ascii-readonly.js
```

Una segunda conexión local también de lectura confirmó nulos/vacíos mediante agregados y comparó dos literales Unicode sintéticos. Son **dos snapshots**, no una única transacción común; ambos contaron una cuenta. No se garantiza ausencia de cambios por otros procesos después de esas lecturas.

| Medida observada | Cantidad |
| --- | ---: |
| Total de cuentas | 1 |
| Correos con caracteres no ASCII | 0 |
| Correos con espacios externos según trim JavaScript | 0 |
| Correos con mayúsculas ASCII | 0 |
| Correos que cambiarían con trim/minúsculas | 0 |
| Correos inválidos para el contrato actual de aplicación | 0 |
| Grupos duplicados por clave canónica | 0 |
| Filas en grupos duplicados canónicos | 0 |
| Grupos duplicados por minúsculas | 0 |
| Correos NULL | 0 |
| Correos de longitud cero en bytes | 0 |

Esquema real observado: VARCHAR(254), NOT NULL, `utf8mb4_0900_as_ci`, **NO PAD**; índice `uq_usuarios_email` único sobre toda la columna, sin prefijo. NOT NULL prohíbe NULL, pero el esquema por sí solo no prohíbe cadena vacía. El validador sí la rechaza. Los siete registros del historial coincidieron con los checksums del catálogo MySQL.

No se incluyen ejemplos anonimizados de la cuenta porque no existen anomalías que ilustrar y no es necesario divulgar fragmentos identificables. Los ejemplos siguientes son enteramente ficticios, no derivados de datos personales.

### Comparaciones SELECT reales con fixtures

| Fixtures | Igualdad MySQL as_ci cruda | Política de aplicación |
| --- | --- | --- |
| `USER@example.com` / `user@example.com` | Iguales | Misma clave canónica |
| Espacios externos/finales / sin espacios | Distintos | Misma clave después de trim |
| `a.b@example.com` / `ab@example.com` | Distintos | Claves distintas; no elimina puntos |
| `user+tag@example.com` / `user@example.com` | Distintos | Claves distintas; no elimina etiquetas |
| Punycode ASCII en mayúsculas/minúsculas | Iguales | Misma clave canónica |
| `jose@example.com` / variante con é | Distintos | Variante Unicode rechazada |
| Letra ASCII / variante de ancho completo | Iguales en el fixture | Variante Unicode rechazada antes del lookup |
| é precompuesta / e + acento combinado, ambos en fixture sintético | Iguales | Ambas entradas Unicode rechazadas |

La última comparación se ejecutó adicionalmente en esta auditoría, junto con validación offline de acento combinado, precompuesto, punycode y espacios/case. Igualdad de literales no demuestra inserción, concurrencia ni comportamiento TiDB.

## 4. Riesgos detectados

1. **Unicidad TiDB no certificada.** No hay conexión remota observada, grants reales ni pruebas de su UNIQUE. La política de entrada no resuelve por sí sola la collation del esquema.
2. **SQL directo puede omitir JavaScript.** El esquema permite almacenar valores que la API no admite. Tener INSERT de email permite introducir datos no canónicos; limitar UPDATE no lo evita.
3. **Canonicalización puede fusionar claves históricas.** Espacios y minúsculas pueden producir una misma representación. No ocurre en el snapshot actual, pero debe reauditarse cualquier dataset posterior o importado. No fusionar/eliminar cuentas automáticamente.
4. **Unicode no es equivalente a ASCII.** Rechazar acentos, secuencias combinadas, ancho completo o espacios Unicode antes de trim evita conversiones silenciosas. Una cuenta histórica con estos caracteres requeriría revisión, no descarte.
5. **La minúscula completa es una decisión de producto.** El proyecto ya la usa para email; no representa una garantía universal de los proveedores sobre la parte local. No retirar puntos ni `+` conforme a reglas particulares de un proveedor.
6. **Validación frontend y backend distinta.** La interfaz puede aceptar formato que Zod rechaza; no debilita la validación del servidor, pero puede generar rechazo posterior al envío.
7. **Sesiones reales no ejercitadas.** No se inicia sesión, revoca ni crea sesión SQL durante la auditoría. El análisis estructural y los dobles no prueban acceso real de todas las cuentas.
8. **Muestra pequeña.** Una cuenta sin anomalías no prueba igualdad universal de collations ni integridad futura frente a otros escritores.

## 5. Duplicados potenciales

**Resultado actual: cero grupos y cero filas duplicadas** tras normalización con la política vigente. Tampoco se detectaron grupos por minúsculas. No se necesita un backfill del snapshot observado porque ninguna clave cambiaría.

La definición es igualdad exacta de la representación `trim(email).toLowerCase()` para entradas ASCII; las anomalías no ASCII se contabilizan aparte y no se «reparan» para agruparlas como cuentas válidas. El UNIQUE actual continúa siendo la defensa atómica frente a carreras de inserción bajo su propia comparación. No debe reemplazarse por un SELECT previo en Node.

Si aparecen duplicados en una auditoría futura: detener la transición, emitir únicamente cantidades, revisar privadamente cada caso con autorización y definir remediación individual. No sobrescribir, fusionar, borrar usuarios ni fabricar un historial de migración para continuar.

## 6. Evaluación de alternativas para TiDB

Consulta oficial: **2026-11-16**, documentación `stable` identificada como **TiDB v8.5**, sin versión Starter observada. El catálogo lista `utf8mb4_0900_bin` NO PAD, `utf8mb4_bin` PAD SPACE y alternativas lingüísticas; no lista `utf8mb4_0900_as_ci`. Las reglas dependen del framework de collations. No se presume equivalencia por nombres. [PingCAP: Character Set and Collation](https://docs.pingcap.com/tidb/stable/character-set-and-collation/).

| Alternativa | Ventaja | Condiciones/riesgos | Recomendación |
| --- | --- | --- | --- |
| Mantener la collation histórica | Preserva comparación MySQL actual | Disponibilidad no documentada en TiDB; no se observó remoto | Conservar en MySQL; no copiar a TiDB como compatible certificado |
| Una sola columna canónica con `utf8mb4_0900_bin` y UNIQUE | Candidata para distinguir claves ASCII exactas sin columna extra | Distingue mayúsculas crudas; exige que todos los escritores almacenen canónico y pruebas de índice/padding/concurrencia | Evaluar primero, sin implementarla |
| `utf8mb4_bin` | Binaria documentada | PAD SPACE cambia igualdad de valores crudos finales; no sustituir silenciosamente | No aprobar por similitud del nombre |
| `utf8mb4_0900_ai_ci`, general/unicode_ci | Comparación insensible a case | Cambian reglas lingüísticas/acentos; no demuestran igualdad exacta de claves | No adoptadas |
| Clave canónica separada `VARBINARY(254)` con UNIQUE | Identidad por bytes independiente del email presentado | Nueva columna, sincronización, consultas, grants, posible backfill y recuperación; no garantiza por sí sola que clave=email canónico | Alternativa condicionada si una sola columna no basta |

En el dominio ASCII canónico, cada carácter se representa con un byte UTF-8. La semántica binaria sin padding permite fundamentar igualdad exacta de esas claves; no es equivalencia global con la comparación Unicode histórica ni prueba de la implementación de un índice remoto. La longitud variable evita introducir relleno fijo. No usar hashes truncados como identidad.

TiDB documenta UNIQUE para valores no NULL y validación que puede diferirse hasta COMMIT según modo/configuración. El éxito debe comunicarse después del commit y deben verificarse los errores reales del driver. CHECK requiere habilitación y enforcement; no presentar una restricción futura como efectiva sin pruebas negativas. [PingCAP: Constraints](https://docs.pingcap.com/tidb/stable/constraints/).

El análisis detallado y matriz de pruebas pendiente están en [Etapa 3.3](DESPLIEGUE_ETAPA_3_3_COMPATIBILIDAD_UNICIDAD.md). Su dictamen «A no demostrado» permanece vigente. Esta auditoría de datos no lo convierte en compatibilidad TiDB aprobada.

## 7. Recomendación técnica y autenticación

Conservar la política vigente: comprobar ASCII **original**, trim, minúsculas, máximo 254 y formato Zod compartido en cada límite de entrada. Mantener MySQL, collation e índice actuales. No añadir una columna o índice preventivo ni modificar el esquema histórico.

| Componente | Evidencia actual | Límite |
| --- | --- | --- |
| Registro | Misma normalización en validación/servicio/repositorio; usuario+sesión transaccionales; duplicado se traduce a 409 | Prueba HTTP con doble SQL, no inserción real |
| Login | Búsqueda parametrizada con la misma clave, bcrypt y estado activo | Sin contraseña ni login de la cuenta real |
| Sesiones existentes | Consultadas por sid/usuario, vigencia, revocación y estado; email no es su identificador | No se consultaron contenidos/tokens de sesiones reales |
| JWT | Subject es ID del usuario y payload incluye sid; email no se usa como clave criptográfica; algoritmo/issuer/audience comprobados | Sin verificación de un token privado existente |
| Cookie HttpOnly | Opciones de desarrollo/producción conservadas, Path=/ y SameSite=Lax; Secure en producción | No se probó navegador remoto |
| CSRF | Origin, JSON, cabecera pública y token de sesión según ruta siguen presentes; HMAC ligado a sid, no email | Revisión estática; no ensayo exhaustivo de CSRF en esta ejecución |
| ADMIN/CLIENTE | Mapeo desde roles SQL y autorización backend; registro no acepta asignación de rol; perfil no permite cambiar email/rol | Sin cambio ni comprobación interactiva de roles reales |
| Recuperación | No encontrada | Deberá usar el normalizador común si se implementa posteriormente |

Por estructura, la política no exige invalidar JWT/sesiones ni modificar cookies, CSRF, bcrypt o roles. Esto no constituye una certificación integral de autenticación con MySQL/TiDB reales. Mantener las protecciones actuales y no usar una caída de base para permitir acceso sin sesión.

## 8. Cambios que serían necesarios posteriormente

No hace falta reimplementar la política ASCII ya existente. Cualquier cambio adicional requiere aprobación independiente:

1. Acordar garantía de almacenamiento canónico para escritores SQL externos, permisos mínimos e importaciones. La validación en Node no puede imponerla a toda conexión SQL.
2. Observar una instancia TiDB autorizada por TLS de solo lectura: versión, collations, padding, framework, modos transaccionales, CHECK/FK y grants. No se autoriza crear/conectar recursos por este informe.
3. Elegir expresamente entre columna única y clave separada, justificando igualdad/UNICIDAD. Si se necesita B, diseñar sincronización, registro/lookup, grants y recuperación del backfill antes de escribir SQL ejecutable.
4. Diseñar catálogo TiDB propio y revisión de preflight con hashes del SQL realmente ejecutado y procedencia. No editar 001–007 ni aprobar solo el nombre de una collation.
5. Evaluar coherencia de mensajes/formato frontend con el backend sin modificar el contrato silenciosamente. Si se añade recuperación de cuenta, usar la misma canonicalización y definir tokens/expiración/privacidad en su propio alcance.
6. Reauditar el dataset inmediatamente antes de cualquier traslado autorizado. Si aparecen anomalías, resolverlas mediante un procedimiento aprobado que preserve cuentas.

## 9. Pruebas realizadas y pruebas posteriores

### Ejecutadas en esta auditoría

| Comprobación | Resultado |
| --- | --- |
| Auditor local existente | Aprobado; resultados agregados de §3 |
| SELECT agregados NULL/vacío y comparación Unicode sintética | Aprobados en conexión local READ ONLY, sin DML |
| Validador offline para espacios/case, acentos precompuestos/combinados y punycode | Resultado acorde al contrato |
| `node --test backend/tests/email-ascii.test.js backend/tests/email-ascii-http.test.js backend/tests/auth-unit.test.js` | **12/12 aprobadas**, sin conexión SQL; HTTP temporal y dobles en memoria |

El primer intento del runner fue bloqueado con `spawn EPERM` por el sandbox. Se reejecutó con autorización fuera de él y pasó. No se ejecutaron los scripts de integración que escriben fixtures reales. No se añadieron pruebas, instalaron dependencias ni ejecutaron migraciones, lint, build o suites completas en esta auditoría. Los resultados de etapas anteriores no se presentan como ejecuciones nuevas.

Las doce pruebas cubren canonicalización/Unicode, validación en llamadas directas, rechazo antes de SQL, registro/login HTTP con doble, conflicto UNIQUE simulado, agregación sin PII, bloqueo del catálogo TiDB, política de contraseñas/asignación masiva, cookie segura, DTO y rechazo de firmas/algoritmos JWT inválidos. Un doble de UNIQUE expresa expectativas, no reproduce una collation.

### Pendientes, con autorización específica de escritura en esquemas aislados

- Ejecutar la matriz de [3.3](DESPLIEGUE_ETAPA_3_3_COMPATIBILIDAD_UNICIDAD.md) en MySQL y versión TiDB observada: case, espacios, punto, guion, `_`, apóstrofo, `+`, punycode y límites de longitud; distinguir original/canónico/comparación de motor.
- Comprobar UNIQUE completo y dos sesiones concurrentes sobre la misma clave y claves distintas; esperar commit y registrar errores reales.
- Verificar rollback conjunto de usuario/sesión, duplicado detectado al commit y desconexión con resultado incierto, sin repetición ciega.
- Probar restricciones frente a INSERT directo no canónico, CHECK/FK efectivos y privilegios runtime. No ejecutar esas pruebas en MySQL local con datos de usuario.
- Ensayar registro/login/logout/expiración/revocación, CSRF, cookies y autorización de ambos roles con cuentas de prueba autorizadas; no reutilizar credenciales reales para el informe.
- Si se elige B, probar coherencia clave/email, backfill parcial y restauración. Si se implementa recuperación, agregar sus pruebas de identidad canónica y seguridad.

## 10. Dictamen final

**APROBADO CON CONDICIONES:** la política ASCII + trim + minúsculas es viable para los datos locales observados y ya está presente en el código. No se detectó pérdida potencial de acceso por normalización ni colisión en el snapshot. Se conserva el UNIQUE MySQL existente; no se garantiza ausencia futura de anomalías o equivalencia universal de collations.

**BLOQUEADO para habilitar/migrar TiDB:** falta demostrar almacenamiento canónico frente a todos los escritores, confirmar capacidades reales y probar unicidad/concurrencia del esquema elegido. Ninguna collation alternativa ni clave adicional queda aprobada por esta auditoría.

Se entrega el informe y se detiene el trabajo. No se avanza a implementación, migraciones, TiDB remoto, Render o Vercel sin autorización expresa.
