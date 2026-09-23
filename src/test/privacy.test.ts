import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { inflateSync } from 'node:zlib'
import { decode } from 'jpeg-js'
import { describe, expect, it } from 'vitest'
import { detectImageKind } from '../lib/detect'
import { readPrivacyMetadata } from '../lib/readMetadata'
import { stripJpeg, stripPng, stripWebp } from '../lib/stripMetadata'
import exifr from 'exifr'
import {
  chunkPayload,
  extractExifTiff,
  paintJpeg,
  pngWithPrivacy,
  privacyJpeg,
  SAMPLE_LATITUDE,
  SAMPLE_LONGITUDE,
  webpWithChunks,
} from './fixtures'
import { asciiBytes } from '../lib/bytes'

const BANNED = ['Apple', 'iPhone', 'Zhang San', 'SecretStudio', '张三', '上海', 'SN123456789', 'secret-comment', 'Family dinner', 'SECRETMPF']

describe('detectImageKind', () => {
  it('recognizes jpeg, png, webp, and heic brands', () => {
    const jpeg = privacyJpeg()
    expect(detectImageKind(jpeg)).toBe('jpeg')
    const tiff = extractExifTiff(jpeg)
    expect(detectImageKind(pngWithPrivacy(tiff))).toBe('png')
    const webp = webpWithChunks([{ id: 'VP8 ', data: asciiBytes('frame') }])
    expect(detectImageKind(webp)).toBe('webp')
    const heic = new Uint8Array(24)
    heic.set([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63], 0)
    expect(detectImageKind(heic)).toBe('heic')
    expect(detectImageKind(asciiBytes('not-an-image!!'))).toBeNull()
  })
})

describe('jpeg privacy cleaner', () => {
  it('reads capture time, gps, and identity, then removes them', async () => {
    const original = privacyJpeg({ orientation: 6 })
    const before = await readPrivacyMetadata(original)
    expect(before.captureTime, fieldDump(before.fields)).toContain('2024-08-01 19:45:12')
    expect(before.gps, fieldDump(before.fields)).not.toBeNull()
    expect(before.gps?.latitude).toBeCloseTo(SAMPLE_LATITUDE, 4)
    expect(before.gps?.longitude).toBeCloseTo(SAMPLE_LONGITUDE, 4)
    expect(before.device).toContain('Apple')
    expect(before.device).toContain('iPhone 15')
    expect(before.fields.some((field) => field.value.includes('张三'))).toBe(true)
    expect(before.fields.some((field) => field.value.includes('上海'))).toBe(true)
    expect(before.fields.some((field) => field.value.includes('SN123456789'))).toBe(true)

    const stripped = stripJpeg(original)
    expect(stripped.keptOrientation).toBe(6)
    expect(await exifr.orientation(stripped.bytes)).toBe(6)
    assertGone(stripped.bytes)
    expect(Buffer.from(stripped.bytes).includes(Buffer.from('ICC_PROFILE'))).toBe(true)

    const after = await readPrivacyMetadata(stripped.bytes)
    expect(after.gps).toBeNull()
    expect(after.captureTime).toBeNull()
    expect(after.device).toBeNull()
    expect(after.fields.some((field) => BANNED.some((word) => field.value.includes(word)))).toBe(false)
    expect(after.fields.some((field) => field.key === 'Orientation')).toBe(true)

    const beforePixels = decode(original, { useTArray: true, formatAsRGBA: true })
    const afterPixels = decode(stripped.bytes, { useTArray: true, formatAsRGBA: true })
    expect(afterPixels.width).toBe(beforePixels.width)
    expect(afterPixels.height).toBe(beforePixels.height)
    expect(Buffer.from(afterPixels.data)).toEqual(Buffer.from(beforePixels.data))
  })

  it('keeps scan bytes, including stuffed markers and a later scan', () => {
    const secret = segment(0xfe, asciiBytes('SECRET'))
    const dqt = segment(0xdb, Uint8Array.of(0, 1, 2, 3))
    const sos1 = segment(0xda, Uint8Array.of(0))
    const scan1 = Uint8Array.of(0x11, 0x22, 0xff, 0x00, 0x33, 0xff, 0xd0, 0x44)
    const dht = segment(0xc4, Uint8Array.of(0, 0x99))
    const sos2 = segment(0xda, Uint8Array.of(0))
    const scan2 = Uint8Array.of(0x55, 0x66)
    const original = concatBytes([
      Uint8Array.of(0xff, 0xd8),
      secret,
      dqt,
      sos1,
      scan1,
      dht,
      sos2,
      scan2,
      Uint8Array.of(0xff, 0xd9),
    ])
    const stripped = stripJpeg(original).bytes
    expect(Array.from(stripped)).toEqual(
      Array.from(
        concatBytes([
          Uint8Array.of(0xff, 0xd8),
          dqt,
          sos1,
          scan1,
          dht,
          sos2,
          scan2,
          Uint8Array.of(0xff, 0xd9),
        ]),
      ),
    )
  })

  it('leaves a jpeg without privacy metadata decodable', async () => {
    const plain = paintJpeg(20, 12, 75)
    const report = await readPrivacyMetadata(plain)
    expect(report.gps).toBeNull()
    expect(report.captureTime).toBeNull()
    const stripped = stripJpeg(plain)
    const beforePixels = decode(plain, { useTArray: true })
    const afterPixels = decode(stripped.bytes, { useTArray: true })
    expect(Buffer.from(afterPixels.data)).toEqual(Buffer.from(beforePixels.data))
  })

  it('rejects a truncated jpeg', () => {
    expect(() => stripJpeg(Uint8Array.of(0xff, 0xd8, 0xff, 0xd9))).toThrow(/损坏/)
  })
})

