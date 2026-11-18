# OtakuZone — Etapa 3.19: modelo versionado de evidencia de enforcement

Fecha: **17 de noviembre de 2026**. Implementación exclusivamente local. Sin SQL real, conexiones TiDB/MySQL, recuperación, migraciones ni cambios del snapshot de producción.

## A. Contrato implementado

El planificador acepta ahora `otakuzone-tidb006-snapshot-v2`. Las restricciones comprobadas conservan sus definiciones estructurales, pero sustituyen `enforced` por `enforcementEvidence`. La evidencia tiene formato independiente `otakuzone-enforcement-evidence-v1` y regla `tidb-8.5.3-markers-v1`.

No existe un generador remoto de snapshot en este proyecto. El productor sigue siendo manual; el contrato exportado y el cuerpo del planificador validan el modelo. La CLI existente sigue leyendo un JSON local y no incorpora conexión, credenciales ni modo execute. No se ejecutó sobre el candidato real.

Estructura de `enforcementEvidence`:

| Campo | Contenido |
| --- | --- |
| format | `otakuzone-enforcement-evidence-v1` |
| declarative | Array de observaciones SHOW CREATE TABLE completas; vacío significa desconocido |
| configuration | Array de observaciones de configuración de la sesión; vacío significa desconocido |
| functional | Array de observaciones funcionales previas; vacío significa desconocido; esta etapa no produce ninguna observación real |

Cada observación incorpora obligatoriamente `restrictionName`, `restrictionType` (`CHECK` o `FOREIGN KEY`), `database`, `tableName`, `source`, `engineVersion`, `versionMapping`, `capturedAt`, `interpretationRuleVersion` y `evidenceCompleteness`. Para interpretarla se exige identidad coincidente, fecha UTC ISO textual válida, regla reconocida y completitud `complete`. Una procedencia ausente o incompatible devuelve `unknown`, nunca true por defecto.

Las correspondencias reconocidas son:

- `engineVersion=8.5.3`, `versionMapping=public-v8.5.3`.
- `engineVersion=8.0.11-TiDB-v8.5.3-serverless`, `versionMapping=reviewed-serverless-v8.5.3`.

La segunda es una declaración explícita de revisión de correspondencia, **no una certificación automática del proveedor ni algo que se haya añadido al snapshot real**. El banner solo no activa esa interpretación. Las cadenas de procedencia son declaraciones del productor, no firmas ni un mecanismo de autorización.

### Observaciones por dimensión

- **Declarative:** `source=show-create-table`, `ddl` con SHOW CREATE completo de la tabla. El intérprete localiza exactamente una restricción por nombre, verifica tabla/esquema y contrasta su definición con el objeto esperado. Para CHECK compara la expresión preservando literales y agrupación semántica; admite envoltorios de paréntesis redundantes. Para FK exige columnas, destino cualificado y reglas coincidentes.
- **Configuration:** `source=session-observation`, `scope=session` y objeto `controls`. Para CHECK requiere `tidb_enable_check_constraint=true`. Para FK requiere `tidb_enable_foreign_key=true` y `foreign_key_checks=true`. Los dos primeros son controles globales observados en el contexto de esa sesión; el último corresponde a la sesión. Una observación exclusivamente global no demuestra su configuración efectiva. No se ejecutan consultas para producir estos objetos aquí.
- **Functional:** `source=functional-observation` y `outcome=true|false|"unknown"`. Outcome es una observación manual de funcionamiento de **esa restricción**, no una deducción de la existencia del objeto ni del ensayo de otra tabla. Se conserva su procedencia, pero el módulo no autentica ni reproduce el ensayo.

El resultado calculado contiene `declarative`, `configuration` y `functional`, cada uno `true|false|"unknown"`, además de `contradictory`. Los estados se derivan de las observaciones; escribir un booleano legado no sustituye evidencia. NULL, propiedades ausentes y strings `"true"` no se convierten en true.

