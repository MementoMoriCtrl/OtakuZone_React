# OtakuZone — Etapa 3.6.1: revisión de escapes SQL y RE2

Fecha: **16 de noviembre de 2026**. Revisión documental y análisis offline. No se ejecutó SQL, RE2, DDL ni se abrió conexión MySQL/TiDB. Solo se crea este informe; el informe 3.6 permanece intacto.

## 1. Hallazgos y errores detectados

**No se detectaron errores de escapes en los dos patrones REGEXP_LIKE del informe 3.6. No requieren corrección.** Ambos literales SQL contienen **cero barras inversas**. Las comillas simples interiores están duplicadas correctamente y los guiones literales quedan al final de sus clases.

Se inspeccionaron el [informe 3.6](DESPLIEGUE_ETAPA_3_6_DISENO_CHECK_EMAIL.md), `backend/src/domain/emailPolicy.js`, `backend/src/validators/email.js` y `backend/node_modules/zod/v4/core/regexes.js`. Se conserva el contrato instalado de Zod 4.6.7, no las otras variantes de email exportadas por esa dependencia.

La conclusión se limita a la traducción de literales y gramática bajo las reglas documentadas. **No certifica que la build TiDB 8.5.3-serverless admita o aplique REGEXP_LIKE dentro de CHECK.**

Precisión editorial: donde 3.6 dice que el formato Zod «elimina» espacios/controles internos, debe entenderse **rechaza**; no los borra ni repara el correo. Solo trim quita blancos externos. No se modifica el documento anterior ni la implementación.

## 2. Dos capas distintas: SQL y RE2

SQL primero interpreta un literal entre comillas simples. Cada pareja interior `''` representa **un apóstrofo** en el contenido. Después REGEXP_LIKE entrega ese contenido al motor regex; las comillas delimitadoras SQL no forman parte del patrón.

| Uso | Literal escrito en SQL | Contenido resultante para regex |
| --- | --- | --- |
| Guardia de alfabeto | `'[^a-z0-9_''+@.-]'` | `[^a-z0-9_'+@.-]` |
| Gramática | `'^([a-z0-9_''+-]+[.])*[a-z0-9_''+-]*[a-z0-9_+-]@([a-z0-9][a-z0-9-]*[.])+[a-z]{2,}$'` | `^([a-z0-9_'+-]+[.])*[a-z0-9_'+-]*[a-z0-9_+-]@([a-z0-9][a-z0-9-]*[.])+[a-z]{2,}$` |
| match_type | `'c'` | `c`, opción de la función, no parte de la regex |

El guardia contiene una pareja interior `''`; la gramática contiene dos. No son apóstrofos repetidos en el alfabeto ni escapes RE2. Se conserva el mismo contenido de los bloques CHECK y CREATE TABLE de 3.6.

