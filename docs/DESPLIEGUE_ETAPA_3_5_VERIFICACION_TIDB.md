# OtakuZone — Etapa 3.5: verificación controlada de unicidad en TiDB

Fecha: **16 de noviembre de 2026**. Resultado: procedimiento de lectura y ensayo preparado; **sin conexión SQL ni escrituras ejecutadas**.

La alternativa A queda **aprobada por el usuario como estrategia de diseño**: una columna email ASCII canónica, candidata `utf8mb4_0900_bin` y UNIQUE completo. Esa decisión no aprueba su implementación ni certifica su funcionamiento en la instancia.

## 1. Identidad y configuración real de TiDB

| Dato | Información aportada por el usuario | Verificación nueva de esta etapa |
| --- | --- | --- |
| Instancia | `otakuzone-db`, TiDB Cloud Starter compatible MySQL | No observada directamente |
| Versión | TiDB 8.5.3 | Pendiente de VERSION y comentario actuales |
| Región | AWS Tokyo | Informada por el usuario; no inferible de VERSION |
| CHECK | Habilitado globalmente y probado en tabla de ensayo | No se recibieron resultados nuevos ni se repitió prueba |
| FOREIGN KEY | Habilitado y probado en tablas de ensayo | Igual: evidencia informada, sin nueva ejecución |
| Transacciones | Pesimistas; foreign_key_checks ON | Pendiente de observación de la sesión actual |
| Collation candidata/framework/padding | Deben consultarse | No verificados en instancia |
| Privilegios efectivos | Desconocidos para el futuro cliente mysql2/runtime | Pendientes |

**Límite de acceso:** se revisó únicamente la disponibilidad de configuración completa en variables del proceso y archivos privados existentes `backend/.env` y `.env.local`, sin imprimir valores, copiarlos ni cambiarlos. No se encontró configuración completa DB_* seleccionando TiDB/TLS ni el conjunto de credenciales TIDB_* habitual. No se buscaron contraseñas en otros almacenes ni se solicitaron al usuario. Esto no prueba que el usuario carezca de acceso desde su consola.

Conforme a la solicitud, **se detiene la conexión automatizada y se entrega el procedimiento SQL Editor**. No se usaron las credenciales locales para intentar un destino remoto. MySQL local no se abrió.

Se revisaron los informes [3.3](DESPLIEGUE_ETAPA_3_3_COMPATIBILIDAD_UNICIDAD.md), [3.2 de auditoría](DESPLIEGUE_ETAPA_3_2_AUDITORIA_EMAIL.md) y [3.4](DESPLIEGUE_ETAPA_3_4_DISENO_UNICIDAD_EMAIL.md), además de `tidbPreflight.js`, `migrationCatalog.js`, manifest TiDB, política/validador, transacción y opciones del pool. El repositorio conserva cambios previos: no se atribuyen a esta etapa. El catálogo sigue blocked y sin SQL ejecutable; no se modifica la collation exigida ni se elimina su bloqueo de runtime.

## 2. Conexión y TLS

### Ruta disponible: consola SQL Editor del usuario

1. Abrir la consola oficial de TiDB Cloud con la sesión privada habitual.
2. Seleccionar la organización y la instancia existente **otakuzone-db**. Comprobar visualmente que es Starter/MySQL, la región informada y el destino esperado.
3. Abrir SQL Editor y ejecutar **solo los bloques de lectura de §§3–4**, seleccionándolos individualmente. No ejecutar ejemplos CREATE/INSERT de tutoriales, importar datasets ni activar complementos.
4. Revisar resultados y errores por bloque. Un resultado vacío o permiso denegado no equivale a variable deshabilitada ni a capacidad aprobada.
5. Conservar la evidencia técnica sin contraseña, cadenas Connect, tokens, emails de cuentas o capturas con secretos. SHOW GRANTS puede incluir nombres SQL/hosts: anonimizar identidades al compartir resultados, manteniendo privilegios y alcance.

