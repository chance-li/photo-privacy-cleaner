import { useRef, useState, type DragEvent } from 'react'

interface DropZoneProps {
  onFile: (file: File) => void
  compact?: boolean
}

export function DropZone({ onFile, compact = false }: DropZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [active, setActive] = useState(false)

  function takeFile(file: File | undefined) {
    if (file) onFile(file)
  }

  function onDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault()
    setActive(false)
    takeFile(event.dataTransfer.files[0])
  }

  return (
    <label
      className={active ? 'dropzone is-active' : 'dropzone'}
      data-compact={compact ? 'true' : 'false'}
      onDragEnter={(event) => {
        event.preventDefault()
        setActive(true)
      }}
      onDragOver={(event) => {
        event.preventDefault()
        setActive(true)
      }}
      onDragLeave={() => setActive(false)}
      onDrop={onDrop}
    >
      <input
        ref={inputRef}
        className="sr-only"
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.jpg,.jpeg,.png,.webp,.heic,.heif"
        onChange={(event) => {
          takeFile(event.target.files?.[0])
          event.target.value = ''
        }}
      />
      <span className="dropzone-mark" aria-hidden="true">
        <svg viewBox="0 0 48 48" width="42" height="42">
          <rect x="6" y="10" width="36" height="28" rx="4" fill="none" stroke="currentColor" strokeWidth="1.6" />
          <circle cx="18" cy="20" r="3" fill="none" stroke="currentColor" strokeWidth="1.6" />
          <path d="M10 32l8-7 6 5 5-4 9 8" fill="none" stroke="currentColor" strokeWidth="1.6" />
        </svg>
      </span>
      <span className="dropzone-title">{compact ? '换一张照片' : '把照片拖到这里'}</span>
      <span className="dropzone-hint">或点击选择文件 · JPEG、PNG、WebP、HEIC</span>
    </label>
  )
}
