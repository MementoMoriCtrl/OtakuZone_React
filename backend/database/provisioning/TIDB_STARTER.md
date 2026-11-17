# Provisioning futuro de TiDB Starter — documentación, sin ejecución

No ejecutar los SQL locales de esta carpeta contra TiDB. Contienen hosts locales,
RANDOM PASSWORD y grants cuyo soporte no está certificado para una instancia.
No usar la cuenta root como runtime. No se crea aquí una cuenta ni contraseña.

Separar:

- Operador inicial: alta de identidades/grants solo cuando se autorice; no es la
  identidad de Express. No presupone privilegios administrativos de MySQL local.
- Migrador: CREATE/ALTER/INDEX/REFERENCES del esquema acordado y SELECT/INSERT del
  ledger propio TiDB; DML de seeds/backfill autorizado. Sin administración global.
- Runtime: los grants granulares descritos en `separate-users.reviewed.sql`
  representan el objetivo funcional, no SQL certificado TiDB. SELECT de tablas
  usadas; INSERT de registro, sesiones, productos/inventario, carrito, pedidos y
  historiales; UPDATE de campos de perfil, revocación, catálogo, inventario y
  estado/planes; DELETE únicamente de detalles_carrito. Sin DDL, CREATE USER,
  GRANT OPTION, UPDATE rol_id/email/password_hash, escritura de roles ni ledger.
- Mantenimiento: identidad aparte para limpieza/conciliación expresamente
  autorizada. No ampliar los permisos normales de Express por esta tarea.

El nombre SQL debe incluir el prefijo real de instancia. La validación local
conserva máximo 32 caracteres completos: escoger un sufijo corto o revisar con
evidencia el límite, nunca truncar ni inventar un prefijo. El panel Connect será
la fuente de host/puerto/usuario y TLS; DB_SSL_CA recibe contenido PEM si hiciera
falta, no una ruta. No poner credenciales en documentación, comandos, chat o Git.

Antes de conceder permisos, comprobar versión y soporte de grants por columna
(documentado desde TiDB 8.5.6), cuenta efectiva y roles heredados, y revisar
SHOW GRANTS. Esta etapa NO interpreta SHOW GRANTS ni certifica permisos remotos.
No asumir RANDOM PASSWORD. Si no se puede mantener el mínimo por columna, no
ampliar silenciosamente a tablas: informar y acordar el riesgo/diseño antes.

Probar en un ensayo autorizado que runtime puede realizar cada operación
necesaria y no puede administrar usuarios, modificar roles/password existentes,
ejecutar DDL ni escribir el ledger. Las pruebas offline del repositorio verifican
la especificación local; no prueban la política real del servicio.

Fuentes: [prefijo](https://docs.pingcap.com/tidbcloud/select-cluster-tier/#user-name-prefix),
[privilegios por columna](https://docs.pingcap.com/tidb/stable/column-privilege-management/).
