import { useEffect, useState } from 'react'
import { DropZone } from './DropZone'
import { formatBytes, formatCoordinate, formatDms, osmLink } from '../lib/format'
import { GROUP_LABELS, GROUP_ORDER, type FieldGroup } from '../lib/labels'
import type { MetadataReport, MetaField } from '../lib/readMetadata'
import { sensitiveFields } from '../lib/readMetadata'
import type { StripResult } from '../lib/stripMetadata'
import { kindLabel, type ImageKind } from '../lib/detect'

export interface CleanedImage {
  blob: Blob
  name: string
  report: MetadataReport
  result: StripResult
}

interface InspectorProps {
  file: File
  kind: ImageKind
  status: 'reading' | 'ready' | 'stripping' | 'cleaned' | 'error'
  report: MetadataReport | null
  error: string | null
  previewUrl: string | null
  cleanedUrl: string | null
  cleaned: CleanedImage | null
  previewNote: string | null
  onFile: (file: File) => void
  onClear: () => void
  onDownload: () => void
  onReset: () => void
  onPreviewError: () => void
}

export function Inspector({
  file,
  kind,
  status,
  report,
  error,
  previewUrl,
  cleanedUrl,
  cleaned,
  previewNote,
  onFile,
  onClear,
  onDownload,
  onReset,
  onPreviewError,
}: InspectorProps) {
  const [which, setWhich] = useState<'before' | 'after'>('before')
  const [dimensions, setDimensions] = useState<string | null>(null)
  useEffect(() => {
    if (cleanedUrl) setWhich('after')
  }, [cleanedUrl])
  const showingAfter = which === 'after' && cleanedUrl
  const imageUrl = showingAfter ? cleanedUrl : previewUrl
  const privacyCount = report ? sensitiveFields(report).length : 0
  const busy = status === 'reading' || status === 'stripping'

  return (
    <section className="workspace">
      <div className="preview-card">
        <div className="preview-toolbar">
          <div className="segmented" role="group" aria-label="预览版本">
            <button
              type="button"
              aria-pressed={which === 'before'}
              onClick={() => setWhich('before')}
            >
              原图
            </button>
            <button
              type="button"
              aria-pressed={which === 'after'}
              disabled={!cleanedUrl}
              onClick={() => setWhich('after')}
            >
              清洁后
            </button>
          </div>
          <button type="button" className="text-button" onClick={onReset}>
            重新开始
          </button>
        </div>
        <div className="stage">
          {imageUrl ? (
            <img
              src={imageUrl}
              alt={showingAfter ? '清洁后的照片预览' : '已选择的照片预览'}
              onLoad={(event) => {
                const image = event.currentTarget
                setDimensions(`${image.naturalWidth} × ${image.naturalHeight}`)
              }}
              onError={onPreviewError}
            />
          ) : (
            <p className="stage-fallback">正在准备预览…</p>
          )}
        </div>
        {previewNote ? <p className="preview-note">{previewNote}</p> : null}
        <div className="file-line">
          <strong title={file.name}>{file.name}</strong>
          <span>{kindLabel(kind)}</span>
          <span>{formatBytes(file.size)}</span>
          {dimensions ? <span>{dimensions}</span> : null}
        </div>
        <DropZone compact onFile={onFile} />
      </div>

      <div className="panel" aria-busy={busy}>
        {status === 'reading' ? <Loading label="正在读取元数据…" /> : null}
        {status === 'stripping' ? <Loading label="正在清除元数据…" /> : null}
        {error ? (
          <p className="banner banner-error" role="alert">
            {error}
          </p>
        ) : null}
        {report && status !== 'reading' && status !== 'stripping' ? (
          <>
            {cleaned && status === 'cleaned' ? (
              <ResultBlock cleaned={cleaned} before={report} onDownload={onDownload} />
            ) : (
              <ReportBlock
                report={report}
                privacyCount={privacyCount}
                onClear={onClear}
                disabled={busy || status === 'error'}
              />
            )}
          </>
        ) : null}
      </div>
    </section>
  )
}

function ReportBlock({
  report,
  privacyCount,
  onClear,
  disabled,
}: {
  report: MetadataReport
  privacyCount: number
  onClear: () => void
  disabled: boolean
}) {
  return (
    <>
      <div className="panel-head">
        <p className="kicker">检查</p>
        <h2>{privacyCount > 0 ? `发现 ${privacyCount} 项隐私相关信息` : '没有检测到隐私元数据'}</h2>
      </div>
      {report.warnings.map((warning) => (
        <p key={warning} className="banner">
          {warning}
        </p>
      ))}
      {privacyCount === 0 ? (
        <p className="empty-copy">
          这张照片里没有读到拍摄时间、位置、设备或作者信息。它可能本来就没有这些数据，或已被别的工具清掉。你仍然可以再清理一遍文件里的附加数据。
        </p>
      ) : (
        <Summary report={report} />
      )}
      <div className="actions">
        <button type="button" className="primary" data-testid="clear-metadata" onClick={onClear} disabled={disabled}>
          清除元数据
        </button>
        <p className="fine-print">
          会保留画面方向和色彩配置，避免照片转歪或变色。时间、位置、设备、作者、版权、注释，以及文件末尾的附加数据会被去掉。
        </p>
      </div>
      <FieldList fields={report.fields} />
    </>
  )
}

