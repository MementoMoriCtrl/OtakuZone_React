# OtakuZone — Etapa 5.0: preparación de verificación controlada de TiDB

Fecha: **17 de noviembre de 2026**. Alcance exclusivamente documental. **Todas las consultas de este informe están propuestas, no ejecutadas.** No se abrió conexión ni se autoriza recuperación por este documento.

## 1. Objetivo, alcance y componentes reutilizados

Preparar una captura de solo lectura que resuelva seis literales de columnas y reúna definiciones, controles y contexto para evaluar posteriormente cuatro restricciones de pedidos/carritos. No crear otro planificador, recolector remoto o modelo de evidencia paralelo.

| Componente existente | Uso previsto / límite |
| --- | --- |
| `columnAttributeContract.js` | Representación observed-value/observed-sql-null/not-applicable/unknown/conflict y comparación estricta |
| `tidb006SnapshotV3.js` | Antecedente de adaptación v2→v3 y conservación de fuente; no es un importador de resultados SQL nuevos |
| `tidbEnforcementEvidence.js` | Interpretación de definiciones y marcadores, con procedencia obligatoria para el modelo offline |
| `tidbRuntimeIntegrity.js` | Contraste de definiciones del catálogo, FK y SHOW CREATE; reglas de formato revisadas en 4.2 |
| `tidbPreflight.js` | Modelo de controles separados y observaciones ligadas a una conexión. Su fase runtime exige todo el esquema y siete versiones: no usarla para aprobar la recuperación parcial de 006 |
| `tidb006RecoveryPlan.js` | Solo planificación offline; bloquea atributos/evidencia obligatorios desconocidos y conserva las tres banderas false |
| `migrationCatalog.js` / `tidbMigrate.js` | Conservan hashes/dialectos y rechazan reintentos normales con applying; no se invocan para capturar evidencia |

Referencias: [diseño 4.0](DESPLIEGUE_ETAPA_4_0_DISENO_RECUPERACION_006.md), [contrato 4.1](DESPLIEGUE_ETAPA_4_1_CONTRATO_TIPADO_V3.md), [preflight 4.2](DESPLIEGUE_ETAPA_4_2_COMPATIBILIDAD_PREFLIGHT_TIDB.md) y [reconciliación 4.3](DESPLIEGUE_ETAPA_4_3_RECONCILIACION_FINAL_V3.md). Sus auditorías no se repiten.

## 2. Estado de partida

- Destino previsto: `otakuzone_db`; versión histórica manual: `8.0.11-TiDB-v8.5.3-serverless`.
- Ledger histórico: 001–005 applied, 006 applying/applied_at=NULL y checksum original conservado, sin 007. No es una lectura remota actual.
- Candidato v3 incompleto, SHA-256 `2498682437402a20d08bcddb57cc058a84f93de95f007e8d4b8ae8b1ddb400c7`.
- Diez atributos not-applicable ya tienen regla y trazabilidad; no necesitan nuevas celdas NULL para esta captura.
- Permanecen seis literales obligatorios unknown y contexto/enforcement incompletos. No se conoce aquí el estado remoto actual.

No se repetirá la captura general del ledger, inventario, índices, conteos de filas o el laboratorio de email. Una eventual verificación previa a **escribir** en el destino tendrá un alcance/autorización posterior propio; esta captura mínima no la sustituye.

## 3. Evidencia pendiente y resultados que la resolverían

| Evidencia | Resultado requerido, sin anticipar su valor |
| --- | --- |
| pedidos.usuario_id.default | COLUMN_DEFAULT literal, indicador IS NULL y representación inequívoca de vacío/texto/NULL |
| Cinco EXTRA de pedidos: usuario_id, estado, moneda, costo_envio, creado_en | Texto completo, indicador IS NULL, longitud y bytes para distinguir vacío de dato oculto/truncado |
| ck_pedidos_moneda y ck_pedidos_envio | DDL íntegro de pedidos, incluidos marcadores declarativos y cláusulas sin alterar |
| fk_pedidos_usuario y fk_carritos_usuario | DDL íntegro de ambas tablas y contraste de columnas/destino/reglas en vistas FK |
| Configuración | Dos controles globales y valores de sesión requeridos, observados en la conexión del lote |
| Identidad/contexto | CONNECTION_ID como string, VERSION, TIDB_VERSION completo, DATABASE y tiempo UTC del servidor al abrir/cerrar el lote |

