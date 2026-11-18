# OtakuZone — Etapa 4.0: diseño de recuperación controlada de TiDB 006

Fecha: **17 de noviembre de 2026**. Alcance: análisis arquitectónico y diseño. **Este documento no implementa, ejecuta ni autoriza la recuperación.** Es el único archivo creado en esta etapa.

## 1. Resumen ejecutivo

La recuperación viable consiste en completar únicamente los efectos ausentes de 006, separando columnas, índices y FK, verificando cada paso y conservando una bitácora de recuperación independiente del checksum histórico. No se debe reintentar el archivo compuesto ni retirar el marcador applying para continuar.

**Actualmente no existe un procedimiento ejecutable aprobado.** Los candidatos siguen incompletos, el planificador es exclusivamente offline y faltan tanto una representación revisada de atributos como un protocolo implementado de ejecución, bitácora y finalización del ledger. Hay además un bloqueo runtime independiente: el preflight todavía consulta una columna ENFORCED cuya inexistencia fue confirmada para esta instancia.

Se recomienda como siguiente etapa **diseñar e implementar localmente un contrato tipado de atributos**, con conversión explícita y pruebas; después revisar separadamente el ejecutor y la reconciliación auditada. No declarar listo el destino remoto por este informe.

## 2. Estado técnico: hechos, evidencia aportada y límites

| Categoría | Resultado |
| --- | --- |
| Comprobado localmente | Catálogo TiDB independiente con siete versiones y ledger schema_migrations_tidb; fuentes MySQL separadas; checksum original de 006 fijado por catálogo y planificador |
| Comprobado localmente | 006 tiene tres sentencias, no es transaccional en el manifest; el migrador persiste applying antes de su SQL y applied después de completar el archivo |
| Comprobado localmente | v1 y v2 tienen metadataComplete=false. V2 conserva 16 atributos obligatorios omitidos y evidencia de enforcement/contexto incompletos |
| Aportado manualmente por el usuario | TiDB 8.0.11-TiDB-v8.5.3-serverless, destino otakuzone_db; 001–005 applied, 006 applying con hash original, 007 ausente |
| Aportado manualmente por el usuario | No se observaron columnas/índices/FK nuevos de 006 ni historial_pedidos; pedidos y carritos estaban vacíos |
| Inferencia | La evidencia es consistente con fallo previo a los efectos de la primera sentencia, pero no certifica que el estado actual siga siendo ese |
| No comprobado aquí | Estado remoto actual, permisos, ausencia de escritores o DDL pendiente, respaldo restaurable, equivalencia exacta del binario Serverless con el tag público |

El checksum histórico de 006 es `2042173bbf22384c553239fb3c98f440962ba611ece696be64f3e3cd3ac9345e`. Identifica el SQL original, no el SQL de una eventual reparación por fases. Nunca intercambiar esas huellas.

Fuentes locales principales: migraciones TiDB 001–007, manifest y ledger.sql, migrate.js/tidbMigrate.js/migrationCatalog.js, planificador e intérprete, preflight/sesiones y pruebas de recuperación; informes [3.18](DESPLIEGUE_ETAPA_3_18_CAPTURA_FINAL.md), [3.19](DESPLIEGUE_ETAPA_3_19_EVIDENCIA_ENFORCEMENT.md), [3.20](DESPLIEGUE_ETAPA_3_20_AUDITORIA_CONTRATO_V2.md), [3.21](DESPLIEGUE_ETAPA_3_21_SNAPSHOT_V2.md) y [3.22](DESPLIEGUE_ETAPA_3_22_RECONCILIACION_COLUMNAS.md).

## 3. Auditoría de 006 y dependencias históricas

Se leyó el SQL íntegro de las siete fuentes TiDB. 001 crea la base si no existe; 002 define el esquema original; 003/004 aportan seeds sin modificar las columnas de pedidos; 005 añade auth_sesiones. Ninguna de ellas crea carrito_origen_id, clave_solicitud o historial_pedidos. 007 crea movimientos_inventario y referencias a pedidos, productos y usuarios; queda fuera de esta recuperación.

