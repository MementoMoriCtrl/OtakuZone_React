# OtakuZone — Etapa 5.1: resultado de preparación de captura autorizada

Fecha: **17 de noviembre de 2026**. Decisión: **CAPTURA BLOQUEADA ANTES DE CONECTAR**. Consultas ejecutadas: **0/10**. No se obtuvo evidencia remota.

## 1. Autorización y condición previa incumplida

Se leyó la autorización adjunta para ejecutar exclusivamente Q1–Q10 de [5.0](DESPLIEGUE_ETAPA_5_0_PREPARACION_VERIFICACION_TIDB.md). Esa autorización exige un mecanismo existente de conexión física dedicada, persistente y con TLS verificado, y ordena detenerse si no puede demostrarse. Prohíbe crear un ejecutor remoto nuevo o cambiar configuración/credenciales.

La inspección local encontró:

- `backend/src/db/pool.js`: la ruta TiDB instala `installTidbSessionGuard`. Al adquirir una conexión, `prepareTidbSession` ejecuta `SET SESSION time_zone`, fuera de Q1–Q10 y expresamente prohibido en este lote. No se invocó.
- `backend/scripts/audit-email-ascii-readonly.js`: usa una conexión dedicada, pero está restringido a MySQL local, realiza lecturas adicionales y abre una transacción. No es una ruta autorizada para este lote. No se invocó.
- La configuración efectiva disponible mediante el mecanismo local existente no selecciona TiDB y no solicita TLS. Solo se emitieron booleanos de disponibilidad; no se mostraron host, usuario, contraseña, certificados ni otros valores privados. No se modificó esa configuración ni se intentó conectar con ella.
- No se encontró un ejecutable `mysql` o `tidb` mediante la búsqueda en PATH. Esto no demuestra ausencia de clientes privados fuera del entorno inspeccionado.

**Falta un mecanismo existente y configurado que permita ejecutar exactamente el lote autorizado en una conexión TiDB dedicada con TLS verificado, sin inicializadores que modifiquen la sesión.** La librería mysql2 disponible por sí sola no constituye ese mecanismo configurado. No se improvisó un cliente ni se intentó usar credenciales locales contra otro destino.

## 2. Resultado de Q1–Q10

| Consulta | Estado | Evidencia obtenida |
| --- | --- | --- |
| Q1: identidad y apertura | No ejecutada | Ninguna |
| Q2: controles globales | No ejecutada | Ninguna |
| Q3: controles de sesión | No ejecutada | Ninguna |
| Q4: cinco filas de columnas | No ejecutada | Ninguna |
| Q5: SHOW CREATE pedidos | No ejecutada | Ninguna |
| Q6: SHOW CREATE carritos | No ejecutada | Ninguna |
| Q7: contraste FK | No ejecutada | Ninguna |
| Q8: identidad y cierre | No ejecutada | Ninguna |
| Q9: controles globales de cierre | No ejecutada | Ninguna |
| Q10: controles de sesión de cierre | No ejecutada | Ninguna |

No hubo error de consulta o conexión: no se intentaron. No existen salidas, encabezados, tiempos UTC de servidor, sessionId o versión observada nuevos que conservar. No se creó un directorio de resultados vacío como si contuviera una captura; el único artefacto nuevo es este informe.

## 3. Atributos y restricciones

Los seis atributos obligatorios siguen **unknown**, sin nuevos literales: `pedidos.usuario_id.default` y EXTRA de `usuario_id`, `estado`, `moneda`, `costo_envio` y `creado_en`. Los indicadores históricos de no nulidad se conservan sin convertirlos en NULL, vacío o cero. No se detectó un conflicto remoto nuevo porque no hubo observación remota.

| Restricción | Declarative | Configuration | Functional |
| --- | --- | --- | --- |
| pedidos.ck_pedidos_moneda | unknown | unknown | unknown |
| pedidos.ck_pedidos_envio | unknown | unknown | unknown |
| pedidos.fk_pedidos_usuario | unknown | unknown | unknown |
| carritos.fk_carritos_usuario | unknown | unknown | unknown |

Se conservan las definiciones históricas documentadas; esta tabla no declara inexistencia ni deshabilitación. No se observaron controles globales/de sesión, ni identidad, versión o contexto de captura nuevos. No se deduce enforcement funcional de antecedentes o fixtures.

## 4. Preservación y validaciones locales

| Snapshot sin modificar | SHA-256 |
| --- | --- |
| v1 | 1d279cf7023ff51d7ab660a9d8fff1ec407129f2325b598870381ab4ffe901ec |
| v2 | 3c11aa5ed05b2f086d8833a16d7920a6729a0a6cd5af28c8a0bb8d815fc7fc64 |
| v3 | 2498682437402a20d08bcddb57cc058a84f93de95f007e8d4b8ae8b1ddb400c7 |

Las huellas locales coinciden con 5.0. No hay artefactos remotos cuyos hashes registrar. La huella de este informe puede calcularse al conservarlo externamente; no se incorpora dentro de sí mismo ni se inventa un captureId.

Solo se realizaron inspecciones locales de código, disponibilidad y configuración mediante indicadores booleanos, y comprobación de huellas. No se ejecutaron tests, lint o build: no cambió implementación. No se invocó el planificador ni preflight, Express o migradores.

## 5. Próximo paso y cierre

Identificar un mecanismo **ya existente** que cumpla las condiciones de conexión del lote y esté configurado para el destino autorizado. Si requiere crear un cliente o modificar configuración, ese trabajo excede esta autorización y necesita un alcance separado. No se solicita compartir secretos en la conversación. No se prepara una propuesta de integración positiva con v3 porque no existe captura completa.

El snapshot v3 no se actualiza; los tres conservan `metadataComplete=false`. Se mantienen `readyForRemoteExecution=false`, `ledgerTransitionAllowed=false` y `allow007=false`.

No hubo conexiones TiDB/MySQL, consultas remotas, SET/USE/BEGIN, DDL/DML, backfills, migraciones, recuperación, cambios de ledger, snapshots, SQL histórico, .env, certificados, credenciales, configuración productiva, autenticación o probe; tampoco despliegues o commits. No se declara TiDB verificado ni recuperación autorizada. Se detiene la etapa por la condición previa incumplida.
