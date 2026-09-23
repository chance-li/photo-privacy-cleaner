import { ascii, readU32BE } from './bytes'

export const MAX_FILE_BYTES = 40 * 1024 * 1024

export type ImageKind = 'jpeg' | 'png' | 'webp' | 'heic'

const HEIC_BRANDS = new Set([
  'heic',
  'heix',
  'hevc',
  'hevx',
  'heim',
  'heis',
  'hevm',
  'hevs',
  'heif',
  'mif1',
  'msf1',
])

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

export function detectImageKind(bytes: Uint8Array): ImageKind | null {
  if (bytes.length < 12) return null
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return 'jpeg'
  if (PNG_SIGNATURE.every((byte, index) => bytes[index] === byte)) return 'png'
  if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') return 'webp'
  if (isHeic(bytes)) return 'heic'
  return null
}

function isHeic(bytes: Uint8Array): boolean {
  if (ascii(bytes, 4, 4) !== 'ftyp') return false
  if (HEIC_BRANDS.has(ascii(bytes, 8, 4))) return true
  const boxSize = readU32BE(bytes, 0)
  const end = Math.min(bytes.length, boxSize >= 16 ? boxSize : Math.min(bytes.length, 64))
  for (let offset = 16; offset + 4 <= end; offset += 4) {
    if (HEIC_BRANDS.has(ascii(bytes, offset, 4))) return true
  }
  return false
}

export function kindLabel(kind: ImageKind): string {
  switch (kind) {
    case 'jpeg':
      return 'JPEG'
    case 'png':
      return 'PNG'
    case 'webp':
      return 'WebP'
    case 'heic':
      return 'HEIC'
  }
}