function ResultBlock({
  cleaned,
  before,
  onDownload,
}: {
  cleaned: CleanedImage
  before: MetadataReport
  onDownload: () => void
}) {
  const beforePrivacy = sensitiveFields(before)
  const afterKeys = new Set(cleaned.report.fields.map((field) => field.key))
  const removed = beforePrivacy.filter((field) => !afterKeys.has(field.key))
  const remains = beforePrivacy.filter((field) => afterKeys.has(field.key))
  const keptBenign = before.fields.filter((field) => !field.sensitive && afterKeys.has(field.key))

  return (
    <>
      <div className="panel-head">
        <p className="kicker">清除完成</p>
        <h2>
          {removed.length > 0 ? (
            <>
              已去除 <em>{removed.length}</em> 项隐私信息
            </>
          ) : (
            '已再次清理文件'
          )}
        </h2>
        <p className="result-note">{cleaned.result.note}</p>
      </div>
      <div className="compare" data-testid="metadata-comparison">
        <div>
          <span>清除前</span>
          <strong>{beforePrivacy.length}</strong>
          <small>项隐私字段</small>
        </div>
        <div>
          <span>清除后</span>
          <strong>{sensitiveFields(cleaned.report).length}</strong>
          <small>项隐私字段</small>
        </div>
      </div>
      {remains.length > 0 ? (
        <p className="banner banner-error" role="alert">
          仍有 {remains.length} 项隐私字段留在文件里：{remains.map((field) => field.label).join('、')}
        </p>
      ) : null}
      <div className="actions">
        <button type="button" className="primary" data-testid="download-cleaned" onClick={onDownload}>
          下载清洁后的照片
        </button>
        <p className="fine-print">文件名：{cleaned.name}</p>
      </div>
      <DiffList before={before.fields} afterKeys={afterKeys} />
      {keptBenign.length > 0 ? (
        <p className="fine-print">已保留：{keptBenign.map((field) => `${field.label}（${field.value}）`).join('、')}</p>
      ) : null}
    </>
  )
}

function Summary({ report }: { report: MetadataReport }) {
  return (
    <div className="summary">
      <article>
        <h3>拍摄时间</h3>
        <p>{report.captureTime ?? '未记录'}</p>
      </article>
      <article>
        <h3>地点</h3>
        {report.gps ? (
          <>
            <p>{formatCoordinate(report.gps.latitude, report.gps.longitude)}</p>
            <p className="muted">{formatDms(report.gps.latitude, report.gps.longitude)}</p>
            {report.gps.altitude != null ? <p className="muted">海拔 {report.gps.altitude.toFixed(1)} 米</p> : null}
            {report.placeName ? <p className="muted">{report.placeName}</p> : null}
            <a href={osmLink(report.gps.latitude, report.gps.longitude)} target="_blank" rel="noreferrer">
              在 OpenStreetMap 中查看
            </a>
            <p className="fine-print">点击后才会把坐标发给地图网站，照片本身不会上传。</p>
          </>
        ) : (
          <p>{report.placeName ?? '未记录'}</p>
        )}
      </article>
      <article>
        <h3>相机与设备</h3>
        <p>{report.device ?? '未记录'}</p>
      </article>
      <article>
        <h3>作者与软件</h3>
        <p>{[report.identity, report.software].filter(Boolean).join(' · ') || '未记录'}</p>
      </article>
    </div>
  )
}

function FieldList({ fields }: { fields: MetaField[] }) {
  if (fields.length === 0) return null
  const groups = GROUP_ORDER.filter((group) => fields.some((field) => field.group === group))
  return (
    <div className="field-list">
      {groups.map((group) => (
        <section key={group}>
          <h3>{GROUP_LABELS[group]}</h3>
          <dl>
            {fields
              .filter((field) => field.group === group)
              .map((field) => (
                <div key={field.key}>
                  <dt>
                    {field.sensitive ? <i className="dot" aria-hidden="true" /> : null}
                    {field.label}
                  </dt>
                  <dd>{field.value}</dd>
                </div>
              ))}
          </dl>
        </section>
      ))}
    </div>
  )
}

function DiffList({ before, afterKeys }: { before: MetaField[]; afterKeys: Set<string> }) {
  if (before.length === 0) {
    return <p className="empty-copy">清除前没有可列出的字段。文件容器已再检查一遍。</p>
  }
  const groups = GROUP_ORDER.filter((group) => before.some((field) => field.group === group))
  return (
    <div className="field-list">
      {groups.map((group: FieldGroup) => (
        <section key={group}>
          <h3>{GROUP_LABELS[group]}</h3>
          <dl>
            {before
              .filter((field) => field.group === group)
              .map((field) => {
                const kept = afterKeys.has(field.key)
                const tone = !kept ? 'removed' : field.sensitive ? 'remains' : 'kept'
                const tag = tone === 'removed' ? '已清除' : tone === 'remains' ? '仍存在' : '已保留'
                return (
                  <div key={field.key} data-status={tone}>
                    <dt>{field.label}</dt>
                    <dd>
                      <span className={tone === 'removed' ? 'struck' : undefined}>{field.value}</span>
                      <em className={`tag tag-${tone}`}>{tag}</em>
                    </dd>
                  </div>
                )
              })}
          </dl>
        </section>
      ))}
    </div>
  )
}

function Loading({ label }: { label: string }) {
  return (
    <p className="loading">
      <span className="spinner" aria-hidden="true" />
      {label}
    </p>
  )
}