describe('png and webp', () => {
  it('strips png text and exif while keeping pixels', async () => {
    const jpeg = privacyJpeg({ orientation: 6 })
    const tiff = extractExifTiff(jpeg)
    const png = pngWithPrivacy(tiff)
    const before = await readPrivacyMetadata(png)
    expect(before.gps, fieldDump(before.fields)).not.toBeNull()
    expect(before.captureTime).toContain('2024-08-01')
    const stripped = stripPng(png)
    expect(stripped.keptOrientation).toBe(6)
    assertGone(stripped.bytes)
    expect(inflateSync(idat(png))).toEqual(inflateSync(idat(stripped.bytes)))
    const after = await readPrivacyMetadata(stripped.bytes)
    expect(after.gps).toBeNull()
    expect(after.captureTime).toBeNull()
    expect(await exifr.orientation(stripped.bytes)).toBe(6)
  })

  it('strips webp exif and xmp without touching the image chunk', async () => {
    const jpeg = privacyJpeg({ orientation: 6 })
    const tiff = extractExifTiff(jpeg)
    const tiny = new Uint8Array(readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'tiny.webp')))
    const vp8 = chunkPayload(tiny, 'VP8 ')
    if (!vp8) throw new Error('fixture webp 缺少图像数据')
    const vp8x = new Uint8Array(10)
    vp8x[0] = 0x0c
    vp8x[4] = 15
    vp8x[7] = 15
    const original = webpWithChunks([
      { id: 'VP8X', data: vp8x },
      { id: 'VP8 ', data: vp8 },
      { id: 'EXIF', data: tiff },
      { id: 'XMP ', data: new TextEncoder().encode('<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:creator><rdf:Seq><rdf:li>张三</rdf:li></rdf:Seq></dc:creator></rdf:Description></rdf:RDF></x:xmpmeta>') },
    ])
    const before = await readPrivacyMetadata(original)
    expect(before.device, fieldDump(before.fields)).toContain('Apple')
    const stripped = stripWebp(original)
    expect(stripped.keptOrientation).toBe(6)
    expect(chunkPayload(stripped.bytes, 'VP8 ')).toEqual(vp8)
    expect(chunkPayload(stripped.bytes, 'XMP ')).toBeNull()
    assertGone(stripped.bytes)
    const after = await readPrivacyMetadata(stripped.bytes)
    expect(after.device).toBeNull()
    expect(after.gps).toBeNull()
    expect((chunkPayload(stripped.bytes, 'VP8X')?.[0] ?? 0) & 0x04).toBe(0)
    expect((chunkPayload(stripped.bytes, 'VP8X')?.[0] ?? 0) & 0x08).toBe(0x08)
  })

  it('drops an empty VP8X box after the only metadata flag is cleared', () => {
    const vp8 = asciiBytes('just-image')
    const vp8x = new Uint8Array(10)
    vp8x[0] = 0x08
    const original = webpWithChunks([
      { id: 'VP8X', data: vp8x },
      { id: 'VP8 ', data: vp8 },
      { id: 'EXIF', data: asciiBytes('Exif\u0000\u0000SECRETAPPLE') },
    ])
    const stripped = stripWebp(original).bytes
    expect(chunkPayload(stripped, 'EXIF')).toBeNull()
    expect(chunkPayload(stripped, 'VP8X')).toBeNull()
    expect(chunkPayload(stripped, 'VP8 ')).toEqual(vp8)
    expect(Buffer.from(stripped).includes(Buffer.from('SECRETAPPLE'))).toBe(false)
  })
})

