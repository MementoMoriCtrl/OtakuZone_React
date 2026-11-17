import { isIP } from 'node:net'

// Only IP/CIDR lists, never blanket `true` or an assumed hop count.
export function loadTrustProxy(value = 'false') {
  if (value === 'false') return false
  const entries = value.split(',').map((entry) => entry.trim())
  if (!entries.length || entries.some((entry) => {
    const [address, bits, extra] = entry.split('/')
    const version = isIP(address)
    return !version || extra !== undefined || (bits !== undefined &&
      (!/^\d+$/.test(bits) || Number(bits) < 1 || Number(bits) > (version === 4 ? 32 : 128)))
  })) throw new Error('Configuración inválida: TRUST_PROXY requiere false o IP/CIDR de proxies verificados.')
  return entries
}
