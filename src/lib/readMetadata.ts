import exifr from 'exifr'
import { ascii, asciiBytes, concat } from './bytes'
import { detectImageKind } from './detect'
import { formatValue } from './format'
import { classifyField, GROUP_ORDER, leafKey, type FieldGroup } from './labels'
import { extractWebpChunk } from './stripMetadata'

export interface MetaField {
  key: string
  label: string
  value: string
  group: FieldGroup
  sensitive: boolean
}

export interface GpsPoint {
  latitude: number
  longitude: number
  altitude: number | null
}

export interface MetadataReport {
  fields: MetaField[]
  gps: GpsPoint | null
  captureTime: string | null
  device: string | null
  software: string | null
  identity: string | null
  placeName: string | null
  makerNote: boolean
  warnings: string[]
}

const PARSE_OPTIONS = {
  tiff: true,
  ifd1: false,
  exif: true,
  gps: true,
  interop: true,
  xmp: true,
  iptc: true,
  icc: false,
  jfif: false,
  ihdr: false,
  makerNote: true,
  userComment: true,
  mergeOutput: true,
  sanitize: true,
  reviveValues: true,
  translateKeys: true,
  translateValues: true,
} as const

const SKIP_KEYS = new Set([
  'errors',
  'ExifOffset',
  'GPSInfo',
  'InteropOffset',
  'JPEGInterchangeFormat',
  'JPEGInterchangeFormatLength',
  'StripOffsets',
  'StripByteCounts',
  'TileOffsets',
  'TileByteCounts',
  'PrintIM',
  'ComponentsConfiguration',
  'ExifVersion',
  'FlashpixVersion',
  'SceneType',
  'FileSource',
  'GPSVersionID',
  'Padding',
  'thumbnail',
  'Thumbnail',
  'MakerNote',
  'GPSLatitude',
  'GPSLongitude',
  'GPSLatitudeRef',
  'GPSLongitudeRef',
  'GPSAltitudeRef',
])

export async function readPrivacyMetadata(input: Blob | Uint8Array): Promise<MetadataReport> {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(await input.arrayBuffer())
  const warnings: string[] = []
  const parsedResult = await parseFile(bytes)
  const parsed = parsedResult.parsed
  const gpsRaw = parsedResult.gps
  warnings.push(...parsedResult.warnings)

  const flat: { key: string; value: unknown }[] = []
  if (parsed && typeof parsed === 'object') flatten('', parsed, flat, 0)

  const makerNote = Boolean(parsed && Object.prototype.hasOwnProperty.call(parsed, 'MakerNote'))
  const fields: MetaField[] = []
  const seen = new Set<string>()

  for (const item of flat) {
    const leaf = leafKey(item.key)
    if (leaf === 'lang' || SKIP_KEYS.has(leaf) || SKIP_KEYS.has(item.key)) continue
    const text = formatValue(item.key, item.value)
    if (!text) continue
    if (seen.has(item.key)) continue
    seen.add(item.key)
    const meta = classifyField(item.key)
    fields.push({
      key: item.key,
      label: meta.label,
      value: text,
      group: meta.group,
      sensitive: meta.sensitive,
    })
  }

  const latitude = numberOrNull(gpsRaw?.latitude) ?? numberField(parsed, 'latitude')
  const longitude = numberOrNull(gpsRaw?.longitude) ?? numberField(parsed, 'longitude')
  const altitude = numberField(parsed, 'GPSAltitude')
  const gps =
    latitude != null && longitude != null && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180
      ? { latitude, longitude, altitude }
      : null

  if (makerNote) {
    fields.push({
      key: 'MakerNote',
      label: '厂商私有数据',
      value: '存在二进制厂商数据，可能包含序列号。清除时会一并去掉。',
      group: 'device',
      sensitive: true,
    })
  }

  fields.sort((a, b) => {
    const groupDelta = GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group)
    if (groupDelta !== 0) return groupDelta
    return a.label.localeCompare(b.label, 'zh')
  })

  return {
    fields,
    gps,
    captureTime: firstValue(fields, ['DateTimeOriginal', 'CreateDate', 'DateTimeDigitized', 'DateTime']),
    device: joinValues(fields, ['Make', 'Model']),
    software: firstValue(fields, ['Software', 'ProcessingSoftware', 'CreatorTool']),
    identity: joinValues(fields, ['Artist', 'Creator', 'By-line', 'CameraOwnerName', 'Copyright', 'CopyrightNotice']),
    placeName: joinValues(fields, ['Sub-location', 'City', 'Province-State', 'State', 'Country-PrimaryLocationName', 'Country']),
    makerNote,
    warnings,
  }
}

