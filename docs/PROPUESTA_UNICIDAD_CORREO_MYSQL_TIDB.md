# Propuesta independiente: unicidad del correo canónico ASCII

Estado: **documentación para revisión; ningún cambio de esquema aprobado o ejecutado**. Etapa 3.2, 16 de noviembre de 2026.

## Decisión vigente

Conservar MySQL, `usuarios.email`, su collation `utf8mb4_0900_as_ci` y `uq_usuarios_email` sin modificaciones. Aplicar la política ASCII aprobada en los límites de entrada, con una representación canónica única en la aplicación. Mantener TiDB bloqueado.

No se ha demostrado que haga falta otra columna o índice en MySQL para la aplicación actual. El índice UNIQUE existente continúa arbitrando inserciones concurrentes; no se reemplaza por una comprobación SELECT previa en Node.

## Definición del contrato

Para una entrada x:

1. Exigir string y que todos los caracteres **originales** estén entre U+0000 y U+007F.
2. Obtener c(x) mediante trim y conversión a minúsculas, independientes de locale.
3. Exigir longitud máxima 254 y el formato del validador Zod que ya utiliza el proyecto. Los controles internos ASCII no quedan aceptados por el mero hecho de pertenecer al rango: deben pasar el formato.
4. Rechazar antes de consultar/insertar si falla una condición. No transliterar, eliminar acentos, convertir IDN Unicode a punycode ni normalizar caracteres de ancho completo.

La equivalencia deseada para entradas válidas es **c(x) = c(y), byte a byte**. El case-insensitivity de una collation no sustituye la canonicalización de todas las entradas.

El índice actual usa comparación Unicode sensible a acentos e insensible a case, no igualdad binaria general. [MySQL: nombres de collations](https://dev.mysql.com/doc/refman/8.0/en/charset-collation-names.html). Diferencias de padding pueden cambiar qué valores colisionan. [MySQL: collations binarias y padding](https://dev.mysql.com/doc/refman/8.0/en/charset-binary-collations.html).

## Evidencia disponible

La auditoría local de MySQL 8.0.46 encontró una cuenta, sin anomalías ASCII/normalización ni grupos duplicados. El índice es UNIQUE sobre la columna completa email, sin prefijo. La collation real es la histórica y su padding es NO PAD. No se alteraron filas.

Las comparaciones SELECT con fixtures muestran que mayúsculas y minúsculas coinciden en esa collation; los espacios externos/finales sí distinguen cadenas crudas, aunque trim las lleva a la misma clave. También muestran que una letra de ancho completo puede comparar igual que ASCII en MySQL, aun cuando la política rechaza ese input antes de consultarlo. Esta es una razón para no extrapolar equivalencia Unicode desde un contrato ASCII.

Las pruebas offline demuestran canonicalización, uso de la misma clave en registro/búsqueda/login, rechazo antes de SQL y traducción de ER_DUP_ENTRY a conflicto. El doble de UNIQUE de las pruebas es una especificación del comportamiento deseado, no una implementación de collations ni una certificación de TiDB.

**No existe evidencia de ejecución sobre TiDB.** Una matriz finita de SELECT en MySQL tampoco demuestra que cualquier par posible de correos ASCII bajo ambas collations compare igual. La ausencia de colisiones en una cuenta no constituye esa prueba.

## Alternativa A: conservar una sola columna canónica

Evaluar primero si una collation disponible en TiDB ofrece exactamente las reglas necesarias para el dominio de correos válidos/canónicos, incluyendo espacios y puntuación. Su catálogo documentado no contiene `utf8mb4_0900_as_ci`; no basta escoger otra por nombre parecido. [Collations TiDB](https://docs.pingcap.com/tidb/stable/character-set-and-collation/).

Para justificar reutilizar email y un UNIQUE sobre ella en el futuro bootstrap TiDB se necesita:

- Observar collations, atributos de padding y versión real mediante conexión autorizada de solo lectura.
- Definir cómo impedir entradas SQL externas que incumplan la canonicalización, además de validar la API.
- Comparar case, cada clase de puntuación admitida por Zod, etiquetas de dominio, límites de longitud, espacios y equivalencias relevantes; estudiar también colisiones que la collation pueda introducir entre dos claves canónicas distintas.
- Auditar de nuevo cualquier dataset que se vaya a trasladar. Sin canonicalizarlo automáticamente, resolver excepciones por un procedimiento aprobado.
- Verificar en un esquema aislado autorizado que el UNIQUE es efectivo y atómico bajo inserciones concurrentes. Esto requerirá autorización de escritura posterior, no está ejecutado aquí.

Si esa equivalencia no puede justificarse, no declarar esta alternativa compatible. No debilitar el preflight ni retirar UNIQUE para aceptar un bootstrap.

## Alternativa B: clave canónica binaria independiente

Si la alternativa A no permite una garantía suficiente, evaluar una representación persistida de c(x) mediante una clave de longitud variable con igualdad binaria y UNIQUE, separada del valor de email presentado. VARBINARY de capacidad suficiente es una posibilidad a investigar; evitar padding de longitud fija y hashes truncados como sustituto de igualdad exacta.

Ventaja: para claves ASCII ya canonicalizadas, el objetivo de igualdad sería independiente de reglas lingüísticas. No equivale a preservar la collation histórica sobre valores fuera del contrato ni garantiza por sí solo que la clave y el email permanezcan sincronizados.

Impactos que requieren otra aprobación:

- Nueva columna/índice, DML de backfill si hubiese datos y controles de consistencia que ambos motores puedan aplicar.
- Consultas de lookup y registro que escriban/busquen la misma representación; no basta añadir el índice sin cambiar la ruta de datos.
- Revisión de grants por columna, límites, escrituras ajenas a la API y recuperación de un backfill parcial.
- Tratamiento explícito de cuentas históricas no canónicas y colisiones, sin sobrescribir, fusionar o eliminar usuarios automáticamente.
- Catálogo TiDB propio con hashes del SQL realmente ejecutado y trazabilidad; no editar 001–007 ni fingir ejecuciones en ningún ledger.

No se demuestra todavía que esta alternativa sea necesaria; se documenta como opción más explícita si no se puede probar A. No se añade un índice extra a MySQL preventivamente.

## Criterio de aceptación posterior

La decisión debe declarar qué pares válidos son iguales, cómo se materializa esa igualdad, quién puede insertar valores fuera del contrato y qué pruebas de motor verificaron UNIQUE/concurrencia. Debe separar evidencia MySQL, evidencia TiDB y expectativas offline. Mientras falten esas piezas, no aprobar TiDB ni afirmar equivalencia entre motores.

Esta propuesta no autoriza conexión remota, DDL, migraciones ni cambios de datos. El resultado ejecutado de Etapa 3.2 está en [el informe](DESPLIEGUE_ETAPA_3_2_CORREO_ASCII.md).
