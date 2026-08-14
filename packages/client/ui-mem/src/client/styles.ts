/**
 * Widget stylesheet, injected once at bundle evaluation (the module loader
 * claims the <style> element for reload disposal). Tokens come from the
 * shared --dsw-* design platform; all animations carry reduced-motion guards.
 * @module @deepseek-ai/dsh-client-ui-mem
 */

export const memStyles = `
.dshmem-root {
  position: relative;
  display: inline-flex;
  align-items: center;
}

/* ── Chip ─────────────────────────────────────────────────────────── */

.dshmem-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 26px;
  padding: 0 10px 0 8px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 999px;
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
  line-height: 1;
  cursor: pointer;
  user-select: none;
  transition: border-color var(--ds-transition-duration-fast) var(--ds-ease-in-out),
    background var(--ds-transition-duration-fast) var(--ds-ease-in-out),
    color var(--ds-transition-duration-fast) var(--ds-ease-in-out);
}

.dshmem-chip:hover {
  border-color: var(--dsw-alias-border-l3);
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-primary);
}

.dshmem-chip:focus-visible {
  outline: 2px solid var(--dsw-alias-state-business-primary);
  outline-offset: 2px;
}

.dshmem-chip[data-open='true'] {
  border-color: var(--dsw-alias-state-business-primary);
  color: var(--dsw-alias-label-primary);
}

.dshmem-chip-label {
  font-weight: 500;
}

.dshmem-chip-count {
  color: var(--dsw-alias-label-tertiary);
  font-variant-numeric: tabular-nums;
}

/* ── State dot ────────────────────────────────────────────────────── */

.dshmem-dot {
  position: relative;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--dsw-alias-label-tertiary);
  flex: none;
  transition: background var(--ds-transition-duration) var(--ds-ease-in-out);
}

.dshmem-dot[data-state='ready'] {
  background: var(--dsw-alias-state-success-primary);
}

.dshmem-dot[data-state='warming'] {
  background: var(--dsw-alias-state-warn-primary);
  animation: dshmem-dot-chase 1.2s var(--ds-ease-in-out) infinite;
}

.dshmem-dot[data-state='error'] {
  background: var(--dsw-alias-state-error-primary);
}

.dshmem-dot[data-active='true']::after {
  content: '';
  position: absolute;
  inset: -4px;
  border-radius: 50%;
  border: 1.5px solid var(--dsw-alias-state-business-primary);
  opacity: 0;
  animation: dshmem-ring-pulse 0.9s var(--ds-ease-in-out);
}

@keyframes dshmem-dot-chase {
  0% { box-shadow: 0 0 0 0 var(--dsw-alias-state-warn-primary); }
  55% { box-shadow: 0 0 0 5px rgba(245, 158, 11, 0); }
  100% { box-shadow: 0 0 0 0 rgba(245, 158, 11, 0); }
}

@keyframes dshmem-ring-pulse {
  0% { opacity: 0.9; transform: scale(0.6); }
  100% { opacity: 0; transform: scale(1.6); }
}

/* ── Activity toast ───────────────────────────────────────────────── */

.dshmem-toast {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  max-width: 300px;
  padding: 8px 12px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 10px;
  background: var(--dsw-alias-bg-layer-2);
  box-shadow: 0 8px 24px var(--dsw-alias-bg-mask-2);
  font-size: 12px;
  color: var(--dsw-alias-label-primary);
  pointer-events: none;
  z-index: 40;
  animation: dshmem-toast-in 2.6s var(--ds-ease-in-out) forwards;
}

.dshmem-toast-kind {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex: none;
  font-weight: 500;
  color: var(--dsw-alias-state-business-primary);
}

.dshmem-toast-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--dsw-alias-label-secondary);
}

@keyframes dshmem-toast-in {
  0% { opacity: 0; transform: translateY(-6px) scale(0.97); }
  8% { opacity: 1; transform: translateY(0) scale(1); }
  82% { opacity: 1; transform: translateY(0) scale(1); }
  100% { opacity: 0; transform: translateY(-4px) scale(0.98); }
}

/* ── Panel ────────────────────────────────────────────────────────── */

.dshmem-panel {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  width: 328px;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 12px;
  background: var(--dsw-alias-bg-layer-2);
  box-shadow: 0 12px 40px var(--dsw-alias-bg-mask-2);
  z-index: 40;
  overflow: hidden;
  animation: dshmem-pop-in var(--ds-transition-duration) var(--ds-ease-in-out);
  transform-origin: top right;
}

@keyframes dshmem-pop-in {
  from { opacity: 0; transform: scale(0.96) translateY(-4px); }
  to { opacity: 1; transform: scale(1) translateY(0); }
}

.dshmem-panel-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 14px 10px;
  border-bottom: 1px solid var(--dsw-alias-border-l1);
}

.dshmem-panel-title {
  flex: 1;
  font-size: 13px;
  font-weight: 600;
  color: var(--dsw-alias-label-primary);
}

.dshmem-panel-close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--dsw-alias-label-tertiary);
  cursor: pointer;
}

.dshmem-panel-close:hover {
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-primary);
}

/* Status row */

.dshmem-status {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--dsw-alias-border-l1);
  font-size: 12px;
}

.dshmem-status-row {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--dsw-alias-label-secondary);
}

.dshmem-status-row strong {
  font-weight: 500;
  color: var(--dsw-alias-label-primary);
  max-width: 210px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dshmem-status-badge {
  margin-left: auto;
  color: var(--dsw-alias-label-tertiary);
  font-variant-numeric: tabular-nums;
}

.dshmem-status-badge[data-state='ready'] { color: var(--dsw-alias-state-success-primary); }
.dshmem-status-badge[data-state='warming'] { color: var(--dsw-alias-state-warn-primary); }
.dshmem-status-badge[data-state='error'] { color: var(--dsw-alias-state-error-primary); }

.dshmem-transform-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 28px;
  margin-top: 8px;
  border: 1px solid var(--dsw-alias-state-business-primary);
  border-radius: 8px;
  background: var(--dsw-alias-state-business-primary);
  color: var(--dsw-alias-label-primary-foreground);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  animation: dshmem-tip-in 0.35s var(--ds-ease-in-out);
  transition: opacity var(--ds-transition-duration-fast) var(--ds-ease-in-out);
}

.dshmem-transform-btn:hover {
  opacity: 0.88;
}

.dshmem-progress {
  position: relative;
  height: 3px;
  border-radius: 2px;
  background: var(--dsw-alias-bg-skeleton);
  overflow: hidden;
  margin-top: 6px;
}

.dshmem-progress-fill {
  position: absolute;
  inset: 0 auto 0 0;
  border-radius: 2px;
  background: var(--dsw-alias-state-business-primary);
  transition: width 0.3s var(--ds-ease-in-out);
}

.dshmem-progress-fill::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.35), transparent);
  animation: dshmem-shimmer 1.4s linear infinite;
}

@keyframes dshmem-shimmer {
  from { transform: translateX(-100%); }
  to { transform: translateX(100%); }
}

.dshmem-warm-detail {
  color: var(--dsw-alias-label-caption);
  font-size: 11px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Model selector */

.dshmem-model-select {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 2px;
}

.dshmem-model-select-label {
  flex: none;
  color: var(--dsw-alias-label-tertiary);
  font-size: 11px;
}

.dshmem-model-select select {
  flex: 1;
  min-width: 0;
  height: 24px;
  padding: 0 6px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 6px;
  background: var(--dsw-specific-selector);
  color: var(--dsw-alias-label-primary);
  font-size: 11px;
  font-family: inherit;
  cursor: pointer;
  outline: none;
}

.dshmem-model-select select:focus {
  border-color: var(--dsw-alias-state-business-primary);
}

.dshmem-model-select select:disabled {
  opacity: 0.6;
  cursor: default;
}

/* Search */

.dshmem-search {
  padding: 10px 14px 6px;
}

.dshmem-search-input {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 30px;
  padding: 0 10px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 8px;
  background: var(--dsw-specific-input-major);
  color: var(--dsw-alias-label-primary);
}

.dshmem-search-input:focus-within {
  border-color: var(--dsw-alias-state-business-primary);
}

.dshmem-search-input svg {
  color: var(--dsw-alias-label-tertiary);
  flex: none;
}

.dshmem-search-input input {
  flex: 1;
  min-width: 0;
  border: none;
  outline: none;
  background: transparent;
  color: inherit;
  font-size: 12px;
  font-family: inherit;
}

.dshmem-search-input input::placeholder {
  color: var(--dsw-alias-label-caption);
}

.dshmem-search-spinner {
  animation: dshmem-spin 0.8s linear infinite;
  color: var(--dsw-alias-label-tertiary);
}

@keyframes dshmem-spin {
  to { transform: rotate(360deg); }
}

/* Results */

.dshmem-results {
  max-height: 208px;
  overflow-y: auto;
  padding: 4px 6px 6px;
}

.dshmem-item {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  padding: 8px;
  border-radius: 8px;
  animation: dshmem-item-in 0.24s var(--ds-ease-in-out) both;
}

.dshmem-item:hover {
  background: var(--dsw-alias-interactive-bg-hover);
}

@keyframes dshmem-item-in {
  from { opacity: 0; transform: translateY(3px); }
  to { opacity: 1; transform: translateY(0); }
}

.dshmem-item-main {
  flex: 1;
  min-width: 0;
}

.dshmem-item-content {
  font-size: 12px;
  line-height: 1.5;
  color: var(--dsw-alias-label-primary);
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
  word-break: break-word;
}

.dshmem-item-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 3px;
  font-size: 11px;
  color: var(--dsw-alias-label-caption);
}

.dshmem-item-score {
  flex: none;
  font-variant-numeric: tabular-nums;
  font-size: 11px;
  color: var(--dsw-alias-state-business-primary);
  font-weight: 500;
}

.dshmem-item-del {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--dsw-alias-label-tertiary);
  cursor: pointer;
  opacity: 0;
  transition: opacity var(--ds-transition-duration-fast) var(--ds-ease-in-out);
}

.dshmem-item:hover .dshmem-item-del { opacity: 1; }
.dshmem-item-del:hover { color: var(--dsw-alias-state-error-primary); background: var(--dsw-alias-interactive-bg-hover-danger); }

.dshmem-empty {
  padding: 18px 12px;
  text-align: center;
  color: var(--dsw-alias-label-caption);
  font-size: 12px;
}

/* Cache tip (fluent crossfade on model switch) */

.dshmem-cache-tip {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 6px;
  font-size: 11px;
  color: var(--dsw-alias-label-caption);
  animation: dshmem-tip-in 0.4s var(--ds-ease-in-out);
}

.dshmem-cache-tip-dot {
  flex: none;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--dsw-alias-state-warn-primary);
  transition: background var(--ds-transition-duration) var(--ds-ease-in-out);
}

.dshmem-cache-tip-dot[data-cached] {
  background: var(--dsw-alias-state-success-primary);
}

.dshmem-cache-tip-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@keyframes dshmem-tip-in {
  from { opacity: 0; transform: translateX(-4px); }
  to { opacity: 1; transform: translateX(0); }
}

/* Strategy tip */

.dshmem-strategy-tip {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  padding: 8px 14px;
  border-top: 1px solid var(--dsw-alias-border-l1);
  background: var(--dsw-specific-tip);
  font-size: 11px;
  line-height: 1.5;
  color: var(--dsw-alias-label-tertiary);
}

.dshmem-strategy-tip svg {
  flex: none;
  margin-top: 1px;
  color: var(--dsw-alias-state-business-primary);
}

/* Record box */

.dshmem-record {
  padding: 8px 14px 12px;
  border-top: 1px solid var(--dsw-alias-border-l1);
}

.dshmem-record-box {
  display: flex;
  align-items: flex-end;
  gap: 8px;
}

.dshmem-record-input {
  flex: 1;
  min-width: 0;
  min-height: 28px;
  max-height: 84px;
  padding: 5px 10px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 8px;
  background: var(--dsw-specific-input-major);
  color: var(--dsw-alias-label-primary);
  font-size: 12px;
  font-family: inherit;
  line-height: 1.5;
  resize: none;
  outline: none;
}

.dshmem-record-input:focus {
  border-color: var(--dsw-alias-state-business-primary);
}

.dshmem-record-input::placeholder {
  color: var(--dsw-alias-label-caption);
}

.dshmem-record-save {
  flex: none;
  height: 28px;
  padding: 0 12px;
  border: none;
  border-radius: 8px;
  background: var(--dsw-alias-state-business-primary);
  color: var(--dsw-alias-label-primary-foreground);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: opacity var(--ds-transition-duration-fast) var(--ds-ease-in-out);
}

.dshmem-record-save:hover { opacity: 0.88; }
.dshmem-record-save:disabled { opacity: 0.5; cursor: default; }

.dshmem-record-feedback {
  margin-top: 6px;
  font-size: 11px;
  color: var(--dsw-alias-state-success-primary);
}

/* ── Stats button + modal ─────────────────────────────────────────── */

.dshmem-stats-openbtn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 22px;
  padding: 0 8px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 6px;
  background: transparent;
  color: var(--dsw-alias-label-tertiary);
  font-size: 11px;
  cursor: pointer;
  transition: border-color var(--ds-transition-duration-fast) var(--ds-ease-in-out),
    color var(--ds-transition-duration-fast) var(--ds-ease-in-out),
    background var(--ds-transition-duration-fast) var(--ds-ease-in-out);
}

.dshmem-stats-openbtn:hover {
  border-color: var(--dsw-alias-state-business-primary);
  color: var(--dsw-alias-state-business-primary);
  background: var(--dsw-alias-interactive-bg-hover);
}

.dshmem-modal-mask {
  position: fixed;
  inset: 0;
  z-index: 200;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 32px;
  background: var(--dsw-alias-bg-mask-1);
  animation: dshmem-mask-in var(--ds-transition-duration) var(--ds-ease-in-out);
}

@keyframes dshmem-mask-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

.dshmem-modal {
  display: flex;
  flex-direction: column;
  width: min(720px, 100%);
  max-height: min(640px, 100%);
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 12px;
  background: var(--dsw-alias-bg-layer-2);
  box-shadow: 0 16px 48px var(--dsw-alias-bg-mask-3);
  overflow: hidden;
  animation: dshmem-pop-in var(--ds-transition-duration) var(--ds-ease-in-out);
  transform-origin: center;
}

.dshmem-modal-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 14px 16px 12px;
  border-bottom: 1px solid var(--dsw-alias-border-l1);
}

.dshmem-modal-title {
  flex: 1;
  font-size: 14px;
  font-weight: 600;
  color: var(--dsw-alias-label-primary);
}

.dshmem-stats-cards {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 10px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--dsw-alias-border-l1);
}

.dshmem-stats-card {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 10px 12px;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 10px;
  background: var(--dsw-alias-bg-layer-1);
  animation: dshmem-item-in 0.24s var(--ds-ease-in-out) both;
}

.dshmem-stats-card-value {
  font-size: 18px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: var(--dsw-alias-label-primary);
}

.dshmem-stats-card-label {
  font-size: 11px;
  color: var(--dsw-alias-label-caption);
}

.dshmem-stats-section {
  display: flex;
  flex-direction: column;
  min-height: 0;
  padding: 10px 16px 12px;
}

.dshmem-stats-section + .dshmem-stats-section {
  border-top: 1px solid var(--dsw-alias-border-l1);
}

.dshmem-stats-section-head {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
}

.dshmem-stats-section-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--dsw-alias-label-secondary);
}

.dshmem-stats-tabs {
  display: inline-flex;
  gap: 2px;
  padding: 2px;
  border-radius: 8px;
  background: var(--dsw-specific-selector);
}

.dshmem-stats-tab {
  border: none;
  background: transparent;
  padding: 3px 10px;
  border-radius: 6px;
  font-size: 11px;
  color: var(--dsw-alias-label-tertiary);
  cursor: pointer;
  transition: background var(--ds-transition-duration-fast) var(--ds-ease-in-out),
    color var(--ds-transition-duration-fast) var(--ds-ease-in-out);
}

.dshmem-stats-tab[data-active] {
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-primary);
}

.dshmem-stats-sortbtn {
  margin-left: auto;
  border: none;
  background: transparent;
  padding: 3px 8px;
  border-radius: 6px;
  font-size: 11px;
  color: var(--dsw-alias-label-tertiary);
  cursor: pointer;
}

.dshmem-stats-sortbtn:hover {
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-primary);
}

.dshmem-stats-table {
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-height: 224px;
  overflow-y: auto;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 10px;
  padding: 4px;
}

.dshmem-stats-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 64px 48px 150px 96px;
  gap: 8px;
  align-items: center;
  padding: 6px 8px;
  border-radius: 6px;
  font-size: 12px;
  color: var(--dsw-alias-label-secondary);
  animation: dshmem-item-in 0.2s var(--ds-ease-in-out) both;
}

.dshmem-stats-row:not(.dshmem-stats-row-head):hover {
  background: var(--dsw-alias-interactive-bg-hover);
}

.dshmem-stats-row-head {
  position: sticky;
  top: 0;
  background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-label-caption);
  font-size: 11px;
}

.dshmem-stats-col-content {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--dsw-alias-label-primary);
}

.dshmem-stats-col-scope,
.dshmem-stats-col-dims,
.dshmem-stats-col-date {
  text-align: right;
  font-variant-numeric: tabular-nums;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dshmem-stats-col-date {
  border: none;
  background: transparent;
  font: inherit;
  color: inherit;
  cursor: pointer;
  padding: 0;
}

.dshmem-stats-col-actions {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
}

.dshmem-stats-row[data-disabled] .dshmem-stats-col-content {
  color: var(--dsw-alias-label-caption);
  text-decoration: line-through;
  text-decoration-color: var(--dsw-alias-border-l3);
}

.dshmem-stats-toggle {
  position: relative;
  width: 28px;
  height: 16px;
  border: none;
  border-radius: 999px;
  background: var(--dsw-alias-bg-skeleton);
  cursor: pointer;
  transition: background var(--ds-transition-duration-fast) var(--ds-ease-in-out);
}

.dshmem-stats-toggle[data-on] {
  background: var(--dsw-alias-state-business-primary);
}

.dshmem-stats-toggle-knob {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: var(--dsw-alias-label-primary-foreground);
  transition: transform var(--ds-transition-duration-fast) var(--ds-ease-in-out);
}

.dshmem-stats-toggle[data-on] .dshmem-stats-toggle-knob {
  transform: translateX(12px);
}

.dshmem-stats-del {
  opacity: 1;
}

.dshmem-stats-add {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 16px;
  border-bottom: 1px solid var(--dsw-alias-border-l1);
  animation: dshmem-tip-in 0.3s var(--ds-ease-in-out);
}

.dshmem-stats-add-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.dshmem-stats-add-scope {
  height: 28px;
  padding: 0 8px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 8px;
  background: var(--dsw-specific-selector);
  color: var(--dsw-alias-label-primary);
  font-size: 12px;
  font-family: inherit;
  outline: none;
}

.dshmem-stats-pager {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 8px;
}

.dshmem-stats-pager button {
  height: 24px;
  padding: 0 10px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 6px;
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-secondary);
  font-size: 11px;
  cursor: pointer;
}

.dshmem-stats-pager button:hover:not(:disabled) {
  border-color: var(--dsw-alias-border-l3);
  color: var(--dsw-alias-label-primary);
}

.dshmem-stats-pager button:disabled {
  opacity: 0.45;
  cursor: default;
}

.dshmem-stats-pager-info {
  font-size: 11px;
  color: var(--dsw-alias-label-caption);
  font-variant-numeric: tabular-nums;
}

.dshmem-stats-empty {
  padding: 16px 8px;
  text-align: center;
  font-size: 12px;
  color: var(--dsw-alias-label-caption);
}

/* Cache ranking rows reuse the table grid with different columns. */
.dshmem-stats-row-cache {
  grid-template-columns: minmax(0, 1fr) 72px 110px;
}

.dshmem-stats-col-cachetext {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--ds-font-family-code);
  font-size: 11px;
  color: var(--dsw-alias-label-secondary);
}

.dshmem-stats-col-hits,
.dshmem-stats-col-last {
  text-align: right;
  font-variant-numeric: tabular-nums;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dshmem-stats-col-hits {
  color: var(--dsw-alias-state-business-primary);
  font-weight: 500;
}

/* ── Reduced motion ───────────────────────────────────────────────── */

@media (prefers-reduced-motion: reduce) {
  .dshmem-modal-mask,
  .dshmem-modal,
  .dshmem-stats-card,
  .dshmem-stats-row,
  .dshmem-cache-tip,
  .dshmem-toast,
  .dshmem-panel,
  .dshmem-item,
  .dshmem-dot[data-active='true']::after,
  .dshmem-dot[data-state='warming'],
  .dshmem-progress-fill::after,
  .dshmem-search-spinner {
    animation: none !important;
  }
}
`
