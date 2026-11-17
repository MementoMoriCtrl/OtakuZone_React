# OtakuZone — Etapa 3.2: correo ASCII y auditoría MySQL/TiDB

Fecha: 16 de noviembre de 2026.

## 1. Resultado

Contrato ASCII centralizado e implementado en registro, login, búsqueda de cuentas y validación del argumento del operador. El frontend utiliza la misma política pura de ASCII/normalización para sus comprobaciones de formulario. El formato autoritativo sigue siendo el validador Zod existente, sin dependencias nuevas ni regex de email inventada.

**Se auditó realmente MySQL local, únicamente en lectura:** una cuenta, sin anomalías ni colisiones bajo el contrato propuesto. Se confirmaron esquema, UNIQUE y siete checksums del historial. No se modificaron datos, índices, collation ni migraciones.

TiDB continúa bloqueado. El contrato de aplicación ya está definido, pero no se ha demostrado equivalencia de unicidad entre motores. Se entrega una [propuesta técnica independiente](PROPUESTA_UNICIDAD_CORREO_MYSQL_TIDB.md), sin implementarla ni aprobar cambios de esquema.

## 2. Diagnóstico inicial y archivos inspeccionados

Antes de modificar código se leyó el informe de Etapa 3.1 y se revisaron la infraestructura y las rutas reales. Se comunicó el diagnóstico inicial y se realizó la auditoría local de solo lectura.

Hallazgos iniciales:

- `backend/src/validators/auth.js` ya compartía entre registro y login `trim`, máximo 254, Zod email y minúsculas, pero no establecía explícitamente ASCII sobre el input original.
- Controladores recibían cuerpos validados; el servicio y el repositorio no garantizaban por sí mismos esa canonicalización si eran llamados directamente.
- `authRepository.findByEmail` usaba `authSql.byEmail`, con `WHERE u.email = ?`; el registro guardaba el parámetro recibido.
- `backend/scripts/promote-admin.js` validaba/normalizaba email con otra expresión Zod y otro orden. Solo se cambia su validación de entrada; no se ejecuta ni se altera su lógica de roles.
- `src/domain/validation.js` mantenía un filtro de formato orientativo menos estricto que el backend, sin rechazo explícito de Unicode. Los formularios hacían trim antes de enviar, pero no convertían a minúsculas; la autoridad era el backend.
- La migración 002 define `usuarios.email VARCHAR(254) COLLATE utf8mb4_0900_as_ci NOT NULL` y `UNIQUE KEY uq_usuarios_email (email)`. Ambos se confirmaron en el servidor local.

Se inspeccionaron además:

- `backend/src/controllers/authController.js`, `routes/auth.js`, `middlewares/validate.js`, `services/authService.js`, `repositories/authRepository.js` y `db/authSql.js`.
- `backend/src/config/database.js`, `config/loadEnvironment.js`, `db/engine.js`, `pool.js`, `transaction.js`, `tidbPreflight.js`, `migrationCatalog.js`, los manifests y las migraciones 001–007.
- Las pruebas de autenticación y las incorporadas en Etapa 3.1; formularios LoginForm/RegistrationForm y servicios de cuenta.
- `src/services/localRepository.js`: la instantánea de perfil de navegador es un mecanismo legado de presentación/persistencia local, no una búsqueda o creación de cuentas SQL. No se reescribió almacenamiento histórico del navegador.
- Lecturas administrativas de email y DTO de usuario: solo presentan datos existentes, no son entradas para crear/identificar cuentas. No se cambió su salida ni se canonicalizó silenciosamente lo almacenado.
- Scripts QA que usan correos fixture: algunos omiten deliberadamente validadores para verificar restricciones SQL. No se modificaron ni ejecutaron esos verificadores con escritura.

## 3. Auditoría real de datos existentes

La conexión utilizó la configuración privada ya existente sin mostrar host privado, usuario, contraseña, emails, identificadores personales, hashes de contraseñas, cookies o tokens. Se restringió el destino a MySQL y loopback; no se solicitó ni guardó ninguna credencial nueva.

La auditoría reproducible se ejecutó con REPEATABLE-READ y `START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY`, SELECT/SHOW y ROLLBACK al finalizar. El inspector del motor confirmó **MySQL 8.0.46**. No se ejecutaron INSERT, UPDATE, DELETE, ALTER, CREATE, migraciones ni limpieza.

