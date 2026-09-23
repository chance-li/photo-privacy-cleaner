import { ascii, asciiBytes, concat, crc32, readU32BE, readU32LE, startsWithAscii, writeU32BE, writeU32LE } from './bytes'
import { detectImageKind, MAX_FILE_BYTES, type ImageKind } from './detect'
import { CleanerError } from './errors'
import { decodeHeicToJpeg } from './heic'

export interface StripResult {
  bytes: Uint8Array
  mime: string
  extension: string
  kind: ImageKind
  mode: 'lossless' | 'reencode'
  keptOrientation: number | null
  note: string
}

const PNG_ANCILLARY_KEEP = new Set([
  'tRNS',
  'gAMA',
  'cHRM',
  'sRGB',
  'iCCP',
  'sBIT',
  'bKGD',
  'pHYs',
  'sPLT',
  'hIST',
  'acTL',
  'fcTL',
  'fdAT',
  'cICP',
  'cLLI',
  'mDCv',
])

export function extractWebpChunk(input: Uint8Array, wanted: 'EXIF' | 'XMP'): Uint8Array | null {
  if (!(ascii(input, 0, 4) === 'RIFF' && ascii(input, 8, 4) === 'WEBP')) return null
  let offset = 12
  while (offset + 8 <= input.length) {
    const id = ascii(input, offset, 4)
    const size = readU32LE(input, offset + 4)
    const end = offset + 8 + size
    if (end > input.length) return null
    const matches = wanted === 'EXIF' ? id === 'EXIF' : id.trim() === 'XMP'
    if (matches) return input.subarray(offset + 8, end)
    offset = end + (size % 2)
  }
  return null
}

export async function stripImage(file: Blob): Promise<StripResult> {
  if (file.size > MAX_FILE_BYTES) {
    throw new CleanerError('文件太大，浏览器里处理可能会卡住。请换一张较小的照片。', 'too-large')
  }
  const bytes = new Uint8Array(await file.arrayBuffer())
  const kind = detectImageKind(bytes)
  if (!kind) {
    throw new CleanerError('无法识别这个文件。请使用 JPEG、PNG、WebP 或 HEIC 照片。', 'unsupported')
  }
  if (kind === 'jpeg') return finishLossless('jpeg', 'image/jpeg', 'jpg', stripJpeg(bytes))
  if (kind === 'png') return finishLossless('png', 'image/png', 'png', stripPng(bytes))
  if (kind === 'webp') return finishLossless('webp', 'image/webp', 'webp', stripWebp(bytes))
  const decoded = await decodeHeicToJpeg(file)
  const stripped = stripJpeg(decoded)
  return {
    bytes: stripped.bytes,
    mime: 'image/jpeg',
    extension: 'jpg',
    kind: 'heic',
    mode: 'reencode',
    keptOrientation: null,
    note: 'HEIC 需要先解码再保存为 JPEG，画质会有轻微变化。新文件不会写入拍摄时间、位置或身份信息。',
  }
}

function finishLossless(
  kind: ImageKind,
  mime: string,
  extension: string,
  result: { bytes: Uint8Array; keptOrientation: number | null },
): StripResult {
  const orientationNote = result.keptOrientation
    ? '已保留画面方向，避免照片转歪。'
    : '画面方向无需单独保留。'
  return {
    bytes: result.bytes,
    mime,
    extension,
    kind,
    mode: 'lossless',
    keptOrientation: result.keptOrientation,
    note: `像素未重新压缩。色彩配置予以保留。${orientationNote}时间、位置、设备、作者、版权和注释已从文件中移除。`,
  }
}

