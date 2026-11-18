# OtakuZone — Etapa 5.2: capturador controlado de metadatos TiDB

Fecha: **17 de noviembre de 2026**. Implementación y pruebas exclusivamente locales. **El capturador no se ejecutó contra una base de datos. Esta etapa no autoriza una captura ni una recuperación.**

## 1. Archivos y arquitectura

Se crean únicamente:

- `backend/scripts/capture-tidb-metadata-readonly.js`.
- `backend/tests/tidb-metadata-capture.test.js`.
- Este informe.

Se revisaron el pool, la configuración existente, mysql2 **3.24.6** y los informes [5.0](DESPLIEGUE_ETAPA_5_0_PREPARACION_VERIFICACION_TIDB.md) y [5.1](DESPLIEGUE_ETAPA_5_1_RESULTADOS_CAPTURA_TIDB.md). No se repitieron auditorías históricas.

El script utiliza `mysql2/promise.createConnection`, una sola vez y sin pool. Reutiliza `loadDatabaseConfig` y el analizador puro `declaredConstraintNames`; no importa `pool.js`, la guardia de sesión, Express, preflight completo o migradores. No carga dotenv ni modifica archivos de configuración. Importarlo para pruebas no inicia su CLI ni conecta.

La configuración se valida con el contexto existente `migration` para no introducir otro esquema de credenciales. Esto no ejecuta un migrador ni concede permisos: admite las identidades contempladas por ese validador, incluso administrativas. Una futura ejecución debe elegir una identidad de lectura aprobada; el script no crea usuarios ni concede privilegios.

## 2. Variables y conexión

El proceso futuro necesita las variables existentes `DB_ENGINE=tidb`, `DB_NAME=otakuzone_db`, `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_SSL=true`; opcionalmente `DB_PORT`, `DB_CONNECT_TIMEOUT_MS` y `DB_SSL_CA`. Se mantienen las validaciones existentes, incluida `DB_POOL_SIZE` entre 2 y 5 aunque aquí no se cree un pool. No se imprimen sus valores ni se solicitan secretos en la conversación.

Además requiere:

| Variable | Requisito |
| --- | --- |
| `TIDB_METADATA_CAPTURE_ENABLED` | Exactamente `true`; cualquier otro valor bloquea antes de conectar |
| `TIDB_METADATA_CAPTURE_OUTPUT_DIR` | Directorio padre existente, privado y destinado a evidencia fuera del repositorio/publicación web |
| `TIDB_METADATA_CAPTURE_PRIVATE_DIRECTORY_CONFIRMED` | Exactamente `true` en la CLI; confirmación operativa del directorio privado |

Se rechaza `NODE_TLS_REJECT_UNAUTHORIZED=0`. Las opciones de conexión fijan `ssl.rejectUnauthorized=true` y `ssl.verifyIdentity=true`; no aceptan opciones TLS arbitrarias. La CA privada existente se suministra solo a mysql2. Se comprobó localmente que la implementación instalada contempla ambas opciones. No se desactiva la validación de cadena o identidad del servidor.

El destino debe declararse explícitamente; no se permite aprovechar un default MySQL/local. `multipleStatements=false`, sin callbacks de inicialización, sin `SET`, `USE`, `BEGIN` o reconexiones automáticas. La base se selecciona mediante el handshake del driver. El protocolo de conexión y su cierre son necesarios para la conexión, pero no añaden sentencias SQL.

## 3. Consultas y ejecución

La lista compilada e inmutable contiene exclusivamente Q1–Q10 de 5.0, en su orden y contenido SQL. Se omiten solo los comentarios explicativos del documento. No se leen consultas desde argumentos, archivos o variables; la CLI rechaza cualquier argumento. Una prueba compara la lista directamente con el bloque SQL de 5.0.

