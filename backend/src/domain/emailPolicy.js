// Browser-safe policy shared with frontend hints. Format validation remains Zod's
// existing email validator on the server; no transliteration or IDN conversion.
export function normalizeAsciiEmail(value) {
  if (typeof value !== 'string' || [...value].some(character => character.codePointAt(0) > 127)) {
    throw new Error('Usa un correo ASCII válido, sin caracteres Unicode.')
  }
  // Check the ORIGINAL input first: e.g. Kelvin sign and Unicode outer spaces
  // must not silently become valid ASCII through lowercasing or trimming.
  return value.trim().toLowerCase()
}