export function stripJpeg(input: Uint8Array): { bytes: Uint8Array; keptOrientation: number | null } {
  if (input.length < 4 || input[0] !== 0xff || input[1] !== 0xd8) {
    throw new CleanerError('这不是有效的 JPEG 文件。', 'corrupt')
  }

  const parts: Uint8Array[] = [input.subarray(0, 2)]
  let orientation: number | null = null
  let offset = 2
  let sawScan = false

  while (offset < input.length) {
    if (input[offset] !== 0xff) {
      throw new CleanerError('JPEG 结构已损坏，已停止处理以免破坏画面。', 'corrupt')
    }
    const markerStart = offset
    while (offset < input.length && input[offset] === 0xff) offset += 1
    if (offset >= input.length) break
    const marker = input[offset]
    offset += 1

    if (marker === 0xd9) {
      parts.push(input.subarray(markerStart, offset))
      break
    }
    if (marker === 0x00) {
      throw new CleanerError('JPEG 结构已损坏，已停止处理以免破坏画面。', 'corrupt')
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      parts.push(input.subarray(markerStart, offset))
      continue
    }
    if (offset + 2 > input.length) {
      throw new CleanerError('JPEG 结构已损坏，已停止处理以免破坏画面。', 'corrupt')
    }
    const segmentLength = (input[offset] << 8) | input[offset + 1]
    if (segmentLength < 2 || offset + segmentLength > input.length) {
      throw new CleanerError('JPEG 结构已损坏，已停止处理以免破坏画面。', 'corrupt')
    }
    const payload = input.subarray(offset + 2, offset + segmentLength)
    const segment = input.subarray(markerStart, offset + segmentLength)
    if (marker === 0xe1) {
      const found = readOrientationFromExifBlob(payload)
      if (found) orientation = found
    }
    if (shouldKeepJpegSegment(marker, payload)) parts.push(segment)
    offset += segmentLength
    if (marker === 0xda) {
      sawScan = true
      const scanEnd = findScanEnd(input, offset)
      parts.push(input.subarray(offset, scanEnd))
      offset = scanEnd
    }
  }

  if (!sawScan) {
    throw new CleanerError('JPEG 结构已损坏，已停止处理以免破坏画面。', 'corrupt')
  }

  let keptOrientation: number | null = null
  if (orientation && orientation >= 2 && orientation <= 8) {
    parts.splice(1, 0, minimalOrientationApp1(orientation))
    keptOrientation = orientation
  }

  let bytes = concat(parts)
  if (bytes.length < 2 || bytes[bytes.length - 2] !== 0xff || bytes[bytes.length - 1] !== 0xd9) {
    bytes = concat([bytes, new Uint8Array([0xff, 0xd9])])
  }
  return { bytes, keptOrientation }
}

function shouldKeepJpegSegment(marker: number, payload: Uint8Array): boolean {
  if (marker === 0xfe) return false
  if (marker < 0xe0 || marker > 0xef) return true
  if (marker === 0xe0) return true
  if (marker === 0xe2 && startsWithAscii(payload, 'ICC_PROFILE')) return true
  if (marker === 0xee && startsWithAscii(payload, 'Adobe')) return true
  return false
}

function findScanEnd(input: Uint8Array, offset: number): number {
  let position = offset
  while (position < input.length) {
    if (input[position] !== 0xff) {
      position += 1
      continue
    }
    let marker = position + 1
    while (marker < input.length && input[marker] === 0xff) marker += 1
    if (marker >= input.length) return input.length
    const value = input[marker]
    if (value === 0x00 || (value >= 0xd0 && value <= 0xd7)) {
      position = marker + 1
      continue
    }
    return position
  }
  return input.length
}