## B. Archivos de esta etapa

| Archivo | Cambio |
| --- | --- |
| `backend/src/db/tidbEnforcementEvidence.js` | Nuevo intérprete puro y guardia de evidencia |
| `backend/src/db/tidb006RecoveryPlan.js` | Snapshot v2, guardias separadas, exportación de versiones y evaluación de evidencia en salida |
| `backend/tests/helpers/tidbEvidenceFixture.js` | Nuevo constructor de evidencia exclusivamente sintética para tests |
| `backend/tests/tidb-enforcement-evidence.test.js` | 31 pruebas nuevas del intérprete |
| `backend/tests/tidb-006-recovery.test.js` | Conserva los 40 escenarios previos con fixtures v2 y añade seis escenarios de rechazo |
| Este informe | Contrato, política, pruebas y límites |

No se modifican CLI, runtime Express, preflight, autenticación, migrador normal, configuración, SQL, manifests ni hashes. El workspace ya contenía cambios de etapas previas; esta lista no atribuye esos cambios a 3.19.

## C. Matriz de estados y política

| Caso | Declarative | Configuration | Functional | Decisión offline |
| --- | --- | --- | --- | --- |
| CHECK completo compatible sin NOT ENFORCED | true | Independiente | Independiente | Requiere configuración true |
| CHECK con `/*!80016 NOT ENFORCED */` o NOT ENFORCED explícito | false | Independiente | Independiente | Bloquea |
| FK completa compatible sin FOREIGN KEY INVALID | true | Independiente | Independiente | Requiere configuración true |
| FK con `/* FOREIGN KEY INVALID */` | false | Independiente | Independiente | Bloquea |
| DDL parcial, versión no interpretada, objeto ausente/duplicado o definición distinta | unknown | Independiente | Independiente | Bloquea |
| Definición habilitada y controles incompletos | true | unknown | Independiente | Bloquea |
| Definición habilitada y foreign_key_checks desactivado | true | false | Independiente | Bloquea |
| Declaración y configuración confirmadas, sin ensayo individual | true | true | unknown | Permite solo propuesta offline; mantiene desconocimiento funcional |
| Resultado funcional negativo | Cualquiera | Cualquiera | false | Bloquea |
| Observaciones true/false contradictorias | unknown o estado individual | unknown o estado individual | unknown o estado individual | Bloquea, sin decidir por mayoría |

Una observación incompleta mezclada con otra positiva no se descarta silenciosamente: la dimensión queda unknown. Mezclar correspondencias de versión diferentes también bloquea. No se ordenan capturas para escoger automáticamente la más favorable o reciente.

La política funcional se hace explícita: **no exige producir una nueva prueba funcional para generar una propuesta offline**. Exige declaración y configuración demostradas y rechaza evidencia negativa. Esto no aprueba ejecución remota. Toda salida sigue fijando `readyForRemoteExecution=false`, `ledgerTransitionAllowed=false` y `allow007=false`; incluye `enforcementAssessment` y la política aplicada.

Las guardias se aplican a FK/CHECK originales de pedidos y, cuando existen, a fk_pedidos_carrito y fk_historial_pedido. El alcance estructural previo de carritos no se amplía: comprueba su id y PK, sin convertir al planificador en auditor de todas sus restricciones.

## D. Verificación real

Comando final, solo fixtures/dobles:

```text
node --test backend/tests/tidb-enforcement-evidence.test.js backend/tests/tidb-006-recovery.test.js backend/tests/tidb-migrations.test.js backend/tests/tidb-ready.test.js backend/tests/tidb-preflight.test.js backend/tests/database-context.test.js backend/tests/database-unit.test.js backend/tests/production-config.test.js backend/tests/tidb-pool.test.js
```

**116/116 aprobadas:** 40 escenarios previos de recuperación, seis adicionales de integración, 31 del intérprete y 39 regresiones relacionadas. Incluyen estados desconocidos, versiones, identidad, truncamiento, literales que contienen texto de marcadores, negativos, configuración global frente a sesión, contradicciones, definición FK diferente, conservación de applying y bloqueo del migrador normal antes de SQL/007.

