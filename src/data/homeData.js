// Presentación de planes; precios y suscripción activa proceden del servidor.
export function presentSubscription(plan) {
  const premium = plan.code === 'premium'
  return {
    name: premium ? 'Premium' : plan.code === 'free' ? 'Free' : plan.name,
    price: Number(plan.price),
    featured: premium,
    tagline: premium ? 'Disfruta de una experiencia más exclusiva dentro de OtakuZone.' : 'Explora el universo OtakuZone sin costo y descubre nuevas historias.',
    benefits: premium
      ? ['Todos los beneficios del plan Free.', 'Navegación sin espacios promocionales en Inicio.', 'Insignia Premium visible en el encabezado de tu cuenta.']
      : ['Acceso al catálogo de anime.', 'Búsqueda y exploración por géneros.', 'Lista personal de animes favoritos.', 'Acceso a la tienda Otaku.', 'Descubrimiento de novedades de la temporada.'],
  }
}