export function stripPng(input: Uint8Array): { bytes: Uint8Array; keptOrientation: number | null } {
  if (!isPng(input)) throw new CleanerError('这不是有效的 PNG 文件。', 'corrupt')
  const chunks: { type: string; raw: Uint8Array }[] = []
  let orientation: number | null = null
  let offset = 8
  while (offset + 12 <= input.length) {
    const length = readU32BE(input, offset)
    const type = ascii(input, offset + 4, 4)
    const end = offset + 12 + length
    if (end > input.length) throw new CleanerError('PNG 结构已损坏，已停止处理以免破坏画面。', 'corrupt')
    const data = input.subarray(offset + 8, offset + 8 + length)
    if (type === 'eXIf') {
      const found = readOrientationFromExifBlob(data)
      if (found) orientation = found
    }
    if (keepPngChunk(type)) chunks.push({ type, raw: input.subarray(offset, end) })
    if (type === 'IEND') break
    offset = end
  }
  const iendIndex = chunks.findIndex((chunk) => chunk.type === 'IEND')
  if (iendIndex === -1) throw new CleanerError('PNG 结构已损坏，已停止处理以免破坏画面。', 'corrupt')

  let keptOrientation: number | null = null
  if (orientation && orientation >= 2 && orientation <= 8) {
    chunks.splice(iendIndex, 0, { type: 'eXIf', raw: pngChunk('eXIf', minimalTiff(orientation)) })
    keptOrientation = orientation
  }
  return {
    bytes: concat([input.subarray(0, 8), ...chunks.map((chunk) => chunk.raw)]),
    keptOrientation,
  }
}

function isPng(bytes: Uint8Array): boolean {
  return (
    bytes.length > 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  )
}

function keepPngChunk(type: string): boolean {
  if (type === 'eXIf') return false
  if (type[0] === type[0].toUpperCase()) return true
  return PNG_ANCILLARY_KEEP.has(type)
}

export function stripWebp(input: Uint8Array): { bytes: Uint8Array; keptOrientation: number | null } {
  if (!(ascii(input, 0, 4) === 'RIFF' && ascii(input, 8, 4) === 'WEBP')) {
    throw new CleanerError('这不是有效的 WebP 文件。', 'corrupt')
  }
  const chunks: { id: string; data: Uint8Array }[] = []
  let orientation: number | null = null
  let offset = 12
  while (offset + 8 <= input.length) {
    const id = ascii(input, offset, 4)
    const size = readU32LE(input, offset + 4)
    const dataEnd = offset + 8 + size
    if (dataEnd > input.length) throw new CleanerError('WebP 结构已损坏，已停止处理以免破坏画面。', 'corrupt')
    const data = input.subarray(offset + 8, dataEnd)
    if (id === 'EXIF') {
      const found = readOrientationFromExifBlob(data)
      if (found) orientation = found
    }
    chunks.push({ id, data })
    offset = dataEnd + (size % 2)
  }

  const kept: { id: string; data: Uint8Array }[] = []
  for (const chunk of chunks) {
    if (isPrivacyWebpChunk(chunk.id)) continue
    if (chunk.id === 'VP8X' && chunk.data.length > 0) {
      const data = new Uint8Array(chunk.data)
      data[0] &= ~0x0c
      kept.push({ id: chunk.id, data })
    } else {
      kept.push(chunk)
    }
  }

  let keptOrientation: number | null = null
  if (orientation && orientation >= 2 && orientation <= 8) {
    kept.push({ id: 'EXIF', data: minimalTiff(orientation) })
    const vp8x = kept.find((chunk) => chunk.id === 'VP8X')
    if (vp8x && vp8x.data.length > 0) {
      const data = new Uint8Array(vp8x.data)
      data[0] |= 0x08
      vp8x.data = data
    }
    keptOrientation = orientation
  }

  const simplified = keptOrientation ? kept : simplifyWebp(kept)
  if (!simplified.some((chunk) => chunk.id === 'VP8 ' || chunk.id === 'VP8L' || chunk.id === 'ANMF')) {
    throw new CleanerError('WebP 结构已损坏，已停止处理以免破坏画面。', 'corrupt')
  }
  return { bytes: buildWebp(simplified), keptOrientation }
}

function isPrivacyWebpChunk(id: string): boolean {
  return id === 'EXIF' || id.trim() === 'XMP'
}