| Consultas | Comprobación local de sus resultados futuros |
| --- | --- |
| Q1/Q8 | Una fila, sesión decimal como string, base exacta, banner TiDB 8.5.3 y corroboración de versión; identidad igual al cierre, reloj no regresivo |
| Q2/Q9 | Dos controles globales únicos y habilitados; comparación por nombre/valor sin depender del orden |
| Q3/Q10 | Siete controles únicos; FK/autocommit/UNIQUE inmediata activos, modo pesimista, modos estrictos y UTC; valores estables al cierre |
| Q4 | Cinco columnas distintas, indicadores NULL coherentes con literal, longitud UTF-8 y HEX; no normaliza defaults/EXTRA |
| Q5/Q6 | Texto completo preservado; analizador conservador existente comprueba envoltura, opciones y nombres esperados de restricciones, sin aprobar sus predicados ni enforcement |
| Q7 | Dos FK hacia otakuzone_db.usuarios(id), nombres/columnas/posición y RESTRICT/RESTRICT coincidentes con antecedentes |

Una anomalía se conserva como evidencia parcial y detiene el lote antes de la siguiente consulta. No se corrigen variables ni se reintentan errores. Cambios legítimos de esquema también bloquean para revisión, sin ocultar filas adicionales.

Se registra la intención antes de cada consulta y la salida antes de validarla. Un fallo del almacenamiento impide continuar. Los errores del driver se registran mediante categoría genérica y, cuando existe, código `ER_*` seguro; **no se persisten mensajes crudos, sqlMessage, stack o parámetros**, que pueden incluir secretos. Esta reducción es deliberada: no se promete conservar detalles privados del error. Se conserva la consulta fija que falló y la evidencia anterior.

La conexión se cierra en `finally`; si falla `end`, se destruye y la captura queda parcial. No hay una segunda conexión, replay o fallback. Un fallo al crear la conexión también produce informe parcial cuando el almacenamiento está disponible.

## 4. Protección de resultados

La CLI crea un subdirectorio único `tidb-capture-*` dentro del directorio privado aprobado. No sobrescribe archivos (`wx`). En POSIX exige que el padre no tenga permisos de grupo/otros, y usa modos privados; en Windows restringe la ACL del subdirectorio nuevo al SID del usuario actual mediante `whoami` e `icacls`, antes de escribir evidencia. Si falla esa operación, no conecta. Los subprocesos son locales, sin ventanas visibles, y su salida no se imprime.

No se cambia la ACL del padre, certificados o configuración existente. La ubicación debe quedar fuera del repositorio y de carpetas públicas/sincronizadas; administradores, backups o políticas del sistema pueden seguir teniendo acceso. No se cifra la evidencia ni se autentica por firma.

Se guardan:

- `opening.json`: instante local inicial, versión del cliente y banderas; no incluye opciones de conexión ni credenciales.
- `Qn-intent.json`: consulta fija e identificador Qn antes de ejecutarla.
- `Qn.json`: consulta, todas las filas y metadatos de columnas seleccionados del driver (nombre, tipo, flags y charset).
- `Qn-error.json`, si corresponde: consulta y error seguro.
- `report.json`: resultados acumulados, estado, error seguro, apertura/cierre locales y banderas.
- Un archivo `.sha256` por cada JSON, calculado sobre sus bytes UTF-8 exactos. Los digests no incluyen su propia huella recursivamente.

Los tiempos UTC del servidor permanecen en Q1/Q8; no se confunden con los tiempos locales del proceso. SQL NULL, string vacío y demás tipos de resultados se conservan mediante JSON sin truncamiento voluntario. No se seleccionan filas de aplicación. No se guardan el hostname configurado, usuario, contraseña, CA o cadenas de conexión.

Los DDL pueden contener comentarios propios del esquema: tratarlos como evidencia privada y no publicar los resultados. El script no puede descubrir secretos que un operador hubiera escrito previamente dentro de esos comentarios; ocultarlos automáticamente destruiría la integridad del DDL. La salida de consola contiene solo estado/banderas o códigos seguros, nunca filas o DDL.

## 5. Pruebas y lint

Comandos ejecutados:

```text
node --test backend/tests/tidb-metadata-capture.test.js
npm run lint
```

**24/24 pruebas aprobadas**, cero fallidas/omitidas/canceladas. **Lint aprobado**. Las pruebas usan exclusivamente fixtures y conexiones inyectadas; un guardia intercepta `Socket.connect` y verifica **cero intentos de red**. La prueba de almacenamiento solo crea evidencia sintética temporal y comprueba bytes/hashes, rechazo de sobrescritura y limpieza limitada al directorio temporal comprobado.

