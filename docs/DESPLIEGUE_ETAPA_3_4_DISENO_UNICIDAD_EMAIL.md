# OtakuZone — Etapa 3.4: diseño técnico de unicidad del correo

Fecha: **16 de noviembre de 2026**. Estado: **diseño para revisión, sin implementación ni autorización de ejecución**.

## 1. Resumen ejecutivo

**Recomendación: alternativa A condicionada**, una sola columna `usuarios.email` canónica, con NOT NULL, UNIQUE completo y candidata `utf8mb4_0900_bin` en un futuro esquema TiDB. La preferencia se justifica porque el producto actual ya almacena el correo normalizado y no requiere conservar otra representación de presentación. Evita duplicar identidad, consultas y controles de sincronización.

La condición decisiva es que **la base rechace almacenamiento no canónico**, además de validar la API. El UNIQUE debe arbitrar concurrencia sobre esa representación y la transacción debe incluir usuario y sesión. Son tres garantías distintas; ninguna sustituye a las otras.

**A no está aprobada para producción ni demostrada en TiDB.** Falta una expresión de restricción efectiva validada por motor, observar Starter y ensayar UNIQUE/concurrencia. B es alternativa si se necesita una identidad independiente o A no satisface las garantías; tampoco resuelve por sí sola eludir el backend.

Se inspeccionó el repositorio y se ejecutó únicamente un análisis offline de diez pares sintéticos con el validador existente. No hubo conexiones SQL, nuevas pruebas guardadas, servicios, migraciones, DML/DDL, cambios de seguridad ni commits. Único archivo creado: este informe.

## 2. Estado actual comprobado

Las clasificaciones de este documento significan:

| Clasificación | Significado |
| --- | --- |
| **COMPROBADO** | Observado en archivos actuales o en el análisis offline indicado; si procede de una auditoría anterior, se identifica expresamente |
| **INFERIDO** | Consecuencia razonada bajo premisas explícitas; no es ejecución de motor |
| **PENDIENTE DE VALIDACIÓN** | Requiere pruebas/capacidades/datos que no se observaron aquí |
| **BLOQUEADO** | No se autoriza habilitar o ejecutar mientras falten las garantías |

| Hallazgo | Clasificación y alcance |
| --- | --- |
| ASCII original → trim → minúsculas → formato Zod → máximo 254 | COMPROBADO en implementación actual |
| Registro y lookup usan `normalizeEmail`; perfil no actualiza correo | COMPROBADO en código |
| Una cuenta, sin anomalías ni duplicados; MySQL 8.0.46 y UNIQUE completo | COMPROBADO en auditoría previa [3.2](DESPLIEGUE_ETAPA_3_2_AUDITORIA_EMAIL.md), **no consultado de nuevo** |
| SQL 002 declara as_ci NOT NULL y UNIQUE, sin CHECK canónico de email | COMPROBADO en archivo; no se inspeccionó un servidor en esta etapa |
| TiDB tiene catálogo `blocked`, cero migraciones, preflight con collation histórica y bloqueo final | COMPROBADO en archivos; runtime/migraciones BLOQUEADOS |
| Semántica y permisos de una instancia Starter concreta | PENDIENTE DE VALIDACIÓN; ninguna conexión remota realizada |

El validador instalado conserva Zod 4.6.7. Su dominio admite letras/dígitos y, según posición, punto, guion, `_`, apóstrofo y `+` en parte local; no admite Unicode ni espacios internos. Punycode ya escrito en ASCII pasa si satisface el formato. No se añaden restricciones RFC nuevas: siguen las particularidades documentadas en 3.3, incluidas ausencia de límites separados de 64/63 y admisión de guion al final de cierta etiqueta de dominio.

## 3. Componentes y archivos revisados