El runner inicial fue bloqueado por spawn EPERM del sandbox; la ejecución fuera del sandbox se autorizó. Las ejecuciones intermedias detectaron una aserción que esperaba el texto anterior de error; se corrigió. El lote final no conserva fallos. La suite de recuperación mantiene el guardia que intercepta intentos de socket antes de conexión; otras regresiones HTTP solo usan servidores locales y dobles. No se ejecutó SQL contra un servidor.

`npm run lint`: aprobado. No corresponde build frontend: no cambia frontend. Verificación final de sintaxis/diff y preservación del candidato registrada al cierre. Las pruebas usan evidencia sintética, no certifican la build Serverless ni el estado remoto.

## E. Compatibilidad y riesgos

**v1 no tiene conversión automática ni vía alternativa de aprobación.** La entrada rechaza snapshot v1 aunque diga metadataComplete=true; un booleano `enforced` presente en una restricción comprobada de v2 también bloquea. Los informes históricos y el candidato v1 permanecen intactos. Una futura conversión manual deberá aportar observaciones reales; no transformar `enforced=true` en tres estados positivos.

El analizador es deliberadamente limitado a la representación revisada de SHOW CREATE, no un parser SQL general. Comprueba balance, identidad y delimitación de restricciones, trata comentarios separadamente de literales y rechaza formas no soportadas. Escapes con barra inversa son desconocidos porque no se interpreta SQL_MODE; tampoco se normalizan arbitrariamente expresiones equivalentes. Puede rechazar una representación válida que necesite revisión explícita.

No puede descubrir que el productor omitió deliberadamente texto de una salida que aún parece sintácticamente completa, autenticar una captura, garantizar permisos, excluir escritores ni asegurar vigencia. `evidenceCompleteness=complete` y `versionMapping` requieren revisión humana. No se ha certificado equivalencia del binario administrado con el código público.

La interpretación sigue la investigación previa: [SHOW v8.5.3](https://github.com/pingcap/tidb/blob/v8.5.3/pkg/executor/show.go), [selección de CHECK v8.5.3](https://github.com/pingcap/tidb/blob/v8.5.3/pkg/table/tables/tables.go) y [controles FK v8.5.3](https://github.com/pingcap/tidb/blob/v8.5.3/pkg/planner/core/foreign_key.go). No se añaden consultas sobre una columna ENFORCED inexistente. No se repiten investigaciones o pruebas remotas.

## F. Snapshot real y siguiente paso

El archivo `docs/snapshots/tidb-006-snapshot-candidate.json` permanece **byte a byte intacto**, formato v1, metadataComplete=false. No se ejecuta el planificador sobre él ni se produce un plan real.

Pendientes locales: transcribir y revisar los atributos de columnas realmente conocidos, resolver los desconocidos (incluido el default de usuario_id frente al indicador default_is_null aportado), incorporar los atributos de índices respaldados, y convertir a v2 únicamente cuando exista procedencia íntegra para las restricciones y configuración. La expresión generada completa de carritos sigue siendo una cuestión documental fuera de todas las guardias implementadas. No se rellenan estos campos en 3.19.

Para enforcement siguen pendientes las definiciones íntegras individuales y la correspondencia Serverless revisada, junto con evidencia de los controles aplicables a la sesión; una variable global y el ensayo temporal ajeno no las sustituyen. Functional puede seguir unknown en una propuesta offline y debe mostrarse así. No se solicita ni ejecuta una nueva consulta por este informe.

Se conservan migraciones 001–007 MySQL/TiDB, hashes, ledger, .env, certificados, secretos, datos y probe. No hubo conexiones remotas, SQL, usuarios/grants, migraciones, recuperación, habilitación de 007, despliegues ni commits. La etapa termina con implementación local para revisión.
