// Presentación de planes; precios y suscripción activa proceden del servidor.
export function presentSubscription(plan) {
  const premium = plan.code === 'premium'
  return {
    name: premium ? 'Premium' : plan.code === 'free' ? 'Free' : plan.name,
    price: Number(plan.price),
    featured: premium,
    tagline: premium ? 'Disfruta de ventajas especiales dentro del universo OtakuZone.' : 'Explora el universo OtakuZone sin costo.',
    benefits: premium
      ? ['Todos los beneficios del plan Free.', 'Insignia Premium exclusiva en tu perfil, visible en el encabezado.']
      : ['Acceso al catálogo completo de anime.', 'Búsqueda y exploración por géneros.', 'Lista personal de animes favoritos.', 'Acceso a Tienda Otaku.', 'Descubre novedades y temporadas.'],
    upcomingBenefits: premium ? [
      'Descuentos especiales en productos de Tienda Otaku.',
      'Colecciones personalizadas de anime.',
      'Seguimiento de animes vistos y pendientes.',
      'Historial personal de exploración.',
      'Recomendaciones basadas en tus preferencias.',
      'Selección destacada de novedades y próximos estrenos.',
    ] : [],
  }
}
