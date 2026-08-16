/**
 * Memory consolidation window: a standalone dialog that runs the LLM over
 * selected memories and shows the resulting plan for review before applying.
 * Each change card renders a vimdiff-style before/after comparison plus an
 * SVG connector strip (mind-map style lines) showing which source memories
 * flow into the result. The analysis model defaults to the agent's current
 * model and can be overridden per run.
 * @module @deepseek-ai/dsh-client-ui-simplemem
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type {
  ConsolidateChange,
  ConsolidatePlan,
  ConsolidateRow,
  MemConsolidateAnalyzeResponse,
  MemConsolidateApplyResponse,
} from '@deepseek-ai/dsh-simplemem/client'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'

/** Verbs the window needs (subset of the widget action face). */
export interface MemConsolidateActions {
  agentModel(): Promise<RemoteResult<{ provider: string; model: string } | null>>
  consolidateAnalyze(ids: string[], model?: { provider: string; model: string }): Promise<RemoteResult<MemConsolidateAnalyzeResponse>>
  consolidateApply(plan: ConsolidatePlan): Promise<RemoteResult<MemConsolidateApplyResponse>>
}

export interface MemConsolidateWindowProps extends MemConsolidateActions {
  open: boolean
  onClose: () => void
  /** Reload the parent list after a successful apply. */
  onApplied: () => void
  /** Selected memory ids to consolidate. */
  ids: string[]
  t: TranslateNS<'mem'>
}

type Phase = 'idle' | 'analyzing' | 'plan' | 'applying' | 'done' | 'error'

function unwrap<T>(result: RemoteResult<T>): T | null {
  return result.ok ? result.value : null
}

/** Simple LCS line diff (vimdiff-style before/after split). */
function diffLines(before: string, after: string): Array<{ t: 'same' | 'del' | 'add'; text: string }> {
  const a = before.split('\n')
  const b = after.split('\n')
  const n = a.length
  const m = b.length
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
    }
  }
  const out: Array<{ t: 'same' | 'del' | 'add'; text: string }> = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ t: 'same', text: a[i] })
      i += 1
      j += 1
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      out.push({ t: 'del', text: a[i] })
      i += 1
    } else {
      out.push({ t: 'add', text: b[j] })
      j += 1
    }
  }
  while (i < n) out.push({ t: 'del', text: a[i++] })
  while (j < m) out.push({ t: 'add', text: b[j++] })
  return out
}

/** Mind-map style connector: curved lines from N sources to the result. */
function ConnectorStrip({ count, height, kind }: { count: number; height: number; kind: 'merge' | 'rewrite' | 'retag' | 'delete' }): JSX.Element {
  const mid = height / 2
  const paths: JSX.Element[] = []
  for (let i = 0; i < count; i += 1) {
    const y0 = ((i + 1) * height) / (count + 1)
    paths.push(
      <path
        key={`l${i}`}
        d={`M 2 ${y0} C 18 ${y0}, 18 ${mid}, 36 ${mid}`}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        opacity="0.75"
      />,
    )
  }
  if (kind === 'delete') {
    paths.push(<path key="x" d={`M 30 ${mid - 5} l 10 10 M 40 ${mid - 5} l -10 10`} fill="none" stroke="currentColor" strokeWidth="1.6" />)
  } else {
    paths.push(<path key="arrow" d={`M 33 ${mid - 4} l 7 4 l -7 4`} fill="none" stroke="currentColor" strokeWidth="1.6" />)
  }
  return (
    <svg className="dshmem-cons-lines" width="42" height={Math.max(height, 8)} viewBox={`0 0 42 ${Math.max(height, 8)}`} aria-hidden="true">
      {paths}
    </svg>
  )
}