| Grupo | Archivos/puntos de acceso | Función y lectura/escritura |
| --- | --- | --- |
| Política | `backend/src/domain/emailPolicy.js`, `backend/src/validators/email.js`, `validators/auth.js` | ASCII y canonicalización compartidas; registro/login; perfil strict sin email |
| Flujo auth | `routes/auth.js`, `controllers/authController.js`, `services/authService.js`, `repositories/authRepository.js`, `db/authSql.js` | POST `/api/v1/auth/register` escribe email; POST `/auth/login` busca por email; GET `/auth/session` y `/auth/me` lo devuelven por usuario/sesión |
| Perfil/logout | Mismos componentes | PATCH `/auth/me` solo nombre/bio; POST `/auth/logout` revoca sesión, sin modificar email |
| Persistencia | `backend/src/config/database.js`, `db/pool.js`, `db/transaction.js`, `db/errors.js` | mysql2 parametrizado, pool, TLS, UTC de transacción, commit/rollback y errores |
| Seguridad | `config/auth.js`, `middlewares/auth.js`, `routes/admin.js` | Cookie, JWT, CSRF y autorización ADMIN |
| Administración | `repositories/adminRepository.js`, `scripts/promote-admin.js` | GET `/api/v1/admin/users`, `/admin/orders`, `/admin/orders/:id` leen correo; promoción consulta email canónico y cambia rol; script solo inspeccionado |
| Operación y QA | `db/verifyDatabase.js`, `scripts/verify-auth.js`, `verify-commerce.js`, `verify-admin.js`, `verify-quality.js` | Cuentas técnicas, SQL directo o peticiones API y limpieza; no ejecutados. El verificador SQL incluye una inserción en mayúsculas que deberá revisarse si se exige rechazo canónico en esquema |
| Auditoría | `db/emailAudit.js`, `scripts/audit-email-ascii-readonly.js` | Lectura/agregación; no ejecutados en esta etapa |
| Frontend | `src/domain/validation.js`, formularios Login/Registration/Profile, `src/services/auth.js`, `src/services/localRepository.js` | Entradas y presentación; email de perfil solo lectura. Snapshot local no es identidad SQL; su validación no sustituye Zod |
| Catálogos | `db/tidbPreflight.js`, `db/migrationCatalog.js`, `database/tidb/manifest.json`, README TiDB y provisioning | Guardias e historial; permisos de archivos son propuestas, no grants efectivos observados |
| Evidencia previa | Informes 3.1, 3.2 implementada, 3.2 auditoría, 3.3 y propuesta de unicidad | Separación de evidencia y decisiones pendientes |

No se encontró un flujo implementado de recuperación de contraseña ni edición administrativa de email. Si aparecen posteriormente, deberán incorporarse al inventario de identidad y usar el mismo contrato.

Se leyeron las migraciones 001–007: 001 crea base/default; 002 define email/UNIQUE; 003 roles/planes y 004 catálogo no crean cuentas; 005 sesiones referencia usuario; 006 comercio y 007 inventario no alteran email. Ninguna fue ejecutada o editada. No se propone reemplazar sus huellas.

## 4. Alternativa A: una columna canónica

### Modelo conceptual e invariantes

Para entrada original x válida, definir `c(x)=trim(x).toLowerCase()`, **después** de exigir ASCII original y antes de validar formato/longitud. La identidad deseada es igualdad exacta de los bytes de c(x).

El diseño futuro TiDB exige simultáneamente:

1. Email NOT NULL, de longitud variable y capacidad 254 caracteres, almacenado ya canónico.
2. Predicado de almacenamiento **S(email)** efectivo, definido en §8, sin normalizar silenciosamente SQL externo.
3. Collation candidata explícita `utf8mb4_0900_bin`; no depender del default de conexión/base.
4. UNIQUE completo sobre email; no por prefijo y sin una segunda identidad contradictoria.
5. Lookup con el mismo normalizador y parámetro, preservando el uso de índice.

