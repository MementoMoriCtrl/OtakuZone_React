import distritoImage from '../assets/demo/distrito-cero.png'
import jardinImage from '../assets/demo/jardin-cristal.png'
import orbitaImage from '../assets/demo/orbita-09.png'
import cafeImage from '../assets/demo/cafe-nubes.png'
import archivoImage from '../assets/demo/archivo-lunar.png'
import islaImage from '../assets/demo/isla-bruma.png'
import figuraImage from '../assets/demo/figura.png'
import mangaImage from '../assets/demo/manga.png'
import poloImage from '../assets/demo/polo.png'
import llaveroImage from '../assets/demo/llavero.png'

// Obras, temporadas, puntuaciones y precios ficticios para la presentación académica.
export const popularAnime = [
  { id: 'distrito-cero', title: 'Distrito Cero', genre: 'Acción · Ciencia ficción', score: 9.2, season: '2026 · Temporada 1', image: distritoImage, imageAlt: 'Mensajera de cabello plateado sobre una ciudad futurista', description: 'Una mensajera descubre un mapa capaz de cambiar el destino de una ciudad que nunca duerme.' },
  { id: 'jardin-cristal', title: 'El jardín de cristal', genre: 'Fantasía · Romance', score: 8.9, season: '2026 · Temporada 1', image: jardinImage, imageAlt: 'Botánica entre flores de cristal iluminadas por la luna', description: 'Una botánica encuentra un jardín donde cada flor conserva un recuerdo que alguien ha perdido.' },
  { id: 'orbita-09', title: 'Órbita 09', genre: 'Ciencia ficción · Aventura', score: 9.1, season: '2025 · Temporada 1', image: orbitaImage, imageAlt: 'Astronauta en un observatorio frente a un planeta azul', description: 'Lejos de la Tierra, una tripulación sigue una señal que parece conocer todos sus secretos.' },
  { id: 'cafe-nubes', title: 'Café entre nubes', genre: 'Comedia · Vida cotidiana', score: 8.7, season: '2026 · Temporada 1', image: cafeImage, imageAlt: 'Dos amigos comparten un momento en una cafetería entre nubes', description: 'Una pequeña cafetería en las alturas conecta a personas con sueños tan distintos como sus pedidos.' },
]

export const latestAnime = [
  { ...popularAnime[0], id: 'distrito-cero-t2', season: '2027 · Temporada 2', description: 'La mensajera regresa a las azoteas para descifrar el origen de un nuevo distrito oculto.' },
  { id: 'archivo-lunar', title: 'Archivo lunar', genre: 'Fantasía · Misterio', score: 8.8, season: '2027 · Temporada 1', image: archivoImage, imageAlt: 'Bibliotecario con un cuaderno luminoso entre mapas estelares', description: 'Cada noche, una biblioteca escribe un nuevo capítulo sobre un futuro que todavía puede cambiar.' },
  { id: 'isla-bruma', title: 'Isla de bruma', genre: 'Aventura · Fantasía', score: 8.6, season: '2027 · Temporada 1', image: islaImage, imageAlt: 'Viajera frente a islas flotantes y cascadas entre la niebla', description: 'Una viajera cruza islas flotantes en busca del faro que guía a quienes han perdido su hogar.' },
  { ...popularAnime[1], id: 'jardin-cristal-t2', season: '2027 · Temporada 2', description: 'Una nueva flor aparece en el jardín y revela un recuerdo que nadie reconoce como suyo.' },
]

export const categories = [
  { id: 'accion', name: 'Acción', description: 'Historias que aceleran el pulso', icon: 'swords' },
  { id: 'aventura', name: 'Aventura', description: 'Un mundo por descubrir', icon: 'compass' },
  { id: 'romance', name: 'Romance', description: 'Conexiones inolvidables', icon: 'heart' },
  { id: 'fantasia', name: 'Fantasía', description: 'Más allá de lo imaginable', icon: 'sparkles' },
  { id: 'ciencia-ficcion', name: 'Ciencia ficción', description: 'Explora otros futuros', icon: 'orbit' },
  { id: 'comedia', name: 'Comedia', description: 'Tu próxima dosis de alegría', icon: 'laugh' },
]

export const products = [
  { id: 'figura', name: 'Figura Mensajera de Distrito Cero', category: 'Figuras coleccionables', price: 129.90, image: figuraImage, imageAlt: 'Figura de resina de una mensajera con chaqueta azul y bufanda cian' },
  { id: 'manga', name: 'Distrito Cero · Volumen 01', category: 'Mangas', price: 39.90, image: mangaImage, imageAlt: 'Manga con ilustración de una mensajera en una ciudad futurista' },
  { id: 'polo', name: 'Polo Neo Tokyo · Midnight', category: 'Polos', price: 59.90, image: poloImage, imageAlt: 'Polo azul medianoche con un emblema de rayo cian y anillo violeta' },
  { id: 'llavero', name: 'Llavero Luna de Neón', category: 'Accesorios · Llaveros', price: 19.90, image: llaveroImage, imageAlt: 'Llavero acrílico de luna cian y estrella violeta con argolla plateada' },
]

export const subscriptions = [
  { id: 'free', name: 'FREE', tagline: 'Tu primer paso al universo anime.', price: 0, benefits: ['Acceso al catálogo de anime', 'Consulta de información y detalles', 'Gestión de favoritos', 'Espacios promocionales simulados'], action: 'Conocer plan Free' },
  { id: 'premium', name: 'PREMIUM', tagline: 'Una experiencia con tu propia insignia.', price: 19.90, benefits: ['Todos los beneficios del plan Free', 'Experiencia sin publicidad simulada', 'Insignia Premium', 'Beneficios exclusivos demostrativos'], action: 'Conocer plan Premium', featured: true },
]