/** One plan change: sources → result with diff panes + connector lines. */
function ChangeCard({ change, rows, t }: { change: ConsolidateChange; rows: ConsolidateRow[]; t: TranslateNS<'mem'> }): JSX.Element {
  const rowById = useMemo(() => new Map(rows.map((row) => [row.id, row])), [rows])

  if (change.type === 'merge') {
    const sources = change.sourceIds.map((id) => rowById.get(id)).filter((row): row is ConsolidateRow => row !== undefined)
    const beforeText = sources.map((row) => row.content).join('\n')
    const afterText = change.content
    const diff = diffLines(beforeText, afterText)
    const h = Math.max(sources.length * 34 + 8, 40)
    return (
      <div className="dshmem-cons-card" data-kind="merge">
        <div className="dshmem-cons-card-head">
          <span className="dshmem-cons-badge">{t('consMerge')}</span>
          <span className="dshmem-cons-reason">{change.reason}</span>
        </div>
        <div className="dshmem-cons-card-body">
          <div className="dshmem-cons-sources">
            {sources.map((row, index) => (
              <div className="dshmem-cons-source" key={row.id} title={row.content}>
                <span className="dshmem-cons-source-idx">{index + 1}</span>
                <span className="dshmem-cons-source-text">{row.content}</span>
                <span className="dshmem-cons-source-use">{row.useCount}×</span>
              </div>
            ))}
          </div>
          <ConnectorStrip count={sources.length} height={h} kind="merge" />
          <div className="dshmem-cons-after">
            <div className="dshmem-cons-after-tags">{change.tags === '' ? t('consNoTags') : change.tags}</div>
            <div className="dshmem-cons-diff">
              {diff.map((line, index) => (
                <div className={`dshmem-cons-line dshmem-cons-line-${line.t}`} key={index}>{line.text || ' '}</div>
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (change.type === 'rewrite') {
    const row = rowById.get(change.id)
    const beforeText = row?.content ?? ''
    const diff = diffLines(beforeText, change.content)
    return (
      <div className="dshmem-cons-card" data-kind="rewrite">
        <div className="dshmem-cons-card-head">
          <span className="dshmem-cons-badge">{t('consRewrite')}</span>
          <span className="dshmem-cons-reason">{change.reason}</span>
        </div>
        <div className="dshmem-cons-card-body">
          <div className="dshmem-cons-before">
            <div className="dshmem-cons-label">{t('consBefore')}</div>
            <div className="dshmem-cons-diff">{diff.filter((l) => l.t !== 'add').map((line, index) => (
              <div className={`dshmem-cons-line dshmem-cons-line-${line.t}`} key={index}>{line.text || ' '}</div>
            ))}</div>
          </div>
          <ConnectorStrip count={1} height={44} kind="rewrite" />
          <div className="dshmem-cons-after">
            <div className="dshmem-cons-label">{t('consAfter')}</div>
            <div className="dshmem-cons-after-tags">{change.tags === '' ? t('consNoTags') : change.tags}</div>
            <div className="dshmem-cons-diff">{diff.filter((l) => l.t !== 'del').map((line, index) => (
              <div className={`dshmem-cons-line dshmem-cons-line-${line.t}`} key={index}>{line.text || ' '}</div>
            ))}</div>
          </div>
        </div>
      </div>
    )
  }

  if (change.type === 'retag') {
    const row = rowById.get(change.id)
    return (
      <div className="dshmem-cons-card" data-kind="retag">
        <div className="dshmem-cons-card-head">
          <span className="dshmem-cons-badge">{t('consRetag')}</span>
          <span className="dshmem-cons-reason">{change.reason}</span>
        </div>
        <div className="dshmem-cons-card-body">
          <div className="dshmem-cons-before">
            <div className="dshmem-cons-label">{t('consBefore')}</div>
            <div className="dshmem-cons-tags-row">{row?.tags === '' || row?.tags === undefined ? t('consNoTags') : row.tags}</div>
            <div className="dshmem-cons-source-text">{row?.content}</div>
          </div>
          <ConnectorStrip count={1} height={44} kind="retag" />
          <div className="dshmem-cons-after">
            <div className="dshmem-cons-label">{t('consAfter')}</div>
            <div className="dshmem-cons-tags-row">{change.tags === '' ? t('consNoTags') : change.tags}</div>
          </div>
        </div>
      </div>
    )
  }

  const row = rowById.get(change.id)
  return (
    <div className="dshmem-cons-card" data-kind="delete">
      <div className="dshmem-cons-card-head">
        <span className="dshmem-cons-badge">{t('consDelete')}</span>
        <span className="dshmem-cons-reason">{change.reason}</span>
      </div>
      <div className="dshmem-cons-card-body">
        <div className="dshmem-cons-before dshmem-cons-before-deleted">
          <div className="dshmem-cons-source-text">{row?.content ?? change.id}</div>
          <div className="dshmem-cons-source-use">{row === undefined ? '' : `${row.useCount}×`}</div>
        </div>
        <ConnectorStrip count={1} height={44} kind="delete" />
        <div className="dshmem-cons-deleted">{t('consDeletedMark')}</div>
      </div>
    </div>
  )
}

/**
 * Standalone consolidation dialog.
 * @param props - open state, verbs, selected ids, locale.
 * @returns the window overlay or null when closed.
 */
export function MemConsolidateWindow({ open, onClose, onApplied, ids, t, agentModel, consolidateAnalyze, consolidateApply }: MemConsolidateWindowProps): JSX.Element | null {
  const [phase, setPhase] = useState<Phase>('idle')
  const [currentModel, setCurrentModel] = useState<{ provider: string; model: string } | null>(null)
  const [customModel, setCustomModel] = useState('')
  const [result, setResult] = useState<MemConsolidateAnalyzeResponse | null>(null)
  const [applied, setApplied] = useState<MemConsolidateApplyResponse | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setPhase('idle')
    setResult(null)
    setApplied(null)
    setError('')
    void agentModel().then((res) => {
      setCurrentModel(unwrap(res))
    })
  }, [open, agentModel])

  const modelOverride = useMemo(() => {
    if (customModel.trim() === '') return undefined
    const idx = customModel.indexOf(':')
    if (idx <= 0) return undefined
    const provider = customModel.slice(0, idx).trim()
    const model = customModel.slice(idx + 1).trim()
    if (provider === '' || model === '') return undefined
    return { provider, model }
  }, [customModel])

  const runAnalyze = useCallback(() => {
    if (ids.length === 0) return
    setPhase('analyzing')
    setError('')
    void consolidateAnalyze(ids, modelOverride).then((res) => {
      if (!res.ok) {
        setPhase('error')
        setError(res.error?.message ?? 'consolidation failed')
        return
      }
      setResult(res.value)
      setPhase('plan')
    })
  }, [ids, modelOverride, consolidateAnalyze])

  const runApply = useCallback(() => {
    if (result === null) return
    setPhase('applying')
    setError('')
    void consolidateApply(result.plan).then((res) => {
      if (!res.ok) {
        setPhase('error')
        setError(res.error?.message ?? 'apply failed')
        return
      }
      setApplied(res.value)
      setPhase('done')
    })
  }, [result, consolidateApply])

  const onKeyDown = useCallback((event: KeyboardEvent): void => {
    if (event.key === 'Escape') onClose()
  }, [onClose])

  useEffect(() => {
    if (!open) return
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open, onKeyDown])

  if (!open) return null

  const usedModelLabel = result?.usedModel !== null && result?.usedModel !== undefined
    ? `${result.usedModel.provider}/${result.usedModel.model}`
    : currentModel !== null
      ? `${currentModel.provider}/${currentModel.model}`
      : t('consModelUnknown')

  return (
    <div className="dshmem-modal-mask" onPointerDown={(event) => {
      if (event.target === event.currentTarget) onClose()
    }}>
      <div className="dshmem-modal dshmem-cons-window" role="dialog" aria-label={t('consTitle')}>
        <div className="dshmem-modal-header">
          <span className="dshmem-modal-title">{t('consTitle')}</span>
          <span className="dshmem-cons-count">{ids.length} {t('consMemories')}</span>
          <button type="button" className="dshmem-panel-close" aria-label={t('statsClose')} onClick={onClose}>✕</button>
        </div>

        {phase === 'idle' && (
          <div className="dshmem-cons-body">
            <div className="dshmem-cons-model-row">
              <label className="dshmem-cons-model-label">{t('consModel')}</label>
              <select
                className="dshmem-cons-model-select"
                value={customModel.trim() === '' ? 'current' : 'custom'}
                onChange={(event) => {
                  if (event.target.value === 'current') setCustomModel('')
                  else if (customModel.trim() === '') setCustomModel(`${currentModel?.provider ?? ''}:${currentModel?.model ?? ''}`)
                }}
              >
                <option value="current">{t('consModelCurrent')}{currentModel !== null ? `（${currentModel.provider}/${currentModel.model}）` : ''}</option>
                <option value="custom">{t('consModelCustom')}</option>
              </select>
              {customModel.trim() !== '' && (
                <input
                  className="dshmem-cons-model-input"
                  value={customModel}
                  placeholder="provider:model"
                  onChange={(event) => { setCustomModel(event.target.value) }}
                />
              )}
            </div>
            <p className="dshmem-cons-hint">{t('consHint')}</p>
            <div className="dshmem-cons-actions">
              <button type="button" className="dshmem-record-save" onClick={runAnalyze} disabled={ids.length === 0}>
                {t('consAnalyze')}
              </button>
              <button type="button" className="dshmem-cons-ghost" onClick={onClose}>{t('consCancel')}</button>
            </div>
          </div>
        )}

        {phase === 'analyzing' && (
          <div className="dshmem-cons-body dshmem-cons-center">
            <span className="dshmem-search-spinner dshmem-cons-spinner" />
            <p>{t('consAnalyzing')}</p>
          </div>
        )}

        {phase === 'plan' && result !== null && (
          <div className="dshmem-cons-body">
            <div className="dshmem-cons-summary">
              <span className="dshmem-cons-summary-text">{result.plan.summary}</span>
              <span className="dshmem-cons-model-used">{usedModelLabel}</span>
            </div>
            <div className="dshmem-cons-changes">
              {result.plan.changes.length === 0 && <div className="dshmem-stats-empty">{t('consNoChanges')}</div>}
              {result.plan.changes.map((change, index) => (
                <ChangeCard key={index} change={change} rows={result.rows} t={t} />
              ))}
            </div>
            <div className="dshmem-cons-actions">
              <button type="button" className="dshmem-record-save" onClick={runApply}>
                {t('consApply')}（{result.plan.changes.length}）
              </button>
              <button type="button" className="dshmem-cons-ghost" onClick={runAnalyze}>{t('consReanalyze')}</button>
            </div>
          </div>
        )}

        {phase === 'applying' && (
          <div className="dshmem-cons-body dshmem-cons-center">
            <span className="dshmem-search-spinner dshmem-cons-spinner" />
            <p>{t('consApplying')}</p>
          </div>
        )}

        {phase === 'done' && applied !== null && (
          <div className="dshmem-cons-body">
            <div className="dshmem-cons-summary">
              <span className="dshmem-cons-summary-text">{t('consDone')}</span>
              <span className="dshmem-cons-model-used">{applied.count} {t('count')}</span>
            </div>
            <div className="dshmem-cons-changes">
              {applied.applied.map((item, index) => (
                <div className={`dshmem-cons-result dshmem-cons-result-${item.kind}`} key={index}>
                  <span className="dshmem-cons-badge">{t(`consResult${item.kind}` as never)}</span>
                  <span className="dshmem-cons-reason">{item.detail}</span>
                </div>
              ))}
            </div>
            <div className="dshmem-cons-actions">
              <button type="button" className="dshmem-record-save" onClick={() => { onApplied(); onClose() }}>{t('consFinish')}</button>
            </div>
          </div>
        )}

        {phase === 'error' && (
          <div className="dshmem-cons-body">
            <div className="dshmem-warm-error">{error}</div>
            <div className="dshmem-cons-actions">
              <button type="button" className="dshmem-cons-ghost" onClick={() => { setPhase('idle') }}>{t('consBack')}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
