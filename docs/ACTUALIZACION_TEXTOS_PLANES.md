# Actualización de textos comerciales de planes

Fecha: 14 de noviembre de 2026.

## Archivos modificados en esta tarea

- `src/data/homeData.js`: descripciones y listas comerciales de Free y Premium; separación de beneficios actuales y próximos.
- `src/components/home/SubscriptionCard.jsx`: bloque «Próximos beneficios» con iconos de reloj y aviso explícito de indisponibilidad.
- `src/pages/Suscripciones.jsx`: únicamente una advertencia visual en la confirmación de Premium; no se cambian los manejadores de selección o confirmación.
- Este informe.

Se conservaron los cambios previos del proyecto. No se editaron otras páginas. La presentación compartida de planes también se refleja en las tarjetas existentes de Inicio, sin modificar su página ni otras secciones.

## Contenido y presentación

Free: «Explora el universo OtakuZone sin costo». Cinco beneficios: catálogo completo de anime, búsqueda por géneros, favoritos personales, Tienda Otaku y novedades y temporadas.

Premium: «Disfruta de ventajas especiales dentro del universo OtakuZone». Beneficios actuales: todos los de Free e insignia Premium exclusiva en el perfil, aclarando que se ve en el encabezado, que es la ubicación ya implementada.

Se presentan como próximos, no disponibles al activar Premium:

- Descuentos especiales en productos de Tienda Otaku.
- Colecciones personalizadas de anime.
- Seguimiento de animes vistos y pendientes.
- Historial personal de exploración.
- Recomendaciones basadas en tus preferencias.
- Selección destacada de novedades y próximos estrenos.

No se anuncian porcentajes ni fechas, no se promete que estas propuestas estén activas y no se implementó ninguna de ellas. La confirmación enumera solo los beneficios actuales y recuerda que los próximos aún no están disponibles. Se conservó el aviso de que no se procesan pagos reales.

No hay referencias a navegación sin publicidad o sin espacios promocionales en los textos actuales de `src`. Los precios continúan procediendo del servidor: no se cambiaron importes, formato PEN, servicios ni reglas de suscripción. Se verificó la presentación con S/ 0.00 y S/ 19.90 mensuales.

Se mantuvieron paleta, tipografías, estructura general de las tarjetas, insignia, botones y alineación de las acciones. El bloque de próximas funciones usa un divisor sutil y un tratamiento diferente de los beneficios actuales.

## Validaciones reales

- `npm run lint`: aprobado sin advertencias.
- `npm test`: 20 pruebas frontend aprobadas. Ejecutadas fuera del sandbox para evitar el bloqueo de procesos de Node observado anteriormente.
- `npm run build`: aprobado.
- Chrome headless con respuestas HTTP controladas: cinco anchos (320, 375, 768, 1024 y 1440 px), sin desbordamiento horizontal; `scrollWidth === clientWidth`.
- Verificados cinco beneficios Free, dos beneficios Premium disponibles y seis próximos, precios y ausencia de promesas sobre publicidad.
- Revisadas capturas de Free y Premium en móvil y escritorio, además de la confirmación móvil: textos legibles, próximos beneficios separados y botones accesibles mediante desplazamiento normal.
- Plan actual deshabilitado; cancelar no envía cambios; Free → Premium → Free conserva selección, confirmación y actualización de insignia.

Las pruebas de selección usaron respuestas aisladas en memoria. No se modificaron suscripciones reales ni se acreditó persistencia contra MySQL. El script temporal se eliminó al terminar.

Capturas locales temporales en `C:/Users/NSM_2/AppData/Local/Temp/otakuzone-state-nNmwtF/`: `plans-premium-320.png`, `plans-premium-1440.png`, `plans-free-320.png`, `plans-free-1440.png` y `plans-confirmation-320.png`.

Sin cambios de backend, endpoints, servicios, autenticación, JWT, base de datos o migraciones. Sin dependencias nuevas, commits ni tareas adicionales.
