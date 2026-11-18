# OtakuZone — Etapa 3.12: preparación local de recuperación TiDB 006

Fecha: **17 de noviembre de 2026**. Implementación exclusivamente local. **Sin conexiones SQL, servicios externos, migraciones, recuperación remota ni cambios de ledger.**

## 1. Resultado y alcance operativo

Se implementa una herramienta separada de **planificación offline**, no un ejecutor remoto. Consume un snapshot JSON revisado, comprueba el estado de 006 y genera propuestas por fases con hashes propios. No importa mysql2 ni pool, no lee .env, no recibe credenciales y no ofrece un modo execute. No elimina applying ni puede continuar hacia 007.

La parte implementada permite evaluar estados parciales y revisar un plan conservador. **No hay todavía herramienta autorizada para aplicar ese plan ni cerrar el ledger.** Mantener esa separación evita introducir un bypass del migrador normal o convertir una propuesta en una recuperación automática. El cierre remoto exige una revisión posterior de trazabilidad, evidencia viva y autorización.

### Archivos creados; ningún archivo existente modificado

| Archivo | Función |
| --- | --- |
| `backend/src/db/tidb006RecoveryPlan.js` | Validación de snapshot, contrato de esquema, conflictos y plan A–E |
| `backend/scripts/plan-tidb-006-recovery.js` | Entrada local explícita con --snapshot; salida JSON para revisión |
| `backend/tests/tidb-006-recovery.test.js` | 40 pruebas nuevas con fixtures, dobles y bloqueo de red |
| Este informe | Diseño, pruebas y condiciones futuras |

No se modifica package.json ni se añade script de migración. Express y el migrador habitual no importan este módulo.

## 2. Diagnóstico y evidencia

Evidencia **aportada por el usuario**, no observada mediante conexión en esta etapa: 001–005 applied; 006 applying; 007 pendiente. pedidos conserva seis columnas originales, sin carrito_origen_id/clave_solicitud; no existen los dos UNIQUE nuevos, fk_pedidos_carrito ni historial_pedidos. carritos.id existe. Esto es consistente con fallo previo a aplicar el primer ALTER de 006.

Se leyó el archivo completo, su manifest, ledger, ejecutor y validadores. El ejecutor registra applying antes del archivo y applied al terminar; APPLY se imprime al final. En 006 no hay transacción global de DDL, y una interrupción puede dejar objetos aplicados. El código normal rechaza applying en el próximo intento.

**Causa probable, con evidencia fuerte pero sin reproducción en esta etapa:** TiDB valida referencias de un ALTER compuesto contra el esquema anterior y los nuevos índices/FK usan columnas añadidas en la misma sentencia. El error 1072 no permite atribuir categóricamente el fallo a una columna concreta sin su mensaje completo. El primer candidato textual es uq_pedidos_carrito(carrito_origen_id).

