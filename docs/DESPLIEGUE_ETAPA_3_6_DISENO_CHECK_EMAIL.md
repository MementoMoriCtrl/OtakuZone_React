# OtakuZone — Etapa 3.6: diseño y validación teórica del CHECK de email

Fecha: **16 de noviembre de 2026**. Alcance: inspección, investigación oficial y análisis JavaScript offline. **No se ejecutó SQL ni se abrió una conexión de base de datos.** Único archivo creado: este informe.

## 1. Dictamen y evidencia disponible

**Existe una candidata justificada por derivación del validador real; NO está certificada como CHECK ejecutable en TiDB 8.5.3-serverless.** Se presenta expresión y DDL condicional para revisión, sin autorizar su ejecución ni habilitar TiDB. La equivalencia de lenguaje puede razonarse bajo las premisas descritas; admisión del DDL, implementación del motor y enforcement requieren validación posterior autorizada.

El usuario informa evidencia real de `8.0.11-TiDB-v8.5.3-serverless`, disponibilidad de `utf8mb4_0900_bin` NO PAD, CHECK habilitado, modo pesimista y denegación de acceso a `mysql.tidb`. También informa resultados 0 para comparar User/user y user/user-espacio. Si son resultados del operador `=`, significan que las cadenas son distintas, coherente con la candidata; no interpretar un 0 de STRCMP como lo mismo. No se recibieron aquí los textos completos de esas consultas ni se reprodujeron.

La denegación de `mysql.tidb` se conserva como limitación del servicio: no intentar ampliar permisos ni cambiar el framework. La evidencia funcional y los metadatos permitidos deberán documentar las garantías accesibles. Esta etapa no sustituye por una suposición la información que no pudo observarse.

## 2. Política real del backend

Archivos inspeccionados: `backend/src/domain/emailPolicy.js`, `backend/src/validators/email.js`, dependencia instalada `backend/node_modules/zod/v4/core/regexes.js` y versión fijada en `backend/package.json` (**Zod 4.6.7**).

Orden efectivo:

1. Exigir string y que todos los caracteres **originales** sean ASCII U+0000–U+007F.
2. Aplicar `trim()` JavaScript y `toLowerCase()` sin locale.
3. Exigir longitud máxima 254 y el formato `.email()` instalado.

Patrón real leído de Zod, no inventado:

```javascript
/^(?:[A-Za-z0-9_'+\-]+\.)*[A-Za-z0-9_'+\-]*[A-Za-z0-9_+-]@(?:[A-Za-z0-9][A-Za-z0-9\-]*\.)+[A-Za-z]{2,}$/
```

El formato permite punto separador, guion, `_`, apóstrofo y `+` en parte local según posición. No admite punto inicial/final ni puntos consecutivos; tampoco apóstrofo final. Dominio sin `_`, con etiquetas que empiezan con alfanumérico y pueden terminar con guion antes del punto; TLD de letras, mínimo dos. No impone por separado límites 64/63 de parte local/etiqueta. No endurecer estas particularidades como si fueran requisitos actuales.

**Aceptar una entrada no equivale a poder almacenarla cruda.** Por ejemplo, la API acepta ` USER@example.com ` y devuelve `user@example.com`. El CHECK debe rechazar el primero como valor de columna, permitiendo almacenar el segundo.

Objetivo de almacenamiento, conservado desde 3.4:

`S(v) := normalizeEmail(v) tiene éxito y su resultado es exactamente v, byte a byte`.

Un CHECK no transforma filas ni reproduce trim como efecto de escritura. Comprueba que el valor ya es un punto fijo válido del normalizador. No puede comprobar cuál era una entrada original antes de que un cliente la transformase o el protocolo la convirtiese; esa primera barrera sigue siendo responsabilidad del backend para las solicitudes API.

## 3. Investigación de TiDB: expresiones y límites

Fuentes consultadas el **2026-11-16**:

