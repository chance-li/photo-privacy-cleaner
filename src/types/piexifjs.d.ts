declare module 'piexifjs' {
  interface Piexif {
    ImageIFD: Record<string, number>
    ExifIFD: Record<string, number>
    GPSIFD: Record<string, number>
    dump(exif: unknown): string
    insert(exifBytes: string, jpeg: string): string
    load(jpeg: string): unknown
  }

  const piexif: Piexif
  export default piexif
}
