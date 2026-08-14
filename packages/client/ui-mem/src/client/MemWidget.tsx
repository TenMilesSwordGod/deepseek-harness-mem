/**
 * Memory widget: a top-right header chip (state dot + count) that opens a
 * panel with status, semantic quick search, and a manual record box. Live
 * activity arrives through the 'memory' session projection and animates the
 * chip plus a transient toast; embedding warmup progress is polled from the
 * host status Remote.
 * @module @deepseek-ai/dsh-client-ui-mem
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type { MemModelEntry, MemProjection, MemStatus } from '@deepseek-ai/dsh-mem/client'
import { MemStatsModal } from './MemStats.tsx'
import type { MemStatsActions } from './MemStats.tsx'
import { memStyles } from './styles.ts'

/** Mutation verbs injected from the plugin apply closure. */
export interface MemActions extends MemStatsActions {
  status(): Promise<RemoteResult<MemStatus>>
  warmup(): Promise<RemoteResult<import('@deepseek-ai/dsh-mem/client').MemWarmupResponse>>
  reembed(): Promise<RemoteResult<import('@deepseek-ai/dsh-mem/client').MemReembedResponse>>
  downloadModel(model: string): Promise<RemoteResult<import('@deepseek-ai/dsh-mem/client').MemDownloadResponse>>
  models(): Promise<RemoteResult<import('@deepseek-ai/dsh-mem/client').MemModelsResponse>>
  configure(model: string): Promise<RemoteResult<import('@deepseek-ai/dsh-mem/client').MemConfigureResponse>>
  search(query: string, limit: number): Promise<RemoteResult<import('@deepseek-ai/dsh-mem/client').MemSearchResponse>>
  record(content: string, tags?: string, scope?: 'project' | 'global'): Promise<RemoteResult<import('@deepseek-ai/dsh-mem/client').MemRecordResponse>>
  forget(id: string): Promise<RemoteResult<import('@deepseek-ai/dsh-mem/client').MemForgetResponse>>
}

/** Full composed props: session standard kit + injected verbs + locale seat. */
export type MemWidgetProps =
  & PropsRuntime<'conversation.session.header.utilities'>
  & MemActions
  & PropsLocale<'mem'>

/** One transient toast entry; `key` forces a fresh mount per activity. */
interface Toast {
  key: number
  kind: 'record' | 'search' | 'forget'
  text: string
}

const TOAST_LIFETIME_MS = 2600
const WARM_POLL_MS = 900
const SEARCH_DEBOUNCE_MS = 250

function unwrap<T>(result: RemoteResult<T>): T | null {
  return result.ok ? result.value : null
}

/** Inline icons (16px, stroke = currentColor). */
function IconSearch(): JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  )
}

function IconSpinner(): JSX.Element {
  return (
    <svg className="dshmem-search-spinner" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
      <path d="M21 12a9 9 0 1 1-6.2-8.56" />
    </svg>
  )
}

function IconClose(): JSX.Element {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  )
}

function IconTrash(): JSX.Element {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m3 0-1 13H7L6 7m4 4v5m4-5v5" />
    </svg>
  )
}

function IconTransform(): JSX.Element {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 4v6h6M20 20v-6h-6" />
      <path d="M4 10a8 8 0 0 1 14-3l2 2M20 14a8 8 0 0 1-14 3l-2-2" />
    </svg>
  )
}

function IconChart(): JSX.Element {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
      <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
    </svg>
  )
}

function IconPlus(): JSX.Element {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}

/**
 * Header widget body. Pure presentation: everything arrives through the
 * four props shares (session kit, injected verbs, locale).
 * @param props - composed widget props.
 * @returns the chip, optional toast, and optional open panel.
 */