Se cubren autorización desactivada, TLS desactivado/bypass, destino/motor incorrectos, configuración incompleta, ausencia de sink, allowlist exacta, conexión única, opciones TLS, resultados completos, errores redactados, fallos de consulta/conexión/almacenamiento/cierre, deriva de identidad/controles/reloj, NULL incoherente, columnas ausentes, DDL truncado/restricciones ausentes y FK divergente.

El runner inicial falló por `spawn EPERM` del sandbox; la ejecución fuera del sandbox fue autorizada para pruebas locales. Una ejecución intermedia detectó alias compartidos entre apertura/cierre en el fixture y una aserción que confundía SHOW CREATE con DDL ejecutable; se corrigieron los tests. La ejecución final no conserva fallos. No se ejecutó la CLI del capturador, ni siquiera contra la configuración local, ni se calcularon planes reales.

## 6. Ejecución futura, solo tras autorización

1. Revisar y autorizar expresamente destino, identidad, consultas y almacenamiento privado para esa captura. La bandera es una habilitación técnica, no un permiso ni prueba de autorización.
2. Proporcionar las variables anteriores mediante el mecanismo privado autorizado del proceso. No editar `.env`, copiar secretos al terminal compartido ni reutilizar una configuración MySQL local cambiando solo el nombre del motor.
3. Preparar y confirmar un directorio privado externo. Verificar que no haya cambios de esquema/migraciones conocidos durante el lote.
4. Únicamente entonces ejecutar, desde la raíz del proyecto, sin argumentos:

```text
node backend/scripts/capture-tidb-metadata-readonly.js
```

5. Conservar el subdirectorio nuevo y verificar sus hashes. Revisar el informe incluso ante salida parcial. No repetir automáticamente una captura fallida ni usar esta herramienta para cambiar controles.

No se ejecutó este comando en esta etapa. La configuración usada en 5.1 sigue sin alterarse. Para habilitar una captura futura deben estar disponibles las variables apropiadas en un alcance separado; este informe no declara que ya lo estén.

## 7. Límites y preservación

`captured-awaiting-review` significa que pasó la validación de captura, **no** aprobación de metadata, runtime o recuperación. El analizador puede bloquear una representación válida no soportada. La comparación definitiva de cláusulas CHECK/FK, marcadores NOT ENFORCED/FOREIGN KEY INVALID, procedencia y correspondencia de versión se mantiene en el flujo offline existente. Functional sigue desconocido: no se realizan pruebas funcionales.

Lecturas inicial/final no crean un snapshot transaccional de metadatos ni garantizan ausencia de cambios intermedios o configuración de sesiones futuras. No se implementan caducidad, exclusión de escritores, recolección de ledger/índices/datos, integración automática al v3, ejecutor de recuperación o cierre de ledger. Una interrupción del proceso puede dejar evidencia parcial; no existe reanudación automática. Un error persistente del disco puede impedir guardar el informe final.

| Snapshot histórico intacto | SHA-256 |
| --- | --- |
| v1 | 1d279cf7023ff51d7ab660a9d8fff1ec407129f2325b598870381ab4ffe901ec |
| v2 | 3c11aa5ed05b2f086d8833a16d7920a6729a0a6cd5af28c8a0bb8d815fc7fc64 |
| v3 | 2498682437402a20d08bcddb57cc058a84f93de95f007e8d4b8ae8b1ddb400c7 |

Los snapshots permanecen `metadataComplete=false`. No se modifica el pool productivo, configuración, autenticación, ledger, SQL histórico, .env, certificados, credenciales o probe. No hubo conexiones TiDB/MySQL, consultas remotas, DDL/DML, migraciones, backfills, recuperación, 007, despliegues o commits.

Se mantienen `readyForRemoteExecution=false`, `ledgerTransitionAllowed=false` y `allow007=false` tanto en el capturador como en los artefactos existentes. Se entrega únicamente esta implementación local y se detiene la etapa, sin ejecutar el capturador ni avanzar a recuperación.
