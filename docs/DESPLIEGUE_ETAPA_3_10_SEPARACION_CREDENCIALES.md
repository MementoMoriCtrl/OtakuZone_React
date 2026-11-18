# OtakuZone — Etapa 3.10: separación de credenciales de migración y runtime

Fecha: **16 de noviembre de 2026**. Alcance: implementación y pruebas locales. **No hubo conexiones SQL, migraciones ni operaciones remotas.**

## 1. Resultado y archivos

El cargador de configuración distingue dos contextos explícitos. Express mantiene el contexto runtime por defecto; únicamente la entrada oficial del migrador solicita migration. Una cuenta TiDB prefijada con sufijo `.root` puede superar la validación del migrador, conservando las demás protecciones. Esto no certifica credenciales, permisos ni conectividad reales.

| Archivo | Cambio de esta etapa |
| --- | --- |
| `backend/src/config/database.js` | Segundo argumento de opciones con contexto runtime predeterminado; valida contexto y separa la excepción administrativa TiDB |
| `backend/scripts/migrate.js` | Llama a `loadDatabaseConfig(process.env, { context: 'migration' })` |
| `backend/tests/database-context.test.js` | Siete pruebas nuevas de aislamiento, credenciales, TLS/destino y preservación MySQL |
| Este informe | Diseño, resultados, riesgos y procedimiento previsto |

Se inspeccionaron consumidores del cargador, `config/env.js`, servidor, pool/TLS, migrador, catálogo/preflight, pruebas existentes y documentación de despliegue. No fue necesario modificar pool, migraciones, manifests, hashes, ledger SQL o guardias del migrador. El workspace conserva cambios de etapas anteriores que no se atribuyen a esta entrega.

## 2. Diseño de contextos

Firma actual: `loadDatabaseConfig(environment = process.env, { context = 'runtime' } = {})`. Contextos desconocidos fallan; el contexto se proporciona como argumento del programa, no se lee de environment, no es estado global y no se incluye en el objeto de configuración devuelto.

| Caso | Resultado |
| --- | --- |
| TiDB runtime, sufijo root en cualquier combinación de mayúsculas | Rechazado, también con NODE_ENV=production |
| TiDB migration, prefijo.root válido | Admitido por configuración; todavía requiere todas las comprobaciones de conexión/migración |
| TiDB migration, usuario ordinario válido | Conserva admisión y validaciones existentes |
| TiDB, sin prefijo, varios puntos, espacios, vacío o longitud superior a 32 | Rechazado en ambos contextos |
| Contraseña vacía | Rechazada en ambos contextos |
| MySQL migration, usuario terminado en `.root` | Rechazado: la excepción de ese sufijo es exclusiva de TiDB |
| MySQL local, contexto predeterminado | Comportamiento anterior conservado, incluido usuario local `root` |

La regla nueva para `.root` en contexto migration/MySQL es intencionada y exigida por el alcance. No se impone retrospectivamente la política de nombres TiDB a runtime MySQL, ni se prohíbe su usuario local `root` sin prefijo. No cambia el motor MySQL predeterminado local.

`config/env.js` sigue llamando a `loadDatabaseConfig(environment)` y server.js sigue usando ese cargador HTTP. No se propaga la excepción después de una llamada migration. Variables como DB_CONTEXT, DB_ALLOW_ROOT, ALLOW_ROOT o context dentro del entorno no seleccionan el contexto; no se añadió ningún interruptor de entorno.

Solo `scripts/migrate.js` solicita migration en el código de aplicación/operación actual. Otros scripts mantienen runtime. La separación es una protección contra selección accidental de credenciales; no es una frontera de seguridad frente a quien pueda modificar el programa o construir manualmente configuraciones.

## 3. Protecciones conservadas

Para TiDB se mantienen formato completo prefijo.sufijo y máximo 32 caracteres, contraseña obligatoria, motor admitido, hostname explícito no IP/localhost, puerto/nombre válidos, TLS obligatorio y pool acotado. La opción TLS conserva rejectUnauthorized=true y CA PEM opcional. No se introduce fallback.

El migrador conserva destino exacto otakuzone_db antes de conectar, lectura del catálogo por dialecto, validación de hashes de SQL/bootstrap/procedencia, identificación de TiDB y preflight, lock, ledger schema_migrations_tidb independiente, rechazo de historial MySQL, continuidad y detección de applying/DDL parcial. El contexto no altera esas comprobaciones.

La preparación UTC de sesión sigue ocurriendo antes del preflight bootstrap; no se cambia ninguna variable global. No se añadieron migraciones automáticas a build/start ni se alteró configuración Render/Vercel.