function simplifyWebp(chunks: { id: string; data: Uint8Array }[]): { id: string; data: Uint8Array }[] {
  if (chunks.length === 2 && chunks[0].id === 'VP8X' && chunks[0].data.length > 0) {
    const flags = chunks[0].data[0] & 0x3e
    const image = chunks[1]
    if (flags === 0 && (image.id === 'VP8 ' || image.id === 'VP8L')) return [image]
  }
  return chunks
}

function buildWebp(chunks: { id: string; data: Uint8Array }[]): Uint8Array {
  const parts: Uint8Array[] = []
  for (const chunk of chunks) {
    const header = new Uint8Array(8)
    header.set(asciiBytes(chunk.id), 0)
    header.set(writeU32LE(chunk.data.length), 4)
    parts.push(header, chunk.data)
    if (chunk.data.length % 2 === 1) parts.push(new Uint8Array([0]))
  }
  const body = concat(parts)
  const header = new Uint8Array(12)
  header.set(asciiBytes('RIFF'), 0)
  header.set(writeU32LE(4 + body.length), 4)
  header.set(asciiBytes('WEBP'), 8)
  return concat([header, body])
}

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = asciiBytes(type)
  const crc = crc32(concat([typeBytes, data]))
  return concat([writeU32BE(data.length), typeBytes, data, writeU32BE(crc)])
}

function readOrientationFromExifBlob(data: Uint8Array): number | null {
  if (data.length >= 6 && ascii(data, 0, 6) === 'Exif\u0000\u0000') {
    return readTiffOrientation(data.subarray(6))
  }
  return readTiffOrientation(data)
}

function readTiffOrientation(tiff: Uint8Array): number | null {
  if (tiff.length < 8) return null
  const little = tiff[0] === 0x49 && tiff[1] === 0x49
  const big = tiff[0] === 0x4d && tiff[1] === 0x4d
  if (!little && !big) return null
  const u16 = (offset: number) => {
    if (offset + 1 >= tiff.length) return null
    return little ? tiff[offset] | (tiff[offset + 1] << 8) : (tiff[offset] << 8) | tiff[offset + 1]
  }
  const u32 = (offset: number) => {
    if (offset + 3 >= tiff.length) return null
    return little
      ? (tiff[offset] | (tiff[offset + 1] << 8) | (tiff[offset + 2] << 16) | (tiff[offset + 3] << 24)) >>> 0
      : ((tiff[offset] << 24) | (tiff[offset + 1] << 16) | (tiff[offset + 2] << 8) | tiff[offset + 3]) >>> 0
  }
  if (u16(2) !== 42) return null
  const ifd = u32(4)
  if (ifd == null || ifd + 2 > tiff.length) return null
  const count = u16(ifd)
  if (count == null || count > 256) return null
  for (let index = 0; index < count; index += 1) {
    const entry = ifd + 2 + index * 12
    if (entry + 12 > tiff.length) return null
    const tag = u16(entry)
    if (tag !== 0x0112) continue
    const type = u16(entry + 2)
    const value = type === 3 ? u16(entry + 8) : u32(entry + 8)
    if (value != null && value >= 1 && value <= 8) return value
    return null
  }
  return null
}

function minimalTiff(orientation: number): Uint8Array {
  const tiff = new Uint8Array(26)
  tiff[0] = 0x49
  tiff[1] = 0x49
  tiff[2] = 42
  tiff[4] = 8
  tiff[8] = 1
  tiff[10] = 0x12
  tiff[11] = 0x01
  tiff[12] = 3
  tiff[14] = 1
  tiff[18] = orientation
  return tiff
}

function minimalOrientationApp1(orientation: number): Uint8Array {
  const header = asciiBytes('Exif\u0000\u0000')
  const tiff = minimalTiff(orientation)
  const payloadLength = header.length + tiff.length
  const segmentLength = 2 + payloadLength
  const out = new Uint8Array(2 + segmentLength)
  out[0] = 0xff
  out[1] = 0xe1
  out[2] = (segmentLength >> 8) & 255
  out[3] = segmentLength & 255
  out.set(header, 4)
  out.set(tiff, 4 + header.length)
  return out
}
