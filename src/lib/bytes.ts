export function bytesToBlob(bytes: Uint8Array, type: string): Blob {
  const copy = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(copy).set(bytes)
  return new Blob([copy], { type })
}

export function concat(parts: Uint8Array[]): Uint8Array {
  let length = 0
  for (const part of parts) length += part.length
  const out = new Uint8Array(length)
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.length
  }
  return out
}

export function ascii(bytes: Uint8Array, offset: number, length: number): string {
  let text = ''
  const end = Math.min(bytes.length, offset + length)
  for (let index = offset; index < end; index += 1) {
    text += String.fromCharCode(bytes[index])
  }
  return text
}

export function asciiBytes(text: string): Uint8Array {
  const out = new Uint8Array(text.length)
  for (let index = 0; index < text.length; index += 1) {
    out[index] = text.charCodeAt(index) & 0xff
  }
  return out
}

export function startsWithAscii(bytes: Uint8Array, text: string): boolean {
  if (bytes.length < text.length) return false
  for (let index = 0; index < text.length; index += 1) {
    if (bytes[index] !== text.charCodeAt(index)) return false
  }
  return true
}

export function readU32LE(bytes: Uint8Array, offset: number): number {
  return (
    bytes[offset] |
    (bytes[offset + 1] << 8) |
    (bytes[offset + 2] << 16) |
    (bytes[offset + 3] << 24)
  ) >>> 0
}

export function readU32BE(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset] << 24) |
      (bytes[offset + 1] << 16) |
      (bytes[offset + 2] << 8) |
      bytes[offset + 3]) >>>
    0
  )
}

export function writeU32LE(value: number): Uint8Array {
  return new Uint8Array([
    value & 255,
    (value >> 8) & 255,
    (value >> 16) & 255,
    (value >> 24) & 255,
  ])
}

export function writeU32BE(value: number): Uint8Array {
  return new Uint8Array([
    (value >>> 24) & 255,
    (value >>> 16) & 255,
    (value >>> 8) & 255,
    value & 255,
  ])
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    }
    table[n] = c >>> 0
  }
  return table
})()

export function crc32(data: Uint8Array): number {
  let c = 0xffffffff
  for (let index = 0; index < data.length; index += 1) {
    c = CRC_TABLE[(c ^ data[index]) & 0xff] ^ (c >>> 8)
  }
  return (c ^ 0xffffffff) >>> 0
}
