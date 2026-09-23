import { deflateSync } from 'node:zlib'
import { encode } from 'jpeg-js'
import piexif from 'piexifjs'
import { ascii, asciiBytes, concat, crc32, writeU32BE, writeU32LE } from '../lib/bytes'

export const SAMPLE_LATITUDE = 31 + 13 / 60 + 48 / 3600
export const SAMPLE_LONGITUDE = 121 + 28 / 60 + 12 / 3600

export function paintJpeg(width: number, height: number, quality = 82): Uint8Array {
  const data = Buffer.alloc(width * height * 4)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4
      const horizon = height * 0.62
      if (y < horizon) {
        const t = y / horizon
        data[index] = 236 - t * 50
        data[index + 1] = 206 - t * 36
        data[index + 2] = 168 - t * 20
      } else {
        const t = (y - horizon) / (height - horizon)
        data[index] = 86 + t * 24
        data[index + 1] = 118 - t * 16
        data[index + 2] = 92
      }
      const dx = x - width * 0.74
      const dy = y - height * 0.28
      const radius = Math.min(width, height) * 0.08
      if (dx * dx + dy * dy < radius * radius) {
        data[index] = 244
        data[index + 1] = 186
        data[index + 2] = 92
      }
      data[index + 3] = 255
    }
  }
  return new Uint8Array(encode({ data, width, height }, quality).data)
}

export function privacyJpeg(options?: { orientation?: number; width?: number; height?: number }): Uint8Array {
  const base = paintJpeg(options?.width ?? 48, options?.height ?? 32, 80)
  const zeroth: Record<number, string | number> = {
    [piexif.ImageIFD.Make]: 'Apple',
    [piexif.ImageIFD.Model]: 'iPhone 15',
    [piexif.ImageIFD.Software]: 'iOS 17.5.1',
    [piexif.ImageIFD.Artist]: 'Zhang San',
    [piexif.ImageIFD.Copyright]: 'Copyright Zhang San',
    [piexif.ImageIFD.ImageDescription]: 'Family dinner',
    [piexif.ImageIFD.DateTime]: '2024:08:01 19:45:12',
  }
  if (options?.orientation) zeroth[piexif.ImageIFD.Orientation] = options.orientation
  const exif: Record<number, string | number | number[]> = {
    [piexif.ExifIFD.DateTimeOriginal]: '2024:08:01 19:45:12',
    [piexif.ExifIFD.DateTimeDigitized]: '2024:08:01 19:45:12',
    [piexif.ExifIFD.LensModel]: 'iPhone 15 back dual camera',
    [piexif.ExifIFD.BodySerialNumber]: 'SN123456789',
    [piexif.ExifIFD.CameraOwnerName]: 'Zhang San',
    [piexif.ExifIFD.FNumber]: [8, 5],
    [piexif.ExifIFD.ExposureTime]: [1, 120],
    [piexif.ExifIFD.ISOSpeedRatings]: 80,
    [piexif.ExifIFD.FocalLength]: [26, 1],
  }
  const gps: Record<number, string | number | number[][]> = {
    [piexif.GPSIFD.GPSLatitudeRef]: 'N',
    [piexif.GPSIFD.GPSLatitude]: [
      [31, 1],
      [13, 1],
      [48, 1],
    ],
    [piexif.GPSIFD.GPSLongitudeRef]: 'E',
    [piexif.GPSIFD.GPSLongitude]: [
      [121, 1],
      [28, 1],
      [12, 1],
    ],
    [piexif.GPSIFD.GPSAltitudeRef]: 0,
    [piexif.GPSIFD.GPSAltitude]: [[18, 1]],
  }
  const dumped = piexif.dump({ '0th': zeroth, Exif: exif, GPS: gps })
  const withExif = fromDataUrl(piexif.insert(dumped, toDataUrl(base)))
  const xmp = `<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
 <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
  <rdf:Description rdf:about=""
    xmlns:dc="http://purl.org/dc/elements/1.1/"
    xmlns:xmp="http://ns.adobe.com/xap/1.0/">
   <dc:creator><rdf:Seq><rdf:li>张三</rdf:li></rdf:Seq></dc:creator>
   <dc:rights><rdf:Alt><rdf:li xml:lang="x-default">版权所有 张三</rdf:li></rdf:Alt></dc:rights>
   <xmp:CreatorTool>SecretStudio</xmp:CreatorTool>
  </rdf:Description>
 </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`
  return insertAfterSoi(withExif, [
    jpegSegment(0xfe, asciiBytes('secret-comment')),
    jpegSegment(0xe1, concat([asciiBytes('http://ns.adobe.com/xap/1.0/\u0000'), new TextEncoder().encode(xmp)])),
    jpegSegment(0xed, photoshopIptc()),
    jpegSegment(0xe2, asciiBytes('ICC_PROFILE\u0000COLORPROFILEDATA')),
    jpegSegment(0xe2, asciiBytes('MPF\u0000SECRETMPF')),
  ])
}

