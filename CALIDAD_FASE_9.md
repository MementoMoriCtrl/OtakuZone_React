# OtakuZone — FASE 9: integración y pruebas de calidad

Fecha: 14 de noviembre de 2026, America/Lima. Base Git: `a7e15ab` (FASE 8). El repositorio estaba limpio al comenzar.

## Dictamen

**Integración local React → Express → MySQL aprobada en los escenarios ejecutados. Integración real con Jikan pendiente por conectividad.** La auditoría no certifica toda la plataforma sin reservas ni su despliegue productivo.

Se ejecutaron pruebas de registro/login/perfil, navegación, catálogo, filtros, favoritos, tienda, carrito, pedidos, suscripciones y administración. Se conservaron las funcionalidades existentes. Las correcciones fueron de infraestructura de pruebas, esperas de navegador, seguridad del aislamiento y documentación desactualizada; no se reprodujo un defecto funcional nuevo que exigiera reconstruir código de producto.

**No hubo commit, instalación de dependencias, migraciones, cambios de secretos ni escrituras sobre datos reales. No se avanzó a FASE 10.**

## Resultados por módulo

| Módulo | Resultado ejecutado | Alcance o pendiente |
| --- | --- | --- |
| React/rutas | APROBADO LOCAL | Inicio, animes demo, tienda, detalle válido/inexistente, favoritos, cuenta, perfil, carrito, pedidos/detalles, suscripciones, ADMIN/secciones y 404. Redirecciones privadas y rechazo de CLIENTE comprobados. |
| Animes demo | APROBADO | Búsqueda con debounce/envío, género, estado, orden, vacío y modal/foco/Escape con datos explícitamente ficticios. No acredita Jikan. |
| Jikan real | NO VALIDADO | Solicitudes reales desde React y Node fallaron; también se probó el proxy existente. No hubo respuestas exitosas utilizables. Error y acceso a demo sí comprobados. |
| JSON Server | APROBADO COMO CATÁLOGO OPCIONAL | GET reales de productos/categorías/promociones: 200, 12/5/2 registros. Proceso de solo lectura. La compra utiliza Express/MySQL, no JSON Server. |
| Favoritos | APROBADO LOCAL | Tarjeta/modal/página, sin duplicados, persistencia al recargar, continuidad tras login, storage corrupto/bloqueado y recuperación. Favorito de un resultado Jikan real queda pendiente. |
| Autenticación | APROBADO | Registro, login correcto/incorrecto, sesión, perfil SQL, logout, revocación, firma/algoritmo/expiración, bcrypt y cookie HttpOnly. |
| Autorización | APROBADO | ADMIN permitido; CLIENTE y usuario sin sesión denegados en endpoints administrativos. Cambio de rol técnico se refleja incluso con JWT emitido. |
| Tienda | APROBADO | Catálogo MySQL, detalles, búsqueda/filtros/orden, disponibilidad y rechazo de inexistentes. |
| Carrito | APROBADO | Agregar/incrementar, editar, eliminar, importes SQL, cantidades inválidas, stock, propiedad y persistencia en SQL/navegador. |
| Pedidos | APROBADO | Creación, snapshots/importes, historial/detalle, propiedad, rollback, idempotencia y compradores concurrentes por última unidad. |
| Suscripciones | APROBADO | Free inicial, Premium y regreso a Free, persistencia, historial sin duplicar el plan actual, insignia/promociones y entradas inválidas. |
| Administración | APROBADO | Indicadores SQL, CRUD con baja lógica, categorías, inventario/reservas/auditoría, pedidos/transiciones/cancelación única y usuarios sin hashes ni cambio de rol HTTP. |
| MySQL | APROBADO EN COMPROBACIONES EJECUTADAS | Esquema, checksums, FK/UNIQUE/CHECK, DECIMAL, commit/rollback/persistencia y consistencia; detalles abajo. |
| Responsive | APROBADO EN ESCENARIOS EJECUTADOS | 320, 375, 768, 1024 y 1440 px; detalle abajo. No equivale a auditoría completa de accesibilidad. |
| Build/lint | APROBADO | Build Vite y linter sin diagnósticos finales. |

