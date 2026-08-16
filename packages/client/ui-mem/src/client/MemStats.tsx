/**
 * Memory statistics modal: opened from a 统计 button inside the memory panel.
 * Shows overview cards, the full memory list (paginated, scope-filtered,
 * date-sortable), and the embedding cache hit ranking (sortable by hits).
 * Standalone overlay dialog — it never renders inside the quick panel body.
 * @module @deepseek-ai/dsh-client-ui-simplemem
 */

import { useCallback, useEffect, useState } from 'react'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type {
  MemCacheStats,
  MemConsolidateAnalyzeResponse,
  MemConsolidateApplyResponse,
  MemForgetResponse,
  MemListAllItem,
  MemListAllRequest,
  MemListAllResponse,
  MemRecordResponse,
  MemSetEnabledResponse,
  MemSetPinnedResponse,
  ConsolidatePlan,
} from '@deepseek-ai/dsh-simplemem/client'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import { MemConsolidateWindow } from './MemConsolidateWindow.tsx'

/** Stats verbs shared with the widget's inject face. */
export interface MemStatsActions {
  cacheStats(): Promise<RemoteResult<MemCacheStats>>
  listAll(request: MemListAllRequest): Promise<RemoteResult<MemListAllResponse>>
  setEnabled(id: string, enabled: boolean): Promise<RemoteResult<MemSetEnabledResponse>>
  setPinned(id: string, pinned: boolean): Promise<RemoteResult<MemSetPinnedResponse>>
  agentModel(): Promise<RemoteResult<{ provider: string; model: string } | null>>
  consolidateAnalyze(ids: string[], model?: { provider: string; model: string }): Promise<RemoteResult<MemConsolidateAnalyzeResponse>>
  consolidateApply(plan: ConsolidatePlan): Promise<RemoteResult<MemConsolidateApplyResponse>>
  forget(id: string): Promise<RemoteResult<MemForgetResponse>>
  record(content: string, tags: string, scope: 'project' | 'global', pinned?: boolean): Promise<RemoteResult<MemRecordResponse>>
}

/** Controlled modal props: open state, close verb, locale seat, data verbs. */
export interface MemStatsModalProps extends MemStatsActions {
  open: boolean
  onClose: () => void
  t: TranslateNS<'mem'>
}

type ScopeFilter = 'all' | 'project' | 'global'
type DateSort = 'createdAtDesc' | 'createdAtAsc'
type HitsSort = 'hitsDesc' | 'hitsAsc'

const PAGE_SIZE = 20

function unwrap<T>(result: RemoteResult<T>): T | null {
  return result.ok ? result.value : null
}

function IconTrash(): JSX.Element {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m3 0-1 13H7L6 7m4 4v5m4-5v5" />
    </svg>
  )
}