export function MemWidget({
  useProjection,
  t,
  status,
  warmup,
  reembed,
  downloadModel,
  models,
  configure,
  cacheStats,
  listAll,
  setEnabled,
  search,
  record,
  forget,
}: MemWidgetProps): JSX.Element {
  const projection = useProjection('memory') as MemProjection | undefined
  const [open, setOpen] = useState(false)
  const [statsOpen, setStatsOpen] = useState(false)
  const [statusSnapshot, setStatusSnapshot] = useState<MemStatus | null>(null)
  const [statusError, setStatusError] = useState(false)
  const [catalog, setCatalog] = useState<MemModelEntry[] | null>(null)
  const [configuring, setConfiguring] = useState(false)
  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [results, setResults] = useState<Array<{ id: string; content: string; tags: string; similarity: number }>>([])
  const [recordDraft, setRecordDraft] = useState('')
  const [recording, setRecording] = useState(false)
  const [recordFeedback, setRecordFeedback] = useState<string | null>(null)
  const [toast, setToast] = useState<Toast | null>(null)
  const [dotActive, setDotActive] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const toastTimer = useRef<number | null>(null)
  const dotTimer = useRef<number | null>(null)
  const activityKey = useRef(0)

  const loadStatus = useCallback(async () => {
    const value = unwrap(await status())
    setStatusError(value === null)
    if (value !== null) setStatusSnapshot(value)
  }, [status])

  const loadCatalog = useCallback(async () => {
    const value = unwrap(await models())
    if (value !== null) setCatalog(value.catalog)
  }, [models])

  // Initial status + warmup polling while the backend is not ready.
  useEffect(() => {
    let disposed = false
    let timer: number | null = null
    void loadStatus().then(() => {
      if (disposed) return
      const poll = (): void => {
        void status().then((result) => {
          if (disposed) return
          const value = unwrap(result)
          setStatusError(value === null)
          if (value !== null) setStatusSnapshot(value)
          const warming = value !== null && (value.warmup.state === 'downloading' || !value.ready)
          const reembedding = value !== null && value.reembed !== null && value.reembed.state === 'running'
          const downloading = value !== null && value.download !== null && value.download.state === 'running'
          timer = (warming || reembedding || downloading) ? window.setTimeout(poll, WARM_POLL_MS) : null
        })
      }
      timer = window.setTimeout(poll, WARM_POLL_MS)
    })
    return () => {
      disposed = true
      if (timer !== null) window.clearTimeout(timer)
    }
  }, [status, loadStatus])

  // Live activity from the session projection: chip pulse + toast + status refresh.
  useEffect(() => {
    const last = projection?.last ?? null
    if (last === null) return
    activityKey.current += 1
    setToast({ key: activityKey.current, kind: last.kind, text: last.text })
    setDotActive(true)
    if (toastTimer.current !== null) window.clearTimeout(toastTimer.current)
    if (dotTimer.current !== null) window.clearTimeout(dotTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(null), TOAST_LIFETIME_MS)
    dotTimer.current = window.setTimeout(() => setDotActive(false), 1000)
    void loadStatus()
    return () => {
      if (toastTimer.current !== null) window.clearTimeout(toastTimer.current)
      if (dotTimer.current !== null) window.clearTimeout(dotTimer.current)
    }
  }, [projection, loadStatus])

  // Debounced semantic quick search.
  useEffect(() => {
    const trimmed = query.trim()
    if (trimmed === '') {
      setResults([])
      setSearching(false)
      return
    }
    setSearching(true)
    const timer = window.setTimeout(() => {
      void search(trimmed, 6).then((result) => {
        setSearching(false)
        const value = unwrap(result)
        setResults(value === null ? [] : value.results)
      })
    }, SEARCH_DEBOUNCE_MS)
    return () => {
      window.clearTimeout(timer)
    }
  }, [query, search])

  // Close on Escape / outside click; focus the search box on open; warm the
  // embedding pipeline so the status flips to ready without a search first.
  useEffect(() => {
    if (!open) return
    void warmup().then(() => { void loadStatus() })
    const onPointerDown = (event: MouseEvent): void => {
      if (rootRef.current !== null && event.target instanceof Node && !rootRef.current.contains(event.target)) {
        setOpen(false)
      }
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    inputRef.current?.focus()
    void loadCatalog()
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open, warmup, loadStatus, loadCatalog])

  const onModelChange = useCallback((modelId: string) => {
    if (configuring) return
    setConfiguring(true)
    void configure(modelId).then(() => {
      setConfiguring(false)
      void loadStatus()
      void loadCatalog()
    })
  }, [configuring, configure, loadStatus, loadCatalog])

  const submitRecord = useCallback(() => {
    const content = recordDraft.trim()
    if (content === '' || recording) return
    setRecording(true)
    setRecordFeedback(null)
    void record(content).then((result) => {
      setRecording(false)
      if (result.ok) {
        setRecordDraft('')
        setRecordFeedback(result.value.status === 'deduplicated' ? t('dedup') : `${t('recorded')} · ${result.value.count} ${t('count')}`)
        void loadStatus()
      }
    })
  }, [recordDraft, recording, record, t, loadStatus])

  const onForget = useCallback((id: string) => {
    void forget(id).then((result) => {
      if (result.ok) {
        setResults((current) => current.filter((item) => item.id !== id))
        void loadStatus()
      }
    })
  }, [forget, loadStatus])

  const dotState = statusError || statusSnapshot?.warmup.state === 'error'
    ? 'error'
    : statusSnapshot?.warmup.state === 'downloading'
      ? 'warming'
      : statusSnapshot?.ready === true
        ? 'ready'
        : 'idle'

  const warmPercent = statusSnapshot === null ? 0 : Math.round(statusSnapshot.warmup.progress * 100)
  const count = statusSnapshot?.count ?? null
  const toastKindLabel = toast === null
    ? ''
    : toast.kind === 'record'
      ? t('recorded')
      : toast.kind === 'search'
        ? t('searched')
        : t('forgot')

  const statusBadge = useMemo(() => {
    if (dotState === 'ready') return t('ready')
    if (dotState === 'warming') return t('warming')
    if (dotState === 'error') return t('error')
    return t('notReady')
  }, [dotState, t])

  return (
    <div className="dshmem-root" ref={rootRef}>
      <button
        type="button"
        className="dshmem-chip"
        data-open={open || undefined}
        title={t('open')}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => { setOpen((current) => !current) }}
      >
        <span className="dshmem-dot" data-state={dotState} data-active={dotActive || undefined} />
        <span className="dshmem-chip-label">{t('title')}</span>
        {count !== null && <span className="dshmem-chip-count">{count}</span>}
      </button>

      {toast !== null && toast.text !== '' && (
        <div className="dshmem-toast" key={toast.key} role="status">
          <span className="dshmem-toast-kind">
            {toast.kind === 'record' ? <IconPlus /> : toast.kind === 'search' ? <IconSearch /> : <IconTrash />}
            {toastKindLabel}
          </span>
          <span className="dshmem-toast-text">{toast.text}</span>
        </div>
      )}

      {open && (
        <div className="dshmem-panel" role="dialog" aria-label={t('panelTitle')}>
          <div className="dshmem-panel-header">
            <span className="dshmem-dot" data-state={dotState} />
            <span className="dshmem-panel-title">{t('panelTitle')}</span>
            <span className="dshmem-status-badge" data-state={dotState}>{statusBadge}</span>
            <button type="button" className="dshmem-stats-openbtn" onClick={() => { setStatsOpen(true) }}>
              <IconChart />
              {t('statsButton')}
            </button>
            <button type="button" className="dshmem-panel-close" aria-label="close" onClick={() => { setOpen(false) }}>
              <IconClose />
            </button>
          </div>

          <div className="dshmem-status">
            <span className="dshmem-status-row">
              {t('model')}
              <strong>{statusSnapshot?.model ?? '—'}</strong>
              {count !== null && <span className="dshmem-status-badge">{count} {t('count')}</span>}
            </span>
            {catalog !== null && (
              <label className="dshmem-model-select">
                <span className="dshmem-model-select-label">{t('modelSelect')}</span>
                <select
                  value={statusSnapshot?.model ?? ''}
                  disabled={configuring}
                  onChange={(event) => { onModelChange(event.target.value) }}
                >
                  {(statusSnapshot !== null && !catalog.some((entry) => entry.id === statusSnapshot.model)) && (
                    <option value={statusSnapshot.model}>{statusSnapshot.model} · {statusSnapshot.dimensions}d</option>
                  )}
                  {catalog.map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.label} · {entry.dims}d · {entry.cached ? t('cached') : t('notCached')}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {catalog !== null && (
              <div className="dshmem-model-list">
                {catalog.map((entry) => {
                  const dl = statusSnapshot?.download ?? null
                  const isDownloading = dl !== null && dl.model === entry.id && dl.state === 'running'
                  const isCurrent = statusSnapshot?.model === entry.id
                  return (
                    <div
                      className="dshmem-model-row"
                      key={entry.id}
                      data-current={isCurrent || undefined}
                      data-cached={entry.cached || undefined}
                      onClick={() => { if (!isCurrent && !configuring) onModelChange(entry.id) }}
                    >
                      <span className="dshmem-model-row-label">{entry.label} · {entry.dims}d</span>
                      <span className="dshmem-model-row-size">{entry.sizeMb}MB</span>
                      {isDownloading && dl !== null ? (
                        <span className="dshmem-model-row-status dshmem-model-row-progress" style={{ width: '96px' }}>
                          <span className="dshmem-progress" style={{ flex: 1, margin: 0 }}>
                            <span className="dshmem-progress-fill" style={{ width: `${Math.max(4, Math.round(dl.progress * 100))}%` }} />
                          </span>
                          {Math.round(dl.progress * 100)}%
                        </span>
                      ) : dl !== null && dl.model === entry.id && dl.state === 'error' ? (
                        <span className="dshmem-model-row-status dshmem-model-row-error">{t('dlFailed')}</span>
                      ) : (
                        <span className="dshmem-model-row-status">{entry.cached ? t('cached') : t('notCached')}</span>
                      )}
                      {!entry.cached && !isDownloading && (
                        <button
                          type="button"
                          className="dshmem-model-dlbtn"
                          onClick={(event) => {
                            event.stopPropagation()
                            void downloadModel(entry.id).then(() => { void loadStatus(); void loadCatalog() })
                          }}
                        >
                          {t('dlDownload')}
                        </button>
                      )}
                      {!entry.cached && (
                        <span className="dshmem-tip" tabIndex={0}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="9" />
                            <path d="M12 8h.01M11 12h1v4h1" />
                          </svg>
                          <span className="dshmem-tip-bubble">
                            <strong>{t('dlTipTitle')}</strong>
                            <span className="dshmem-tip-path">{entry.id}</span>
                            <span>{t('dlTipBody')}</span>
                            <span className="dshmem-tip-files">{t('dlTipFiles')}</span>
                          </span>
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
            {statusSnapshot !== null && (
              <div className="dshmem-cache-tip" key={statusSnapshot.model}>
                <span className="dshmem-cache-tip-dot" data-cached={(catalog ?? []).some((entry) => entry.id === statusSnapshot.model && entry.cached) || undefined} />
                <span className="dshmem-cache-tip-text">
                  {(catalog ?? []).some((entry) => entry.id === statusSnapshot.model && entry.cached)
                    ? `${t('cacheTipLocal')} · ${((catalog ?? []).find((entry) => entry.id === statusSnapshot.model)?.sizeMb) ?? '?'}MB · ${statusSnapshot.dimensions}${t('cacheTipDims')}${(catalog ?? []).find((entry) => entry.id === statusSnapshot.model)?.multilingual === true ? ` · ${t('cacheTipMultilingual')}` : ''} · ${t('cacheTipCpu')}`
                    : `${t('cacheTipRemote')} · ${((catalog ?? []).find((entry) => entry.id === statusSnapshot.model)?.sizeMb) ?? '?'}MB`}
                </span>
              </div>
            )}
            {statusSnapshot?.reembed?.state === 'running' && (
              <>
                <div className="dshmem-progress" aria-hidden="true">
                  <div
                    className="dshmem-progress-fill"
                    style={{ width: `${Math.max(4, Math.round(statusSnapshot.reembed.done / Math.max(1, statusSnapshot.reembed.total) * 100))}%` }}
                  />
                </div>
                <span className="dshmem-warm-detail">
                  {t('reembedding')} {statusSnapshot.reembed.done}/{statusSnapshot.reembed.total}
                </span>
              </>
            )}
            {statusSnapshot !== null && statusSnapshot.staleCount > 0 && statusSnapshot.reembed?.state !== 'running' && (
              <button
                type="button"
                className="dshmem-transform-btn"
                onClick={() => {
                  void reembed().then(() => { void loadStatus() })
                }}
              >
                <IconTransform />
                {t('transformIndex')}（{statusSnapshot.staleCount}）
              </button>
            )}
            {dotState === 'warming' && (
              <>
                <div className="dshmem-progress" aria-hidden="true">
                  <div className="dshmem-progress-fill" style={{ width: `${Math.max(4, warmPercent)}%` }} />
                </div>
                <span className="dshmem-warm-detail">
                  {t('warmingDetail')}{statusSnapshot?.warmup.detail !== null ? ` (${statusSnapshot?.warmup.detail})` : ''} · {warmPercent}%
                </span>
              </>
            )}
            {dotState === 'idle' && (
              <span className="dshmem-warm-detail">{t('warmOnOpen')}</span>
            )}
          </div>

          <div className="dshmem-search">
            <div className="dshmem-search-input">
              <IconSearch />
              <input
                ref={inputRef}
                type="text"
                value={query}
                placeholder={t('searchPlaceholder')}
                aria-label={t('searchPlaceholder')}
                onChange={(event) => { setQuery(event.target.value) }}
              />
              {searching && <IconSpinner />}
            </div>
          </div>

          <div className="dshmem-results">
            {query.trim() === '' ? (
              <div className="dshmem-empty">{t('searchHint')}</div>
            ) : results.length === 0 && !searching ? (
              <div className="dshmem-empty">{t('searchEmpty')}</div>
            ) : results.map((item, index) => (
              <div className="dshmem-item" key={item.id} style={{ animationDelay: `${Math.min(index * 30, 150)}ms` }}>
                <div className="dshmem-item-main">
                  <div className="dshmem-item-content">{item.content}</div>
                  <div className="dshmem-item-meta">
                    {item.tags !== '' && <span>{item.tags.split(',').slice(0, 3).join(' · ')}</span>}
                  </div>
                </div>
                <span className="dshmem-item-score">{Math.round(item.similarity * 100)}%</span>
                <button type="button" className="dshmem-item-del" title={t('forget')} onClick={() => { onForget(item.id) }}>
                  <IconTrash />
                </button>
              </div>
            ))}
          </div>

          <div className="dshmem-record">
            <div className="dshmem-record-box">
              <textarea
                className="dshmem-record-input"
                rows={1}
                value={recordDraft}
                placeholder={t('recordPlaceholder')}
                aria-label={t('recordPlaceholder')}
                onChange={(event) => { setRecordDraft(event.target.value) }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault()
                    submitRecord()
                  }
                }}
              />
              <button
                type="button"
                className="dshmem-record-save"
                disabled={recordDraft.trim() === '' || recording}
                onClick={submitRecord}
              >
                {t('recordButton')}
              </button>
            </div>
            {recordFeedback !== null && <div className="dshmem-record-feedback">{recordFeedback}</div>}
          </div>

          <div className="dshmem-strategy-tip">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 8h.01M11 12h1v4h1" />
            </svg>
            <span>{t('strategyTip')}</span>
          </div>
        </div>
      )}

      <MemStatsModal
        open={statsOpen}
        onClose={() => { setStatsOpen(false) }}
        t={t}
        cacheStats={cacheStats}
        listAll={listAll}
        setEnabled={setEnabled}
        forget={forget}
        record={record}
      />
    </div>
  )
}