## 4. Pruebas y resultados reales

Comando ejecutado desde raíz:

```text
node --test backend/tests/database-context.test.js backend/tests/database-unit.test.js backend/tests/production-config.test.js backend/tests/tidb-pool.test.js backend/tests/tidb-migrations.test.js backend/tests/tidb-ready.test.js backend/tests/tidb-preflight.test.js
```

**39/39 aprobadas**, incluidas las siete nuevas. Verifican rechazo runtime normal/productivo y variaciones de case; admisión migration TiDB; rechazo `.root` en migration MySQL; usuarios/contraseñas/contextos inválidos; ausencia de propagación al cargador HTTP; imposibilidad de activación mediante variables de entorno; TLS/host/puerto/motor/nombre y destino; preservación local MySQL.

Las regresiones existentes cubren hashes/procedencia y mezcla de dialectos, preflight, ledger parcial/discontinuo, marcadores antes de DDL, transacciones con dobles, retiro del pool, errores redactados y configuración productiva. La prueba del destino incorrecto usa una factoría espía y demuestra rechazo antes de conectar. Las pruebas de migración utilizan dobles: no ejecutan SQL contra servidores ni ejecutan la entrada db:migrate. Los casos HTTP solo levantan servidores temporales locales con repositorios/dobles.

El primer intento no pudo iniciar los procesos del runner por spawn EPERM del sandbox. Se reejecutó con autorización fuera del sandbox y pasó. No se interpreta ese bloqueo del runner como fallo funcional ni queda una prueba fallida en la ejecución final.

`npm run lint` desde raíz: **aprobado**. No se ejecutaron instalaciones, builds frontend o matrices exploratorias de correo, porque no corresponden a estos cambios. Los valores de credenciales en las pruebas son exclusivamente fixtures sintéticos, no contraseñas reales ni secretos del proyecto.

## 5. Procedimiento previsto para la migración inicial — no ejecutado

1. Obtener autorización expresa para la operación remota y confirmar destino vacío otakuzone_db. No utilizar otakuzone_email_probe ni MySQL local.
2. Preferir una identidad SQL dedicada; si se autoriza la cuenta administrativa prefijo.root, usarla solo en el proceso local del migrador. La identidad proxy del SQL Editor no sustituye credenciales SQL externas.
3. Proporcionar variables de proceso de PowerShell sin editar .env: NODE_ENV=production, DB_ENGINE=tidb, DB_NAME=otakuzone_db, host/puerto reales, usuario y contraseña por canal privado, DB_SSL=true y contenido PEM en DB_SSL_CA cuando corresponda. Conservar las demás validaciones del cargador. No introducir credenciales en la línea de comandos o logs.
4. Tras autorización, utilizar la entrada oficial `npm --prefix backend run db:migrate` desde raíz. Esa entrada selecciona migration; no es necesario definir una variable de contexto. **No ejecutar este comando como parte de esta etapa.**
5. Si falla preflight, permisos, lock o aplicación, detenerse y revisar el diagnóstico redactado. No cambiar hashes, fabricar historial o reintentar DDL parcial automáticamente.
6. Verificar después, con alcance autorizado separado, ledger, estructura y runtime con una credencial no administrativa. No trasladar la credencial .root a Express/Render.

## 6. Riesgos y límites

Permitir `.root` en configuración no reduce sus privilegios reales. Una cuenta administrativa puede tener alcance mayor que otakuzone_db; custodiarla, limitar su uso y no compartirla con HTTP. El código no audita exhaustivamente SHOW GRANTS. Nombre válido no significa autorización mínima ni contraseña correcta.

DDL y ledger no son atómicos en conjunto; una interrupción o commit de resultado incierto requiere conciliación. Las pruebas locales no prueban TLS real, grants, acceso de red, versión o formato real de metadatos CHECK en TiDB. Las protecciones conservadas deben poder fallar ante una garantía ausente; no se relajaron para facilitar conexión.

## 7. Preservación y cierre

Se mantienen MySQL, SQL TiDB 001–007, manifests/hashes, definiciones de schema_migrations/schema_migrations_tidb, .env, dependencias, autenticación, JWT, cookies, CSRF y autorización. No se generaron ni guardaron credenciales reales. No se ejecutaron db:migrate, SQL, conexiones MySQL/TiDB, cambios de usuarios/permisos, despliegues o commits.

Implementación local completada y pruebas pertinentes aprobadas. Se detiene el trabajo; toda conexión o migración remota requiere autorización expresa posterior.