## Pruebas automatizadas y resultados

Se reutilizaron **Node Test Runner, assert, fetch HTTP real y Chrome/CDP**, presentes en el proyecto. No estaban instalados Vitest, React Testing Library, Jest, Supertest ni Playwright. No se añadieron herramientas redundantes: las interacciones React se comprobaron en navegador real y los endpoints contra Express/MySQL reales, además de los contratos unitarios existentes. No se afirma haber ejecutado aquellas bibliotecas.

| Prueba ejecutada | Resultado |
| --- | --- |
| `npm test` | 18/18 aprobadas: validación, favoritos, servicios/contratos, cancelación, caché, reintentos y normalización. |
| `npm --prefix backend test` | 18/18 aprobadas: autenticación unitaria, configuración, transacciones con dobles, catálogo HTTP, errores, CORS y rate limiting. |
| `verify-db.js` en base aislada | Aprobado: consultas parametrizadas, commit/rollback, FK, CHECK, UNIQUE, CASCADE, snapshots DECIMAL y limpieza técnica. |
| `verify-auth.js` aislado | 35 solicitudes HTTP aprobadas. |
| `verify-commerce.js` aislado | 62 solicitudes HTTP aprobadas. |
| `verify-admin.js` aislado | 72 solicitudes HTTP aprobadas por ejecución; no se suman repeticiones. |
| `verify-quality.js` aislado | 26 solicitudes HTTP aprobadas y 18 relaciones sin huérfanos; consistencia de importes e inventario. |
| `verify-db-http.js` aislado | Inserción y actualización SQL vistas por Express; eliminación técnica seguida de 404 (tres lecturas HTTP). |
| Chrome autenticación | Aprobado: formularios, validaciones, registro/perfil SQL, cookies, favoritos, roles, login incorrecto/correcto y logout. |
| Chrome interactividad | Aprobado local: búsqueda/filtros demo, favoritos/storage, foco/modal y validación. Su búsqueda Jikan real quedó pendiente. |
| Chrome comercio | Aprobado: carga/error/reintento, carrito, compra, historial, planes, SQL y responsive. |
| Chrome ADMIN | Aprobado en repetición final: rechazo CLIENTE, dashboard, categorías/productos, inventario SQL, compra/cancelación y usuarios. |
| Chrome rutas/calidad | Aprobado local en repetición final: rutas, 404, detalle inexistente, redirecciones, menú/Escape y controles dentro del ancho. Jikan: NO VALIDADO. |
| JSON Server real | Tres GET aprobados. Se lanzó con `--read-only`; no se modificó mock/db.json. |
| Node/Jikan real | Falló populares; temporada/géneros/búsqueda/detalles del chequeo Node se omitieron tras ese fallo. |
| `npm run build` | Aprobado: Vite 8.3.8, salida dist/. No cambió código de producto después de compilar. |
| `npm run lint` / `git diff --check` | Aprobados. Git avisó de normalización LF/CRLF; sin errores de whitespace. |

Las cuatro suites HTTP contadas suman **195 solicitudes asertadas** (35+62+72+26), más las tres lecturas SQL→HTTP y los tres GET de JSON Server. No se suman reintentos de ejecuciones anteriores ni tráfico de navegador no contado.

Las suites inicialmente no pudieron crear procesos dentro del sandbox (spawn EPERM); la repetición autorizada fuera del sandbox ejecutó las 36 pruebas correctamente. Ese bloqueo inicial no se clasificó como fallo de aplicación.

## Flujos de navegador y responsive

Se ejecutaron con Chrome headless real, perfiles temporales independientes, API en 4407 y Vite en 5177. Antes de registrar usuarios, los guiones verifican que el módulo de autenticación servido a React apunta exactamente a la API aislada.