**COMPROBADO documentalmente:** PingCAP lista `utf8mb4_0900_bin` como binaria NO PAD; `utf8mb4_bin` es PAD SPACE. `utf8mb4_0900_as_ci` no aparece en su catálogo publicado. Debe observarse el framework efectivo y la collation real; no se presume disponibilidad en una instancia Starter. [Collations TiDB, v8.5](https://docs.pingcap.com/tidb/stable/character-set-and-collation/).

**INFERIDO, condicionado a esa semántica efectiva:** una clave ASCII en UTF-8 tiene un byte por carácter. Una comparación binaria sin padding distingue claves diferentes, incluida puntuación, y no agrega equivalencias lingüísticas. Distingue mayúsculas crudas, pero S solo permite minúsculas. Los espacios finales son significativos para la candidata, aunque S no permite almacenarlos.

No se declara equivalencia global con MySQL as_ci. **MySQL local conserva su collation e índice sin cambios.** Para demostrar paridad entre motores dentro del contrato, falta comprobar que la comparación histórica no introduce equivalencias adicionales entre claves canónicas distintas. No es necesario preservar equivalencias Unicode de entradas prohibidas, pero sí revisar cualquier dato histórico fuera del contrato.

### Cambios futuros que A implicaría

No exige cambiar el SQL de negocio de registro/lookup, sujeto a las pruebas. Sí exige diseñar SQL TiDB propio para collation y S, catálogo/hashes reales, revisión explícita del preflight y diagnóstico de errores/capacidades por sesión. Si se requiere la misma garantía de almacenamiento en MySQL, presentarla como **cambio posterior separado**, sin reescribir 001–007 ni afirmar que ya existe.

## 5. Alternativa B: clave canónica independiente

Modelo conceptual: email presentado p y una clave k de tipo candidato `VARBINARY(254)`, NOT NULL y UNIQUE completo; `k=bytesASCII(c(p))`. TiDB documenta los tipos VARCHAR y VARBINARY, distinguiendo caracteres de bytes. [Tipos TiDB, v8.5](https://docs.pingcap.com/tidb/stable/data-type-string/).

La capacidad de k es 254 bytes porque el contrato es ASCII. VARBINARY evita el relleno fijo; MySQL documenta que no agrega padding y que todos los bytes son significativos. BINARY fijo puede rellenar con NUL; no se elige. Modo estricto y validación deben impedir truncamientos. [BINARY/VARBINARY MySQL 8.0](https://dev.mysql.com/doc/refman/8.0/en/binary-varbinary.html).

**INFERIDO:** la representación binaria expresa la identidad sin reglas lingüísticas. Pero dos valores p que normalizan igual solo colisionan si ambos generan la misma k. Un escritor que inventa otra clave puede evadir esa identidad si la base no exige consistencia.

No se cambia ahora la representación visible actual, ya canónica. Preservar capitalización original en p sería otra decisión de producto, no una necesidad de B. Si se aprobara, p seguiría siendo ASCII con formato válido y se definiría explícitamente qué espacios se conservan. No permitir Unicode en p silenciosamente.

### Consistencia y cambios futuros

- Preferir evaluar una clave derivada por el motor, con expresión determinista y tipo/resultados verificados; no dar por soportada su combinación concreta con índice o restricciones.
- Si se escribe k desde Node, exigir además una restricción efectiva `k=c(p)` por bytes. La transacción de ambos campos evita escritura parcial, **no valores incoherentes**. Si no puede imponerse esa relación, B no cumple la garantía fuerte.
- Registro escribiría p/k coherentes; login y `promote-admin.js` buscarían k enlazada como bytes explícitos. Revisar `authSql.js`, repositorio, DTO y lectores administrativos; no exponer k como nuevo identificador público ni token.
- Revisar INSERT/grants por columna, imports y QA. No ampliar UPDATE de email, rol o password_hash como atajo.
- Decidir el UNIQUE de p: conservar una restricción lingüística adicional podría rechazar dos claves binarias distintas; no asumir que añadir k basta. Cualquier sustitución de índice requiere autorización expresa y ensayo, sin retirar UNIQUE del sistema operativo antes de tener la garantía reemplazante.
- Para datos históricos: auditar claves, conflictos y divergencias; planear copia/restauración, lotes verificables y transición de lectores. Si backfill falla, detener transición, comparar estado y recuperar con plan aprobado. NULL temporal no equivale a identidad garantizada; no marcar ledger completo ni fusionar cuentas.

**PENDIENTE DE VALIDACIÓN:** expresión derivada/consistencia, mysql2 con parámetros binarios, grants del tier, ejecución de índices y recuperación. B no es una solución certificada ni necesaria hoy.

## 6. Matriz comparativa

| Criterio | A: email canónico | B: email + clave binaria |
| --- | --- | --- |
| Identidad | Igualdad de email almacenado, bajo S y comparación candidata | Igualdad de k, bajo consistencia obligatoria con p |
| Case | Collation binaria distingue; canonicalización previa une variantes | Clave distingue bytes; canonicalización produce la misma k |
| Espacios/padding | Candidata NO PAD; S rechaza espacios almacenados | VARBINARY conserva bytes; k válida no contiene espacios |
| ASCII | S en base + validador API | Validar p y k, además de su relación |
| Máximo | 254 caracteres ASCII = 254 bytes de datos | 254 bytes de clave; límite de p por contrato |
| UNIQUE | Columna completa NOT NULL | Clave completa NOT NULL; revisar UNIQUE legado de p |
| Concurrencia | Índice del motor y commit | Mismo árbitro; dos campos no añaden atomicidad por sí solos |
| Complejidad | Menor: queries actuales esencialmente conservadas | Mayor: nueva columna/índice, parámetros, lookup y consistencia |
| TiDB | Candidata documentada; instancia/enforcement pendientes | Tipo documentado; derivación/consistencia/índice reales pendientes |
| Mantenimiento | Una representación y un predicado versionado | Dos representaciones y una relación versionada |
| Históricos | Detectar no canónicos y equivalencias/collisiones | Lo anterior más backfill/divergencias e índices en transición |
| Autenticación | Mantiene búsqueda por email canónico | Cambia búsqueda a k; conserva usuario/sid como identidad de sesión |
| Presentación original | No conserva otra capitalización | Posible, si se aprueba ese nuevo requisito |
| Garantía SQL externo | Solo con S efectivo y permisos controlados | Solo con validación y consistencia efectivas; no basta UNIQUE(k) |
| Recomendación | **Primera opción de diseño, condicionada** | Reserva si hay justificación y ofrece garantía superior comprobable |

## 7. Análisis de concurrencia

Dos solicitudes R1/R2 pueden superar cualquier SELECT previo si ninguna ve aún el commit de la otra. No hay que tratar ese SELECT como exclusión. En el flujo actual ni siquiera se necesita para decidir el registro: se intenta insertar y el índice arbitra.

Secuencia conceptual para A y B:

1. Ambas validan su entrada y obtienen la misma clave c.
2. Cada una usa una sola conexión y una transacción propia para insertar usuario y sesión.
3. El UNIQUE impide **dos estados confirmados** con la misma clave; el perdedor puede esperar, fallar en sentencia o fallar al confirmar según motor/modo. Si el primero revierte, el otro puede ser quien confirme.
4. Solo después de COMMIT satisfactorio se emite JWT/Set-Cookie y respuesta de éxito. La transacción perdedora no debe dejar usuario o sesión parcial.

**COMPROBADO en código:** `registerWithSession()` usa `withTransaction`; inserta ambos registros y lee el DTO antes de commit, pero lo devuelve al servicio solo después de confirmar. `authController` fija cookie después de resolver el servicio. Un error ordinario intenta rollback; uno de transporte destruye la conexión, sin replay.

**COMPROBADO documentalmente:** TiDB puede validar UNIQUE al commit en modo optimista; en pesimista normalmente lo hace por sentencia. [Restricciones TiDB](https://docs.pingcap.com/tidb/stable/constraints/#unique-key). La variable `tidb_constraint_check_in_place_pessimistic`, desde 6.3.0, puede diferir esa comprobación si está OFF; no asumir el default en cada conexión. El preflight actual exige pesimista, pero no observa esa variable. [Variables TiDB](https://docs.pingcap.com/tidb/stable/system-variables/#tidb_constraint_check_in_place_pessimistic-new-in-v630).

| Error/situación | Estado actual y tratamiento de diseño |
| --- | --- |
| `ER_DUP_ENTRY` / 1062 | COMPROBADO: servicio traduce `error.code` a 409 genérico, incluida propagación desde commit. PENDIENTE: observar campos reales mysql2/índice origen en TiDB; no exponer mensaje SQL con email |
| 8147, comprobación diferida | Documentado como fallo de unicidad diferida con rollback; no traducir todo el código automáticamente a «email ya existe» sin verificar contexto. El código actual no lo clasifica específicamente |
| 9007 write conflict | TiDB lo documenta, incluso bajo comprobación diferida. No implica necesariamente cuenta duplicada; diseñar error temporal redactado y probarlo, sin inventar mapeo mysql2 |
| Deadlock/timeout de lock | Distinguir conflicto de concurrencia de email duplicado. Observar errno/code/sqlState reales; no convertir todos los errores en 409 |
| CHECK/FK, longitud o dato inválido | No son conflicto de cuenta existente. Rollback y respuesta controlada; una violación tras validar puede ser defecto de contrato/esquema |
| Caída de transporte al commit | Resultado incierto: no emitir éxito/token ni afirmar rollback garantizado; no repetir registro automáticamente. Puede haber usuario+sesión confirmados aunque no llegara la respuesta |

Las referencias a 8147 y 9007 son documentales, no errores observados del proyecto sobre TiDB. [Restricciones](https://docs.pingcap.com/tidb/stable/constraints/), [códigos de TiDB](https://docs.pingcap.com/tidb/stable/error-codes/).

Para resultado ambiguo, conservar respuesta genérica y permitir un login posterior normal, sujeto a disponibilidad, sin revelar la existencia de una cuenta. La conciliación operativa debe distinguir transacción abortada de commit confirmado. No se añade aquí idempotencia nueva a registro ni reintentos ciegos. Tras commit correcto pero respuesta perdida, una sesión inaccesible puede existir hasta expirar; no es una escritura parcial de usuario/sesión.

## 8. Garantía de canonicalización

### Especificación de almacenamiento

Definir **S(v)** como: `normalizeEmail(v)` termina correctamente **y devuelve exactamente v byte a byte**. Esta definición es la referencia del contrato, no una función JavaScript que pueda invocarse desde CHECK SQL.

Para materializar S en un esquema futuro, diseñar un predicado equivalente que compruebe:

- Texto no NULL, ASCII permitido y longitud entre el mínimo derivado del formato y 254 bytes/caracteres ASCII.
- Solo letras minúsculas y el conjunto/posiciones que admite el validador vigente: formato completo, sin controles, espacios externos/internos ni Unicode.
- Coincidencia de **toda** la cadena, sin anclas que permitan un salto de línea final, sin opciones case-insensitive que acepten mayúsculas ni conversiones que sustituyan bytes inválidos.

**INFERIDO:** si todo el valor pertenece exactamente al lenguaje ASCII minúsculo aceptado y no contiene espacios/controles, ya es un punto fijo de trim/minúsculas. Se puede **rechazar** SQL no canónico sin tener que reproducir TRIM de JavaScript en SQL. Esto evita el error de asumir que `email=LOWER(TRIM(email))` bajo una collation ci detecta mayúsculas.

**PENDIENTE DE VALIDACIÓN:** traducción a expresiones admitidas por CHECK en cada motor/versión, flags y semántica de regex, escapes, conversiones de conexión, modo estricto y enforcement. No se incluye DDL ejecutable ni se promete que copiar la regex Zod a SQL sea portable. Una actualización de Zod que cambie el lenguaje requerirá revisar ese contrato de esquema antes de aceptarla.

Separar dos niveles: un guardia de ASCII/minúsculas/sin espacios asegura representación; el formato Zod completo asegura además que toda cuenta cumple el contrato de aplicación. No presentar el primero como si probara el segundo.

### Escritores y límite de confianza

| Escritor | Garantía propuesta | Lo que no basta |
| --- | --- | --- |
| Registro API | Normalizador existente + S/UNIQUE en base + transacción | Validación de formulario |
| Scripts administrativos | Usar normalizador común; permisos mínimos; S para cualquier escritura | Que `promote-admin.js` valide su lookup no certifica todos los scripts |
| Importador futuro | Validación previa sin reparar silenciosamente, plan de errores/conflictos; S sigue aplicándose | Confiar en CSV o en ausencia de anomalías de una cuenta |
| SQL externo con INSERT/UPDATE | S/consistencia efectivos deben rechazar valores inválidos aunque omita Node | Restringir UPDATE si mantiene INSERT de email |
| Runtime | Custodia de credencial, sin DDL/usuarios/roles/ledger; revisar grants efectivos y controles por sesión | Declarar aplicados los GRANT presentes en archivos de propuesta |
| Mantenimiento/migrador | Identidad separada, acciones autorizadas, auditoría y restauración | Usar credencial administrativa en HTTP |
| Operador con capacidad de retirar restricciones | Fuera de la garantía frente a escritores ordinarios; acceso excepcional y revisado | Prometer que CHECK resiste a quien puede eliminarlo |

CHECK debe estar habilitado y efectivo para las conexiones que escriben; también verificar modos que podrían ignorarlo y privilegios que permiten alterarlo. NOT NULL debe cerrar el caso UNKNOWN. Si Starter no permite imponer el predicado requerido, **no aprobar la garantía fuerte**, aunque todos los escritores conocidos usen Node. B solo reemplaza A si también puede imponer su propia consistencia; no usarla para encubrir la misma carencia.

## 9. Impacto en autenticación

| Elemento | A recomendada | B si se aprobara |
| --- | --- | --- |
| Registro/login | Mismo valor canónico y búsqueda por email; probar collation/errores | Cambia SQL de inserción/lookup a k y debe preservar DTO |
| bcrypt | No requiere cambio | No requiere cambio |
| JWT | Sigue subject=usuario y sid; email no es identidad criptográfica | Igual; k no entra en token |
| Cookie HttpOnly | Conservar nombre/opciones según entorno; sin Domain añadido | Igual |
| CSRF/Origin | Conservar controles y token ligado a sid | Igual |
| Sesiones revocables | Mantener transacción, FK, revocación/vigencia y consulta por usuario/sid | Igual |
| ADMIN/CLIENTE | Sin cambios de asignación/autorización | Sin cambios; nuevos grants no deben ampliar cambios de rol |
| Recuperación de cuenta futura | Normalizador común obligatorio | Misma clave canónica k; no lookup por representación cruda |

**INFERIDO:** no hace falta invalidar sesiones, cambiar secretos ni modificar protecciones por este diseño. No se han probado sesiones/cookies de usuarios reales. Cambiar el mecanismo de igualdad puede afectar qué cuenta encuentra un lookup; por ello equivalencias y datos históricos son criterios de aceptación, no detalles cosméticos.

## 10. Riesgos y limitaciones

- La collation candidata está documentada; su disponibilidad, framework, índice y restricciones en Starter no están observados. Self-Managed v8.5 no equivale a una certificación de un tier administrado.
- El MySQL histórico mantiene su comparación as_ci. La matriz finita y una cuenta sin anomalías no prueban paridad exhaustiva para todo el lenguaje canónico.
- S no existe hoy en el esquema; el diseño de su expresión concreta y su prueba negativa están pendientes. Permisos mínimos reducen exposición pero no validan valores.
- El pool usa mysql2, UTF-8, UTC del driver y TLS verificado al seleccionar TiDB; no garantiza por sí solo variables de integridad de todas las sesiones nuevas.
- B añade sincronización, transición de índices y backfill. Cambios parciales de DDL/ledger requieren detener y conciliar, sin modificar huellas para ocultarlos.
- Ante commit incierto, no se sabe por el error de red si hubo persistencia. La atomicidad del motor no garantiza entrega de la respuesta HTTP.
- No se aplicaron grants ni se observó un SHOW GRANTS real en esta etapa. El SQL de QA heredado no es un procedimiento remoto de prueba aprobado.

### Fuentes verificadas y alcance

Consultadas el **2026-11-16**: PingCAP [collations](https://docs.pingcap.com/tidb/stable/character-set-and-collation/), [tipos](https://docs.pingcap.com/tidb/stable/data-type-string/), [restricciones](https://docs.pingcap.com/tidb/stable/constraints/), [variables](https://docs.pingcap.com/tidb/stable/system-variables/) y [errores](https://docs.pingcap.com/tidb/stable/error-codes/), páginas `stable` con selector **v8.5**; MySQL [BINARY/VARBINARY](https://dev.mysql.com/doc/refman/8.0/en/binary-varbinary.html), manual **8.0**. No se infiere una versión Starter de esos selectores. Las fuentes fundamentan capacidades documentadas, no resultados remotos.

## 11. Recomendación técnica justificada

**INFERIDO: priorizar A como diseño mínimo condicionado.** El requisito actual es una identidad ASCII canónica; no hay necesidad funcional demostrada de conservar otra presentación. Una columna con S y UNIQUE evita tener que demostrar también `k=c(p)`, cambiar lookup y conciliar dos representaciones.

Criterios necesarios para aprobar A definitivamente:

1. Contrato de almacenamiento y expresión de S aprobados, con equivalencia al validador vigente y rechazo directo SQL.
2. Identidad/versión/framework/collation/padding reales observados; CHECK/FK y permisos efectivos para todas las sesiones runtime.
3. Auditoría actualizada del dataset sin correcciones automáticas y pruebas de igualdad frente al MySQL conservado.
4. UNIQUE completo efectivo y dos conexiones concurrentes; usuario/sesión atómicos y commit verificado.
5. Tratamiento de errores en sentencia/commit, caída de conexión y guardias/catálogo revisados sin saltarse requisitos.

Si A falla, identificar la causa antes de elegir B. Si falla por comparación de identidad o necesidad de presentación, B podría aportar valor. Si falla por incapacidad de imponer validez/consistencia a escritores SQL, B también puede quedar bloqueada. No elegir una columna extra como sustituto de evidencia.

## 12. Matriz de pruebas futuras

Estados de entorno: **O** offline sin motor; **M** esquema MySQL aislado futuro; **T** instancia TiDB real/esquema aislado futuro. Toda escritura M/T requiere otra autorización, datos sintéticos y plan de limpieza; no usar la base local de cuentas como laboratorio.

| Caso | Expectativa de aplicación y almacenamiento | Entorno necesario |
| --- | --- | --- |
| `USER@example.test` / `user@example.test` | Ambas entradas → misma clave; SQL crudo mayúsculo rechazado por S | O; M/T para CHECK/UNIQUE |
| Espacios externos, TAB/CR/LF externos | API recorta ASCII; SQL almacenado con espacios/controles rechazado | O; M/T |
| NBSP, ancho completo, Kelvin, Unicode no ASCII | Rechazo del original antes de normalizar; sin SQL de aplicación | O; M/T para rechazo directo |
| é precompuesta / e + acento combinado | Ambas rechazadas, sin transliteración ni equivalencia de cuentas | O; M/T para restricciones |
| Punycode ASCII en distinto case | Clave idéntica; punycode distinto conserva identidad distinta, sin validación IDNA nueva | O; M/T |
| Punto, `-`, `_`, `+`, apóstrofo permitido | Diferencias conservadas; probar posiciones admitidas/prohibidas por Zod | O; M/T para igualdad/índice |
| 254 y 255 caracteres | 254 si formato válido se acepta; 255 se rechaza, sin truncamiento. Comparar dos claves 254 distintas cerca del final | O; M/T para capacidad/índice sin prefijo |
| Dos entradas canónicamente iguales | Una identidad confirmada, conflicto de segunda inserción; ninguna sesión parcial | O con doble; M/T certifica motor |
| Dos conexiones y misma clave | Solo una confirmación final; probar primer commit y primer rollback | M/T |
| Dos conexiones y claves distintas | Ambas pueden confirmarse sin colisión artificial | M/T |
| UNIQUE diferido | Observar variables y errores de sentencia/commit, sin éxito/cookie prematuros | T; M como referencia de flujo |
| Fallo entre usuario y sesión | Ninguno persiste si la transacción revierte | O con doble; M/T |
| Fallo de commit/red | No replay automático ni afirmación de rollback; conciliar estado y evitar éxito anticipado | O simulado; M/T ensayo controlado |
| SQL directo NULL/vacío/mayúsculas/Unicode/control | Rechazo por esquema, incluso sin Node; no omitir CHECK/FK para probar | M/T |
| CHECK y FK negativos | Insert inválido no se confirma; metadatos e integridad real, incluidas sesiones con usuario inexistente | M/T |
| Conexiones nuevas del pool | Mismos requisitos de modos, encoding e integridad en cada sesión | M/T |
| Perfil, login, cookies, CSRF y roles | Sin actualización de email/rol por perfil; autenticación y autorización preservadas | O; navegador/HTTP aislado M/T |
| B si se elige: k incorrecta o desincronizada | Base rechaza inconsistencia; lookup usa bytes canónicos; revisar UNIQUE legado y backfill incompleto | O; M/T |

Reutilizar los 26 pares diseñados en [3.3](DESPLIEGUE_ETAPA_3_3_COMPATIBILIDAD_UNICIDAD.md) como corpus base y añadir casos de almacenamiento directo, concurrencia y sesiones. El tamaño del corpus no sustituye el razonamiento del predicado y comparación; conservar fixtures y versión del contrato.

**Ejecutado ahora, solo O:** diez pares con el `normalizeEmail` existente: case/espacios y literal repetido dieron claves iguales; punto, guion, `_`, `+` y apóstrofo dieron claves distintas; acento precompuesto/combinado fueron rechazados; punycode en distinto case dio clave igual; longitud 254 aceptada y 255 rechazada. No se escribieron scripts/pruebas nuevos ni se ejecutó SQL. No se reejecutaron suites, builds o las doce pruebas previas; sus resultados pertenecen a la auditoría anterior.

## 13. Decisiones que requieren aprobación del usuario

| Decisión futura | Impacto y límite de autorización |
| --- | --- |
| A como estrategia del destino y comparación binaria | Aprobar identidad ASCII canónica, sin declarar equivalencia Unicode global ni cambiar MySQL histórico |
| Expresión concreta de S y posible esquema posterior MySQL | Modificación futura de restricciones; revisar formato exacto, modos y guardias. No autorizada por este informe |
| B si hay causa justificada | Nueva columna/índice, consistencia, SQL/grants y transición; presentación original sería decisión adicional |
| Observación de Starter | Creación de recurso, si fuese necesaria, y conexión TLS de lectura requieren alcance separado; sin pago/facturación implícitos |
| Catálogo/preflight | Adaptación posterior con evidencia y hashes propios; no editar status o collation exigida para saltar el bloqueo |
| Ensayos con escrituras | Esquemas nuevos aislados, provisioning revisado, datos sintéticos, limpieza y recuperación aprobados |
| Traslado de datos o backfill | Nueva auditoría, tratamiento de excepciones y restauración; ninguna modificación de cuentas se autoriza aquí |

No se solicita una autorización genérica para desplegar. La siguiente revisión deberá presentar el cambio concreto, su evidencia y el entorno autorizado.

## 14. Dictamen final

- **COMPROBADO:** política de aplicación compartida, transacción usuario/sesión y bloqueo actual de TiDB en archivos; análisis offline de diez pares completado.
- **INFERIDO:** A requiere menos cambios y basta conceptualmente para el producto actual si S y UNIQUE son efectivos sobre la identidad aprobada.
- **PENDIENTE DE VALIDACIÓN:** expresión S por motor, paridad necesaria con MySQL, capacidades Starter, grants, errores mysql2 y pruebas reales de índice/concurrencia/rollback.
- **BLOQUEADO:** aprobación operativa de A/B, catálogo/runtime TiDB, migraciones y despliegues. La recomendación de diseño no los habilita.

Se preservan los cambios previos del workspace. La comparación final SHA-256 de **296 archivos existentes** del inventario, incluidos entornos privados, no encontró cambios; el único añadido es este informe. Se excluyeron `.git`, dependencias instaladas y artefactos de build/caché del inventario; no se ejecutaron herramientas que los regeneren. No se publican huellas privadas en el informe. No hubo conexiones de base de datos ni cambios en código, SQL, datos, entorno, seguridad, usuarios o servicios. Se detiene aquí la Etapa 3.4, a la espera de autorización expresa.
