export function createVercelConfig(environment = process.env) {
  let origin
  try {
    const url = new URL(environment.RENDER_API_ORIGIN)
    if (url.protocol !== 'https:' || !url.hostname.endsWith('.onrender.com') || url.username || url.password || url.search || url.hash || url.pathname !== '/' || url.port) throw new Error()
    origin = url.origin
  } catch { throw new Error('RENDER_API_ORIGIN requiere el origen HTTPS real de Render, sin rutas ni credenciales.') }
  return {
    framework: 'vite', installCommand: 'npm ci', buildCommand: 'npm run build', outputDirectory: 'dist',
    rewrites: [
      { source: '/api/v1', destination: `${origin}/api/v1` },
      { source: '/api/v1/:path*', destination: `${origin}/api/v1/:path*` },
      { source: '/(.*)', destination: '/index.html' },
    ],
    headers: [
      ...['/api/v1', '/api/v1/:path*'].map(source => ({ source, headers: [
        { key: 'Cache-Control', value: 'no-store' },
        { key: 'CDN-Cache-Control', value: 'no-store' },
        { key: 'Vercel-CDN-Cache-Control', value: 'no-store' },
        { key: 'x-vercel-enable-rewrite-caching', value: '0' },
      ] })),
      { source: '/(.*)', headers: [
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'X-Frame-Options', value: 'DENY' },
      ] },
    ],
  }
}
