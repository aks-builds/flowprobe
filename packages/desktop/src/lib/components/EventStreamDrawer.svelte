<script context="module" lang="ts">
  export type LogEntry = { timestampMs: number; level: string; message: string }
</script>

<script lang="ts">
  import { createEventDispatcher, afterUpdate } from 'svelte'
  import { fadeScale } from '../design/animations.js'

  export let entries: LogEntry[] = []
  export let open = true
  export let liveCount = 0

  const dispatch = createEventDispatcher<{ toggle: void }>()
  let logEl: HTMLDivElement

  afterUpdate(() => {
    if (open && logEl) logEl.scrollTop = logEl.scrollHeight
  })

  function formatTime(ms: number): string {
    if (!Number.isFinite(ms)) return '??:??:??.???'
    return new Date(ms).toISOString().slice(11, 23)
  }

  const levelColor: Record<string, string> = {
    info: '#a78bfa',
    recv: '#34d399',
    send: '#a78bfa',
    pass: '#4ade80',
    fail: '#f87171',
    warn: '#fbbf24',
  }
</script>

<div class="drawer" class:open>
  <div class="drawer-header" role="button" tabindex="0" on:click={() => dispatch('toggle')} on:keydown={e => e.key === 'Enter' && dispatch('toggle')}>
    <span class="drawer-title">Event Stream</span>
    {#if liveCount > 0}
      <span class="live-badge">● LIVE</span>
    {/if}
    <span class="toggle-arrow">{open ? '▾' : '▸'}</span>
  </div>
  {#if open}
    <div class="log" bind:this={logEl} in:fadeScale>
      {#each entries as entry (entry.timestampMs + entry.message)}
        <div class="entry">
          <span class="ts">{formatTime(entry.timestampMs)}</span>
          <span class="msg" style="color:{levelColor[entry.level] ?? '#94a3b8'}">{entry.message}</span>
        </div>
      {/each}
      {#if entries.length === 0}
        <div class="empty">No events yet. Start a run to see the live stream.</div>
      {/if}
      {#if liveCount > 0}
        <div class="cursor-line"><span class="cursor">█</span></div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .drawer { background: #0f172a; flex-shrink: 0; border-top: 1px solid rgba(255,255,255,.06); }
  .drawer-header { display: flex; align-items: center; gap: 7px; padding: 5px 14px; cursor: pointer; border-bottom: 1px solid rgba(255,255,255,.04); }
  .drawer-title { font-size: 9px; font-weight: 700; color: #334155; text-transform: uppercase; letter-spacing: .08em; font-family: var(--font-mono); flex: 1; }
  .live-badge { font-size: 8px; background: rgba(59,130,246,.2); color: #60a5fa; padding: 1px 6px; border-radius: 8px; animation: live-blink var(--dur-crawl) ease-in-out infinite; }
  @keyframes live-blink { 0%,100%{opacity:1} 50%{opacity:.4} }
  .toggle-arrow { font-size: 9px; color: #334155; }
  .log { height: 88px; overflow-y: auto; padding: 5px 14px 7px; scrollbar-width: thin; scrollbar-color: #1e293b #0f172a; }
  .entry { display: flex; gap: 10px; font-size: 9px; font-family: var(--font-mono); margin-bottom: 3px; }
  .ts { color: #334155; width: 80px; flex-shrink: 0; }
  .msg { flex: 1; }
  .empty { font-size: 9px; color: #334155; font-family: var(--font-mono); padding: 4px 0; }
  .cursor-line { font-size: 9px; color: #475569; font-family: var(--font-mono); }
  .cursor { animation: cblink var(--dur-slow) step-end infinite; }
  @keyframes cblink { 0%,100%{opacity:1} 50%{opacity:0} }
  @media (prefers-reduced-motion: reduce) {
    .live-badge { animation: none; }
    .cursor { animation: none; }
  }
</style>