| Comprobación | Resultado agregado |
| --- | --- |
| Cuentas examinadas | 1 |
| Correos con caracteres no ASCII en la entrada almacenada | 0 |
| Correos con letras ASCII mayúsculas | 0 |
| Correos con espacios externos según trim | 0 |
| Valores inválidos bajo ASCII + formato Zod | 0 |
| Valores ASCII que cambiarían al canonicalizar | 0 |
| Grupos duplicados según trim + minúsculas ASCII | 0 |
| Filas en esos grupos | 0 |
| Grupos que colisionan solo al convertir a minúsculas | 0 |

Los grupos se construyen en memoria a partir de valores ASCII; los valores Unicode se cuentan como inválidos, sin transformarlos para adoptarlos. Nada se devuelve como listado de direcciones o claves canónicas. La información describe el snapshot observado, no futuros datos ni todas las bases posibles.

### Esquema e historial observados

`usuarios.email`: varchar(254), NOT NULL, `utf8mb4_0900_as_ci`, **NO PAD**. `uq_usuarios_email`: índice UNIQUE de una sola columna completa email, sin prefijo. También se observaron PRIMARY sobre id e ix_usuarios_rol sobre rol_id. No se añadieron ni eliminaron índices.

Los siete registros de schema_migrations coincidieron con las huellas de sus SQL versionados; no se escribieron ni sustituyeron checksums. Las pruebas verifican también la procedencia fijada en el catálogo reservado TiDB.

### Comparaciones SELECT con fixtures, no cuentas reales

| Caso | Igualdad de cadenas crudas en MySQL as_ci | Igualdad canónica de aplicación |
| --- | --- | --- |
| Diferente capitalización | Sí | Sí |
| Espacios externos | No | Sí |
| Solo espacio final | No | Sí |
| Variante con acento | No | Fuera del contrato: rechazada |
| Letra de ancho completo frente a ASCII | Sí | Fuera del contrato: rechazada |
| Punto en local-part frente a ausencia de punto | No | No |
| Sufijo +tag frente a ausencia de sufijo | No | No |
| Punycode ASCII con distinta capitalización | Sí | Sí |

Las comparaciones reproducibles utilizan fixtures Unicode conservados en un archivo fuente, evitando depender de la codificación del stdin de PowerShell. No se usan conversiones de Unicode a ASCII para decidir validez.

No hubo intentos de insertar duplicados en MySQL: esa prueba escribiría datos y no está autorizada aquí. La metadata UNIQUE real y estas comparaciones son evidencia distinta de una prueba negativa de INSERT o de concurrencia.

### Reproducción de solo lectura

Desde la raíz del repositorio:

```text
node backend/scripts/audit-email-ascii-readonly.js
```

No recibe credenciales como argumentos, no admite un host remoto y no cambia variables globales o de sesión. Si no puede verificar el motor, REPEATABLE-READ o el esquema/índice esperado, se detiene. Para más de 100 000 filas exige revisar una estrategia paginada antes de leerlas. Sus consultas reproducibles están en `backend/src/db/emailAudit.js`; la salida JSON solo contiene agregados, metadatos y resultados de fixtures.

No se necesita un script manual de corrección porque no se detectaron anomalías. Si otra ejecución encontrase excepciones, solo las informará; no las normalizará en la base.

## 4. Contrato ASCII implementado

La función pura `normalizeAsciiEmail` primero exige string y comprueba todos los caracteres originales. **Después** aplica trim y toLowerCase. Así no desaparecen silenciosamente espacios Unicode externos ni se convierte, por ejemplo, el signo Kelvin en una letra ASCII válida al pasar a minúsculas.

`emailSchema` añade el formato Zod que ya utilizaba el backend y máximo 254. `normalizeEmail` expone esa misma validación completa para servicios, repositorios y el operador. Se reutiliza la implementación en distintos límites defensivos; no se crean reglas de formato divergentes entre ellos.

| Entrada representativa | Resultado |
| --- | --- |
| USER@example.com | user@example.com |
| user@example.com | Aceptada |
| Espacios ASCII alrededor | Se recortan |
| Tabs/saltos ASCII únicamente alrededor | Se recortan como en el trim anterior |
| josé@example.com | Rechazada |
| user@éxample.com | Rechazada |
| 用户@example.com | Rechazada |
| Unicode invisible externo o signo Kelvin | Rechazados antes de normalizar |
| Espacios internos, NUL o formato inválido | Rechazados por la política/formato |
| Punycode ya escrito como ASCII y con formato válido | Aceptado, sin decodificar ni convertir el dominio |

Registro y login pasan por el mismo esquema. El servicio canonicaliza también llamadas directas. El repositorio canonicaliza búsquedas y registro antes de emitir SQL o adquirir una conexión para una entrada inválida. La consulta preparada y el índice UNIQUE siguen arbitrando la búsqueda/unicidad; no se añade un SELECT previo para sustituir el índice.