export function extractExifTiff(jpeg: Uint8Array): Uint8Array {
  let offset = 2
  while (offset + 4 < jpeg.length) {
    if (jpeg[offset] !== 0xff) break
    while (jpeg[offset] === 0xff) offset += 1
    const marker = jpeg[offset]
    offset += 1
    if (marker === 0xda || marker === 0xd9) break
    const length = (jpeg[offset] << 8) | jpeg[offset + 1]
    if (marker === 0xe1 && ascii(jpeg, offset + 2, 6) === 'Exif\u0000\u0000') {
      return jpeg.subarray(offset + 8, offset + length)
    }
    offset += length
  }
  throw new Error('找不到 EXIF TIFF')
}

export function pngWithPrivacy(tiff: Uint8Array): Uint8Array {
  const ihdr = new Uint8Array(13)
  ihdr[3] = 2
  ihdr[7] = 2
  ihdr[8] = 8
  ihdr[9] = 2
  const scan = new Uint8Array([
    0, 180, 70, 40, 200, 90, 50,
    0, 40, 120, 70, 30, 100, 60,
  ])
  const signature = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  return concat([
    signature,
    pngChunk('IHDR', ihdr),
    pngChunk('iTXt', iTXt('Author', '张三')),
    pngChunk('tEXt', concat([asciiBytes('Comment'), Uint8Array.of(0), asciiBytes('secret-comment')])),
    pngChunk('eXIf', tiff),
    pngChunk('IDAT', deflateSync(scan)),
    pngChunk('IEND', new Uint8Array()),
  ])
}

export function webpWithChunks(chunks: { id: string; data: Uint8Array }[]): Uint8Array {
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

export function chunkPayload(file: Uint8Array, id: string): Uint8Array | null {
  let offset = 12
  while (offset + 8 <= file.length) {
    const name = ascii(file, offset, 4)
    const size = file[offset + 4] | (file[offset + 5] << 8) | (file[offset + 6] << 16) | (file[offset + 7] << 24)
    const data = file.subarray(offset + 8, offset + 8 + size)
    if (name === id) return data
    offset += 8 + size + (size % 2)
  }
  return null
}

function photoshopIptc(): Uint8Array {
  const records = concat([
    iptc(1, 90, Uint8Array.of(0x1b, 0x25, 0x47)),
    iptc(2, 80, new TextEncoder().encode('张三')),
    iptc(2, 116, new TextEncoder().encode('版权所有 张三')),
    iptc(2, 90, new TextEncoder().encode('上海')),
    iptc(2, 101, new TextEncoder().encode('中国')),
  ])
  const name = Uint8Array.of(0, 0)
  const header = concat([
    asciiBytes('8BIM'),
    Uint8Array.of(0x04, 0x04),
    name,
    writeU32BE(records.length),
  ])
  const padded = records.length % 2 === 0 ? records : concat([records, Uint8Array.of(0)])
  return concat([asciiBytes('Photoshop 3.0\u0000'), header, padded])
}

function iptc(record: number, dataset: number, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(5 + data.length)
  out[0] = 0x1c
  out[1] = record
  out[2] = dataset
  out[3] = (data.length >> 8) & 255
  out[4] = data.length & 255
  out.set(data, 5)
  return out
}

function jpegSegment(marker: number, payload: Uint8Array): Uint8Array {
  const length = payload.length + 2
  const out = new Uint8Array(4 + payload.length)
  out[0] = 0xff
  out[1] = marker
  out[2] = (length >> 8) & 255
  out[3] = length & 255
  out.set(payload, 4)
  return out
}

function insertAfterSoi(jpeg: Uint8Array, segments: Uint8Array[]): Uint8Array {
  return concat([jpeg.subarray(0, 2), ...segments, jpeg.subarray(2)])
}

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = asciiBytes(type)
  const crc = crc32(concat([typeBytes, data]))
  return concat([writeU32BE(data.length), typeBytes, data, writeU32BE(crc)])
}

function iTXt(keyword: string, text: string): Uint8Array {
  return concat([
    asciiBytes(keyword),
    Uint8Array.of(0, 0, 0, 0, 0),
    new TextEncoder().encode(text),
  ])
}

function toDataUrl(bytes: Uint8Array): string {
  return `data:image/jpeg;base64,${Buffer.from(bytes).toString('base64')}`
}

function fromDataUrl(url: string): Uint8Array {
  const payload = url.split(',')[1]
  return new Uint8Array(Buffer.from(payload, 'base64'))
}