describe('committed samples', () => {
  it('demo-with-exif.jpg exposes time and place, and the cleaner removes them', async () => {
    const original = new Uint8Array(readFileSync('public/samples/demo-with-exif.jpg'))
    const before = await readPrivacyMetadata(original)
    expect(before.captureTime).toContain('2024-08-01 19:45:12')
    expect(before.gps?.latitude).toBeCloseTo(SAMPLE_LATITUDE, 4)
    expect(before.gps?.longitude).toBeCloseTo(SAMPLE_LONGITUDE, 4)
    const stripped = stripJpeg(original)
    const after = await readPrivacyMetadata(stripped.bytes)
    expect(after.captureTime).toBeNull()
    expect(after.gps).toBeNull()
    assertGone(stripped.bytes)
    const beforePixels = decode(original, { useTArray: true })
    const afterPixels = decode(stripped.bytes, { useTArray: true })
    expect(Buffer.from(afterPixels.data)).toEqual(Buffer.from(beforePixels.data))
  })

  it('demo-plain.jpg has no privacy metadata', async () => {
    const plain = new Uint8Array(readFileSync('public/samples/demo-plain.jpg'))
    const report = await readPrivacyMetadata(plain)
    expect(report.gps).toBeNull()
    expect(report.captureTime).toBeNull()
    expect(report.fields.filter((field) => field.sensitive)).toEqual([])
  })
})

function fieldDump(fields: { key: string; value: string }[]): string {
  return fields.map((field) => `${field.key}=${field.value}`).join('\n')
}

function assertGone(bytes: Uint8Array) {
  const utf8 = Buffer.from(bytes).toString('utf8')
  const latin1 = Buffer.from(bytes).toString('latin1')
  for (const word of BANNED) {
    expect(utf8.includes(word) || latin1.includes(word), word).toBe(false)
  }
}

function segment(marker: number, payload: Uint8Array): Uint8Array {
  const length = payload.length + 2
  const out = new Uint8Array(4 + payload.length)
  out[0] = 0xff
  out[1] = marker
  out[2] = (length >> 8) & 255
  out[3] = length & 255
  out.set(payload, 4)
  return out
}

function concatBytes(parts: Uint8Array[]): Uint8Array {
  const length = parts.reduce((sum, part) => sum + part.length, 0)
  const out = new Uint8Array(length)
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.length
  }
  return out
}

function idat(png: Uint8Array): Uint8Array {
  let offset = 8
  while (offset + 12 <= png.length) {
    const length = (png[offset] << 24) | (png[offset + 1] << 16) | (png[offset + 2] << 8) | png[offset + 3]
    const type = String.fromCharCode(png[offset + 4], png[offset + 5], png[offset + 6], png[offset + 7])
    if (type === 'IDAT') return png.subarray(offset + 8, offset + 8 + length)
    offset += 12 + length
  }
  throw new Error('缺少 IDAT')
}