El frontend comparte únicamente el módulo puro, que no importa Zod, configuración, mysql2 ni secretos. Su filtro de formato orientativo previo se conserva; el servidor sigue validando de manera autoritativa con Zod. Se rechaza Unicode antes del envío normal del formulario, sin cambiar diseño, rutas o componentes JSX.

Los errores HTTP continúan como 400 de validación genérica sin repetir direcciones/passwords. Los duplicados continúan como 409 REGISTRATION_UNAVAILABLE; los fallos de login conservan el mismo mensaje genérico para usuario inexistente y contraseña incorrecta. JWT, bcrypt, cookies, CSRF y roles permanecen intactos.

El rechazo de Unicode externo que antes pudiera desaparecer mediante trim es un endurecimiento explícito exigido por la política ASCII aprobada. No se translitera ni se modifica una cuenta almacenada para hacerla cumplir.

## 5. Archivos modificados y creados

Solo se atribuyen aquí los cambios de Etapa 3.2; el workspace conserva cambios anteriores.

| Modificado | Alcance |
| --- | --- |
| backend/src/validators/auth.js | Utiliza el esquema central en registro y login |
| backend/src/services/authService.js | Canonicaliza entradas de registro/login, incluso llamadas directas |
| backend/src/repositories/authRepository.js | Canonicaliza lookup y registro antes de SQL |
| backend/scripts/promote-admin.js | Reutiliza validación central del argumento; no se ejecutó |
| src/domain/validation.js | Reutiliza la política pura ASCII en la validación de formularios |

| Creado | Propósito |
| --- | --- |
| backend/src/domain/emailPolicy.js | ASCII y normalización puras, reutilizables en navegador |
| backend/src/validators/email.js | Formato Zod central y función completa normalizeEmail |
| backend/src/db/emailAudit.js | Agregados de auditoría y comparaciones SELECT con fixtures |
| backend/scripts/audit-email-ascii-readonly.js | Entrada local restringida para auditoría de lectura |
| backend/tests/email-ascii.test.js | Contrato, repositorio, agregados y TiDB bloqueado |
| backend/tests/email-ascii-http.test.js | Flujo HTTP de registro/login con SQL simulado y errores |
| tests/emailAscii.test.mjs | Validación frontend coherente de casos ASCII/Unicode |
| docs/PROPUESTA_UNICIDAD_CORREO_MYSQL_TIDB.md | Diseño independiente, sin ejecución ni aprobación de DDL |
| docs/DESPLIEGUE_ETAPA_3_2_CORREO_ASCII.md | Este informe |

No se modificaron .env.local, backend/.env, lockfiles, dependencias, estructura MySQL, SQL 001–007, manifest MySQL, catálogo/preflight TiDB, resolvedor API ni configuración del proxy.

## 6. DECISIÓN SOBRE UNICIDAD DEL CORREO

**MySQL actual:** conservar la garantía del UNIQUE existente, sin cambiar collation ni crear un índice adicional. Todas las entradas de cuenta pasan ahora por una canonicalización explícita compartida; las direcciones válidas que difieren en capitalización llegan con la misma representación. El servicio conserva el tratamiento del error de duplicado de la base, que resuelve también carreras entre inserciones. La auditoría no encontró excepciones históricas que requieran remediación.

Esto no obliga a afirmar que igualdad binaria y as_ci sean universalmente equivalentes para todas las cadenas posibles. En particular, trim no reproduce la comparación de valores crudos NO PAD: dos valores históricos con espacios podrían convertirse en la misma clave. Se buscó ese problema y no existe en el snapshot local observado.

**TiDB:** la canonicalización de aplicación está resuelta, pero la unicidad equivalente entre motores **no está garantizada ni probada**. No hubo conexión TiDB ni pruebas negativas/concurrentes de su UNIQUE. El doble SQL usado por las pruebas no implementa las reglas lingüísticas de TiDB/MySQL.

La propuesta independiente evalúa primero reutilizar una sola columna canónica con semántica demostrada. Si no es posible justificarla, contempla una clave canónica binaria con UNIQUE y sus controles de consistencia. No se declara necesaria ni se implementa esa columna: requeriría otro diseño aprobado, grants, consultas y posible backfill. No basta cambiar a utf8mb4_bin o utf8mb4_0900_ai_ci.

