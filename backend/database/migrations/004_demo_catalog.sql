-- Snapshot de demostraci?n del cat?logo de Fase 4; no sobrescribe filas existentes.
INSERT INTO categorias (id, nombre, orden) VALUES
('figuras', 'Figuras coleccionables', 1),
('mangas', 'Mangas', 2),
('polos', 'Polos', 3),
('accesorios', 'Accesorios', 4),
('papeleria', 'Papelería (sin productos por ahora)', 5)
ON DUPLICATE KEY UPDATE id = id;

INSERT INTO productos (id, categoria_id, nombre, descripcion, precio, image_key, alt_imagen, orden) VALUES
('figura-mensajera', 'figuras', 'Figura Mensajera de Distrito Cero', 'Producto ficticio para la tienda académica OtakuZone. La imagen es ilustrativa y puede reutilizarse entre variantes; no hay compras ni stock real.', 129.90, 'figura', 'Imagen ilustrativa de demostración: Figura Mensajera de Distrito Cero', 1),
('figura-lunar', 'figuras', 'Figura Guardiana Lunar', 'Producto ficticio para la tienda académica OtakuZone. La imagen es ilustrativa y puede reutilizarse entre variantes; no hay compras ni stock real.', 149.90, 'figura', 'Imagen ilustrativa de demostración: Figura Guardiana Lunar', 2),
('figura-orbita', 'figuras', 'Figura Exploradora Órbita', 'Producto ficticio para la tienda académica OtakuZone. La imagen es ilustrativa y puede reutilizarse entre variantes; no hay compras ni stock real.', 139.90, 'figura', 'Imagen ilustrativa de demostración: Figura Exploradora Órbita', 3),
('manga-distrito-1', 'mangas', 'Distrito Cero · Volumen 01', 'Producto ficticio para la tienda académica OtakuZone. La imagen es ilustrativa y puede reutilizarse entre variantes; no hay compras ni stock real.', 39.90, 'manga', 'Imagen ilustrativa de demostración: Distrito Cero · Volumen 01', 4),
('manga-distrito-2', 'mangas', 'Distrito Cero · Volumen 02', 'Producto ficticio para la tienda académica OtakuZone. La imagen es ilustrativa y puede reutilizarse entre variantes; no hay compras ni stock real.', 39.90, 'manga', 'Imagen ilustrativa de demostración: Distrito Cero · Volumen 02', 5),
('manga-jardin', 'mangas', 'El jardín de cristal · Volumen 01', 'Producto ficticio para la tienda académica OtakuZone. La imagen es ilustrativa y puede reutilizarse entre variantes; no hay compras ni stock real.', 42.90, 'manga', 'Imagen ilustrativa de demostración: El jardín de cristal · Volumen 01', 6),
('polo-midnight', 'polos', 'Polo Neo Tokyo · Midnight', 'Producto ficticio para la tienda académica OtakuZone. La imagen es ilustrativa y puede reutilizarse entre variantes; no hay compras ni stock real.', 59.90, 'polo', 'Imagen ilustrativa de demostración: Polo Neo Tokyo · Midnight', 7),
('polo-cyan', 'polos', 'Polo Neo Tokyo · Cyan', 'Producto ficticio para la tienda académica OtakuZone. La imagen es ilustrativa y puede reutilizarse entre variantes; no hay compras ni stock real.', 64.90, 'polo', 'Imagen ilustrativa de demostración: Polo Neo Tokyo · Cyan', 8),
('polo-orbita', 'polos', 'Polo Órbita · Edición demo', 'Producto ficticio para la tienda académica OtakuZone. La imagen es ilustrativa y puede reutilizarse entre variantes; no hay compras ni stock real.', 69.90, 'polo', 'Imagen ilustrativa de demostración: Polo Órbita · Edición demo', 9),
('llavero-luna', 'accesorios', 'Llavero Luna de Neón', 'Producto ficticio para la tienda académica OtakuZone. La imagen es ilustrativa y puede reutilizarse entre variantes; no hay compras ni stock real.', 19.90, 'llavero', 'Imagen ilustrativa de demostración: Llavero Luna de Neón', 10),
('llavero-orbita', 'accesorios', 'Llavero Órbita Azul', 'Producto ficticio para la tienda académica OtakuZone. La imagen es ilustrativa y puede reutilizarse entre variantes; no hay compras ni stock real.', 24.90, 'llavero', 'Imagen ilustrativa de demostración: Llavero Órbita Azul', 11),
('llavero-jardin', 'accesorios', 'Llavero Jardín de Cristal', 'Producto ficticio para la tienda académica OtakuZone. La imagen es ilustrativa y puede reutilizarse entre variantes; no hay compras ni stock real.', 22.90, 'llavero', 'Imagen ilustrativa de demostración: Llavero Jardín de Cristal', 12)
ON DUPLICATE KEY UPDATE id = id;

INSERT INTO inventario (producto_id, cantidad_total, cantidad_reservada) VALUES
('figura-mensajera', 25, 0),
('figura-lunar', 25, 0),
('figura-orbita', 25, 0),
('manga-distrito-1', 25, 0),
('manga-distrito-2', 25, 0),
('manga-jardin', 25, 0),
('polo-midnight', 25, 0),
('polo-cyan', 25, 0),
('polo-orbita', 25, 0),
('llavero-luna', 25, 0),
('llavero-orbita', 25, 0),
('llavero-jardin', 25, 0)
ON DUPLICATE KEY UPDATE producto_id = producto_id;

INSERT INTO promociones (id, titulo, descripcion, destino, orden) VALUES
('neo-tokyo', 'Colección Neo Tokyo', 'Explora nuestra selección de productos ficticios. Imágenes ilustrativas y precios de demostración.', '/tienda', 1),
('universo', 'Tu próxima historia', 'Descubre información real de anime mediante Jikan. La tienda sigue siendo una simulación académica.', '/animes', 2)
ON DUPLICATE KEY UPDATE id = id;