| Fuente oficial | Versión y aportación | Límite de evidencia |
| --- | --- | --- |
| [PingCAP Constraints](https://docs.pingcap.com/tidb/stable/constraints/) | Selector v8.5; CHECK booleano, NULL/UNKNOWN, ENFORCED y sintaxis de tabla | No ofrece en esa página una lista exhaustiva de funciones permitidas dentro de CHECK para el parche 8.5.3 |
| [PingCAP String Functions](https://docs.pingcap.com/tidb/stable/string-functions/#regular-expression-compatibility-with-mysql) | Selector v8.5; REGEXP_LIKE, flags y diferencias de regex/tipos | Soporte en consultas no demuestra admisión dentro de CHECK |
| [RE2 Syntax](https://github.com/google/re2/wiki/Syntax) | Referencia del motor enlazada por PingCAP | No es el motor JavaScript ni certifica la compilación serverless |
| [Código PingCAP constraint.go](https://github.com/pingcap/tidb/blob/v8.5.3/pkg/ddl/constraint.go) | Tag exacto v8.5.3; metadatos de expresión/Enforced y validación de filas existentes | No identifica por sí solo toda la validación de funciones ni la build administrada |

Las rutas documentales `/v8.5/` consultadas pueden redirigir a stable; esa documentación incluye parches posteriores y **no debe confundirse con una especificación congelada de 8.5.3**. Se inspeccionó además código público etiquetado v8.5.3; no se obtuvo una prueba concluyente de admisión específica de REGEXP_LIKE dentro de CHECK de la build serverless. No se usa una lista de funciones de columnas generadas como si fuera una lista autorizada de CHECK.

TiDB documenta CHECK como expresión booleana: FALSE rechaza y UNKNOWN puede pasar. NOT NULL debe cerrar ese caso. Se documentan CREATE TABLE/ALTER TABLE para restricciones; ciertas formas de añadir columna con CHECK pueden ignorar el CHECK. Por eso el DDL propuesto usa restricción de tabla en CREATE TABLE, sin que esto demuestre su ejecución. [Constraints](https://docs.pingcap.com/tidb/stable/constraints/).

TiDB documenta regex RE2, frente a ICU de MySQL; REGEXP_LIKE admite `c` para case-sensitive. Prohíbe argumentos de tipo cadena binaria en estas funciones. **No convertir email a BINARY para pasarlo a REGEXP_LIKE**: una collation binaria sobre VARCHAR no es el tipo BINARY. [String Functions](https://docs.pingcap.com/tidb/stable/string-functions/#regular-expression-compatibility-with-mysql).

RE2 admite grupos, clases, cuantificadores y anclas usados aquí. Sin modo multiline, su `$` corresponde al final del texto; no requiere lookahead o backreferences. La candidata usa además un guardia que rechaza cualquier carácter fuera del alfabeto permitido, incluyendo saltos finales. [RE2 Syntax](https://github.com/google/re2/wiki/Syntax).

| Elemento | Justificación | Estado dentro del CHECK específico |
| --- | --- | --- |
| IS NOT NULL, AND, NOT, BETWEEN | Composición booleana sin acceso a otras tablas/estado externo | Diseño consistente con CHECK booleano; falta parser/DDL real |
| OCTET_LENGTH(email) | Longitud de bytes, adecuada para ASCII permitido | Función SQL documentada; falta admisión dentro de esta restricción |
| REGEXP_LIKE(texto, patrón constante, 'c') | Lenguaje y flags documentados; sin casts binarios | Candidata, no certificada dentro de CHECK 8.5.3-serverless |
| LOWER/TRIM | No se necesitan si solo se acepta el lenguaje ya canónico | Excluidos de la candidata; no se presume equivalencia JavaScript/SQL |
| BINARY/casts, UDF, variables, subconsultas | Innecesarios para este diseño | No usados; no afirmar que «determinista» implique «permitido» |

## 4. Expresión candidata y derivación

**Propuesta condicional, para revisión; no ejecutar.** Se conserva la gramática instalada, sustituyendo A–Z por a–z porque el almacenamiento exige canonicalización. Los puntos literales se escriben `[.]`, los guiones al final de clases y los apóstrofos se duplican como escape SQL. Se cambian grupos no capturantes a capturantes sin alterar el lenguaje, pues no se consumen capturas.

```sql
CHECK (
  email IS NOT NULL
  AND OCTET_LENGTH(email) BETWEEN 1 AND 254
  AND NOT REGEXP_LIKE(email, '[^a-z0-9_''+@.-]', 'c')
  AND REGEXP_LIKE(
    email,
    '^([a-z0-9_''+-]+[.])*[a-z0-9_''+-]*[a-z0-9_+-]@([a-z0-9][a-z0-9-]*[.])+[a-z]{2,}$',
    'c'
  )
) ENFORCED
```

No hay barras inversas en los literales SQL: no depende de duplicar escapes para `NO_BACKSLASH_ESCAPES`. No usar comillas dobles para delimitarlos, ni sustituir `'c'` por `'i'`/`'m'`. El guardia permite exclusivamente letras ASCII minúsculas, dígitos, `_`, apóstrofo, `+`, `@`, punto y guion; el segundo patrón impone las posiciones. Que el guardia admita `@` no permite varios: la gramática completa los rechaza.

### Razonamiento de equivalencia, condicionado a la semántica documentada

- **S(v) ⇒ candidata:** un valor idéntico a su salida válida carece de mayúsculas y espacios externos; el formato Zod elimina además espacios/controles internos y solo usa el alfabeto ASCII citado. Su UTF-8 ocupa un byte por carácter y no supera 254. La gramática minúscula mantiene las mismas posiciones que Zod.
- **Candidata ⇒ S(v):** los caracteres permitidos son ASCII minúsculo sin blancos/controles. Por tanto trim/minúsculas no cambian v. La gramática deriva del patrón instalado; formato y máximo se satisfacen. No se necesita reproducir reglas Unicode de LOWER ni de trim.

Esto es una **demostración de diseño bajo premisas**, no de equivalencia ejecutada entre JavaScript y TiDB. Depende de matching exacto, flags efectivos, admisión en CHECK, encoding sin sustitución y enforcement. Un corpus finito no prueba esas premisas del servidor.

IS NOT NULL produce FALSE para NULL aunque otras partes resulten UNKNOWN; la columna seguirá siendo NOT NULL. Cadena vacía falla por longitud/gramática; no se declara válido por pertenecer trivialmente al alfabeto. El mínimo funcional del correo viene de la gramática: no se añade otro límite de producto.

## 5. Matriz de casos

`e=example.com`. Las abreviaturas deben expandirse; `L(n)` son n letras a. «CHECK esperado» se refiere al valor **crudo de columna**, no a su versión transformada por la API. Todos los datos son sintéticos.

| Entrada original | Backend | CHECK esperado si se almacena cruda | Motivo |
| --- | --- | --- | --- |
| `user@e` | Acepta, igual | Acepta | Canónico |
| `USER@e` | Acepta → minúsculas | Rechaza | No es punto fijo |
| ` user@e ` | Acepta → sin espacios | Rechaza | No almacenar blancos externos |
| `user@e\n`, TAB/CR/LF externos | Acepta tras trim ASCII | Rechaza | Guardia excluye controles |
| Espacio/control ASCII interno, NUL o DEL | Rechaza | Rechaza | Formato/alfabeto |
| `a.b@e` / `ab@e` | Ambas válidas, distintas | Ambas aceptadas | Punto no se elimina |
| `a-b@e`, `a_b@e`, `a+b@e` | Acepta y conserva | Acepta | Puntuación admitida |
| `a'b@e` | Acepta | Acepta | Apóstrofo interior |
| `ab'@e` | Rechaza | Rechaza | Apóstrofo final excluido |
| `.ab@e`, `ab.@e`, `a..b@e` | Rechaza | Rechaza | Segmentos no vacíos |
| `a!b@e`, comillas, barra inversa | Rechaza | Rechaza | No admitidos por Zod instalado |
| `user@a-b.example` | Acepta | Acepta | Etiqueta con guion |
| `user@a-.example` | Acepta actualmente | Acepta | No endurecer el validador |
| `user@a_b.example`, `user@-a.example` | Rechaza | Rechaza | Dominio inválido para el patrón |
| `user@xn--bcher-kva.de` | Acepta | Acepta | Punycode ASCII literal, sin validación IDNA nueva |
| Punycode con mayúsculas | Acepta → minúsculas | Rechaza | Clave canónica debe ser minúscula |
| é, e + acento combinado, ancho completo, Kelvin, NBSP externo | Rechaza original | Rechaza | No convertir/transliterar Unicode |
| NULL/no string | Rechaza | NULL rechazado; tipos SQL distintos requieren análisis de conversión | CHECK recibe valor convertido al tipo de columna |
| Cadena vacía | Rechaza | Rechaza | Longitud/formato |
| `a@b.co` | Acepta | Acepta | Límite inferior derivado del patrón |
| `L(242)@example.com` | Acepta: 254 | Acepta | Máximo global |
| `L(243)@example.com` | Rechaza: 255 | Debe rechazarse sin truncar | Tipo/modo estricto antes de CHECK también importan |
| Parte local 65 o etiqueta 64, con total válido | Acepta si pasa patrón | Acepta | No imponer límites nuevos |

### Validación offline efectuada

Se ejecutó el normalizador real y un modelo **JavaScript** de los componentes de la candidata: alfabeto, gramática minúscula y longitud UTF-8. Corpus: veinte casos base, más inserción de cada uno de los 128 caracteres ASCII en las veinte posiciones de `a.b+tag@example.com`. Total **2.580 casos; cero discrepancias** entre el modelo y `normalizeEmail(v) === v`.

No se ejecutó RE2, parser SQL, DDL, CHECK ni UNIQUE. Los datos no se guardaron y no se crearon tests/scripts. El modelo reutiliza regex JavaScript para contrastar la derivación; **no constituye una emulación de TiDB** ni una prueba exhaustiva del lenguaje. Las expectativas de la tabla se basan en código y razonamiento, no en resultados SQL de esta etapa.

## 6. DDL propuesto para revisión

**Borrador condicional de una única tabla aislada, no migración ni esquema real. NO EJECUTAR hasta validar la admisión del CHECK y obtener autorización específica de ensayo.** Se utiliza el nombre propuesto en 3.5; no se crea la base ni se incluye USE/DDL contra usuarios reales.

```sql
CREATE TABLE otakuzone_email_probe.usuarios_probe (
  id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
  email VARCHAR(254)
    CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin NOT NULL,
  UNIQUE KEY uq_probe_email (email),
  CONSTRAINT ck_probe_email_canonical CHECK (
    email IS NOT NULL
    AND OCTET_LENGTH(email) BETWEEN 1 AND 254
    AND NOT REGEXP_LIKE(email, '[^a-z0-9_''+@.-]', 'c')
    AND REGEXP_LIKE(
      email,
      '^([a-z0-9_''+-]+[.])*[a-z0-9_''+-]*[a-z0-9_+-]@([a-z0-9][a-z0-9-]*[.])+[a-z]{2,}$',
      'c'
    )
  ) ENFORCED
);
```

Sin IF NOT EXISTS: no adoptar una tabla previa como ensayo válido. Antes de cualquier ejecución futura revisar inexistencia del destino, permisos, sql_mode, encoding, cuota y recuperación/limpieza autorizada. No hay AUTO_INCREMENT para evitar introducir referencias a esa columna en CHECK; IDs serán fixtures distintos. No se añaden roles, contraseñas, sesiones reales ni ledger.

Este bloque es **candidato pendiente**, no DDL certificado para Starter. Si una función se rechaza o una restricción no queda efectiva, detenerse; no omitir el CHECK para hacer funcionar la aplicación. La autorización de diseño A no autoriza este CREATE TABLE.

## 7. Riesgos de collation, padding y versión

- Comparación binaria, normalización y sintaxis son controles distintos. La collation no recorta ni convierte minúsculas; UNIQUE no prueba formato; CHECK no arbitra duplicados concurrentes.
- NO PAD distingue espacios finales en igualdad de texto, pero S los rechaza igualmente. El argumento textual de REGEXP_LIKE conserva tipo VARCHAR con collation binaria; no pasar CAST AS BINARY.
- LOWER sobre Unicode o igualdad ci contra LOWER no reproduce S. El diseño evita ambos; tampoco usa clases amplias como `\w`, `\s` o propiedades Unicode para inventar el alfabeto.
- CHECK examina el valor después de conversiones a VARCHAR. Modo no estricto o escrituras con semántica IGNORE podrían truncar/ajustar antes de evaluarlo; no prometer rechazo del input original solo con el predicado. Exigir política de escritura/modo estricto y probar variantes antes de certificación. Espacios de exceso en tipos texto merecen prueba específica, aun con modo estricto.
- La fuente pública v8.5.3 no prueba todas las diferencias de serverless. Documentación estable de rama y soporte general de una función no garantizan que esa función sea admisible en CHECK en la build concreta.
- UPDATE/INSERT externos, importadores y conexiones nuevas deben quedar sujetos a enforcement y permisos revisados. No ampliar permisos para leer `mysql.tidb`; usar evidencia funcional autorizada y declarar lo no observable.
- Una actualización de Zod puede cambiar el lenguaje. La relación validador/predicado debe versionarse y revisarse; no cambiar uno silenciosamente.
- La collation histórica MySQL as_ci sigue intacta. Este diseño no demuestra paridad universal entre ella y TiDB ni migra cuentas.

## 8. Cierre y siguiente validación

**Dictamen técnico: CANDIDATA TEÓRICAMENTE JUSTIFICADA; EQUIVALENCIA Y COMPATIBILIDAD OPERATIVA NO GARANTIZADAS.** No se presenta una REGEXP arbitraria ni se relaja el contrato ASCII; se deriva del validador instalado y se explican las premisas pendientes.

La siguiente etapa, si se autoriza, deberá separar: validación por SELECT de funciones/flags/fixtures, admisión del DDL en ensayo nuevo, metadatos ENFORCED, rechazos negativos directos, modos de conversión y sesiones nuevas, UNIQUE completo y concurrencia/rollback de usuario-sesión. No ejecutar SQL ni modificar variables para resolver esas preguntas dentro de esta etapa. Registrar códigos reales y detenerse si falta una garantía; no aprobar catálogo/runtime solo porque CREATE termina sin error.

La comparación SHA-256 final de **298 archivos existentes inventariados**, incluidos archivos privados, no encontró cambios; el único añadido es este informe. El inventario excluye `.git`, dependencias instaladas y artefactos de build/caché; no se regeneraron mediante herramientas. No se publican huellas privadas. No se modificaron aplicación, migraciones, `.env`, MySQL local, usuarios, permisos, seguridad o servicios. TiDB sigue bloqueado en el proyecto. Se entrega este diseño y se espera autorización expresa; no se avanza a implementación, SQL remoto, migraciones o despliegue.