No se espera ni se busca functional=true. Ninguna consulta propuesta intenta violar restricciones. La evidencia funcional continuará unknown si no existe un ensayo individual auténtico con alcance independiente.

## 4. Procedimiento de captura propuesto

### Antes de conectar, en una etapa autorizada

1. Aprobar expresamente **solo estas lecturas**, el destino y la identidad usada. Esta etapa no concede ese permiso ni pide credenciales.
2. Conservar las huellas de los tres snapshots y del texto exacto de consultas. Mantener sus archivos congelados. Preparar un directorio privado para resultados crudos cuando se autorice producirlos; no se crea aquí.
3. Usar un cliente con una conexión física dedicada, TLS con certificado verificado y `otakuzone_db` como parámetro de conexión. Las credenciales se suministrarán por un mecanismo privado autorizado; no se copian al informe ni se cambian .env.
4. Asegurar que no se comparte esa conexión entre tareas y que no hay actividad de migración o cambios de esquema conocidos durante el lote. No adquirir locks ni iniciar escrituras para esta captura.

SQL Editor solo sirve para el lote si puede garantizar la misma sesión física entre las sentencias. Una pestaña o un orden de ejecución visual no demuestran esa garantía. Si el cliente reconecta o no puede mantener la sesión, conservar el resultado como parcial y **no usar los SHOW como prueba de configuración de esa sesión**. No ensamblar capturas de conexiones distintas para simular un lote único.

No arrancar Express, ejecutar db:migrate ni pasar por inicializadores como la guardia del pool que establece UTC con SET SESSION. El bloque siguiente no contiene SET: si la sesión no cumple UTC/modos, se registra y bloquea, no se corrige automáticamente. No se implementa aquí un cliente o ejecutor remoto nuevo.

### Durante el lote

Ejecutar una sentencia a la vez, en el orden Q1–Q10, preservando su salida antes de continuar. Registrar las sentencias exactas y cualquier error; no repetir automáticamente una consulta fallida. La interfaz debe conservar todas las filas y el texto íntegro de las celdas SHOW.

Q8–Q10 son lecturas de cierre para verificar coherencia del mismo lote, no repetición exploratoria. Los relojes de apertura/cierre delimitan la ventana; no se requiere que sus valores sean iguales.

## 5. Consultas de solo lectura propuestas

**NO EJECUTADAS.** Son SELECT/SHOW de metadatos. No incluyen USE, SET, BEGIN, locks, DDL/DML, backfill, consultas de datos de usuarios ni lecturas del probe.