La diferencia entre case-insensitivity/accent-sensitivity y comparación binaria está documentada por [MySQL](https://dev.mysql.com/doc/refman/8.0/en/charset-collation-names.html). El catálogo de [collations TiDB](https://docs.pingcap.com/tidb/stable/character-set-and-collation/) no sustituye una verificación real de la instancia ni demuestra equivalencia del dominio de valores.

## 7. Pruebas realizadas y comparación con Etapa 3.1

Entorno observado: Node 24.16.0 y npm 11.13.0. No se instalaron ni actualizaron paquetes.

| Verificación | Etapa 3.1 | Etapa 3.2 ejecutada |
| --- | --- | --- |
| Lint raíz | Aprobado | Aprobado, sin advertencias finales |
| Pruebas frontend | 22/22 | **23/23** |
| Pruebas backend | 58/58 | **66/66** |
| Build local | 2181 módulos | Aprobado, 2182 módulos, dist-local |
| check:local | Aprobado | Aprobado |
| git diff --check | Sin errores | Sin errores |
| Datos MySQL reales | No consultados | Auditoría local de lectura completada |
| TiDB remoto | Sin conexión | Sin conexión, sigue bloqueado |

Se añadieron 8 pruebas backend y 1 frontend. Cubren los casos solicitados y casos de Unicode que podrían convertirse a ASCII si se normalizasen en el orden incorrecto; formato Zod preservado para los fixtures ASCII; búsqueda canónica; rechazo antes de adquirir conexión; agregación sin PII; bloqueo de TiDB; registro/login reales de Express con repositorio SQL simulado; conflicto UNIQUE simulado; errores de login consistentes y protección de llamadas directas al servicio.

En el flujo HTTP offline se utiliza bcrypt/JWT reales con cuentas solo en memoria del doble, no usuarios de MySQL. No se ejecuta CREATE USER ni se cambia ningún rol real. Las 58 pruebas anteriores continúan pasando, incluidas configuración MySQL/TLS, transacciones, hashes, cookies, CSRF y roles.

Los comandos ejecutados fueron npm run lint, npm test en raíz y backend, npm run build:local, npm run check:local, el auditor local de lectura y git diff --check. No se ejecutó el build productivo con URLs inventadas.

Los runners encontraron inicialmente spawn EPERM dentro del sandbox y se reejecutaron autorizados fuera de él. Una advertencia de lint sobre el rango de controles en una regex ASCII se corrigió usando comprobación de puntos de código; lint final quedó limpio. No hubo fallos funcionales pendientes en las ejecuciones finales.

## 8. Preservación y límites

Se compararon en memoria las huellas iniciales y finales de 13 archivos protegidos: .env.local, backend/.env, dos lockfiles, manifests MySQL/TiDB y siete migraciones históricas. **Todos permanecieron idénticos.** No se muestran huellas de archivos privados. El catálogo TiDB mantiene status=blocked y cero migraciones; las pruebas existentes de preflight/collation no se debilitaron.

MySQL conserva configuración, collation, UNIQUE, estructura, datos, credenciales y roles. El único cambio funcional de entrada es hacer explícito el contrato ASCII aprobado, con la misma normalización de correos ASCII aceptados. Los datos locales no requirieron corrección y no se tocaron.

No se probó login contra cuentas MySQL reales, inserción real de duplicados, concurrencia de escritura ni comportamiento TiDB. No se auditó el contenido de password_hash, tokens u otros datos sensibles. Los resultados de una cuenta no describen bases futuras ni dispensan de reauditar antes de trasladar datos.

La auditoría detecta colisiones para revisión, pero no repara ni bloquea automáticamente escrituras SQL de otros operadores. Cualquier dato no canónico incorporado fuera de la API debe revisarse antes de una futura migración. No se añade un backfill silencioso ni una estrategia que omita la restricción de base.

## 9. Recomendación para la siguiente etapa

Revisar la propuesta independiente y acordar el criterio de igualdad verificable del destino. Si se autoriza posteriormente observar TiDB, hacerlo primero en solo lectura y comprobar versión, collations, padding, CHECK/FK, variables, permisos y metadatos. Sin esa evidencia no aprobar una collation alternativa, un catálogo ejecutable ni runtime.

Si llegara a necesitarse una clave/índice nuevo, presentar el cambio de esquema y su tratamiento de datos como otra aprobación explícita. No alterar las migraciones MySQL históricas; cualquier SQL TiDB futuro tendrá identidad e historial propios.

La autorización para política ASCII **no autoriza** crear TiDB, conectar remotamente, ejecutar migraciones ni desplegar Render/Vercel. Esta etapa se detiene aquí, con datos locales auditados, contrato implementado/pruebas aprobadas y la compatibilidad de unicidad TiDB expresamente pendiente.