La regla de duplicar el delimitador está documentada por [MySQL 8.0, String Literals](https://dev.mysql.com/doc/refman/8.0/en/string-literals.html). TiDB documenta literales y el efecto de ANSI_QUOTES: mantener comillas simples evita confundir una cadena con un identificador. [TiDB Literal Values](https://docs.pingcap.com/tidb/stable/literal-values/).

No hay barras inversas que SQL pueda consumir, reinterpretar o conservar según NO_BACKSLASH_ESCAPES. Esta independencia **solo se refiere a estos literales**, no certifica todos los efectos de sql_mode en inserción/conversión. Si en una implementación futura se envuelven en otra cadena JavaScript/JSON/shell habrá una capa adicional de escapes que deberá revisarse; no copiar automáticamente el texto SQL como si ya fuera ese literal del lenguaje anfitrión.

## 3. Inventario individual de barras inversas

Patrón original instalado:

```javascript
/^(?:[A-Za-z0-9_'+\-]+\.)*[A-Za-z0-9_'+\-]*[A-Za-z0-9_+-]@(?:[A-Za-z0-9][A-Za-z0-9\-]*\.)+[A-Za-z]{2,}$/
```

Tiene exactamente **cinco barras inversas**, leídas del `.source` de la regex instalada:

| Número, de izquierda a derecha | Secuencia original | Función | Traducción de la candidata |
| --- | --- | --- | --- |
| 1 | `\-` en la clase del segmento local anterior a un punto | Guion literal | `-` al final de `[a-z0-9_'+-]` |
| 2 | `\.` después de ese segmento local | Punto literal | `[.]` |
| 3 | `\-` en la clase del segmento local final | Guion literal | `-` al final de `[a-z0-9_'+-]` |
| 4 | `\-` en la clase de continuación de etiqueta del dominio | Guion literal | `-` al final de `[a-z0-9-]` |
| 5 | `\.` después de la etiqueta del dominio | Punto literal | `[.]` |

Los escapes de puntuación `\-` y `\.` son expresables en RE2 si esos caracteres llegan realmente al motor; **la candidata no los necesita**. La revisión no descubre `\_`, `\@`, `\+`, lookahead, backreferences ni escapes Unicode en los patrones SQL. No inventar un error de «escape RE2 inválido» donde no hay barra inversa.

Las barras `/.../` delimitan el literal regex JavaScript, no son barras inversas y no se trasladan como delimitadores a REGEXP_LIKE. Las representaciones JSON de un diagnóstico pueden mostrar `\\` para codificar una sola barra; eso tampoco implica que SQL contenga esas barras.

RE2 documenta escapes de puntuación, clases, grupos y cuantificadores. Las variantes elegidas evitan tener que coordinar un escape regex con uno SQL. [Referencia oficial RE2](https://github.com/google/re2/wiki/Syntax).

## 4. Revisión de clases y operadores

| Carácter | Dentro de las clases actuales | Fuera de clase, donde aparece |
| --- | --- | --- |
| `_` | Literal; no es comodín de REGEXP | No se usa como operador; no confundir con LIKE SQL |
| `@` | Literal en el guardia | Separador literal único en la gramática |
| `+` | Literal en las clases locales/guardia | Cuantificador de uno o más cuando sigue a una clase o grupo |
| `-` | Literal al final, inmediatamente antes de `]` | Los de `a-z` y `0-9` son rangos intencionados |
| `.` | Literal en el guardia y en `[.]` | No existe punto comodín desnudo en la gramática |
| `'` | Literal para RE2 tras decodificar `''` SQL | No delimita cadenas cuando ya se está en la capa regex |

La posición final del guion se verifica en **todas** las clases relevantes: `[^a-z0-9_'+@.-]`, `[a-z0-9_'+-]`, `[a-z0-9_+-]` y `[a-z0-9-]`. No crea rangos accidentales entre apóstrofo, plus, punto u otros caracteres. El `^` inicial dentro del guardia niega la clase; en la gramática, fuera de clase, ancla el comienzo.

`NOT REGEXP_LIKE` del guardia significa que no puede encontrarse ningún carácter ajeno al alfabeto. No basta por sí solo para validar posiciones: por ejemplo, permite considerar `@` como carácter admisible, pero la gramática rechaza dos separadores.

`'c'` solicita matching sensible a mayúsculas en TiDB. No se usan opciones `i` o `m`. RE2 distingue anclas de texto y de línea según flags; el guardia rechaza además CR/LF y otros controles. La diferencia del `$` JavaScript frente al final de texto RE2 no amplía el conjunto almacenado porque el guardia excluye terminadores. [TiDB: flags y motor regex](https://docs.pingcap.com/tidb/stable/string-functions/#regular-expression-compatibility-with-mysql), [RE2: sintaxis](https://github.com/google/re2/wiki/Syntax).

## 5. Comparación con Zod y alcance de equivalencia

No se afirma que el patrón SQL minúsculo acepte exactamente las mismas **entradas crudas** que el normalizador: esa afirmación sería falsa. Zod recibe el resultado de trim/minúsculas. El CHECK debe comprobar el valor ya canónico:

`S(v) = normalizeEmail(v) tiene éxito y su salida es exactamente v`.

| Transformación | ¿Cambia el contrato de almacenamiento? |
| --- | --- |
| Quitar A–Z de clases y TLD | No respecto a S: mayúsculas crudas no son canónicas; la API puede aceptarlas y convertirlas antes de almacenar |
| `\.` → `[.]` | No; conserva punto literal |
| `\-` → guion final de clase | No; conserva guion literal |
| `(?:...)` → `(...)` | No para matching booleano sin consumir capturas; las agrupaciones y cuantificadores se conservan |
| `'` → `''` en el literal SQL | No; escape SQL, mismo carácter entregado al motor |
| Añadir guardia y máximo 254 bytes | Explicita ASCII canónico/longitud; para ASCII válido un carácter UTF-8 ocupa un byte |

Se conservan las posiciones: apóstrofo interior admitido, final rechazado; puntos solo como separadores de segmentos locales no vacíos; `_` admitido localmente, no en dominio; `+` no se elimina; etiquetas de dominio con guion según el patrón instalado; TLD alfabético mínimo dos. No se añaden restricciones RFC de 64/63 ni conversión IDNA. Toda equivalencia con el motor real sigue condicionada a las reglas efectivamente aplicadas por TiDB.

### Comprobación offline de esta revisión

Se extrajeron los literales **del bloque CHECK real de 3.6**, se decodificó únicamente el escape de comilla duplicada y se contrastó su modelo JavaScript con S usando el normalizador instalado. Esto es análisis de texto, **no ejecución ni parseo SQL completo**.

Resultado: cero barras inversas en los dos patrones y ambos flags; cinco escapes en el original Zod, en el orden indicado. **4.493 casos, cero discrepancias** entre modelo y S: trece casos base más la inserción de cada carácter ASCII 0–127 en todas las posiciones de `ab@example.com` y `a.b+tag@example.com`.

El corpus incluye mayúsculas/espacios, NUL, salto final, Unicode precompuesto/combinado, NBSP, punycode y longitudes 254/255. No demuestra exhaustividad, compilación RE2, parser TiDB, admisión en CHECK, enforcement ni UNIQUE. No se crearon scripts/tests ni se ejecutaron suites de integración.

## 6. Patrones finales y DDL candidato

**Sin cambios: no hay patrones que corregir.** La forma SQL revisada es:

```sql
NOT REGEXP_LIKE(email, '[^a-z0-9_''+@.-]', 'c')
AND REGEXP_LIKE(
  email,
  '^([a-z0-9_''+-]+[.])*[a-z0-9_''+-]*[a-z0-9_+-]@([a-z0-9][a-z0-9-]*[.])+[a-z]{2,}$',
  'c'
)
```

No procede emitir un DDL «actualizado» con diferencias inexistentes. Para revisión se reproduce el candidato de 3.6, **idéntico en su definición, NO EJECUTAR**:

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

La copia no autoriza crear esquema/tabla, no es una migración y no afecta a usuarios reales. NOT NULL, longitud y UNIQUE siguen siendo controles separados del formato regex. No se modifica el catálogo ni el preflight.

## 7. Fuentes, riesgos pendientes y dictamen final

Fuentes primarias consultadas el **2026-11-16**: [RE2 Syntax](https://github.com/google/re2/wiki/Syntax); PingCAP [Literal Values](https://docs.pingcap.com/tidb/stable/literal-values/) y [String Functions](https://docs.pingcap.com/tidb/stable/string-functions/#regular-expression-compatibility-with-mysql), con selector documental **v8.5**; [MySQL String Literals](https://dev.mysql.com/doc/refman/8.0/en/string-literals.html), manual **8.0**. Las páginas de rama no certifican el parche/build serverless. No se usaron fuentes de terceros como fundamento de equivalencia.

Quedan pendientes en TiDB 8.5.3:

- Verificar contenido exacto de literales/flags recibido por el motor y admisión específica de REGEXP_LIKE/OCTET_LENGTH dentro de CHECK.
- Comprobar metadatos ENFORCED y rechazo directo de valores inválidos en ensayo aislado autorizado, con encoding y modos reales.
- Probar conversiones/truncamiento previos al CHECK y semánticas IGNORE; el CHECK recibe el valor convertido, no el original de Node.
- Mantener argumentos textuales VARCHAR con collation binaria; TiDB documenta restricciones para cadenas de tipo binario en regex. No introducir CAST AS BINARY para «reforzar» matching.
- Verificar UNIQUE completo y concurrencia/rollback por separado: una revisión de escapes no prueba integridad transaccional.

**Dictamen: SIN ERRORES DE ESCAPES DETECTADOS; PATRONES CONSERVADOS.** La gramática canónica derivada está justificada bajo la semántica documentada, sin ampliar caracteres ni cambiar la política. **Compatibilidad operativa y enforcement TiDB: NO CERTIFICADOS.**

La comparación final SHA-256 de **299 archivos existentes inventariados**, incluidos los entornos privados y el informe 3.6, no encontró cambios; el único añadido es este informe. El inventario excluye `.git`, dependencias instaladas y artefactos de build/caché; no se ejecutaron herramientas que los regeneren. No se publican huellas privadas. No hubo SQL, conexiones, modificaciones de aplicación/migraciones/entornos privados/autenticación, datos, servicios, despliegues o commits. Se entrega únicamente este informe y se detiene la etapa, a la espera de autorización expresa.
