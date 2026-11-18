# OtakuZone — Etapa 3.21: construcción local del candidato snapshot v2

Fecha: **17 de noviembre de 2026**. Transcripción local de evidencia manual previamente aportada. Sin consultas nuevas, conexiones remotas, SQL, migraciones ni recuperación.

## A. Archivos creados y modificados

Se crean únicamente:

- [Candidato v2](snapshots/tidb-006-snapshot-v2-candidate.json).
- Este informe.

No se modifica ningún archivo existente: candidato histórico v1, intérprete, planificador, pruebas, migraciones y configuración permanecen intactos respecto al inicio de esta etapa. El workspace ya contenía cambios de etapas anteriores.

Se revisaron el contrato exportado y las guardias reales, intérprete markers-v2, fixtures/pruebas y los informes 3.12–3.20. El inventario de archivos accesibles no localizó una exportación SQL o captura identificable que aportase el literal faltante de usuario_id.default. Las imágenes identificadas en docs corresponden a evidencias de la interfaz, no se presentan como capturas SQL inspeccionadas. No se reconstruyen resultados remotos desde las migraciones o los fixtures.

## B. Campos incorporados y procedencia

El nuevo archivo declara `format=otakuzone-tidb006-snapshot-v2`, `metadataComplete=false` y `evidenceTrust=manual-unverified`. Se mantienen explícitamente las tres banderas de seguridad false. Estas propiedades no conceden autorización: el planificador fija sus propias banderas de salida.

### Columnas de las siete filas confirmadas

La fuente es el resumen literal de COLUMNS aportado por el usuario después de 3.18: siete filas, sus valores legibles y los indicadores IS NULL. No es una captura nueva realizada por el agente.

| Columna | Valores transcritos |
| --- | --- |
| pedidos.id | type=bigint unsigned, nullable=false, default=null SQL confirmado, extra=auto_increment, generationExpression="" |
| carritos.id | Los mismos atributos confirmados de su propia fila |
| pedidos.usuario_id | type=bigint unsigned, nullable=false, generationExpression=""; default omitido por desconocido |
| pedidos.estado | enum('pendiente','confirmado','cancelado','completado'), nullable=false, default="pendiente", charset=utf8mb4, collation=utf8mb4_0900_ai_ci, generationExpression="" |
| pedidos.moneda | char(3), nullable=false, default="PEN", charset=ascii, collation=ascii_bin, generationExpression="" |
| pedidos.costo_envio | decimal(10,2), nullable=false, default="0.00" como string, generationExpression="" |
| pedidos.creado_en | timestamp(3), nullable=false, default="CURRENT_TIMESTAMP(3)", generationExpression="" |

Los tipos se transcriben con casing canónico en minúsculas; AUTO_INCREMENT confirmado se representa como `auto_increment`. No se eliminan atributos desconocidos de una salida real ni se copian defaults esperados del contrato para rellenarlos.

El usuario confirmó generation_is_null=0 y expresión vacía en las siete filas: aquí `generationExpression=""` significa string vacío respaldado, no SQL NULL. `extra_is_null=0` no revela el texto de EXTRA para las otras cinco filas; sus propiedades extra siguen omitidas. Los indicadores de nulidad no sustituyen los valores literales.

### Los seis índices

Los nombres, unicidad y composición ordenada ya estaban respaldados en v1. Se completan usando SHOW INDEX y la aclaración de STATISTICS aportados en la conversación:

| Tabla | Índices, columnas y unicidad conservadas |
| --- | --- |
| pedidos | PRIMARY(id), único; ix_pedidos_usuario_fecha(usuario_id, creado_en), no único; ix_pedidos_estado_fecha(estado, creado_en), no único |
| carritos | PRIMARY(id), único; uq_carritos_usuario_activo(usuario_activo_id), único; ix_carritos_usuario_estado(usuario_id, estado), no único |

En los seis se transcriben `type=BTREE`, `visible=true`. En sus nueve partes se transcriben `order=ASC`, `prefix=null`, `expression=null`. La nulidad se apoya en prefix_is_null=1 y expression_is_null=1, **no en que las celdas parezcan vacías**. Se mantiene el orden de claves de cada parte name/prefix/order/expression requerido por la comparación actual.

