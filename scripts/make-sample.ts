import { mkdirSync, writeFileSync } from 'node:fs'
import { paintJpeg, privacyJpeg } from '../src/test/fixtures.ts'

mkdirSync('public/samples', { recursive: true })

const withExif = privacyJpeg({ width: 800, height: 480 })
const plain = paintJpeg(800, 480, 82)

writeFileSync('public/samples/demo-with-exif.jpg', withExif)
writeFileSync('public/samples/demo-plain.jpg', plain)

console.log(`wrote demo-with-exif.jpg (${withExif.length} bytes)`)
console.log(`wrote demo-plain.jpg (${plain.length} bytes)`)
