# Catálogo TiDB preparado — Etapa 3.9

`manifest.json` está `ready`: código preparado, sin afirmar ejecución remota. Contiene siete versiones independientes en `migrations/`, SHA-256 de cada SQL normalizado (sin BOM, CRLF a LF), fuente MySQL y huella original. El bootstrap `ledger.sql` también tiene hash. MySQL 001–007 y su manifest permanecen intactos.

002 adapta email: VARCHAR(254), NOT NULL, `utf8mb4_0900_bin`, UNIQUE completo y `ck_usuarios_email_canonical` derivado de 3.6.1. TiDB espera 21 CHECK y 18 FK. Se conservan seeds de roles, planes y catálogo. No se adopta el probe ni se copian sus filas.

La migración requiere autorización separada sobre `otakuzone_db`. No forma parte del build/start HTTP. Migrador y runtime rechazan el ledger MySQL en ese destino.

## Recuperación de DDL parcial

El ledger `schema_migrations_tidb` registra `applying` antes de cada versión y `applied` solo al terminar. 003/004 usan transacción para seed y cierre de entrada; el marcador inicial persiste si fallan. Estados applying, huecos, checksums distintos o tablas sin historial detienen nuevos intentos.

CREATE DATABASE y bootstrap idempotentes preceden a los marcadores. DDL no es atómico con el ledger: 006 puede dejar ALTER sin backfill completo y 007 una tabla sin cierre de historial. No reintentar a ciegas. Conservar evidencia redactada, comparar objetos y datos con SQL/hashes y preparar reparación/restauración autorizada. No borrar tablas, editar checksums o fabricar aplicaciones para ocultar fallos.

Runtime exige siete versiones aplicadas y el contrato real; ready no basta. Véase el [informe de implementación 3.9 y cierre documental 3.9.1](../../../docs/DESPLIEGUE_ETAPA_3_9_IMPLEMENTACION_TIDB_PROXY.md).

