/**
 * Memory statistics modal: opened from a 统计 button inside the memory panel.
 * Shows overview cards, the full memory list (paginated, scope-filtered,
 * date-sortable), and the embedding cache hit ranking (sortable by hits).
 * Standalone overlay dialog — it never renders inside the quick panel body.
 * @module @deepseek-ai/dsh-client-ui-mem
 */

import { useCallback, useEffect, useState } from 'react'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type {
  MemCacheStats,
  MemListAllItem,
  MemListAllRequest,
  MemListAllResponse,
} from '@deepseek-ai/dsh-mem/client'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'

/** Stats verbs shared with the widget's inject face. */
export interface MemStatsActions {
  cacheStats(): Promise<RemoteResult<MemCacheStats>>
  listAll(request: MemListAllRequest): Promise<RemoteResult<MemListAllResponse>>
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

function IconClose(): JSX.Element {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  )
}

/** Standalone stats dialog rendered from the memory panel's 统计 button. */
export function MemStatsModal({ open, onClose, t, cacheStats, listAll }: MemStatsModalProps): JSX.Element | null {
  const [cache, setCache] = useState<MemCacheStats | null>(null)
  const [items, setItems] = useState<MemListAllItem[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [scope, setScope] = useState<ScopeFilter>('all')
  const [dateSort, setDateSort] = useState<DateSort>('createdAtDesc')
  const [hitsSort, setHitsSort] = useState<HitsSort>('hitsDesc')
  const [loading, setLoading] = useState(false)

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const loadList = useCallback(async (targetPage: number, targetScope: ScopeFilter, targetSort: DateSort) => {
    setLoading(true)
    const value = unwrap(await listAll({ scope: targetScope, sort: targetSort, page: targetPage, pageSize: PAGE_SIZE }))
    setLoading(false)
    if (value !== null) {
      setItems(value.items)
      setTotal(value.total)
      setPage(value.page)
    }
  }, [listAll])

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
          <button type="button" className="dshmem-panel-close" aria-label={t('statsClose')} onClick={onClose}>
            <IconClose />
          </button>
        </div>

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

          <div className="dshmem-stats-table">
            <div className="dshmem-stats-row dshmem-stats-row-head">
              <span className="dshmem-stats-col-content">{t('statsContent')}</span>
              <span className="dshmem-stats-col-scope">{t('statsScope')}</span>
              <span className="dshmem-stats-col-dims">{t('statsDims')}</span>
              <button type="button" className="dshmem-stats-col-date" onClick={onDateSort}>
                {t('statsCreatedAt')} {dateSort === 'createdAtDesc' ? '↓' : '↑'}
              </button>
            </div>
            {items.length === 0 && !loading && (
              <div className="dshmem-stats-empty">{t('statsEmpty')}</div>
            )}
            {loading && <div className="dshmem-stats-empty">{t('statsLoading')}</div>}
            {items.map((item) => (
              <div className="dshmem-stats-row" key={item.id}>
                <span className="dshmem-stats-col-content" title={item.content}>{item.content}</span>
                <span className="dshmem-stats-col-scope">{item.scope === 'global' ? t('scopeGlobal') : t('scopeProject')}</span>
                <span className="dshmem-stats-col-dims">{item.dims}</span>
                <span className="dshmem-stats-col-date">{new Date(item.createdAt).toLocaleString()}</span>
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
            {sortedCacheTop.length === 0 && <div className="dshmem-stats-empty">{t('statsEmpty')}</div>}
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
    </div>
  )
}