### Orden exacto de las tres sentencias de 006

| Orden | Operación | Dependencias y efecto |
| --- | --- | --- |
| 1.1 | ADD COLUMN pedidos.carrito_origen_id BIGINT UNSIGNED NULL | Tabla pedidos existente; columna nueva opcional |
| 1.2 | ADD COLUMN pedidos.clave_solicitud CHAR(36) ascii/ascii_bin NULL | Tabla pedidos existente; columna nueva opcional |
| 1.3 | ADD UNIQUE uq_pedidos_carrito(carrito_origen_id) | Depende de 1.1; duplicados no NULL impedirían su creación |
| 1.4 | ADD UNIQUE uq_pedidos_solicitud(usuario_id, clave_solicitud) | usuario_id existe en 002; clave_solicitud depende de 1.2 |
| 1.5 | ADD FK fk_pedidos_carrito → carritos(id), RESTRICT/RESTRICT | Depende de 1.1, compatibilidad de tipos/índices y referencias válidas |
| 2 | CREATE TABLE IF NOT EXISTS historial_pedidos | Cuatro columnas: id BIGINT UNSIGNED AUTO_INCREMENT/PK; pedido_id BIGINT UNSIGNED NOT NULL; estado ENUM de cuatro estados NOT NULL; creado_en TIMESTAMP(3) con CURRENT_TIMESTAMP(3). Índice ix_historial_pedido_fecha(pedido_id, creado_en, id); FK fk_historial_pedido → pedidos(id), RESTRICT/RESTRICT |
| 3 | INSERT SELECT con NOT EXISTS por pedido_id | Depende de la tabla de 2 y de pedidos.id/estado/creado_en. Conserva esos tres valores; no inventa transiciones ni modifica pedidos |

**1.1–1.5 son cláusulas de una misma sentencia**, no cinco sentencias independientes. La primera sentencia histórica es, para diagnóstico, no para ejecutar:

```sql
ALTER TABLE pedidos
  ADD COLUMN carrito_origen_id BIGINT UNSIGNED NULL,
  ADD COLUMN clave_solicitud CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  ADD UNIQUE KEY uq_pedidos_carrito (carrito_origen_id),
  ADD UNIQUE KEY uq_pedidos_solicitud (usuario_id, clave_solicitud),
  ADD CONSTRAINT fk_pedidos_carrito FOREIGN KEY (carrito_origen_id)
    REFERENCES carritos(id) ON DELETE RESTRICT ON UPDATE RESTRICT;
```

No se identifica un nombre local mal escrito: las referencias previas pedidos.usuario_id y carritos.id están en 002; las otras dos columnas se añaden en el mismo ALTER que las utiliza. El contrato reproduce esos efectos y conserva las restricciones originales de moneda/envío. La ausencia previa de las columnas nuevas es esperada; la duda es su disponibilidad durante la validación del ALTER compuesto.

El backend usa ambas columnas para crear/reconocer pedidos e historial_pedidos para registrar y leer estados. El arranque consulta esos objetos. No es válido omitir 006 o declarar funcionamiento comercial completo sin ellos. Una recuperación de 006 tampoco satisface por sí sola el arranque final, que espera además objetos de 007 y el catálogo completo.

## 4. Causa del fallo y nivel de certeza