Cardinality, Clustered, Global y la columna Null de SHOW INDEX no tienen campos en el contrato: no se agregan ni se usan para inferir nulabilidad de columnas.

### Información histórica reutilizada

Se conserva el ledger exactamente igual al v1: seis filas, hashes y fechas literales, 001–005 applied, 006 applying con checksum original y applied_at=null, sin entrada 007. Una comparación local confirmó identidad íntegra de ambos arrays; no se escribió en el ledger remoto ni se reconstruyeron hashes como supuesta lectura remota.

También se conservan atributos confirmados de tablas, cláusulas CHECK, referencias FK a otakuzone_db.usuarios(id), reglas RESTRICT/RESTRICT, triggers ausentes e historial_pedidos=null. Se mantienen pedidos=0 y los conteos derivados de historial ausente. Los contadores de conflictos sobre columnas/tablas ausentes siguen null/no aplicables, no se convierten en ceros medidos.

## C. Campos todavía desconocidos

En v2 parcial se **omiten propiedades desconocidas**. No se usa JSON null para representar desconocimiento. Los null presentes significan SQL NULL confirmado, ausencia de tabla confirmada, ausencia de prefijo/expresión confirmada o contador condicional no aplicable, según su ubicación.

Estas son las **16 propiedades de columnas que bloquean las guardias actuales**:

| Columna | Propiedades omitidas por desconocidas |
| --- | --- |
| pedidos.id | charset, collation |
| pedidos.usuario_id | charset, collation, default, extra |
| pedidos.estado | extra |
| pedidos.moneda | extra |
| pedidos.costo_envio | charset, collation, extra |
| pedidos.creado_en | charset, collation, extra |
| carritos.id | charset, collation |

No se infiere charset/collation SQL NULL por tratarse de una columna numérica o temporal. Los siete tipos y nullable ya están completos. Tampoco se asigna extra="" a partir de extra_is_null=0.

Las otras cinco columnas de carritos —usuario_id, estado, usuario_activo_id, creado_en y actualizado_en— conservan su nombre y objeto vacío. Su definición íntegra sigue pendiente documentalmente; el cuerpo actual del planificador no exige todos sus atributos. El hecho confirmado de que usuario_activo_id sea STORED GENERATED se conserva en los informes previos, pero no justifica reconstruir su expresión o el texto exacto de EXTRA.

No quedan atributos obligatorios de índices pendientes con la evidencia aportada. Esta conclusión es una reconciliación local, no una certificación actual del servidor ni de la vigencia de las capturas.

## D. pedidos.usuario_id.default

**Pendiente; propiedad omitida.** El resumen recibido indica default_is_null=0 para las cinco columnas distintas de ambos id. Por tanto, ese indicador incluye usuario_id, pero no proporciona su default literal.

Los archivos locales muestran el valor esperado por el contrato y el diseño SQL, no el literal observado en esa captura. No se encontró evidencia adicional suficiente para transcribirlo. El candidato no recibe null, "NULL", 0, string vacío ni otro valor supuesto.

Si la evidencia futura confirma un valor diferente del esperado, será necesario revisar la discrepancia de representación o esquema; no cambiar silenciosamente el contrato ni el default remoto. No se solicita ni se prepara otra consulta en esta etapa.

## E. Enforcement CHECK/FK v2

En las dos FK y los dos CHECK existentes se retira únicamente del **nuevo candidato** la propiedad legada enforced y se prepara:

```json
{
  "format": "otakuzone-enforcement-evidence-v1",
  "declarative": [],
  "configuration": [],
  "functional": []
}
```

Estas listas vacías significan **sin observaciones suficientes transcritas en este modelo**, no ausencia de las restricciones, deshabilitación o éxito funcional. Las tres dimensiones permanecen unknown. No se copian fixtures ni se convierten los antiguos booleanos en evidencia positiva.

evidenceContext contiene únicamente engineVersion=`8.0.11-TiDB-v8.5.3-serverless`, respaldado por la versión aportada. Se omiten captureId, sessionId y versionMapping porque no están demostrados. No se crea una correspondencia reviewed-serverless-v8.5.3 ni una certificación del binario.