export function sensitiveFields(report: MetadataReport): MetaField[] {
  return report.fields.filter((field) => field.sensitive)
}

function firstValue(fields: MetaField[], keys: string[]): string | null {
  const wanted = new Set(keys)
  return fields.find((field) => wanted.has(leafKey(field.key)))?.value ?? null
}

function joinValues(fields: MetaField[], keys: string[]): string | null {
  const wanted = new Set(keys)
  const values: string[] = []
  for (const field of fields) {
    if (!wanted.has(leafKey(field.key))) continue
    if (!values.includes(field.value)) values.push(field.value)
  }
  return values.length > 0 ? values.join(' · ') : null
}

function numberField(parsed: Record<string, unknown> | undefined, key: string): number | null {
  if (!parsed) return null
  return numberOrNull(parsed[key])
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

async function parseFile(bytes: Uint8Array): Promise<{
  parsed: Record<string, unknown> | undefined
  gps: { latitude?: number; longitude?: number } | undefined
  warnings: string[]
}> {
  if (detectImageKind(bytes) === 'webp') return parseWebp(bytes)
  const warnings: string[] = []
  let parsed: Record<string, unknown> | undefined
  try {
    parsed = (await exifr.parse(bytes, PARSE_OPTIONS)) as Record<string, unknown> | undefined
  } catch {
    warnings.push('有一部分元数据无法解析，仍可以尝试清除。')
  }
  let gps: { latitude?: number; longitude?: number } | undefined
  try {
    gps = await exifr.gps(bytes)
  } catch {
    gps = undefined
  }
  return { parsed, gps, warnings }
}

async function parseWebp(bytes: Uint8Array): Promise<{
  parsed: Record<string, unknown> | undefined
  gps: { latitude?: number; longitude?: number } | undefined
  warnings: string[]
}> {
  const warnings: string[] = []
  const merged: Record<string, unknown> = {}
  let gps: { latitude?: number; longitude?: number } | undefined
  const exifChunk = extractWebpChunk(bytes, 'EXIF')
  if (exifChunk) {
    const tiff = ascii(exifChunk, 0, 6) === 'Exif\u0000\u0000' ? exifChunk.subarray(6) : exifChunk
    try {
      Object.assign(merged, (await exifr.parse(tiff, PARSE_OPTIONS)) ?? {})
    } catch {
      warnings.push('WebP 里的 EXIF 有一部分无法解析，仍可以尝试清除。')
    }
    try {
      gps = await exifr.gps(tiff)
    } catch {
      gps = undefined
    }
  }
  const xmpChunk = extractWebpChunk(bytes, 'XMP')
  if (xmpChunk) {
    try {
      Object.assign(merged, (await exifr.parse(jpegWrappingXmp(xmpChunk), { xmp: true })) ?? {})
    } catch {
      warnings.push('WebP 里的 XMP 有一部分无法解析，仍可以尝试清除。')
    }
  }
  return { parsed: merged, gps, warnings }
}

function jpegWrappingXmp(xmp: Uint8Array): Uint8Array {
  const payload = concat([asciiBytes('http://ns.adobe.com/xap/1.0/\u0000'), xmp])
  const length = payload.length + 2
  const segment = new Uint8Array(4 + payload.length)
  segment[0] = 0xff
  segment[1] = 0xe1
  segment[2] = (length >> 8) & 255
  segment[3] = length & 255
  segment.set(payload, 4)
  return concat([Uint8Array.of(0xff, 0xd8), segment, Uint8Array.of(0xff, 0xd9)])
}

function flatten(key: string, value: unknown, out: { key: string; value: unknown }[], depth: number): void {
  if (depth > 5 || value == null) return
  if (key === 'MakerNote' || leafKey(key) === 'MakerNote') return
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || value instanceof Date) {
    if (key) out.push({ key, value })
    return
  }
  if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer) return
  if (Array.isArray(value)) {
    if (value.every((item) => item == null || ['string', 'number', 'boolean'].includes(typeof item))) {
      const text = value
        .filter((item) => item != null && item !== '')
        .map(String)
        .join('、')
      if (key && text) out.push({ key, value: text })
      return
    }
    value.forEach((item, index) => flatten(`${key}[${index + 1}]`, item, out, depth + 1))
    return
  }
  if (typeof value === 'object') {
    for (const [child, childValue] of Object.entries(value as Record<string, unknown>)) {
      if (child === 'errors') continue
      flatten(key ? `${key}.${child}` : child, childValue, out, depth + 1)
    }
  }
}