**Causa probable, no reproducida aquí:** validación de índices/FK contra el esquema previo al ALTER, con dependencias hacia columnas añadidas en la misma sentencia. La documentación oficial advierte de validación contra el esquema previo en cambios compuestos. Esa advertencia respalda la hipótesis, pero su ejemplo no reproduce exactamente este ALTER ni certifica el parche Serverless. No se concluye que todo ALTER compuesto esté prohibido. [Compatibilidad de ALTER TABLE](https://docs.pingcap.com/tidbcloud/sql-statement-alter-table/).

El código de error 1072/ER_KEY_COLUMN_DOES_NOT_EXITS no identifica por sí solo la columna. uq_pedidos_carrito(carrito_origen_id) es el primer candidato textual; también dependen de nuevas columnas el segundo UNIQUE y la FK. El orden textual no demuestra el orden interno de validación.

El log APPLY 005 se imprime **después** de su SQL y de actualizar su estado. El marcador remoto aportado de 006 applying demuestra que se inició su intento; no contradice que faltase APPLY 006. El esquema anterior observado es coherente con que no se alcanzaran CREATE historial ni backfill. No basta para descartar otra revisión ejecutada, cambios posteriores o una operación pendiente.

Separar dependencias es una recomendación conservadora, no una compatibilidad ya ensayada. La versión exacta ejecutada y un mensaje original completo redactado, si se conservan, serían evidencia adicional; no se provoca otro fallo para obtenerlos. No hay indicios en este error de que cambiar CA, contraseña, cuenta administrativa o la política de email lo resuelva.

## 5. Matriz de escenarios de recuperación

Todos los procedimientos siguientes son propuestas condicionadas a autorización futura. La clasificación requiere evidencia vigente; no se asigna definitivamente un escenario al destino actual.

| Escenario | Evidencia necesaria | Riesgos y bloqueo | Procedimiento propuesto | Verificación de cierre |
| --- | --- | --- | --- | --- |
| 1. Sin cambios parciales | 001–005 válidas; 006 applying; ausencia explícita de ambas columnas, claves/FK nuevas e historial; visibilidad suficiente | Captura obsoleta o DDL aún activo. Bloquea cualquier desconocido obligatorio | Ejecutar solo fases A–D ausentes; E si hay pedidos sin historial | Definiciones exactas, claves/FK válidas, datos conservados y cobertura completa |
| 2. DDL parcial | Inventario detallado que identifica exactamente columnas, claves, FK y tabla ya públicas; estado terminal de cualquier DDL previo | No saber si terminó un trabajo o adoptar un objeto solo por nombre. Bloquea incompatibilidad | Conservar objetos equivalentes, saltar únicamente esos pasos y aplicar el resto en orden de dependencias | Contraste después de cada paso y al final; ninguna duplicación de objetos |
| 3. applying con esquema completamente aplicado | Contrato estructural final íntegro, evidencia de restricciones y datos/backfill completos; no basta ver las tablas | Puede faltar backfill aunque el DDL esté completo. Bloquean incoherencias o ausencia de trazabilidad | No repetir DDL ni backfill ya satisfecho; reconstruir evidencia auditable y proponer solo cierre condicionado | Bitácora de conciliación que distingue acciones observadas de acciones realmente ejecutadas |
| 4. applying con esquema parcialmente aplicado | DDL y datos evaluados por separado: por ejemplo historial equivalente existente con pedidos todavía sin entrada | Duplicación de historial por concurrencia o adopción de datos incompatibles. Bloquean huérfanos, duplicados conflictivos o escritores | Completar objetos faltantes; backfill únicamente de pedidos sin ninguna entrada, sin alterar las existentes | Cero pedidos sin historial, referencias válidas y evidencia de preservación de registros anteriores |
| 5. Esquema incompatible | Tipo, columna, índice, FK, CHECK, trigger o historial distinto; versiones/hashes/estados inesperados | Corrección destructiva accidental. Un objeto equivalente con otro nombre también requiere revisión | Detener; inventariar y diseñar una reparación específica o restauración aprobada. No renombrar/borrar/adoptar automáticamente | Nuevo contrato y plan revisados antes de escribir; no hay cierre genérico permitido |

Los escenarios 2 y 4 se solapan intencionalmente: el primero describe el avance DDL; el cuarto obliga a considerar además ledger y efectos de datos. Un resultado desconocido no equivale a objeto ausente.

## 6. Procedimiento propuesto por fases

### 6.1 Prevalidación

Antes de cualquier acción remota futura: aprobación del destino y alcance exactos, identidad de mantenimiento separada de Express, permisos mínimos comprobados, TLS con verificación, versión corroborada y política de sesión conservada. Nunca usar el probe, root runtime ni una identidad distinta por fallback.

Mantener detenidos backend, migradores y otros escritores bajo una ventana aprobada. Preparar respaldo/exportación y una vía de restauración revisada, preservando también seeds, usuarios y sesiones existentes; tablas de pedidos vacías no significan base descartable. No definir una limpieza automática como recuperación.

La recuperación debe coordinarse con el mismo lock lógico `otakuzone_db:tidb:migrations`, en una conexión dedicada cuya pérdida detenga la ejecución. GET_LOCK es consultivo: coordina clientes cooperantes, no impide escrituras de la aplicación ni de operadores que no lo respeten. La documentación describe su ámbito de clúster; su disponibilidad/comportamiento en el destino debe validarse en alcance autorizado, no suponerse por los mocks. [Funciones de locking](https://docs.pingcap.com/tidb/stable/locking-functions/).

### 6.2 Identificación del estado real

Con autorización de lectura posterior, reutilizar la evidencia conservada como antecedente y corroborar únicamente lo necesario para actuar sobre un entorno que pudo cambiar. Identificar ledger completo, objetos presentes y definiciones íntegras, datos agregados y restricciones. No preparar una nueva matriz de consultas repetidas en esta etapa.

Si hubo timeout o pérdida de conexión durante DDL, comprobar que no haya trabajo aún pendiente antes de clasificar o reenviar una operación. Una desconexión del cliente no demuestra que el servidor no aplicara el cambio. Si no es posible corroborarlo con los permisos/metadatos disponibles, detenerse.

### 6.3 Comparación observada/esperada

Separar: identidad de objeto, definición, aplicabilidad de atributos, valores observados y evidencia de enforcement. El contrato revisado debe comprobar los originales además de los objetos de 006. No aceptar un campo solo porque su valor coincide con un fixture.

Con el código actual, los 16 atributos y el contexto/enforcement faltantes impiden planificación real. La futura representación tipada de la sección 9 debe aprobarse e implementarse antes de utilizar una normalización semántica. No activar metadataComplete temporalmente.

### 6.4 Determinación de pendientes

Cada objeto se clasifica como ausente verificado, existente equivalente, incompatible o desconocido. Solo el primero admite creación; el segundo admite omisión justificada; los otros bloquean. Un nombre alternativo equivalente requiere decisión explícita para evitar claves duplicadas.

En la hipótesis de escenario 1, con pedidos todavía vacíos, se estiman seis operaciones DDL separadas y ningún backfill con filas: dos columnas, dos UNIQUE, una FK y una tabla. **Es una estimación de diseño, no un plan producido con el snapshot real.**

### 6.5 Idempotencia y dependencias

| Fase | Acción futura, si falta | Condición antes y después |
| --- | --- | --- |
| A | Añadir cada columna en su propio ALTER | Tabla original equivalente; comprobar tipo completo, nulabilidad, charset/collation aplicables, default y generación tras cada acción |
| B | Añadir cada UNIQUE por separado | Columnas ya verificadas; comprobar grupos duplicados no NULL según la semántica de la clave; verificar unicidad, orden, ausencia de prefijos/expresiones y visibilidad |
| C | Añadir fk_pedidos_carrito separadamente | Tipos y claves referenciadas compatibles, ausencia de huérfanos, columnas e índice ya verificadas; conservar RESTRICT/RESTRICT |
| D | Crear historial solo ante ausencia comprobada | Verificar sus cuatro columnas, PK, índice compuesto, FK y atributos. Tabla preexistente incompatible bloquea; IF NOT EXISTS no reemplaza esta comprobación |
| E | Backfill de pedidos sin ninguna entrada | Solo si faltan entradas; conservar id/estado/creado_en originales y todas las entradas existentes. Verificar cobertura y referencias al terminar |

La idempotencia corresponde a **inspeccionar, decidir y verificar**, no a repetir DDL a ciegas ni añadir IF NOT EXISTS a todo. Las acciones de DDL y la bitácora no son atómicas en conjunto. Un error conserva el estado y detiene; no se deshace con DROP ni se reconstruye la base.

NOT EXISTS no evita una carrera entre procesos. Historial admite varias entradas por pedido: no añadir UNIQUE(pedido_id), borrar o deduplicar para facilitar reanudación. Un único escritor es condición de ejecución. Una transacción DML puede proteger el backfill, pero no sustituye la exclusión de otros escritores ni hace transaccional el DDL previo.

### 6.6 Propuesta y bitácora de recuperación

Diseñar una entrada separada, nunca invocada desde build/start, con destino fijo, límite 006 y revisión explícita del hash del plan. No crear un interruptor de entorno genérico que permita saltar validadores en Express o en el migrador normal.

La bitácora futura deberá guardar: referencia al intento original y checksum, revisión de código, contrato/reglas, hashes de captura y plan, SQL y hashes de cada acción realmente propuesta, aprobaciones, precondiciones, intención durable, resultado y verificación posterior. No guardar secretos ni datos de filas personales.

Estados conceptuales por paso: preparado, intención registrada, ejecución incierta, efecto verificado, fallido. Solo una verificación de estado autoriza registrar efecto verificado. Si se pierde la respuesta, no reenviar automáticamente: inspeccionar estado y trabajo DDL, conservar el intento incierto y registrar si el objeto se encontró aplicado. No atribuir al proceso SQL que no ejecutó.

El almacenamiento, integridad, permisos y recuperación de esa bitácora todavía deben diseñarse e implementarse. Si no puede registrarse evidencia durable, no empezar una nueva acción.

### 6.7 Verificación posterior

Revisar el resultado integral de 006 y la preservación de los originales; no basta el éxito de la última sentencia. Comprobar objetos exactos, claves/FK, CHECK originales, datos preservados, cobertura de historial, reglas de sesión y ausencia de avance de 007. Separar resultado declarativo/configuración de una prueba funcional que no se haya realizado.

El ensayo previo de compatibilidad y de interrupciones debe realizarse únicamente en un entorno expresamente autorizado. Los tests actuales no ejecutan el SQL real en TiDB. No se prescribe una prueba destructiva o un ensayo funcional en producción por este documento.

### 6.8 Reconciliación del ledger

**No existe hoy un mecanismo implementado de cierre recuperado.** Mantener 006 applying hasta verificar el esquema/datos y aprobar un protocolo que preserve tanto el intento fallido como la finalización por recuperación.

Opción de diseño recomendada, condicionada a revisión: bitácora separada que conserve el estado original applying y el modo recovered, los hashes del SQL efectivamente aplicado y la verificación final; después una transición controlada del ledger a applied, conservando su checksum original. Su semántica deberá documentar «efectos de la versión completados mediante recuperación enlazada», **no «archivo original íntegramente ejecutado con éxito»**.

Esa opción exige adaptar previamente los lectores/validadores para verificar el enlace de recuperación; el ledger actual no contiene por sí solo ese modo ni esa procedencia. Sin el enlace obligatorio, cambiar status a applied produciría un historial ambiguo y no se recomienda. Si esa semántica no se aprueba, conservar applying y diseñar un estado terminal versionado distinto con sus lectores, sin fabricar una ejecución original.

La finalización propuesta debe, en una transacción exclusivamente DML, registrar el cierre de bitácora y condicionar la transición a versión/checksum/status/applied_at originales exactos, con una única fila afectada. No se incluyen aquí comandos SQL para hacerlo. Los cinco registros previos permanecen intactos. No usar esa transacción para fingir atomicidad del DDL anterior.

Ante resultado de commit incierto, detener y reconciliar por identificador único de recuperación y lectura de ambas piezas, sin repetir escrituras a ciegas. La creación previa del almacenamiento de bitácora, su transacción y cualquier transición de ledger requieren aprobación específica. Finalizar 006 **no autoriza ejecutar 007** ni iniciar el backend completo.

## 7. Riesgos y controles

| Riesgo | Control de diseño |
| --- | --- |
| Evidencia manual inventada o incompleta | Conservar origen y salida íntegra; distinguir confianza manual; corroboración viva autorizada antes de ejecutar |
| Captura obsoleta/DDL pendiente | Ventana sin escritores, conexión dedicada, clasificación actual y bloqueo ante incertidumbre |
| DDL aplicado sin confirmación/bitácora | Intención durable, inspección posterior y reanudación por estado, nunca replay automático |
| Duplicados y huérfanos | Verificación de datos previa a claves/FK; preservar datos conflictivos para decisión, sin eliminarlos |
| Cuenta administrativa excesiva | Identidad separada, alcance de mantenimiento aprobado; Express conserva su rechazo de .root |
| Falsa seguridad de transacción o lock | Separar DDL de finalización DML; lock consultivo más exclusión operativa de escritores |
| Historial falso | Checksum original inmutable más SQL/hash reales y modo recovered enlazado; cierre solo tras comprobación integral |
| Pérdida de conexión/commit ambiguo | Detención, evidencia de intento y lectura de estado antes de cualquier reanudación |

## 8. Auditoría del planificador y cambios necesarios no implementados

### Guardias que existen

El lector valida catálogo TiDB y procedencia MySQL por hashes; el planificador fija además el hash original de 006. Exige formato v2, motor/destino exactos, metadataComplete=true, contexto explícito, seis registros y prefijo continuo 001–005 aplicado con fechas, más 006 applying/applied_at=null. Rechaza historial MySQL y avance declarado hacia 007.

Verifica las seis columnas originales de pedidos, índices, FK y CHECK; detecta objetos de recuperación equivalentes o incompatibles y conflictos de datos. Su alcance de carritos es id/PK, no una auditoría completa. La ausencia de historial debe ser null explícito; una propiedad omitida no basta.

El intérprete markers-v2 separa declarative/configuration/functional, ámbitos global/sesión, identidad de captura y versión. Bloquea negativos funcionales, contradicciones y evidencia inválida. Functional unknown puede permanecer así en una propuesta offline; declarative/configuration desconocidos no pasan. `reviewed-serverless-v8.5.3` sigue siendo una declaración manual, no certificación del proveedor.

La CLI solo lee un archivo y emite JSON; no importa conexión, entorno o modo execute. Toda salida fija readyForRemoteExecution=false, ledgerTransitionAllowed=false y allow007=false, con evidenceTrust manual-unverified. No se puede obtener permiso de ejecución inyectando esas propiedades en el snapshot.

### Límites y trabajo futuro

- Aprobar un contrato tipado de atributos y su adaptador explícito, manteniendo campos desconocidos y conflictos. No normalizar arbitrariamente con el contrato actual.
- Introducir una comparación revisada de representaciones que conserve literales, agrupación y atributos relevantes. JSON.stringify y la comparación textual pueden producir bloqueos por representación; no reemplazarlos por equivalencias permisivas sin pruebas.
- Diseñar recopilación/procedencia suficiente y actualización de la conexión real: los identificadores manuales no prueban que una observación corresponda a una sesión viva.
- Diseñar ejecución separada, bitácora, precondiciones por paso y finalización recuperada; no añadir un bypass del estado applying al flujo habitual.
- Añadir posteriormente pruebas locales de ese diseño y ensayos de interrupción autorizados. No certificar SQL real con dobles.

**Bloqueo runtime comprobado en código:** `tidbPreflight.js`, fase runtime, selecciona `ENFORCED AS enforced` desde information_schema.TABLE_CONSTRAINTS y requiere YES. La evidencia previa de la instancia confirma que esa columna no está expuesta. El modelo offline nuevo no sustituyó esa consulta. Recuperar 006 o cerrar su ledger no corrige este bloqueo; debe revisarse en una etapa local explícita con evidencia compatible, sin suprimir la comprobación de integridad. Bootstrap no recorre esa rama, por lo que este hallazgo no explica el fallo original de 006.

El runtime exige además las siete versiones. El diseño necesita distinguir verificación de recuperación hasta 006 de aprobación completa de runtime. No ejecutar 007 para conseguir que una comprobación final de 006 pase.

## 9. Propuesta tipada y versionada para los atributos pendientes

Se propone para una etapa local posterior un **snapshot v3**, con un contrato de atributos independiente y un adaptador de versiones explícito. No se modifica ni aprueba v1/v2 en esta etapa.

Cada atributo tendría uno de estos estados discriminados:

| Estado propuesto | Contenido y significado |
| --- | --- |
| observed-value | value tipado; puede ser string vacío. Procedencia de celda/DDL literal, versión, instante y referencia a captura completa |
| observed-sql-null | SQL NULL observado expresamente; no se confunde con texto "NULL" ni con propiedad omitida |
| not-applicable | Ausencia semántica de aplicación justificada por tipo observado y regla versionada; no declara que se haya leído una celda NULL |
| unknown | Valor ausente/ilegible; puede conservar hechos parciales como sqlNull=false sin asignar un literal |
| conflict | Observaciones incompatibles que se conservan con sus referencias; bloquea hasta reconciliar |

La procedencia propuesta separaría source, evidenceRefs, engineVersion, capturedAt y completeness; para derivaciones, ruleVersion y typeEvidenceRef. Es un esquema de diseño, **no registros de evidencia con identificadores o fechas inventados**. Fechas e identificadores desconocidos deben seguir ausentes y bloquear las decisiones que los requieran.

Reglas de aceptación propuestas:

1. Diez campos charset/collation de columnas numéricas/temporales podrían clasificarse not-applicable únicamente mediante una regla de tipos documentada, versionada, probada y aprobada, vinculada al tipo realmente observado. Eso preservaría su procedencia derivada; no los convertiría en observed-sql-null. Un valor textual contrario observado produciría conflict. El contrato actual no admite todavía esa decisión.
2. Los cinco EXTRA pendientes requieren valor observado o representación completa suficiente para una normalización explícita. extra_is_null=0 solo acredita no nulidad; no acredita string vacío. Mantener unknown. No usar una regla «no autoincrement → vacío».
3. pedidos.usuario_id.default permanece unknown con el hecho parcial default_is_null=0. No es un atributo no aplicable por ser BIGINT. No sustituirlo por null esperado, DDL histórico, cero o vacío. La posible discrepancia de representación/esquema requiere revisión, no una relajación automática.
4. El adaptador solo producirá un valor canónico aceptado si cada estado obligatorio está resuelto según política aprobada. unknown/conflict bloquean. Defaults, nulabilidad, generación y EXTRA no se omiten por comodidad. Conservar raw y regla aplicada permite revisar una normalización sin modificar el esquema.

Balance de los 16 campos: **10 candidatos a no aplicabilidad semántica, cinco EXTRA desconocidos y un default desconocido**. Ninguno se completa aquí. La propuesta no promete que los diez puedan aprobarse sin revisión de fuentes y reglas; tampoco resuelve por sí sola enforcement o contexto.

## 10. Criterios de aceptación para una recuperación futura

- Destino y revisión exactos aprobados; MySQL y probe fuera de alcance; 001–005/hashes preservados, 007 bloqueada.
- Atributos obligatorios resueltos con contrato revisado, sin confundir observado, NULL, no aplicable, vacío y desconocido.
- Definiciones CHECK/FK y configuración verificadas mediante evidencia compatible y correspondiente a la conexión requerida, sin columna ENFORCED ficticia ni garantía Serverless supuesta.
- Respaldo y restauración revisados, permisos adecuados y ventana efectiva de exclusión; sin DDL previo de resultado incierto.
- Plan por fases revisado y fijado por hash, probado localmente y con compatibilidad real ensayada solo bajo autorización correspondiente.
- Cada operación ausente aplicada a lo sumo según su estado comprobado; objetos equivalentes preservados e incompatibles bloqueados; datos existentes conservados.
- Resultado integral de 006 verificado, historial cubierto y bitácora durable completa antes de cualquier cierre.
- Protocolo de ledger y lectores adaptados/aprobados; cierre que distingue recuperación de ejecución original y resuelve commit ambiguo.
- Verificación hasta 006 no confundida con arranque completo; el bloqueo runtime de metadatos se trata separadamente. Ninguna aceptación de este listado autoriza 007 o despliegue.

## 11. Decisiones y autorizaciones pendientes

| Acción | Alcance actual / autorización futura |
| --- | --- |
| Leer código/informes, comparar huellas y producir este diseño | Permitido y realizado localmente |
| Implementar snapshot v3, adaptadores o cambios de preflight/validadores | Requiere nueva autorización local; no realizado |
| Crear ejecutor y bitácora, cambiar semántica de finalización | Requiere revisión e implementación local separadas antes de pedir escritura remota |
| Capturar/verificar estado en una conexión real | Requiere autorización de lectura remota; no concedida por esta etapa |
| Ensayar SQL real en un destino de ensayo | Requiere alcance y autorización de ese destino; no realizado |
| Respaldo/exportación y operaciones de mantenimiento del proveedor | Requieren alcance aprobado; no se asumen disponibles ni se activan pagos |
| Aplicar DDL/DML de recuperación o crear almacenamiento de bitácora remoto | Requiere autorización expresa del plan concreto y su destino |
| Transición del ledger | Requiere aprobación explícita de su semántica, protocolo y evidencia; nunca sustituto de verificar esquema |
| Ejecutar 007, iniciar/publicar backend o desplegar | Fuera de esta recuperación; autorización separada |

La aprobación del documento de diseño no equivale a aprobar ninguna de las escrituras futuras. No se incluye un comando listo para ejecutar contra producción.

## 12. Validación de preservación, conclusión y siguiente etapa

Se tomaron y compararon huellas SHA-256 de **159 archivos existentes inventariados** de código, scripts, pruebas, SQL/manifests, snapshots e informes. Se verifican también ambos JSON y sus estados, sin llamar al planificador:

| Snapshot | SHA-256 conservado |
| --- | --- |
| v1 | 1d279cf7023ff51d7ab660a9d8fff1ec407129f2325b598870381ab4ffe901ec |
| v2 | 3c11aa5ed05b2f086d8833a16d7920a6729a0a6cd5af28c8a0bb8d815fc7fc64 |

No se ejecutan suites nuevas, lint ni build: no hay cambios de implementación que justifiquen repetirlos. Las 107 pruebas aprobadas de 3.22 y las 146 de 3.20 son antecedentes históricos, no ejecuciones de esta etapa ni prueba del motor remoto. Las validaciones nuevas son lecturas locales, comparación de huellas/JSON y revisión de contenido. Se consultó documentación pública de PingCAP; no se abrió conexión a la instancia.

Los SQL MySQL/TiDB 001–007, manifests, bootstrap/ledger.sql y filas de ledger conservadas en ambos snapshots permanecen intactos. **El ledger remoto no se consultó ni modificó; no se presenta su estado actual como observado.** Tampoco se modifican .env, certificados, credenciales, datos, probe o permisos. No se instalaron dependencias, ejecutaron SQL/migraciones/recuperación, realizaron despliegues ni commits.

Se conservan metadataComplete=false en ambos candidatos y, en v2 y en la salida fija del planificador:

```text
readyForRemoteExecution=false
ledgerTransitionAllowed=false
allow007=false
```

**Conclusión:** la recuperación por dependencias separadas es un diseño viable condicionado a evidencia y controles; hoy permanece bloqueada. Siguiente etapa recomendada: aprobar únicamente el diseño e implementación local de atributos tipados y comparación, sin rellenar el default desconocido ni fabricar enforcement. El ejecutor, el cierre recuperado y la revisión runtime necesitan alcances posteriores propios. Esta Etapa 4.0 termina aquí y no autoriza por sí misma ninguna operación remota.
