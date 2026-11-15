// Textos de presentación para las referencias actuales de Tienda Otaku.
// No reemplazan los datos del servidor ni se envían al carrito.
const descriptions = {
  'figura-mensajera': 'Lleva el espíritu de Distrito Cero a tu colección con su Mensajera. Una figura para dar protagonismo a tu rincón de exhibición.',
  'figura-lunar': 'Haz un lugar para la Guardiana Lunar entre tus personajes favoritos. Su temática lunar aporta un nuevo motivo para ampliar tu colección y exhibirla a tu manera.',
  'figura-orbita': 'Dale un lugar a la Exploradora Órbita en tu universo de figuras. Una propuesta de inspiración espacial para renovar tu zona de exhibición.',
  'manga-distrito-1': 'Comienza tu recorrido por Distrito Cero con el volumen 01. El punto de partida para descubrir esta historia y abrirle un espacio en tu colección de manga.',
  'manga-distrito-2': 'Continúa tu lectura de Distrito Cero con el volumen 02. Acompaña el primer tomo en tu estantería y sigue explorando su historia a tu ritmo.',
  'manga-jardin': 'Abre las páginas de El jardín de cristal con su volumen 01. Una nueva historia para tus momentos de lectura y el inicio de otra colección en tu biblioteca.',
  'polo-midnight': 'Haz de Neo Tokyo parte de tu estilo cotidiano con Midnight. Combínalo a tu manera en un look cómodo que exprese tu pasión por el universo anime.',
  'polo-cyan': 'Expresa tu lado Neo Tokyo con la propuesta Cyan. Un polo para crear combinaciones relajadas y darle identidad otaku a tu estilo de cada día.',
  'polo-orbita': 'Lleva la inspiración de Órbita a tus looks informales. Una opción para quienes buscan unir estilo anime y comodidad al vestir a su manera.',
  'llavero-luna': 'Dale a tus llaves un toque de Luna de Neón. Un accesorio para reunirlas y sumar un guiño a tu universo otaku en lo cotidiano.',
  'llavero-orbita': 'Pon tus llaves en la órbita de tu estilo con Órbita Azul. Un detalle para identificarlas y expresar tu afinidad por la temática espacial.',
  'llavero-jardin': 'Lleva un pequeño guiño a Jardín de Cristal junto a tus llaves. Un accesorio que une una función cotidiana con la personalidad de tu colección otaku.',
}

export function getProductDescription(product) {
  return Object.hasOwn(descriptions, product.id) ? descriptions[product.id] : product.description
}