La regla vigente es `tidb-8.5.3-markers-v2`. No se fabrican observaciones para colocar esa regla junto a fechas o DDL supuestos. Cuando se transcriban observaciones reales, necesitarán todos los campos de procedencia exigidos en 3.20, definición completa y controles con ámbito correcto.

El global CHECK habilitado y el ensayo temporal previo no se convierten en configuration=true o functional=true de pedidos. Las cláusulas CHECK y las referencias/reglas FK se conservan como definiciones conocidas, sin elevar su existencia a enforcement demostrado. No se inventa TABLE_CONSTRAINTS.ENFORCED.

## F. Validación y pruebas locales

Se ejecutaron aserciones estructurales locales mediante Node:

- JSON sintácticamente válido y formato v2, metadataComplete=false.
- Ledger idéntico al v1, seis registros y 006 applying con applied_at=null.
- Sin columnas nuevas de 006 ni historial inventado.
- Atributos presentes de las seis columnas originales de pedidos coinciden con el contrato local; las propiedades ausentes se enumeran como pendientes, no se aprueban.
- Los tres índices originales de pedidos y la PK de carritos coinciden íntegramente con el contrato; todos los seis índices y sus nueve partes tienen los atributos confirmados.
- Sin booleanos enforced legados; las cuatro estructuras de evidencia tienen las tres listas vacías.
- Confianza manual y tres banderas false.

Estas aserciones **no equivalen a validar el contrato completo**. No se llamó a planTidb006Recovery ni a su CLI con el candidato real. Solo se consultó el contrato exportado, sin conexión ni SQL.

Comando de pruebas ejecutado:

```text
node --test backend/tests/tidb-enforcement-evidence.test.js backend/tests/tidb-006-recovery.test.js
```

**107/107 aprobadas:** 55 del intérprete y 52 de recuperación. Los planes calculados pertenecen exclusivamente a fixtures sintéticos; las referencias al migrador se resuelven con dobles. El guardia de sockets permanece activo. La ejecución fuera del sandbox se autorizó por la limitación conocida del runner. No se repitieron suites ajenas a este lote.

`npm run lint`: aprobado. No se modificó código, se añadieron tests, instalaron dependencias ni se ejecutó build frontend. Comprobaciones finales de preservación y espacios verificadas localmente.

## G. Estado de v1 y v2

| Archivo | Estado |
| --- | --- |
| tidb-006-snapshot-candidate.json | v1 histórico, byte a byte intacto; metadataComplete=false |
| tidb-006-snapshot-v2-candidate.json | Nuevo candidato parcial; formato v2, metadataComplete=false, confianza manual, sin plan real |

La huella SHA-256 de v1 al inicio se conserva al cierre. Su archivo no se reserializa. No se modifican hashes de migración ni se añaden filas al ledger. La preparación manual de otro candidato no es una conversión automática de confianza ni una aprobación del snapshot.

## H. Bloqueos restantes y cierre

Para evaluar el candidato completo faltan las 16 propiedades de columnas enumeradas, el contexto de captura/sesión y correspondencia revisada, y observaciones declarativas/configuración verificables de las restricciones comprobadas. La captura documental completa de carritos también sigue pendiente. Functional puede permanecer unknown para una propuesta offline según la política actual, pero no prueba funcionamiento ni autoriza recuperación.

No se declarará metadataComplete=true hasta resolver esos bloqueos. No se añade un ejecutor, se modifica una guardia o se reintenta el migrador para facilitar el avance.

Se mantienen:

```text
readyForRemoteExecution=false
ledgerTransitionAllowed=false
allow007=false
```

No hubo conexiones TiDB/MySQL, SQL remoto o local contra una base, DDL/DML, migraciones, recuperación, cambios de ledger/datos, SQL 001–007, hashes históricos, .env, certificados, credenciales, probe, usuarios/grants, despliegues o commits. Se entrega el candidato parcial trazable y este informe; se detiene la etapa sin avanzar a recuperación.
