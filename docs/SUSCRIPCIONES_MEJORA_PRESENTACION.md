# Mejora de presentación de suscripciones

Fecha: 14 de noviembre de 2026.

## Auditoría previa

Se revisaron `Suscripciones`, `SubscriptionCard`, la sección de planes de `Home`, el proveedor y contexto de suscripciones, el encabezado y el perfil; también los servicios frontend y las rutas, validadores, controladores, servicio, repositorio y SQL del backend.

- `GET /api/v1/plans` proporciona nombres y precios. No se sustituyen por precios locales.
- `GET /api/v1/subscription` consulta la suscripción y su historial para la sesión actual.
- `PATCH /api/v1/subscription` recibe `{ code }`, con validación Free/Premium y las protecciones existentes de sesión y CSRF.
- El repositorio conserva el plan en `historial_suscripciones`, consulta `suscripciones`, finaliza el anterior y activa el nuevo dentro del mecanismo transaccional existente. Si no hay plan, la consulta existente inicializa Free; esa conducta no se modifica.
- `SubscriptionProvider` consulta el servidor y deriva `premium` del código activo. La interfaz no persiste el plan en localStorage.
- La insignia existente está en el encabezado, también visible desde Perfil; no había una insignia independiente dentro del contenido de Perfil.
- Premium oculta el bloque promocional de Inicio. No se encontró acceso prioritario ni una colección exclusiva real.

## Archivos modificados en esta tarea

- `src/pages/Suscripciones.jsx`: presentación, estado actual, confirmación y manejo de resultados.
- `src/components/home/SubscriptionCard.jsx`: precios adaptables, enlaces para visitantes, hover/focus y eliminación de la nota de muestra.
- `src/data/homeData.js`: presentación común de beneficios para Inicio y Suscripciones, sin duplicar listas.
- `src/pages/Home.jsx`: únicamente el contenido y las tarjetas de la sección de planes.
- `src/components/layout/Header.jsx`: eliminación del calificativo demostrativo de la insignia Premium existente.
- `src/routes/AppRouter.jsx`: omisión de la leyenda académica exclusivamente en la página de suscripciones; sin cambios de rutas ni protecciones.
- `scripts/audit-subscriptions-presentation.mjs`: auditoría reproducible del frontend con respuestas HTTP controladas.
- Este informe y tres capturas en `docs/evidencias-suscripciones/`.

Se conservaron los cambios que ya existían al comenzar, incluidos los de Suscripciones. No se modificaron backend, base de datos, autenticación, carrito, pedidos ni inventario.

## Presentación y textos

Free: «Explora el universo OtakuZone sin costo y descubre nuevas historias».

Premium: «Disfruta de una experiencia más exclusiva dentro de OtakuZone».

Se muestran los precios del servidor con dos decimales y la unidad mensual. Los valores usados en la auditoría son S/ 0.00 y S/ 19.90. El plan actual aparece como Free/Premium y su botón deshabilitado indica «Tu plan actual». Los demás indican «Elegir Free/Premium».

Se mantuvieron la paleta, las fuentes y los acentos existentes. Las tarjetas tienen igual altura y botones alineados cuando comparten fila; en móvil crecen según su contenido. Los textos académicos y de muestra se retiraron del contenido de suscripciones, de las tarjetas de planes y de la insignia. Las secciones ajenas a esta tarea no se reescribieron.

## Beneficios disponibles y pendientes

Free conserva catálogo, búsqueda por géneros, favoritos personales locales, acceso a tienda y descubrimiento de la temporada. No se promete sincronización de favoritos ni un módulo nuevo de próximos estrenos.

Premium incluye lo anterior, oculta los espacios promocionales de Inicio y muestra la insignia existente en el encabezado. El texto limita esos beneficios a su alcance real. Se reemplazó la antigua zona de colección de demostración por un resumen de beneficios activos, sin anunciar contenido exclusivo.

No se implementaron acceso prioritario, contenido exclusivo real, pagos, tarjetas ni pasarelas. Siguen fuera del alcance y no se anuncian como disponibles.

## Cambio de plan y accesibilidad

La selección abre un diálogo nativo con nombre, precio mensual, beneficios y explicación del cambio inmediato según el mecanismo existente. Cancelar y Escape permiten salir sin enviar la solicitud. El diálogo tiene etiquetas, foco inicial, navegación con Tab y restauración de foco al cerrar. Durante la solicitud se bloquean los botones y el cierre para evitar duplicados o incertidumbre.

El plan actual no genera PATCH. Tras confirmar se utiliza el servicio existente, se verifica que la respuesta contiene el código elegido y se vuelve a consultar el proveedor. Los mensajes de éxito dependen de esa respuesta; los errores se muestran dentro del diálogo y permiten reintentar. Los visitantes acceden a Mi Cuenta desde las tarjetas.

## Validaciones ejecutadas

- `npm test`: 20 pruebas frontend aprobadas. Ejecutadas fuera del sandbox por el bloqueo de procesos observado previamente.
- `npm run lint`: aprobado sin advertencias en la ejecución final. Se corrigió un BOM que produjo una advertencia en una ejecución inicial.
- `npm run build`: aprobado después de los últimos cambios de producto.
- `node scripts/audit-subscriptions-presentation.mjs`: aprobado en Chrome headless. Se comprueban Free, Premium, plan actual deshabilitado sin PATCH, cancelación con Escape sin PATCH, Tab, restauración del foco, error HTTP y reintento, Free → Premium → Free, insignia, enlaces de visitantes, contenido de planes de Inicio y ocultación del bloque promocional con Premium.
- 15 comprobaciones responsive: Free, Premium y confirmación a 320, 375, 768, 1024 y 1440 px. En todos los casos `scrollWidth === clientWidth`; a 320 px ambos miden 305 px con barra vertical clásica. Diálogo dentro del área disponible y alturas de tarjetas iguales en filas de dos columnas.
- Revisión visual de las capturas de escritorio, móvil y confirmación: precios legibles, distribución sin superposiciones y foco visible. No se ejecutó una auditoría automática completa de contraste o lector de pantalla.

La primera auditoría se detuvo por intentar comprobar restauración de foco tras un clic programático que no enfocaba el botón; se ajustó el escenario para enfocar antes de seleccionar. Una segunda detectó textos de muestra pendientes y caracteres dañados al escribir desde la consola; se corrigieron y la ejecución final pasó.

### Límite de las pruebas

La auditoría de navegador reemplaza las respuestas HTTP en memoria; no envía mutaciones a usuarios reales ni a MySQL. Comprueba el comportamiento del frontend y el contrato esperado, pero no acredita persistencia real o integración completa con el servidor. No se ejecutaron pruebas backend porque no se modificó backend. Los endpoints y su persistencia se inspeccionaron en código, sin modificar datos.

## Evidencias

- [Free en escritorio](evidencias-suscripciones/subscriptions-free-1440.png)
- [Premium en móvil](evidencias-suscripciones/subscriptions-premium-320.png)
- [Confirmación en móvil](evidencias-suscripciones/subscriptions-confirmation-320.png)

No se instalaron dependencias, crearon migraciones, realizaron commits ni inició otra fase.
