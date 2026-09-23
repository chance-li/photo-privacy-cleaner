import { CleanerError } from './errors'

const cache = new WeakMap<Blob, Promise<Uint8Array>>()

export function decodeHeicToJpeg(file: Blob): Promise<Uint8Array> {
  const cached = cache.get(file)
  if (cached) return cached
  const pending = convert(file).catch((error: unknown) => {
    cache.delete(file)
    throw error
  })
  cache.set(file, pending)
  return pending
}

async function convert(file: Blob): Promise<Uint8Array> {
  const native = await tryNativeDecode(file)
  if (native) return native

  try {
    const { heicTo } = await import('heic-to')
    const blob = await heicTo({
      blob: file,
      type: 'image/jpeg',
      quality: 0.92,
    })
    return new Uint8Array(await blob.arrayBuffer())
  } catch {
    throw new CleanerError(
      '当前浏览器无法解码这张 HEIC，因此不能生成已清除元数据的副本。可以先在系统相册里导出为 JPEG，再回到这里清除。',
      'decode',
    )
  }
}

async function tryNativeDecode(file: Blob): Promise<Uint8Array | null> {
  if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') return null
  try {
    const bitmap = await createImageBitmap(file)
    try {
      return await bitmapToJpeg(bitmap)
    } finally {
      bitmap.close()
    }
  } catch {
    return null
  }
}

function bitmapToJpeg(bitmap: ImageBitmap): Promise<Uint8Array> {
  const canvas = document.createElement('canvas')
  canvas.width = bitmap.width
  canvas.height = bitmap.height
  const context = canvas.getContext('2d')
  if (!context) return Promise.reject(new Error('canvas'))
  context.drawImage(bitmap, 0, 0)
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('toBlob'))
          return
        }
        blob.arrayBuffer().then((buffer) => resolve(new Uint8Array(buffer)), reject)
      },
      'image/jpeg',
      0.92,
    )
  })
}