- Registro con obligatorios/confirmación inválidos y luego datos válidos; cookie HttpOnly no accesible por document.cookie ni guardada en localStorage. Perfil actualizado, recarga y consulta SQL confirman persistencia. Login incorrecto/correcto y logout comprobados.
- Animes demo: debounce de 450 ms, búsqueda enviada, filtros combinados, orden, vacío, modal, Escape/restauración de foco, favoritos persistidos y almacenamiento fallido/corrupto.
- Carrito: alta, dos unidades, edición, baja, nueva alta, recarga y cantidad SQL. Confirmación genera pedido, detalles/historial y descuenta stock. Free/Premium persisten y actualizan la UI.
- ADMIN: CLIENTE ve Acceso restringido; elevación únicamente de la fixture aislada permite comprobar dashboard, categoría/producto, edición, desactivación, ajuste auditado, consulta del cliente y cancelación con restitución SQL.
- Rutas públicas y errores: `/`, `/animes?source=demo`, `/favoritos`, `/tienda`, producto inexistente, `/suscripciones`, `/cuenta` y ruta 404. Invitado redirigido desde perfil, carrito, pedidos, detalle de pedido, ADMIN y productos ADMIN.

**Anchos comprobados: 320, 375, 768, 1024 y 1440 px.** Los guiones cubren catálogo/favoritos/cuenta, perfil autenticado, seis pantallas comerciales y seis módulos administrativos. La auditoría adicional comprueba scrollWidth y que los controles visibles de rutas públicas queden dentro del ancho. Menú móvil y cierre con Escape comprobados. El modal/restauración de foco se probaron en el recorrido de interactividad; no se certifica cada combinación de estado/dispositivo ni WCAG completo.

Las ejecuciones locales aprobadas no registraron excepciones ni console.error de aplicación. Los errores de red de Jikan y respuestas 401/403/404 intencionales se reportan aparte.

## Backend, datos y seguridad

Revisión de rutas, controladores, servicios, repositorios, validadores y configuración existentes; no se añadieron endpoints de producto durante esta fase.

- Métodos GET/HEAD/OPTIONS y rechazo 405 del catálogo; preflight incluye PUT. JSON malformado: 400; cuerpo excesivo: 413; origen no permitido: 403. Consultas desconocidas/repetidas, arrays e identificadores inválidos: 400; inexistentes: 404. Errores JSON consistentes y sin SQL/trazas.
- Autenticación real: bcrypt distinto del texto original, bcrypt.compare correcto y coste configurado; mensajes genéricos de login. JWT falsificado, expirado o con algoritmo distinto: 401. Token revocado no se reutiliza; roles se consultan en MySQL. No se devuelve JWT en JSON.
- Autorización ADMIN central y protección React; CLIENTE no administra, no consulta pedidos ajenos y no puede inyectar role/usuario/importes en cuerpos estrictos. CSRF ausente/incorrecto y origen no autorizado se rechazan.
- Entradas enlazadas a parámetros SQL; se probaron literales de inyección sin convertirlos en SQL. La paginación administrativa usa exclusivamente un entero validado y nombres internos de consultas, no fragmentos aportados por el cliente.
- MySQL real: **8.0.46, 17 tablas InnoDB, 18 FK, 20 CHECK y siete migraciones**. Los siete SHA-256 coinciden con el ledger. No se ejecutó migrador ni se cambió un archivo SQL.
- La prueba aislada fuerza fallos de segunda inserción y del historial tras escrituras reales; comprueba rollback de cabecera/detalles/stock/carrito. También prueba UNIQUE, reservas, relaciones RESTRICT/CASCADE y snapshots de precio. La excepción interna deliberada y su 500 son esperados.
- Auditoría adicional **de solo lectura sobre desarrollo**: 18 relaciones sin huérfanos; cero inconsistencias detectadas en disponibilidad, subtotales o deltas; cero usuarios activos sin patrón bcrypt. No se imprimieron hashes ni datos personales. El cotejo bcrypt contra una contraseña conocida se hizo solo con fixtures, no con cuentas reales.
- `.env`, `.env.test` y dist están ignorados; solo ejemplos de entorno están versionados. Búsqueda estática en 205 archivos candidatos en ese momento: ningún patrón sospechoso de clave privada, JWT literal o secreto largo. El bundle no contiene DB_PASSWORD, JWT_SECRET ni password_hash. Son comprobaciones acotadas, no garantía universal de ausencia de secretos.