function IconSpinner(): JSX.Element {
  return (
    <svg className="dshmem-search-spinner" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
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

/** Standalone stats dialog rendered from the memory panel's 统计 button. */
export function MemStatsModal({ open, onClose, t, cacheStats, listAll, setEnabled, setPinned, agentModel, consolidateAnalyze, consolidateApply, forget, record }: MemStatsModalProps): JSX.Element | null {
  const [cache, setCache] = useState<MemCacheStats | null>(null)
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState('')
  const [draftScope, setDraftScope] = useState<'project' | 'global'>('project')
  const [draftPinned, setDraftPinned] = useState(false)
  const [saving, setSaving] = useState(false)
  const [items, setItems] = useState<MemListAllItem[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [scope, setScope] = useState<ScopeFilter>('all')
  const [dateSort, setDateSort] = useState<DateSort>('createdAtDesc')
  const [hitsSort, setHitsSort] = useState<HitsSort>('hitsDesc')
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState<string[]>([])
  const [consOpen, setConsOpen] = useState(false)

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const loadList = useCallback(async (targetPage: number, targetScope: ScopeFilter, targetSort: DateSort) => {
    // Keep the previous rows visible while loading: clearing them here made
    // the table collapse and re-expand (the flicker/jump on open and paging).
    setLoading(true)
    const value = unwrap(await listAll({ scope: targetScope, sort: targetSort, page: targetPage, pageSize: PAGE_SIZE }))
    setLoading(false)
    if (value !== null) {
      setItems(value.items)
      setTotal(value.total)
      setPage(value.page)
    }
  }, [listAll])

  const reload = useCallback(() => {
    void loadList(page, scope, dateSort)
    void cacheStats().then((result) => {
      const value = unwrap(result)
      if (value !== null) setCache(value)
    })
  }, [page, scope, dateSort, loadList, cacheStats])

  const submitAdd = useCallback(() => {
    const content = draft.trim()
    if (content === '' || saving) return
    setSaving(true)
    void record(content, '', draftScope, draftPinned).then((result) => {
      setSaving(false)
      if (result.ok) {
        setDraft('')
        setDraftPinned(false)
        setAdding(false)
        reload()
      }
    })
  }, [draft, draftScope, draftPinned, saving, record, reload])

  const onToggle = useCallback((id: string, enabled: boolean) => {
    void setEnabled(id, enabled).then((result) => {
      if (result.ok && result.value.updated) {
        setItems((current) => current.map((item) => (item.id === id ? { ...item, enabled: result.value.enabled } : item)))
      }
    })
  }, [setEnabled])

  const onPin = useCallback((id: string, pinned: boolean) => {
    void setPinned(id, pinned).then((result) => {
      if (result.ok && result.value.updated) {
        setItems((current) => current.map((item) => (item.id === id ? { ...item, pinned: result.value.pinned } : item)))
      }
    })
  }, [setPinned])

  const onDelete = useCallback((id: string) => {
    void forget(id).then((result) => {
      if (result.ok && result.value.forgotten) {
        setItems((current) => current.filter((item) => item.id !== id))
        setTotal((current) => Math.max(0, current - 1))
      }
    })
  }, [forget])

  // Multi-select for consolidation.
  const toggleSelect = useCallback((id: string) => {
    setSelected((current) => (current.includes(id) ? current.filter((x) => x !== id) : [...current, id]))
  }, [])

  const toggleSelectAll = useCallback(() => {
    setSelected((current) => (current.length === items.length && items.every((item) => current.includes(item.id))
      ? []
      : [...new Set([...current, ...items.map((item) => item.id)])]))
  }, [items])

  const clearSelection = useCallback(() => setSelected([]), [])

  // Selection is per open; drop it when the modal closes or the page changes.
  useEffect(() => {
    if (!open) setSelected([])
  }, [open])

  // Open: load cache stats + first list page; close on Escape / mask click.
  useEffect(() => {
    if (!open) return
    void cacheStats().then((result) => {
      const value = unwrap(result)
      if (value !== null) setCache(value)
    })
    void loadList(1, 'all', 'createdAtDesc')
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open, cacheStats, loadList, onClose])

  // Every hook is above this line: the early return must not change hook order.
  if (!open) return null

  const onScope = (next: ScopeFilter): void => {
    setScope(next)
    void loadList(1, next, dateSort)
  }

  const onDateSort = (): void => {
    const next: DateSort = dateSort === 'createdAtDesc' ? 'createdAtAsc' : 'createdAtDesc'
    setDateSort(next)
    void loadList(page, scope, next)
  }

  const sortedCacheTop = cache === null ? [] : [...cache.top].sort((a, b) =>
    hitsSort === 'hitsDesc' ? b.hits - a.hits || b.lastAt - a.lastAt : a.hits - b.hits || b.lastAt - a.lastAt)

  const hitRate = cache === null || cache.hits + cache.misses === 0
    ? '—'
    : `${Math.round(cache.hits / (cache.hits + cache.misses) * 100)}%`

  return (
    <div className="dshmem-modal-mask" onPointerDown={(event) => {
      if (event.target === event.currentTarget) onClose()
    }}>
      <div className="dshmem-modal" role="dialog" aria-label={t('statsTitle')}>
        <div className="dshmem-modal-header">
          <span className="dshmem-modal-title">{t('statsTitle')}</span>
          <button
            type="button"
            className="dshmem-stats-openbtn"
            data-active={adding || undefined}
            onClick={() => { setAdding((current) => !current) }}
          >
            {t('statsAdd')}
          </button>
          <button type="button" className="dshmem-panel-close" aria-label={t('statsClose')} onClick={onClose}>
            <IconClose />
          </button>
        </div>

        {adding && (
          <div className="dshmem-stats-add">
            <textarea
              className="dshmem-record-input"
              rows={2}
              value={draft}
              placeholder={t('recordPlaceholder')}
              aria-label={t('recordPlaceholder')}
              onChange={(event) => { setDraft(event.target.value) }}
            />
            <div className="dshmem-stats-add-row">
              <label className="dshmem-record-pinned dshmem-record-pinned-inline">
                <input
                  type="checkbox"
                  checked={draftPinned}
                  onChange={(event) => { setDraftPinned(event.target.checked) }}
                />
                <span>{t('pinnedLabel')}</span>
              </label>
              <select
                className="dshmem-stats-add-scope"
                value={draftScope}
                onChange={(event) => { setDraftScope(event.target.value === 'global' ? 'global' : 'project') }}
              >
                <option value="project">{t('scopeProject')}</option>
                <option value="global">{t('scopeGlobal')}</option>
              </select>
              <button
                type="button"
                className="dshmem-record-save"
                disabled={draft.trim() === '' || saving}
                onClick={submitAdd}
              >
                {t('recordButton')}
              </button>
            </div>
          </div>
        )}

        <div className="dshmem-stats-cards">
          <div className="dshmem-stats-card">
            <span className="dshmem-stats-card-value">{total}</span>
            <span className="dshmem-stats-card-label">{t('statsTotal')}</span>
          </div>
          <div className="dshmem-stats-card">
            <span className="dshmem-stats-card-value">{cache?.hits ?? '—'}</span>
            <span className="dshmem-stats-card-label">{t('statsCacheHits')}</span>
          </div>
          <div className="dshmem-stats-card">
            <span className="dshmem-stats-card-value">{hitRate}</span>
            <span className="dshmem-stats-card-label">{t('statsHitRate')}</span>
          </div>
          <div className="dshmem-stats-card">
            <span className="dshmem-stats-card-value">{cache !== null ? `${cache.size}/${cache.capacity}` : '—'}</span>
            <span className="dshmem-stats-card-label">{t('statsCacheSize')}</span>
          </div>
        </div>

        <div className="dshmem-stats-section">
          <div className="dshmem-stats-section-head">
            <span className="dshmem-stats-section-title">{t('statsMemories')}</span>
            {loading && <IconSpinner />}
            <div className="dshmem-stats-tabs">
              {(['all', 'project', 'global'] as const).map((key) => (
                <button
                  key={key}
                  type="button"
                  className="dshmem-stats-tab"
                  data-active={scope === key || undefined}
                  onClick={() => { onScope(key) }}
                >
                  {key === 'all' ? t('scopeAll') : key === 'project' ? t('scopeProject') : t('scopeGlobal')}
                </button>
              ))}
            </div>
          </div>

          <div className="dshmem-stats-selection">
            <label className="dshmem-stats-selall">
              <input
                type="checkbox"
                checked={items.length > 0 && items.every((item) => selected.includes(item.id))}
                onChange={toggleSelectAll}
              />
              <span>{t('consSelectAll')}</span>
            </label>
            <span className="dshmem-stats-selected-count">{selected.length} {t('consSelected')}</span>
            {selected.length > 0 && (
              <button type="button" className="dshmem-stats-clear" onClick={clearSelection}>{t('consClear')}</button>
            )}
            <button
              type="button"
              className="dshmem-cons-open-btn"
              disabled={selected.length === 0}
              onClick={() => { setConsOpen(true) }}
            >
              ✨ {t('consTitle')}
            </button>
          </div>

          <div className="dshmem-stats-table">
            <div className="dshmem-stats-row dshmem-stats-row-head">
              <span className="dshmem-stats-col-check">
                <input
                  type="checkbox"
                  checked={items.length > 0 && items.every((item) => selected.includes(item.id))}
                  onChange={toggleSelectAll}
                  aria-label={t('consSelectAll')}
                />
              </span>
              <span className="dshmem-stats-col-content">{t('statsContent')}</span>
              <span className="dshmem-stats-col-scope">{t('statsScope')}</span>
              <span className="dshmem-stats-col-use">{t('statsUse')}</span>
              <span className="dshmem-stats-col-dims">{t('statsDims')}</span>
              <button type="button" className="dshmem-stats-col-date" onClick={onDateSort}>
                {t('statsCreatedAt')} {dateSort === 'createdAtDesc' ? '↓' : '↑'}
              </button>
              <span className="dshmem-stats-col-actions">{t('statsActions')}</span>
            </div>
            {items.length === 0 && !loading && (
              <div className="dshmem-stats-empty">{t('statsEmpty')}</div>
            )}
            {items.map((item) => (
              <div className="dshmem-stats-row" key={item.id} data-disabled={!item.enabled || undefined} data-selected={selected.includes(item.id) || undefined}>
                <span className="dshmem-stats-col-check">
                  <input
                    type="checkbox"
                    checked={selected.includes(item.id)}
                    onChange={() => { toggleSelect(item.id) }}
                    aria-label={t('consSelect')}
                  />
                </span>
                <span className="dshmem-stats-col-content" title={item.content}>
                  {item.pinned && <span className="dshmem-stats-pin-badge">{t('pinned')}</span>}
                  {item.content}
                </span>
                <span className="dshmem-stats-col-scope">{item.scope === 'global' ? t('scopeGlobal') : t('scopeProject')}</span>
                <span className="dshmem-stats-col-use" title={(item.useCount ?? 0) >= 50 ? t('consHighUseTip') : undefined}>
                  {item.useCount ?? 0}
                </span>
                <span className="dshmem-stats-col-dims">{item.dims}</span>
                <span className="dshmem-stats-col-date">{new Date(item.createdAt).toLocaleString()}</span>
                <span className="dshmem-stats-col-actions">
                  <button
                    type="button"
                    className="dshmem-stats-toggle"
                    data-on={item.enabled || undefined}
                    title={item.enabled ? t('statsDisable') : t('statsEnable')}
                    onClick={() => { onToggle(item.id, !item.enabled) }}
                  >
                    <span className="dshmem-stats-toggle-knob" />
                  </button>
                  <button
                    type="button"
                    className="dshmem-stats-pinbtn"
                    data-on={item.pinned || undefined}
                    title={item.pinned ? t('unpin') : t('pin')}
                    onClick={() => { onPin(item.id, !item.pinned) }}
                  >
                    📌
                  </button>
                  <button
                    type="button"
                    className="dshmem-item-del dshmem-stats-del"
                    title={t('forget')}
                    onClick={() => { onDelete(item.id) }}
                  >
                    <IconTrash />
                  </button>
                </span>
              </div>
            ))}
          </div>

          <div className="dshmem-stats-pager">
            <button type="button" disabled={page <= 1} onClick={() => { void loadList(page - 1, scope, dateSort) }}>{t('prevPage')}</button>
            <span className="dshmem-stats-pager-info">{page} / {pages}</span>
            <button type="button" disabled={page >= pages} onClick={() => { void loadList(page + 1, scope, dateSort) }}>{t('nextPage')}</button>
          </div>
        </div>

        <div className="dshmem-stats-section">
          <div className="dshmem-stats-section-head">
            <span className="dshmem-stats-section-title">{t('statsCacheRank')}</span>
            {cache !== null && (
              <span className="dshmem-stats-summary">
                {t('statsCacheHits')} {cache.hits} · {t('statsMisses')} {cache.misses}
              </span>
            )}
            <button
              type="button"
              className="dshmem-stats-sortbtn"
              onClick={() => { setHitsSort((current) => (current === 'hitsDesc' ? 'hitsAsc' : 'hitsDesc')) }}
            >
              {t('statsHits')} {hitsSort === 'hitsDesc' ? '↓' : '↑'}
            </button>
          </div>
          <div className="dshmem-stats-table">
            <div className="dshmem-stats-row dshmem-stats-row-head dshmem-stats-row-cache">
              <span className="dshmem-stats-col-cachetext">{t('statsCacheText')}</span>
              <span className="dshmem-stats-col-hits">{t('statsHits')}</span>
              <span className="dshmem-stats-col-last">{t('statsLastHit')}</span>
            </div>
            {sortedCacheTop.length === 0 && <div className="dshmem-stats-empty">{t('statsCacheEmpty')}</div>}
            {sortedCacheTop.map((entry, index) => (
              <div className="dshmem-stats-row dshmem-stats-row-cache" key={index}>
                <span className="dshmem-stats-col-cachetext" title={entry.text}>{entry.text}</span>
                <span className="dshmem-stats-col-hits">{entry.hits}</span>
                <span className="dshmem-stats-col-last">{new Date(entry.lastAt).toLocaleTimeString()}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <MemConsolidateWindow
        open={consOpen}
        onClose={() => { setConsOpen(false) }}
        onApplied={() => { clearSelection(); reload() }}
        ids={selected}
        t={t}
        agentModel={agentModel}
        consolidateAnalyze={consolidateAnalyze}
        consolidateApply={consolidateApply}
      />
    </div>
  )
}