```sql
-- Q1. Apertura: identidad y tiempo UTC; conservar una fila completa.
SELECT CAST(CONNECTION_ID() AS CHAR) AS session_id,
       VERSION() AS version,
       TIDB_VERSION() AS tidb_version,
       DATABASE() AS selected_database,
       CAST(UTC_TIMESTAMP(3) AS CHAR) AS captured_at_utc;

-- Q2. Controles globales; conservar nombre y valor, sin asignarles ámbito de sesión.
SHOW GLOBAL VARIABLES
WHERE Variable_name IN (
  'tidb_enable_check_constraint',
  'tidb_enable_foreign_key'
);

-- Q3. Controles observados en la sesión dedicada.
SHOW SESSION VARIABLES
WHERE Variable_name IN (
  'foreign_key_checks',
  'sql_mode',
  'time_zone',
  'system_time_zone',
  'tidb_txn_mode',
  'tidb_constraint_check_in_place_pessimistic',
  'autocommit'
);

-- Q4. Cinco filas resuelven seis atributos pendientes; conservar encabezados.
SELECT TABLE_NAME, COLUMN_NAME,
       COLUMN_DEFAULT,
       COLUMN_DEFAULT IS NULL AS default_is_null,
       OCTET_LENGTH(COLUMN_DEFAULT) AS default_octets,
       HEX(COLUMN_DEFAULT) AS default_hex,
       EXTRA,
       EXTRA IS NULL AS extra_is_null,
       OCTET_LENGTH(EXTRA) AS extra_octets,
       HEX(EXTRA) AS extra_hex
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = 'otakuzone_db'
  AND TABLE_NAME = 'pedidos'
  AND COLUMN_NAME IN (
    'usuario_id', 'estado', 'moneda', 'costo_envio', 'creado_en'
  )
ORDER BY ORDINAL_POSITION;

-- Q5. Copiar Create Table íntegro: dos CHECK y FK de pedidos, con comentarios.
SHOW CREATE TABLE otakuzone_db.pedidos;

-- Q6. Copiar Create Table íntegro de carritos, sin truncar la columna generada.
SHOW CREATE TABLE otakuzone_db.carritos;

-- Q7. Contraste FK compatible, sin ENFORCED.
SELECT k.TABLE_NAME, k.CONSTRAINT_NAME, k.ORDINAL_POSITION,
       k.COLUMN_NAME, k.REFERENCED_TABLE_SCHEMA,
       k.REFERENCED_TABLE_NAME, k.REFERENCED_COLUMN_NAME,
       r.DELETE_RULE, r.UPDATE_RULE
FROM information_schema.KEY_COLUMN_USAGE AS k
JOIN information_schema.REFERENTIAL_CONSTRAINTS AS r
  ON r.CONSTRAINT_SCHEMA = k.CONSTRAINT_SCHEMA
 AND r.TABLE_NAME = k.TABLE_NAME
 AND r.CONSTRAINT_NAME = k.CONSTRAINT_NAME
WHERE k.TABLE_SCHEMA = 'otakuzone_db'
  AND k.TABLE_NAME IN ('pedidos', 'carritos')
  AND k.REFERENCED_TABLE_NAME IS NOT NULL
ORDER BY k.TABLE_NAME, k.CONSTRAINT_NAME, k.ORDINAL_POSITION;

-- Q8. Cierre: misma sesión, base y versión; nuevo tiempo de cierre observado.
SELECT CAST(CONNECTION_ID() AS CHAR) AS session_id,
       VERSION() AS version,
       TIDB_VERSION() AS tidb_version,
       DATABASE() AS selected_database,
       CAST(UTC_TIMESTAMP(3) AS CHAR) AS captured_at_utc;

-- Q9. Cierre de controles globales.
SHOW GLOBAL VARIABLES
WHERE Variable_name IN (
  'tidb_enable_check_constraint',
  'tidb_enable_foreign_key'
);

-- Q10. Cierre de controles de la sesión.
SHOW SESSION VARIABLES
WHERE Variable_name IN (
  'foreign_key_checks',
  'sql_mode',
  'time_zone',
  'system_time_zone',
  'tidb_txn_mode',
  'tidb_constraint_check_in_place_pessimistic',
  'autocommit'
);
```

Se reutilizan las funciones/vistas y los nombres de controles del preflight 4.2. HEX y longitud aclaran la representación de metadatos; no seleccionan datos personales. Si algún campo/función resulta inaccesible en la build administrada, conservar el error y detener la evaluación afectada: no sustituirlo por constantes favorables.

No se incluye TABLE_CONSTRAINTS.ENFORCED. Tampoco se añade CHECK_CONSTRAINTS por rutina: el diseño 4.2 establece SHOW completo como fuente individual obligatoria cuando las vistas omiten CHECK. Q7 se repite de forma focalizada dentro del lote nuevo porque debe corroborar la definición capturada **ahora**, no porque se hayan perdido las referencias históricas.

### Salida y criterio de cada lectura

| Consulta | Resultado esperado / evidencia a conservar |
| --- | --- |
| Q1/Q8 | Una fila por lectura. Mismo session_id string, selected_database=otakuzone_db y versión corroborable. Tiempos UTC reales que delimitan el lote; preservar TIDB_VERSION completo |
| Q2/Q9 | Dos variables únicas, presentes y habilitadas según los criterios existentes. Comparar por nombre/valor, no por orden de filas |
| Q3/Q10 | Siete nombres requeridos con valores íntegros. foreign_key_checks/autocommit/comprobación UNIQUE inmediata ON; modo pesimista, modos estrictos y UTC conforme al preflight |
| Q4 | Cinco filas distintas con los cinco nombres indicados; nunca rellenar una fila ausente. De usuario_id se necesita default y EXTRA; de las otras cuatro, EXTRA. Sus defaults se conservan también como contraste del mismo resultado, no originan otra captura |
| Q5/Q6 | Una definición íntegra por tabla. Mantener comentarios versionados, NOT ENFORCED, FOREIGN KEY INVALID, reglas y todo el texto; no ejecutar el DDL que aparece en la celda |
| Q7 | Según el antecedente: una parte por cada una de las dos FK hacia usuarios.id, esquema otakuzone_db y reglas RESTRICT/RESTRICT. Conservar cualquier fila diferente o adicional para revisión, sin filtrarla para cumplir la expectativa |

Para system_time_zone, SHOW SESSION puede exponer el valor global de esa variable; no se utiliza como sustituto de time_zone de sesión. Solo corrobora SYSTEM=UTC cuando esa es la configuración observada, conforme a la política existente.

