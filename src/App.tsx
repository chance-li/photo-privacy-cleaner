import { useEffect, useRef, useState } from 'react'
import { DropZone } from './components/DropZone'
import { Inspector, type CleanedImage } from './components/Inspector'
import { bytesToBlob } from './lib/bytes'
import { detectImageKind, kindLabel, MAX_FILE_BYTES, type ImageKind } from './lib/detect'
import { cleanedFilename, downloadBlob } from './lib/download'
import { CleanerError } from './lib/errors'
import { formatBytes } from './lib/format'
import { decodeHeicToJpeg } from './lib/heic'
import { readPrivacyMetadata, type MetadataReport } from './lib/readMetadata'
import { stripImage } from './lib/stripMetadata'

type Status = 'idle' | 'reading' | 'ready' | 'stripping' | 'cleaned' | 'error'

export default function App() {
  const [status, setStatus] = useState<Status>('idle')
  const [file, setFile] = useState<File | null>(null)
  const [kind, setKind] = useState<ImageKind | null>(null)
  const [report, setReport] = useState<MetadataReport | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [cleanedUrl, setCleanedUrl] = useState<string | null>(null)
  const [cleaned, setCleaned] = useState<CleanedImage | null>(null)
  const [previewNote, setPreviewNote] = useState<string | null>(null)
  const previewRef = useRef<string | null>(null)
  const cleanedRef = useRef<string | null>(null)

  useEffect(() => {
    function block(event: DragEvent) {
      event.preventDefault()
    }
    window.addEventListener('dragover', block)
    window.addEventListener('drop', block)
    return () => {
      window.removeEventListener('dragover', block)
      window.removeEventListener('drop', block)
      revoke(previewRef)
      revoke(cleanedRef)
    }
  }, [])

  function replaceUrl(slot: 'preview' | 'cleaned', blob: Blob | null) {
    const ref = slot === 'preview' ? previewRef : cleanedRef
    revoke(ref)
    const next = blob ? URL.createObjectURL(blob) : null
    ref.current = next
    if (slot === 'preview') setPreviewUrl(next)
    else setCleanedUrl(next)
  }

  async function handleFile(next: File) {
    setError(null)
    setCleaned(null)
    setReport(null)
    setPreviewNote(null)
    replaceUrl('cleaned', null)

    if (next.size > MAX_FILE_BYTES) {
      setFile(null)
      setKind(null)
      replaceUrl('preview', null)
      setStatus('error')
      setError(`文件超过 ${formatBytes(MAX_FILE_BYTES)}，请换一张较小的照片。`)
      return
    }

    const bytes = new Uint8Array(await next.arrayBuffer())
    const detected = detectImageKind(bytes)
    if (!detected) {
      setFile(null)
      setKind(null)
      replaceUrl('preview', null)
      setStatus('error')
      setError('无法识别这个文件。请使用 JPEG、PNG、WebP 或 HEIC 照片。')
      return
    }

    setFile(next)
    setKind(detected)
    replaceUrl('preview', next)
    setStatus('reading')

    try {
      const nextReport = await readPrivacyMetadata(bytes)
      setReport(nextReport)
      setStatus('ready')
    } catch {
      setError('读取元数据失败，请换一张照片试试。')
      setStatus('error')
    }
  }

  async function handlePreviewError() {
    if (!file || kind !== 'heic') {
      setPreviewNote('浏览器无法显示这张照片的预览，仍可根据读到的元数据进行清除。')
      return
    }
    setPreviewNote('正在解码 HEIC 以生成预览…')
    try {
      const jpeg = await decodeHeicToJpeg(file)
      replaceUrl('preview', bytesToBlob(jpeg, 'image/jpeg'))
      setPreviewNote('预览由 HEIC 解码而来，原文件尚未改动。')
    } catch (caught) {
      setPreviewNote(caught instanceof Error ? caught.message : '无法预览这张 HEIC。')
    }
  }

  async function handleClear() {
    if (!file || !report) return
    setStatus('stripping')
    setError(null)
    await new Promise((resolve) => window.setTimeout(resolve, 40))
    try {
      const result = await stripImage(file)
      const blob = bytesToBlob(result.bytes, result.mime)
      const after = await readPrivacyMetadata(result.bytes)
      const name = cleanedFilename(file.name, result.extension)
      replaceUrl('cleaned', blob)
      setCleaned({ blob, name, report: after, result })
      setStatus('cleaned')
    } catch (caught) {
      setError(caught instanceof CleanerError ? caught.message : '清除失败，这张照片的文件结构可能已损坏。')
      setStatus('ready')
    }
  }

  function handleDownload() {
    if (!cleaned) return
    downloadBlob(cleaned.blob, cleaned.name)
  }

  function handleReset() {
    setStatus('idle')
    setFile(null)
    setKind(null)
    setReport(null)
    setError(null)
    setCleaned(null)
    setPreviewNote(null)
    replaceUrl('preview', null)
    replaceUrl('cleaned', null)
  }

  async function loadSample(path: string, name: string) {
    setStatus('reading')
    setError(null)
    try {
      const response = await fetch(path)
      if (!response.ok) throw new Error('示例照片加载失败。')
      const blob = await response.blob()
      await handleFile(new File([blob], name, { type: blob.type || 'image/jpeg' }))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '示例照片加载失败。')
      setStatus('error')
    }
  }

  const showWorkspace = Boolean(file && kind && status !== 'idle')

  return (
    <div className="page">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true" />
          <div>
            <p className="brand-name">净照</p>
            <p className="brand-sub">照片隐私元数据清除</p>
          </div>
        </div>
        <p className="topbar-note">在这台设备上处理 · 不会上传</p>
      </header>

      <main>
        {file && kind && status !== 'idle' ? (
          <Inspector
            key={`${file.name}-${file.size}-${file.lastModified}`}
            file={file}
            kind={kind}
            status={status}
            report={report}
            error={error}
            previewUrl={previewUrl}
            cleanedUrl={cleanedUrl}
            cleaned={cleaned}
            previewNote={previewNote}
            onFile={(next) => void handleFile(next)}
            onClear={() => void handleClear()}
            onDownload={handleDownload}
            onReset={handleReset}
            onPreviewError={() => void handlePreviewError()}
          />
        ) : (
          <section className="hero">
            <p className="kicker">本地清理</p>
            <h1>上传照片，先看清隐藏信息，再一键清掉。</h1>
            <p className="lede">
              拍摄时间、GPS 位置、相机序列号、作者和版权，常常藏在 EXIF、IPTC 和 XMP
              里。净照在浏览器中读取并清除这些数据，照片不会离开这台设备。
            </p>
            {error ? (
              <p className="banner banner-error" role="alert">
                {error}
              </p>
            ) : null}
            <DropZone onFile={(next) => void handleFile(next)} />
            <div className="sample-row">
              <button
                type="button"
                className="text-button"
                data-testid="sample-exif"
                onClick={() => void loadSample('/samples/demo-with-exif.jpg', 'demo-with-exif.jpg')}
              >
                试用带定位信息的示例
              </button>
              <button
                type="button"
                className="text-button"
                data-testid="sample-plain"
                onClick={() => void loadSample('/samples/demo-plain.jpg', 'demo-plain.jpg')}
              >
                试用没有元数据的示例
              </button>
            </div>
            <ol className="steps">
              <li>
                <span>1</span>选择照片
              </li>
              <li>
                <span>2</span>查看元数据
              </li>
              <li>
                <span>3</span>清除并下载
              </li>
            </ol>
          </section>
        )}
      </main>

      <footer>
        <p>
          读取和清除的思路来自 Phil Harvey 的{' '}
          <a href="https://github.com/exiftool/exiftool" target="_blank" rel="noreferrer">
            ExifTool
          </a>
          。JPEG、PNG、WebP 会直接拆掉元数据容器，不重新压缩像素。HEIC 会先解码成 JPEG。
        </p>
        {showWorkspace && kind ? <p className="footer-kind">当前文件：{kindLabel(kind)}</p> : null}
      </footer>
    </div>
  )
}

function revoke(slot: { current: string | null }) {
  if (!slot.current) return
  URL.revokeObjectURL(slot.current)
  slot.current = null
}