La limitación documental ya consultada en 3.11 está en [TiDB ALTER TABLE](https://docs.pingcap.com/tidbcloud/sql-statement-alter-table/). No se consultaron servicios externos de nuevo en esta etapa. Separar ALTER de columnas, índices y FK respeta sus dependencias y conserva su definición funcional, pero **no certifica ejecución en la build 8.5.3-serverless**.

## 3. Sentencias originales y conservación histórica

El SQL TiDB histórico 006 conserva SHA-256 normalizado:

`2042173bbf22384c553239fb3c98f440962ba611ece696be64f3e3cd3ac9345e`

El planificador exige ese hash específico además de las verificaciones del lector de catálogo. Si la fuente cambia, falla cerrado. No edita el archivo ni su huella.

Las tres sentencias originales, reproducidas para diagnóstico, **NO EJECUTAR**:

```sql
ALTER TABLE pedidos
  ADD COLUMN carrito_origen_id BIGINT UNSIGNED NULL,
  ADD COLUMN clave_solicitud CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  ADD UNIQUE KEY uq_pedidos_carrito (carrito_origen_id),
  ADD UNIQUE KEY uq_pedidos_solicitud (usuario_id, clave_solicitud),
  ADD CONSTRAINT fk_pedidos_carrito FOREIGN KEY (carrito_origen_id) REFERENCES carritos(id) ON DELETE RESTRICT ON UPDATE RESTRICT;

CREATE TABLE IF NOT EXISTS historial_pedidos (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  pedido_id BIGINT UNSIGNED NOT NULL,
  estado ENUM('pendiente','confirmado','cancelado','completado') NOT NULL,
  creado_en TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY ix_historial_pedido_fecha (pedido_id, creado_en, id),
  CONSTRAINT fk_historial_pedido FOREIGN KEY (pedido_id) REFERENCES pedidos(id) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

INSERT INTO historial_pedidos (pedido_id, estado, creado_en)
SELECT p.id, p.estado, p.creado_en FROM pedidos p
WHERE NOT EXISTS (SELECT 1 FROM historial_pedidos h WHERE h.pedido_id = p.id);
```

El plan reutiliza CREATE/backfill de esta fuente fijada por hash, cualifica referencias con otakuzone_db y retira IF NOT EXISTS del CREATE propuesto: solo se propone cuando el snapshot declara ausencia explícita. No se adopta una tabla previa por su nombre. No cambia valores del backfill ni sobrescribe historial.

## 4. Estrategia por fases e idempotencia

| Fase | Si falta | Si existe | Comprobaciones |
| --- | --- | --- | --- |
| A | Proponer cada columna en un ALTER separado | Omitir solo si es equivalente | Tipo, nulabilidad, charset/collation, default, extra y expresión generada |
| B | Proponer cada UNIQUE separado | Omitir solo si coincide exactamente | Columnas/orden, unicidad, ausencia de prefijo/expresión, BTREE y visibilidad; duplicados previos |
| C | Proponer fk_pedidos_carrito | Omitir solo si coincide | Esquema/tabla/columnas referenciadas, columnas locales, enforcement y RESTRICT/RESTRICT; huérfanos previos |
| D | Proponer CREATE historial_pedidos | Adoptar únicamente estructura equivalente | Cuatro columnas exactas, tipos/defaults, PK, índice compuesto y FK; engine/charset/collation, ausencia de CHECK/triggers extra |
| E | Proponer backfill solo si faltan historiales | Conservar todos los registros existentes | Conteos coherentes y NOT EXISTS por pedido; ninguna operación destructiva |

Cada acción incluye fase, objeto, texto SQL de propuesta y SHA-256 de ese texto. Estos hashes **no son nuevas huellas de 006 ni se escriben en el ledger**. El plan también incluye hash del snapshot para relacionar revisión y evidencia.

Un objeto incompatible detiene la planificación completa; no se devuelve un plan parcial ejecutable. Un índice o FK equivalente/conflictivo con otro nombre también detiene el plan para revisión, en lugar de duplicarlo. Los índices adicionales sobre las columnas de recuperación no se aceptan silenciosamente. La herramienta no renombra, elimina, reemplaza ni corrige definiciones.

El contrato original de pedidos se comprueba antes de proponer cambios: seis columnas previas, índices originales, FK a usuarios y CHECK de moneda/envío. carritos se comprueba como tabla con id BIGINT UNSIGNED AUTO_INCREMENT y PK completa; no se certifican por ello todas sus otras columnas/reglas. El ámbito es el esquema funcional afectado por 006, no toda la aplicación.

### Idempotencia condicionada, no garantía de ejecución concurrente

Replanificar un snapshot donde un objeto ya está correctamente creado omite su acción. Si todo el esquema y backfill están completos, el resultado tiene cero acciones, **pero sigue prohibiendo cerrar ledger y avanzar a 007**.

Un snapshot puede quedar obsoleto. El plan no es seguro para ejecutar a ciegas ni contiene exclusión de escritores. Una futura recuperación debe hacer introspección viva antes/después de cada acción bajo ventana de mantenimiento y lock coordinado con el migrador, además de las verificaciones de motor/TLS/preflight existentes. No se implementa esa conexión o ejecución aquí.

El backfill original evita añadir historial para pedidos que ya tengan alguna entrada. No impide por sí solo una carrera entre dos procesos, porque no hay UNIQUE(pedido_id) y añadirlo cambiaría la funcionalidad de historial múltiple. Por eso la recuperación requiere un único escritor y una ventana sin operaciones de pedidos. No borrar ni deduplicar historial existente.

## 5. Snapshot y uso exclusivamente local

La API `planTidb006Recovery(snapshot)` exige:

- format = otakuzone-tidb006-snapshot-v1, engine = tidb, database = otakuzone_db y metadataComplete = true.
- ledger con exactamente las seis entradas: 001–005 applied con fecha, 006 applying con checksum original y applied_at null; sin 007. El prefijo aplicado pasa por el validador existente sin convertir 006 a applied ni siquiera en memoria.
- tables.pedidos y tables.carritos con metadatos; tables.historial_pedidos debe ser un objeto completo o **null explícito** si se confirmó ausencia. Una propiedad omitida no equivale a tabla ausente. Se rechazan claves de tablas schema_migrations o movimientos_inventario declaradas en ese mapa.
- Cada tabla utiliza tableType, engine, charset, collation, columns, indexes, foreignKeys, checks y triggers. El mapa debe declarar cualquier historial MySQL/avance hacia 007 observado; no omitirlo para pasar la validación.
- Cada columna usa type, nullable booleano, charset/collation o null, default o null, extra y generationExpression. Los formatos canónicos se exponen mediante `tidb006Contract()`; no se permite omitir atributos desconocidos. Por ejemplo, bigint unsigned, auto_increment, CURRENT_TIMESTAMP(3) y cadena vacía cuando no existe expresión generada.
- Índices: name, unique booleano, type=BTREE, visible booleano y columns ordenadas con name, prefix=null, order=ASC y expression=null. Las FK incluyen esquema/tabla/columnas, RESTRICT en ambas reglas y enforced booleano. Los CHECK previos contienen nombre, cláusula y enforcement.
- data contiene ordersCount, historyRows y ordersMissingHistory, enteros no negativos. Con columna carrito_origen_id existente se exigen duplicateCartGroups y orphanCartReferences; con clave_solicitud existente, duplicateRequestGroups. Con historial existente se exige orphanHistoryReferences. Conflictos distintos de cero bloquean.

metadataComplete es una declaración del productor del snapshot, **no una prueba de origen ni firma del servidor**. La herramienta no recolecta ni autentica esa información. La conversión de metadatos reales a este modelo requiere revisión manual posterior, sin traducir campos ausentes a valores favorables. Las representaciones diferentes o desconocidas fallan cerrado; no quitar validaciones para aceptar una salida remota.

La comparación del modelo es estricta y puede rechazar una representación equivalente que no se haya normalizado expresamente. Eso exige revisar el adaptador/snapshot, no modificar el esquema. No se entrega un exportador remoto ni se fabrica un snapshot de producción con los datos incompletos del chat. No incluir filas, correos, tokens o credenciales en ese JSON.

Entrada disponible únicamente para planificación sobre un archivo local ya revisado:

```text
node backend/scripts/plan-tidb-006-recovery.js --snapshot <archivo-local-revisado.json>
```

No se ejecutó la herramienta sobre datos de producción. Solo imprime el plan; no guarda archivos por su cuenta. Argumentos alternativos como --execute no están admitidos. Los errores CLI se redactan sin imprimir contenido del snapshot.

## 6. Protección del ledger y trazabilidad pendiente

Salida del plan, siempre:

```json
{
  "mode": "offline-review-only",
  "readyForRemoteExecution": false,
  "ledgerTransitionAllowed": false,
  "allow007": false
}
```

La entrada original 006 conserva su checksum y estado; no se modifica/borrra applying, no se simula una ejecución exitosa y no se salta el validador normal. Una prueba demuestra que el migrador habitual sigue deteniéndose antes de DDL/007 incluso después de planificar.

Para una revisión futura se propone un **registro de recuperación separado** con referencia a versión/checksum originales, hash del snapshot, plan aprobado, fases efectivamente ejecutadas, resultados de introspección y verificación integral. Ese registro no se crea en esta etapa. Después habrá que aprobar una transición explícita y condicionada del intento original, enlazada a esa evidencia, conservando su checksum e historial del fallo.

No basta marcar applied porque los objetos «parezcan estar». Con el código actual no existe una transición de recuperación remota implementada. No hay comando operativo para reanudar 007. Esta limitación es deliberada: preparar el plan no autoriza cambios de historial.

## 7. Verificación real ejecutada

Comando desde raíz:

```text
node --test backend/tests/tidb-006-recovery.test.js backend/tests/tidb-migrations.test.js backend/tests/tidb-ready.test.js backend/tests/tidb-preflight.test.js backend/tests/database-context.test.js backend/tests/database-unit.test.js backend/tests/production-config.test.js backend/tests/tidb-pool.test.js
```

**79/79 aprobadas: 40 nuevas de recuperación y 39 regresiones relacionadas.** Cubren estado anterior, una/ambas columnas existentes, tipos/nulabilidad/default/charset/collation incorrectos, índices completos/ausentes/equivalentes y orden/unicidad/prefijos/visibilidad/expresiones incorrectos, FK ausente/equivalente/incompatible, historial ausente/equivalente/incompatible, backfill vacío/parcial/completo, duplicados, huérfanos, metadatos incompletos, checksum/estado/continuidad y bloqueo de 007.

El archivo nuevo de pruebas intercepta Socket.connect y rechaza cualquier conexión antes de DNS/socket. Una prueba verifica expresamente ese rechazo con hostname reservado; no abre conexión. El conteo final exige exactamente ese único intento interceptado y ningún otro. Las pruebas existentes de HTTP solo usan servidores locales temporales y dobles; no acceden a servicios externos. Los SQL de los tests del migrador se entregan a mocks, nunca a una base.

Las regresiones MySQL confirman sus hashes/procedencia, configuración local, transacciones y separación de dialectos. No se conectó a MySQL real. No se modificó el comportamiento de su migrador ni su configuración.

`npm run lint`: **aprobado**. No corresponde build frontend porque no se modificó frontend ni despliegue. Se revisa diff/huellas al cierre, sin publicar huellas privadas.

Incidencias corregidas durante desarrollo: el runner fue bloqueado inicialmente por spawn EPERM y se reejecutó con autorización fuera del sandbox; una prueba nueva tenía await dentro de callback síncrono y se corrigió; la separación inicial del SQL fuente contaba un punto y coma dentro de comentario, por lo que se retiran comentarios de línea de esta fuente fijada por hash antes de dividir sus tres sentencias. No es un parser SQL genérico. La ejecución final no conserva fallos.

## 8. Procedimiento manual futuro y condiciones de autorización

1. Revisar este diseño y mantener detenidos reintentos/despliegues. Preservar los logs, 001–005 y el intento 006.
2. Autorizar recolección de metadatos de solo lectura y recuentos agregados actualizados, con visibilidad suficiente. Las consultas preparadas en 3.11 siguen siendo referencia; no se ejecutan en esta etapa. Obtener además definiciones de triggers/atributos requeridos por el snapshot y verificar conflictos según columnas presentes.
3. Revisar manualmente el modelo completo; no inferir equivalencia por nombre o por seis columnas únicamente. Generar el plan local y conservar sus hashes para revisión privada.
4. Aprobar backup/restauración, ventana de mantenimiento, identidad/privilegios, lock/exclusión, SQL por fases y protocolo de recuperación si se interrumpe entre fases. Resolver antes el diseño del registro de recuperación y cierre de ledger.
5. Implementar/revisar el ejecutor o procedimiento manual futuro con introspección viva y todas las guardias existentes. Probar compatibilidad real de DDL separado en ensayo autorizado y verificar columnas/índices/FK/backfill. No aplicar contra producción directamente desde la salida JSON.
6. Solo tras autorización remota expresa, aplicar los cambios ausentes y verificar cada fase, sin duplicar objetos ni tocar definiciones incompatibles. Un error detiene el proceso y conserva evidencia.
7. Verificar íntegramente el resultado y registrar la recuperación; solicitar/realizar únicamente la transición de ledger aprobada. Después, en alcance autorizado, continuar 007 con migrador habitual y validar runtime.

**El código está listo para revisar planes offline, no para ejecutar una recuperación remota.** La futura prueba remota requiere los puntos anteriores. No se declara TiDB 8.5.3 certificado por los mocks ni por documentación de otra build.

## 9. Cierre

Se crean cuatro archivos y no se modifica ningún archivo existente. Migraciones MySQL/TiDB, hashes históricos, manifests, .env, certificados, credenciales, API, autenticación/JWT/cookies/CSRF, frontend y configuración Render/Vercel permanecen intactos. No hubo SQL real, conexiones, cambios de usuarios/grants, modificaciones de datos/ledger, despliegues o commits.

Se entrega la preparación conservadora local. La recuperación remota permanece bloqueada y requiere autorización expresa; se detiene el trabajo.