Los recuentos/valores anteriores son **criterios basados en el antecedente**, no resultados obtenidos. Si aparecen columnas/FK nuevas de 006, otros cambios o una diferencia frente al candidato, no ocultarlos ni adoptar automáticamente un escenario de recuperación.

## 6. Integridad, aceptación y bloqueo

Conservar cada salida cruda completa en un formato que distinga null, string vacío y texto. Las capturas visuales pueden complementar una exportación, pero no sustituyen celdas truncadas. Guardar localmente, en un alcance futuro aprobado, texto de consulta, salida/error, cliente y garantía de conexión dedicada, orden, apertura/cierre y huellas SHA-256 de cada artefacto. No incluir comandos con contraseñas, certificados, tokens o datos de filas de aplicación.

### Representación de valores

- Indicador IS NULL=1: SQL NULL observado; el texto/HEX/longitud deben ser coherentes con esa nulidad.
- Indicador=0, longitud=0 y HEX vacío: string vacío observado, no SQL NULL.
- Indicador=0 y longitud positiva: conservar el literal y su representación; no eliminar comillas, introductores, espacios ni escapes por conveniencia.
- Texto `NULL` con indicador=0 sigue siendo texto, no null JSON.
- Resultado ilegible, ausente o contradictorio: unknown o conflict según corresponda; no completar con el valor esperado.
- Los diez not-applicable existentes siguen siendo derivaciones tipadas, no se recategorizan como celdas SQL NULL por este procedimiento.

### Bloqueos obligatorios

1. Conexión no fijada, reconexión, cambio de session_id/base/versión o falta de garantía de que SHOW se ejecutó en la conexión del lote.
2. Controles ausentes, OFF, desconocidos, duplicados, contradictorios entre apertura/cierre o de alcance incorrecto. No ejecutar SET para corregirlos bajo este permiso de lectura.
3. Versión no corroborable o fuera de la interpretación aprobada; una actualización del proveedor no se aprueba automáticamente.
4. Menos filas de columnas, resultado truncado, diferencia entre literal/indicador/HEX o tipo de null perdido por el visor/exportación.
5. Restricción ausente, NOT ENFORCED, FOREIGN KEY INVALID, referencias/reglas divergentes o definición no interpretable por las reglas existentes.
6. Estado remoto diferente del supuesto, cambios concurrentes conocidos, visibilidad insuficiente o error de permisos/metadatos. Un resultado vacío no prueba ausencia con permisos insuficientes.
7. Conflicto con antecedentes, incluido default_is_null=0 histórico frente a un nuevo SQL NULL: conservar ambas fuentes y revisar la discrepancia, no seleccionar la lectura que hace pasar el contrato.

Aceptar un **paquete de captura suficiente** solo significa que sus datos son legibles, coherentes y trazables para revisión offline. No equivale a metadataComplete=true, aprobación runtime, permiso de reparación o certeza de que el servidor no cambió después.

## 7. Integración futura con v3

No modificar v1, v2 ni el candidato v3 de esta etapa. Una integración posterior autorizada debe crear un candidato separado y conservar el v3 de origen y su hash. Reutilizar el contrato tipado, el comparador y las reglas existentes; no crear otra semántica de aprobación.

### Contexto sin identificadores inventados

- sessionId se transcribe como string exacto del CONNECTION_ID observado. No usar CURRENT_USER, nombres de usuario, IDs de fixtures o números generados localmente como si fueran de la sesión.
- El futuro captureId puede definirse mediante una **regla explícita de derivación documental**, por ejemplo el SHA-256 de un manifiesto inmutable con las consultas/salidas y sus hashes. No será un identificador emitido por TiDB ni una firma. El manifiesto excluye su propio ID/hash para evitar una referencia circular. Esa regla debe registrarse al integrar; no se calcula ni asigna uno ahora.
- capturedAt debe proceder del tiempo UTC observado del lote. Si se usa la apertura como instante común, documentar esa semántica y conservar también la hora de cierre; no fingir hora exacta de cada SHOW. Convertir el texto UTC a ISO con milisegundos solo mediante una transformación explícita revisada, conservando el original; nunca reutilizar applied_at, fecha del informe o un reloj supuesto.
- engineVersion conserva el banner real y su corroboración. versionMapping requiere revisión explícita de la regla de interpretación; no es una certificación del binario Serverless y no se obtiene por cambiar un string a reviewed-serverless.

### Atributos