El editor permite consultas desde la consola sin cliente local; selección de sentencia evita ejecutar accidentalmente todo un documento. [PingCAP: SQL Editor](https://docs.pingcap.com/tidbcloud/explore-data-with-sql-editor/).

### Conexión futura mysql2, no realizada

Usar hostname y usuario completos de Connect, puerto real y secreto desde un mecanismo privado autorizado. Mantener TLS con `rejectUnauthorized=true`, validación de hostname y CA de confianza; nunca IP sustituta, `rejectUnauthorized=false` ni contraseña en argumentos/logs. El código actual admite CA PEM opcional; las CA incorporadas de Node pueden bastar según certificado real. Starter documenta conexiones TLS con certificados de un tercero. [PingCAP: TLS Starter](https://docs.pingcap.com/tidbcloud/secure-connections-to-serverless-clusters/).

No se genera contraseña, no se guarda credencial ni se modifica `.env`. La consola HTTPS/SQL Editor **no certifica el canal mysql2 de Node**: ese handshake y la autorización TLS real quedan pendientes de una conexión posterior. No iniciar la aplicación ni el migrador para descubrir capacidades.

## 3. Collation, padding e identidad: consultas de solo lectura

**Preparadas para ejecución manual; NO ejecutadas por Codex.** No contienen DDL, DML ni SET. Seleccionar cada bloque por separado. El SQL Editor puede emplear sesiones distintas: sus valores no demuestran los defaults de futuras conexiones runtime.

```sql
SELECT VERSION() AS version, @@version_comment AS version_comment;
```

```sql
SHOW COLLATION WHERE Charset = 'utf8mb4';
```

Examinar disponibilidad y `Pad_attribute`, especialmente `utf8mb4_0900_bin` y la histórica `utf8mb4_0900_as_ci`. Si la salida no expone padding, registrar «no observable por esta consulta» y solicitar evidencia de metadatos compatible con la versión; no deducir el valor real del nombre.

```sql
SELECT VARIABLE_VALUE
FROM mysql.tidb
WHERE VARIABLE_NAME = 'new_collation_enabled';
```

La consulta anterior lee la fila del framework; `new_collation_enabled` no es una columna llamada así. Si el servicio deniega acceso a `mysql.tidb`, registrar ese límite sin ampliar grants ni modificar configuración. Se necesitará evidencia equivalente verificable antes de aprobar semántica.

Documentación consultada el 2026-11-16: PingCAP v8.5 lista la candidata como binaria NO PAD; no lista la histórica as_ci. Es fundamento documental, **no resultado de esta instancia 8.5.3**. [Character Set and Collation](https://docs.pingcap.com/tidb/stable/character-set-and-collation/).

Las comparaciones con literales y las expresiones de CHECK se reservan para un alcance posterior: la primera fase solicitada se limita a identidad, configuración y privilegios.

## 4. Estado CHECK, FOREIGN KEY, modos y privilegios

Ejecutar estos bloques de lectura, sin activar variables:

```sql
SHOW GLOBAL VARIABLES
WHERE Variable_name IN (
  'tidb_enable_check_constraint',
  'tidb_enable_foreign_key',
  'foreign_key_checks',
  'tidb_txn_mode',
  'time_zone',
  'sql_mode'
);
```

```sql
SHOW SESSION VARIABLES
WHERE Variable_name IN (
  'tidb_enable_check_constraint',
  'tidb_enable_foreign_key',
  'foreign_key_checks',
  'tidb_txn_mode',
  'tidb_constraint_check_in_place',
  'tidb_constraint_check_in_place_pessimistic',
  'time_zone',
  'system_time_zone',
  'sql_mode'
);
```

Una variable solo global puede no aparecer en SESSION; una fila ausente requiere revisar alcance/versiones, no asumir ON/OFF. Para UTC, si `time_zone=SYSTEM`, corroborar `system_time_zone`; Z del driver solo gobierna conversión del cliente. Conservar modo estricto y ONLY_FULL_GROUP_BY del contrato actual; registrar diferencias sin corregirlas automáticamente.

```sql
SHOW GRANTS;
```

```sql
SELECT CURRENT_ROLE() AS active_roles;
```

Si hay roles activos, SHOW GRANTS por sí solo puede no desplegar todos sus permisos heredados. El operador debe revisar concesiones efectivas de esos roles, roles predeterminados y la identidad usada por SQL Editor con las herramientas permitidas del servicio. No ejecutar GRANT/REVOKE/SET ROLE para completar esta auditoría. No confundir la identidad de consola con el futuro usuario runtime o migrador.

Estado actual del informe: **habilitación/pruebas previas informadas por el usuario; resultados nuevos pendientes**. Incluso un CHECK global ON no certifica una expresión específica: harán falta metadatos y rechazos negativos en el ensayo autorizado. TiDB documenta CHECK y UNIQUE, con comprobación de unicidad que puede diferirse hasta commit. [Constraints, v8.5](https://docs.pingcap.com/tidb/stable/constraints/).

## 5. Diseño de pruebas aisladas

**Propuesta para revisión. No creada, sin DDL de creación ejecutable en esta entrega.**

| Elemento exacto propuesto | Definición conceptual |
| --- | --- |
| Esquema | `otakuzone_email_probe`, separado de cualquier base real del producto |
| Tabla `usuarios_probe` | `id` BIGINT UNSIGNED PK asignado por fixture; `email` VARCHAR(254) utf8mb4/utf8mb4_0900_bin NOT NULL |
| Índice `uq_probe_email` | UNIQUE sobre email completo, una columna, sin prefijo |
| Restricción `ck_probe_email_canonical` | Predicado S de §8, pendiente; **no se genera como CHECK ejecutable** |
| Tabla `auth_sesiones_probe` | `id` CHAR(64) ASCII PK de fixture; `usuario_id` BIGINT UNSIGNED NOT NULL; sin JWT/password_hash reales |
| FK `fk_probe_session_user` | usuario_id → usuarios_probe.id, RESTRICT; prueba aislada de vínculo, no réplica completa del schema auth |

No hace falta copiar roles, catálogo, ledger ni datos reales. Los IDs de usuario de cada caso serán distintos para que una PK repetida no simule un conflicto de email. Los IDs de sesión también serán distintos; se documentará cada fixture y conexión.

Antes de autorizar DDL debe confirmarse que **el esquema no existe** y que no se adoptan objetos ajenos. Si ya existe, detenerse; no usar IF NOT EXISTS para reutilizarlo ni limpiarlo automáticamente. Definir un nuevo plan/nombre revisado si corresponde. Antes de ejecutar se presentará el DDL exacto, el CHECK demostrado y su huella; este diseño no basta como permiso.

Datos: únicamente correos sintéticos de §6 y sus expansiones de longitud; sesiones artificiales sin tokens, contraseñas o datos personales. No se crea otro servicio/instancia, y el esquema tampoco se crea ahora. Las pruebas consumirán RU/almacenamiento de la instancia cuando se autoricen; no aumentar límites de gasto.

### Limpieza propuesta, NO autorizada ni ejecutada

Solo tras verificar que el esquema fue creado exclusivamente por el ensayo y que contiene exactamente los objetos aprobados, con ambas conexiones cerradas/revertidas y evidencia conservada:

```sql
-- PROPUESTA DE LIMPIEZA DESTRUCTIVA: NO EJECUTAR EN ESTA ETAPA.
DROP TABLE otakuzone_email_probe.auth_sesiones_probe;
DROP TABLE otakuzone_email_probe.usuarios_probe;
DROP DATABASE otakuzone_email_probe;
```

No usar comodines, DROP DATABASE sobre el schema real, ni desactivar FK/CHECK para limpiar. Si aparecen objetos no previstos, detenerse y preparar limpieza específica. La aprobación futura debe indicar expresamente si autoriza también esta limpieza; en caso contrario conservar el ensayo y solicitarla después.

## 6. Matriz de unicidad propuesta

Todas las filas están **pendientes en TiDB**. API significa ejecutar el normalizador vigente antes de escribir; SQL directo envía el literal crudo. Un valor normalizable puede aceptarse por API y tener que rechazarse si se intenta almacenar sin canonicalizar.

`e=example.test`, `L(n)` son n letras a. Para límites se usa `@example.com` (12 caracteres). La igualdad esperada de motor binario para literales crudos no equivale al resultado de UNIQUE después de normalizar.

| Caso | Entradas sintéticas | Expectativa de comparación/almacenamiento |
| --- | --- | --- |
| Canónicos idénticos | `user@e` / `user@e` | Iguales; segunda confirmación impedida por UNIQUE |
| Case | `USER@e` / `user@e` | Crudas distintas bajo candidata binaria; API produce misma clave; SQL mayúsculo rechazado por S |
| Punto | `a.b@e` / `ab@e` | Claves distintas, ambas confirmables |
| Guion | `a-b@e` / `ab@e` | Distintas |
| Guion bajo | `a_b@e` / `ab@e` | Distintas |
| Plus | `a+b@e` / `ab@e` | Distintas; no eliminar etiquetas |
| Apóstrofo | `a'b@e` / `ab@e` | Ambas válidas/distintas; `ab'@e` debe rechazarse por formato vigente |
| Longitud | `L(242)@example.com` / `L(241)b@example.com` | Ambas 254 y distintas, detecta errores por prefijo; 255 debe fallar sin truncar |
| Espacios finales/externos | `user@e ` / ` user@e ` / `user@e` | Crudos con espacios no son clave válida; API recorta y converge; SQL directo rechazado por S |
| Controles | TAB/CR/LF externos, internos, NUL | API puede recortar controles ASCII externos admitidos por trim; almacenamiento directo no debe contener ninguno |
| Unicode | é, e+acento combinado, NBSP, ancho completo, Kelvin | Rechazo original por API y por S; sin transliteración |
| Punycode ASCII | variantes de case de `user@xn--bcher-kva.de` | API converge; distintas etiquetas ASCII no se fusionan |
| NULL/vacío/formato inválido | NULL, cadena vacía, doble @, espacios internos | Rechazo; NOT NULL y S son garantías diferentes |

Procedimiento futuro por caso: comparar literales y bytes; registrar resultado de cada sentencia y commit; consultar metadata del índice para comprobar Non_unique=0, columna email completa y Sub_part NULL; verificar recuento final de filas y relaciones. No presentar un SELECT de igualdad como prueba del UNIQUE. Longitud inválida puede fallar por tipo antes que CHECK: registrar la causa real, no atribuir todo rechazo a S.

El corpus detallado de [3.3](DESPLIEGUE_ETAPA_3_3_COMPATIBILIDAD_UNICIDAD.md) y las expectativas de [3.4](DESPLIEGUE_ETAPA_3_4_DISENO_UNICIDAD_EMAIL.md) siguen siendo especificación, no resultados remotos. Ninguna prueba autoriza introducir valores inválidos en usuarios reales.

## 7. Plan de concurrencia

Requiere **dos conexiones físicas independientes mysql2**, mantenidas durante cada transacción, más coordinación del observador. Dos pestañas SQL Editor no demuestran esa independencia ni el mismo comportamiento del driver. No usar SELECT previo como exclusión ni retrasos como única prueba de sincronización.

| Ensayo futuro | Secuencia coordinada y resultado exigido |
| --- | --- |
| Ganador confirma | A inicia transacción pesimista e inserta usuario/sesión sintéticos sin confirmar. B inicia otra e intenta mismo email con IDs distintos. Registrar si espera/falla y cuándo. A confirma; B no puede confirmar una segunda identidad |
| Primero revierte | Misma secuencia, pero A revierte. B puede proceder/confirmar o recibir error según ejecución; observar, no inventar. Si se relanza para otro ensayo, hacerlo explícitamente, no como retry oculto |
| Claves distintas | Ambas deben poder confirmar con sus propias sesiones, sin colisión artificial |
| Fallo de sesión | Tras insertar usuario provocar una violación controlada de sesión/FK/PK; rollback conjunto debe dejar cero filas del intento |
| Conflicto al commit | Si las variables permiten validación diferida, registrar error y rollback total; no cambiar variables para provocarlo sin autorización adicional |
| Commit sin respuesta | Ensayo separado de transporte, con alcance específico. Conciliar estado desde observador; no afirmar rollback ni repetir a ciegas |

Registrar tiempos/fase (BEGIN, INSERT usuario, INSERT sesión, COMMIT/ROLLBACK), `errno`, `code` y `sqlState` reales, usando fixtures y sin log completo del driver. Los mensajes pueden contener email/SQL: redactarlos. Distinguir 1062/ER_DUP_ENTRY de conflicto transaccional, timeout, 8147 u otros errores que realmente aparezcan; no inventar sus nombres mysql2 ni mapear todos a 409.

Criterio final: como máximo una identidad confirmada por clave, ninguna sesión sin usuario, y ninguna sesión del intento perdedor cuando se confirme su rollback. Si el commit fue ambiguo, registrar incertidumbre hasta conciliación. El código actual espera commit antes de emitir cookie; no se modifica ni se prueba contra producción aquí.

## 8. Predicado CHECK propuesto

**Especificación S, no CHECK SQL ejecutable:** `normalizeEmail(v)` debe terminar correctamente y devolver exactamente los mismos bytes que v. Almacenamiento permite únicamente el lenguaje ASCII minúsculo aceptado por el validador actual, sin espacios/controles y con longitud máxima 254. NOT NULL se impone por separado.

Descomposición a estudiar:

1. Rango ASCII y conjunto permitido, rechazando controles/DEL, Unicode y conversiones con sustitución.
2. Minúsculas por coincidencia sensible a case; una comparación ci contra LOWER no demuestra canonicalización.
3. Coincidencia de cadena completa, sin tolerancia a salto de línea final ni regex multiline involuntaria.
4. Gramática Zod vigente: puntuación y posiciones válidas, dominio y TLD; no añadir límites RFC ausentes en el contrato.
5. Longitud y rechazo de exceso sin truncamiento; revisar `sql_mode` y encoding de entrada.

PingCAP documenta REGEXP_LIKE con compatibilidad parcial respecto a MySQL y opciones de matching; eso **no demuestra** que un patrón Zod trasladado sea equivalente ni admisible dentro de CHECK en 8.5.3. [String Functions, v8.5](https://docs.pingcap.com/tidb/stable/string-functions/#regexp_like).

Puerta previa a generar DDL: obtener evidencia de versión, funciones/expresiones permitidas en CHECK y semántica regex; evaluar el predicado con SELECT sobre fixtures bajo autorización ampliada de lectura, contrastarlo con el validador Node y revisar casos de borde. Después presentar el CHECK exacto para revisión. Su enforcement se demostrará únicamente con escrituras negativas aisladas autorizadas. Un ensayo previo de CHECK aritmético informado por el usuario no demuestra compatibilidad de este predicado.

**No se incluye un CHECK ejecutable ni se afirma equivalencia demostrada.** Si la expresión no puede garantizar S, detener la creación de su versión de ensayo y revisar el diseño; no relajar el contrato, añadir VARBINARY o desactivar protecciones como atajo.

## 9. Permisos runtime y migrador

- **Observación:** identidad que pueda leer los metadatos necesarios, sin conceder permisos administrativos adicionales para evitar un error de lectura.
- **Operador de ensayo:** permisos limitados al esquema aprobado para sus tablas, índices/FK/CHECK, DML sintético y limpieza si se autoriza. Separado del servidor público y sin intervenir otras bases.
- **Migrador futuro:** DDL y ledger/seed exclusivamente del destino autorizado; no root HTTP ni CREATE USER/GRANT general por comodidad.
- **Runtime futuro:** solo lectura/escrituras de negocio necesarias, sin ALTER/CREATE/DROP/INDEX ni administración de identidades, roles o ledger. Mantener restricciones por columna donde el tier/versión realmente las admita; no prometer grants no comprobados.

Revisar roles activos/heredados, permisos globales y control de variables por sesión. Impedir que runtime retire/desactive restricciones exige más que no dar ALTER; cualquier mecanismo que permita eludir enforcement debe detectarse y tratarse. No se ejecuta GRANT, REVOKE o SET. El usuario SQL de SQL Editor no prueba los privilegios del usuario Node futuro.

## 10. Riesgos

- Sin credenciales disponibles para Codex, no hay nueva evidencia real del motor/TLS ni errores mysql2. Los datos de instancia aportados se respetan como información del usuario, sin presentarlos como consulta realizada.
- Variables globales y sesión pueden diferir; una sesión del editor no certifica conexiones nuevas del pool.
- S continúa sin expresión SQL demostrada. UNIQUE binario sin S permite distinguir mayúsculas crudas que la aplicación considera la misma identidad.
- El esquema de ensayo puede consumir cuota y dejar DDL parcial; no reusar un nombre existente ni limpiar sin inspección/permiso.
- Bloqueos concurrentes pueden esperar o expirar: usar coordinación y límite de duración externo, rollback/cierre controlado; no reducir protecciones para hacer pasar pruebas.
- Un commit incierto no equivale a pérdida de atomicidad. Es necesario conciliar antes de concluir sobre filas parciales.
- Nada de este ensayo aislado certifica el esquema real, sus migraciones, backups o autenticación completa.

## 11. Resultados ejecutados y pendientes

| Actividad | Estado |
| --- | --- |
| Lectura de solicitud y revisión de código/documentación requerida | Realizada |
| Inspección de disponibilidad de configuración privada, sin valores en salida | Realizada; no se encontró configuración TiDB completa en los ámbitos revisados |
| VERSION/variables/grants/collations remotos | No ejecutados; consultas entregadas para el usuario |
| TLS mysql2 contra Starter | No realizado |
| Creación/limpieza de esquema y tablas | No realizadas |
| Igualdad/UNIQUE/CHECK/FK/rollback/concurrencia sobre TiDB | No ejecutados; matriz y plan preparados |
| Pruebas offline nuevas/suites/builds | No ejecutados; no necesarios para esta entrega documental |
| MySQL local | Sin conexión ni modificación |
| Catálogo/preflight/env/autenticación | Sin cambios |

Un intento inicial de inspección de disponibilidad falló por una ruta supuesta al módulo dotenv; se corrigió su resolución mediante el package del backend y se obtuvo el resultado booleano anterior, sin adquirir conexiones ni instalar paquetes. No fue un error de TiDB ni una prueba de conectividad.

## 12. Dictamen de compatibilidad

**ALTERNATIVA A: aprobada como estrategia por el usuario; compatibilidad operativa PENDIENTE DE VALIDACIÓN.**

**Etapa completada como procedimiento preparado, no como certificación remota.** La instancia y pruebas previas informadas son útiles, pero deben reobservarse según la primera fase. Sin S demostrado, índice real ensayado y concurrencia/atomicidad verificadas no se aprueba runtime, migrador ni despliegue. El catálogo continúa **BLOQUEADO**; no se modifica el preflight para aceptar la candidata por anticipado.

## 13. Siguiente autorización requerida

Primero, el usuario puede ejecutar las consultas de lectura entregadas desde su SQL Editor privado; no debe facilitar contraseñas. Revisar sus resultados técnicos y diferencias antes de cualquier escritura. Si falta información o un permiso, registrar el límite y detener el paso dependiente.

La autorización posterior deberá concretar **otakuzone_email_probe**, sus dos tablas/objetos propuestos, DDL exacto con CHECK previamente justificado, datos sintéticos, dos conexiones y alcance de rollback/concurrencia, cuota/riesgos y si incluye la limpieza explícita de §5. **El presente informe no solicita aprobar un CHECK aún inexistente ni autoriza escrituras por silencio.**

La comparación final SHA-256 de los **297 archivos existentes inventariados**, incluidos entornos privados, no encontró modificaciones; el único añadido es este informe. El inventario excluye `.git`, dependencias instaladas y carpetas de build/caché; no se ejecutaron herramientas que las regeneren. No se publican huellas privadas. No hubo modificaciones de código, SQL histórico, datos, entornos privados, usuarios, contraseñas, roles o servicios. Se conserva el trabajo anterior. No se avanza a migraciones reales, Render, Vercel ni despliegue. Se espera autorización expresa antes de crear el esquema de ensayo.
