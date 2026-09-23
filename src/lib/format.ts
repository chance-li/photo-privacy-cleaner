import { orientationLabel } from './labels'

export function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

export function formatValue(key: string, value: unknown): string | null {
  if (value == null) return null
  const leaf = key.split('.').pop() ?? key

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null
    return formatDate(value)
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null
    return formatNumber(leaf, value)
  }

  if (typeof value === 'boolean') return value ? '是' : '否'

  if (typeof value === 'string') {
    const trimmed = repairLatin1Utf8(value.replace(/\u0000/g, '').trim())
    if (!trimmed) return null
    if (leaf === 'Orientation') return orientationLabel(trimmed) ?? trimmed
    const dated = formatExifDateString(trimmed)
    return dated.length > 500 ? `${dated.slice(0, 500)}…` : dated
  }

  return null
}

export function formatDate(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

export function formatExifDateString(value: string): string {
  const match = value.match(/^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}:\d{2}:\d{2})/)
  if (!match) return value
  return `${match[1]}-${match[2]}-${match[3]} ${match[4]}`
}

export function formatCoordinate(latitude: number, longitude: number): string {
  const latHemisphere = latitude >= 0 ? '北纬' : '南纬'
  const lonHemisphere = longitude >= 0 ? '东经' : '西经'
  return `${latHemisphere} ${Math.abs(latitude).toFixed(5)}°，${lonHemisphere} ${Math.abs(longitude).toFixed(5)}°`
}

export function formatDms(latitude: number, longitude: number): string {
  return `${toDms(latitude, 'N', 'S')}，${toDms(longitude, 'E', 'W')}`
}

export function osmLink(latitude: number, longitude: number): string {
  const lat = latitude.toFixed(6)
  const lon = longitude.toFixed(6)
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=16/${lat}/${lon}`
}

function toDms(value: number, positive: string, negative: string): string {
  const hemisphere = value >= 0 ? positive : negative
  const absolute = Math.abs(value)
  const degrees = Math.floor(absolute)
  const minutesFloat = (absolute - degrees) * 60
  const minutes = Math.floor(minutesFloat)
  const seconds = (minutesFloat - minutes) * 60
  return `${degrees}°${String(minutes).padStart(2, '0')}′${seconds.toFixed(1).padStart(4, '0')}″ ${hemisphere}`
}

function formatNumber(key: string, value: number): string {
  if (key === 'Orientation') return orientationLabel(String(value)) ?? String(value)
  if (key === 'FNumber' || key === 'ApertureValue') return `f/${trimNumber(value)}`
  if (key === 'ExposureTime') {
    if (value > 0 && value < 1) return `1/${Math.round(1 / value)} 秒`
    return `${trimNumber(value)} 秒`
  }
  if (key === 'FocalLength' || key === 'FocalLengthIn35mmFormat') return `${trimNumber(value)} mm`
  if (key === 'ISO' || key === 'ISOSpeedRatings') return `ISO ${trimNumber(value)}`
  if (key === 'GPSAltitude') return `${trimNumber(value)} 米`
  if (key === 'latitude' || key === 'longitude' || key === 'GPSDestLatitude' || key === 'GPSDestLongitude') {
    return `${value.toFixed(5)}°`
  }
  if (Number.isInteger(value)) return String(value)
  return trimNumber(value)
}

function trimNumber(value: number): string {
  const rounded = Math.round(value * 10000) / 10000
  return String(rounded)
}

// Some IPTC readers, including exifr, decode UTF-8 bytes as Latin-1.
function repairLatin1Utf8(value: string): string {
  const codes = [...value].map((char) => char.charCodeAt(0))
  if (codes.some((code) => code > 255) || !codes.some((code) => code > 127)) return value
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(codes))
  } catch {
    return value
  }
}