Resolver cada uno de los seis unknown solo con el literal/SQL NULL inequívoco y su procedencia. Preservar su estado previo, hechos parciales y referencias como historial de enriquecimiento. La ausencia de un valor previo no es una observación negativa: un dato nuevo compatible puede resolver unknown; si contradice un hecho parcial observado, conservar el conflicto para decisión explícita.

Usar observed-value para un literal, incluido `""`, u observed-sql-null cuando realmente se observe SQL NULL. No poner partialFacts en un nodo positivo como si aún sustituyeran el valor: conservarlos en su antecedente/historial, conforme a las validaciones del contrato. Si el nuevo default/EXTRA no coincide con la expectativa, el comparador debe bloquear hasta revisar su representación/semántica; no modificar SQL ni quitar guardias para aceptarlo.

### Restricciones y configuración

Transcribir las definiciones completas y sus fuentes; evaluar CHECK y FK individualmente mediante las reglas revisadas. Vincular configuración global y de sesión al mismo lote/identidad, con sus valores y ámbitos. La existencia del objeto no acredita su funcionalidad. Mantener functional=unknown si no hay evidencia funcional individual auténtica; no repetir el ensayo temporal para rellenarlo.

Los formatos live-query-unattested de 4.2 y manual-unverified del modelo offline describen procedencias distintas. Una transcripción manual de resultados deberá conservar su origen real y la revisión realizada; **no copiar el informe de preflight como si ya fuera un enforcementEvidence válido ni elevarlo a evidencia autenticada**. No se implementa esa integración en esta etapa.

El recolector runtime completo de 4.2 requiere 007 y ledger completo; por ello no es un atajo para esta captura parcial. Reutilizar sus consultas y funciones puras permite revisar los resultados sin ejecutar el preflight completo contra una base todavía en recuperación.

El paquete no actualiza la vigencia del ledger histórico ni certifica todo el esquema. La revisión final deberá distinguir lo recién observado de lo conservado históricamente y determinar si la coherencia temporal es suficiente. Ni siquiera seis literales resueltos permiten activar automáticamente metadataComplete.

## 8. Riesgos y limitaciones

Las diez lecturas no forman un snapshot transaccional único. Una identidad/controles coincidentes al inicio y cierre no detectan todos los cambios intermedios ni autentican archivos exportados. El contexto queda limitado a la conexión y ventana observadas; no acredita conexiones futuras ni garantiza exclusión de escritores.

SHOW y las vistas permiten evidencia declarativa/configuración conforme a la política versionada, no una prueba funcional negativa. Los parsers existentes son conservadores: una representación legítima no reconocida puede bloquear y requerir revisión explícita. No se presupone disponibilidad de todas las lecturas o permisos en la build administrada.

El procedimiento no prueba que 006 sea recuperable sin datos conflictivos, no ensaya DDL separado, no crea bitácora de recuperación ni cierre de ledger. Ese alcance sigue separado del diseño de captura.

## 9. Validación local y próximo paso

Solo se crea este documento. Se verifica por SHA-256 que código, informes y snapshots históricos inventariados permanecen intactos; no se ejecutan suites, lint o build porque no cambia implementación.

| Snapshot | SHA-256 preservado |
| --- | --- |
| v1 | 1d279cf7023ff51d7ab660a9d8fff1ec407129f2325b598870381ab4ffe901ec |
| v2 | 3c11aa5ed05b2f086d8833a16d7920a6729a0a6cd5af28c8a0bb8d815fc7fc64 |
| v3 | 2498682437402a20d08bcddb57cc058a84f93de95f007e8d4b8ae8b1ddb400c7 |

Próximo paso: revisión del procedimiento y, **solo con autorización separada**, realización de este lote de lectura en una conexión dedicada y conservación de resultados. No se propone otra auditoría documental equivalente ni se inicia automáticamente una verificación.

Siguen pendientes la captura efectiva, la revisión de versionMapping/procedencia y su integración local aprobada. La recuperación, cualquier DDL/DML, backfill o transición de ledger necesitarán sus propios controles y autorización posteriores.

Se conservan metadataComplete=false y **readyForRemoteExecution=false, ledgerTransitionAllowed=false, allow007=false**. No hubo conexión TiDB/MySQL, consulta remota, SQL real, migraciones, recuperación, cambios de ledger/datos/snapshots/.env/credenciales/certificados/configuración productiva/auth/probe, despliegues ni commits. No se declara TiDB verificado. La etapa termina aquí, a la espera de autorización antes de cualquier lectura remota.
