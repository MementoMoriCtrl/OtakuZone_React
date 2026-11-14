import { useState } from 'react'

export default function MediaImage({ src, alt, ...props }) {
  const [failedSrc, setFailedSrc] = useState(null)
  if (!src || failedSrc === src) return <div role="img" aria-label={alt} className="flex h-full w-full items-center justify-center bg-neo-slate p-6 text-center text-sm text-neo-white/65">Imagen no disponible</div>
  return <img src={src} alt={alt} onError={() => setFailedSrc(src)} {...props} />
}