**Riesgo de entorno detectado:** la cuenta MySQL de runtime configurada localmente tiene privilegios globales. Las pruebas usaron otra cuenta limitada a su base; no se modificó `.env` ni se sustituyeron credenciales reales. Antes de producción, el operador debe separar mantenimiento/runtime y aplicar los permisos mínimos ya ejemplificados en `backend/database/provisioning/application-user.example.sql`. No se certifica HTTPS productivo, rotación de secretos ni endurecimiento del servidor local.

## Jikan: qué se intentó y qué falta

Se intentó la API real desde React, incluyendo la búsqueda Naruto con género/estado/orden. Se verificó que la URL enviada conserva los parámetros y que la aplicación informa el fallo, permite Reintentar y ofrece explícitamente Demo local; no sustituye resultados silenciosamente.

El chequeo Node de populares también falló sin una respuesta utilizable. Una consulta adicional con `node --use-env-proxy` y el proxy ya configurado terminó en **UND_ERR_CONNECT_TIMEOUT**. Un diagnóstico Chrome con ese proxy agotó **Page.navigate**. No se deshabilitó TLS ni se enviaron credenciales del proxy por argumentos.

Esto demuestra un fallo de conectividad **desde este entorno**, no que Jikan esté caído globalmente. No se obtuvieron resultados reales para validar el camino exitoso. Quedan pendientes populares, temporada, géneros, búsqueda/detalles y favoritos de un resultado real, así como su consumo exitoso simultáneo con Express/MySQL en React.

El modo demo y los dobles unitarios no se cuentan como sustitutos de esas pruebas. Deben repetirse desde un entorno con salida verificada a `https://api.jikan.moe/v4`. El comando integral mantiene salida distinta de cero cuando falla la comprobación externa.

JSON Server continúa como proveedor opcional de catálogo; el flujo principal de compra/autenticación usa MySQL. Se comprobó su transporte HTTP real y el contrato de adaptación existente; no se afirma haber ejecutado toda la UI con Vite configurado exclusivamente contra JSON Server en esta fase.

## Incidencias y correcciones

| Hallazgo reproducido | Corrección o estado |
| --- | --- |
| Guiones antiguos apuntaban al puerto 4000 y esperaban tres métricas ADMIN | Usan API_URL aislada, cookies del puerto correcto y las seis métricas actuales; guion de autenticación volvió a pasar. |
| Verificaciones antiguas auth/db podían escribir en desarrollo | Guardas previas al pool/fixtures exigen base/cuenta aisladas; no pueden usar automáticamente `.env` de desarrollo para escribir. |
| Solo comprobar la conexión SQL no garantizaba el backend usado por React | Los guiones que registran usuarios comparan AUTH_API_URL del navegador con la API aislada antes de mutar. |
| Cuenta restringida MySQL devuelve variantes FK 1216/1217 | La aserción acepta exclusivamente la misma clase de rechazo de integridad, también 1452/1451, sin conceder REFERENCES ni desactivar restricciones. |
| Falta de 375/1024 px en guiones antiguos | Se actualizaron los cinco anchos exigidos y se añadió perfil autenticado/rutas/controles. |
| Navegación inicial en blanco y controles aún no montados durante comprobación de sesión | Ejecuciones marcadas fallidas y limpiadas. Se espera presencia/habilitación de controles; navegación permite un único reintento explícito solo para documento vacío sin excepción JS. No reintenta errores renderizados ni oculta excepciones. ADMIN y rutas pasaron después. |
| README seguía describiendo FASE 6 como estado vigente | Encabezados actuales enlazan este informe y el ejecutor seguro; se conservan antecedentes históricos. |
| Jikan no accesible, incluso en diagnósticos de proxy | Pendiente externo explícito; no se falseó éxito ni se desactivó TLS. |
| Cuenta local de runtime con privilegios globales | Riesgo operativo pendiente de revisión; no se cambiaron cuentas/secretos reales. |

No se eliminó funcionalidad ni se relajaron validadores para aprobar pruebas. No hubo cambios en componentes o lógica de negocio de la aplicación.

## Ejecuciones fallidas y repetición final

La primera prueba DB se detuvo por la variante del error FK; corregida y repetida correctamente. La ejecución integral sobre `otakuzone_f7_test_013541dbd954` aprobó los módulos locales, rutas, JSON Server y navegador, pero **terminó con código 1 por Jikan**.

Otra ejecución integral incorporó el perfil en cinco anchos y aprobó esas comprobaciones, pero se detuvo al iniciar Chrome ADMIN en blanco. Una repetición ADMIN falló al buscar un control antes de montar el formulario. Ambas se registran como fallidas, no como éxitos de aplicación.

La repetición final local en `otakuzone_f7_test_84e7f8648e54` aprobó 72 solicitudes ADMIN, su navegador y rutas/calidad en los cinco anchos; salió 0 para ese alcance local y conservó **Jikan NO VALIDADO**. No se sumaron sus solicitudes a los 195 del conjunto de suites ni se convirtió ese cero local en aprobación externa.

## Aislamiento y evidencias

Preparador reutilizado de FASE 7/8: base única, cuenta técnica CRUD limitada, credenciales/JWT aleatorios en memoria, acceso a desarrollo denegado y puertos verificados. Copia esquema y catálogo; nunca usuarios, sesiones, pedidos o historiales reales. No copia perfiles Chrome al repositorio. Las eliminaciones se limitan al nombre exacto de recursos creados por cada invocación.

Todas las ejecuciones terminaron su limpieza, incluidas las fallidas. Consulta posterior: **cero bases `otakuzone_f7_test_%` y cero cuentas `ozf7_%`**. Servidores propios detenidos. Un cierre forzoso del sistema seguiría requiriendo inspeccionar los nombres exactos antes de limpiar manualmente; no borrar por patrón.

Evidencias con datos exclusivamente técnicos:

- [Auditoría MySQL de solo lectura](docs/evidencias/fase9/mysql-solo-lectura.json).
- [Perfil autenticado móvil](docs/evidencias/fase9/perfil-autenticado-movil.png).
- [Catálogo demo, sin atribuirlo a Jikan](docs/evidencias/fase9/catalogo-demo.png).
- [Pedido real de prueba en MySQL aislado](docs/evidencias/fase9/pedido-demostrativo.png).
- [Dashboard ADMIN](docs/evidencias/fase9/admin-dashboard.png).
- [Error real de conectividad Jikan](docs/evidencias/fase9/jikan-error-real.png).

## Reproducción y archivos

Sin escritura a datos de desarrollo:

```sh
npm test
npm --prefix backend test
npm run lint
npm run build
node backend/scripts/audit-readonly.js
```

Integración con fixtures únicamente en base aislada (MySQL, permisos de mantenimiento para crear cuenta/base temporal, Chrome/Edge y puertos 4407/5177/4409 libres):

```sh
npm --prefix backend run quality:verify
```

Repetición local de ADMIN y rutas, sin certificar Jikan:

```sh
node backend/scripts/close-phase7.js --admin --admin-only --quality-recheck
```

Diagnóstico opcional de Jikan en Chrome: `node scripts/check-jikan-browser.mjs`; `AUDIT_USE_PROXY=1` permite usar el proxy existente sin transportar credenciales por argumentos ni omitir TLS. No registrar contraseñas, cookies o valores de `.env` en el informe de una repetición.

Nuevos: `audit-readonly.js`, `verify-quality.js`, `audit-quality-browser.mjs`, `check-jikan-browser.mjs`, este informe y evidencias. Modificados: package del backend (quality:verify), preparador aislado, verificadores auth/db/SQL→HTTP, aserciones de verifyDatabase, guiones de navegador auth/comercio/admin/interactividad, helper CDP y ambos README. Ninguna migración ni dependencia cambió.

**Pendientes para aprobación completa:** obtener una ejecución exitosa real de Jikan/React desde una red adecuada y revisar la cuenta de runtime antes de producción. No se hizo git add/commit ni se inició FASE 10; el resultado queda para revisión del usuario.
