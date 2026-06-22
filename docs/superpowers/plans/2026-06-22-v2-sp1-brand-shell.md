# FlowProbe v2 SP1: Brand & App Shell — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the macOS-style traffic light buttons and all "FlowProbe" text with the Signal Pulse logo mark; add a custom frameless titlebar with inline navigation tabs; show "FlowProbe" only on the 500ms splash screen.

**Architecture:** Tauri 2.0 frameless window (`decorations: false`) with a Svelte custom titlebar that handles dragging, minimize/maximize/close, inline nav tabs, environment selector, and the Run button. A splash screen overlays on cold launch for 500ms then cross-fades out.

**Tech Stack:** Tauri 2.0, Svelte 5, TypeScript, CSS custom properties

## Global Constraints

- All Svelte 5 runes syntax — no `$:` reactive, no `onMount` in new components
- No hardcoded animation durations — use `var(--dur-*)` tokens from `tokens.css`
- All animations respect `prefers-reduced-motion`
- No `Co-Authored-By: Claude` in any commit
- No `git config user.name/email` at local scope
- All subagent work: `model: "sonnet"`

---

## File Map

```
packages/desktop/
├── src-tauri/
│   └── tauri.conf.json                    MODIFY — decorations:false, titleBarStyle:Overlay
├── src/
│   ├── app.html                           MODIFY — add data-theme="dark" to <html>
│   ├── lib/
│   │   ├── assets/
│   │   │   └── LogoMark.svelte            CREATE — Signal Pulse SVG mark, accepts size prop
│   │   ├── components/
│   │   │   ├── Titlebar.svelte            CREATE — custom frameless titlebar
│   │   │   └── SplashScreen.svelte        CREATE — 500ms splash overlay
│   │   ├── stores/
│   │   │   └── nav.ts                     CREATE — activeTab store ('collections'|'environments'|'history'|'settings')
│   │   └── design/
│   │       └── tokens.css                 MODIFY — add --titlebar-h, --splash-* tokens
│   └── routes/
│       ├── +layout.svelte                 MODIFY — add Titlebar + SplashScreen above slot
│       └── +page.svelte                   MODIFY — remove existing titlebar div and macOS buttons
```

---

### Task 1: Frameless window config + CSS tokens

**Files:**
- Modify: `packages/desktop/src-tauri/tauri.conf.json`
- Modify: `packages/desktop/src/app.html`
- Modify: `packages/desktop/src/lib/design/tokens.css`

**Interfaces:**
- Produces: frameless window (no OS title bar)
- Produces: `--titlebar-h: 40px` CSS token
- Produces: `data-theme="dark"` on `<html>` for future theme switching

- [ ] **Step 1: Set decorations:false in tauri.conf.json**

Read `packages/desktop/src-tauri/tauri.conf.json`, then find the `windows` array and update the first window entry:

```json
{
  "label": "main",
  "title": "FlowProbe",
  "width": 1280,
  "height": 800,
  "minWidth": 900,
  "minHeight": 600,
  "decorations": false,
  "transparent": false,
  "titleBarStyle": "Overlay"
}
```

- [ ] **Step 2: Add data-theme to app.html**

Read `packages/desktop/src/app.html`. Change:
```html
<html lang="en">
```
to:
```html
<html lang="en" data-theme="dark">
```

- [ ] **Step 3: Add titlebar tokens to tokens.css**

Read `packages/desktop/src/lib/design/tokens.css`, then append inside the `:root` block:

```css
  /* Titlebar */
  --titlebar-h: 40px;
  --titlebar-bg: #040408;

  /* Splash */
  --splash-bg: #07070f;
  --splash-dur: 500ms;
  --splash-fade: 200ms;
```

- [ ] **Step 4: Build check**
```bash
cd packages/desktop && npx vite build 2>&1 | tail -5
```
Expected: `✓ built in`

- [ ] **Step 5: Commit**
```bash
git add packages/desktop/src-tauri/tauri.conf.json packages/desktop/src/app.html packages/desktop/src/lib/design/tokens.css
git commit -m "feat(desktop): frameless window config + titlebar/splash tokens"
```

---

### Task 2: LogoMark component (Signal Pulse SVG)

**Files:**
- Create: `packages/desktop/src/lib/assets/LogoMark.svelte`

**Interfaces:**
- Produces: `<LogoMark size={number} />` — renders Signal Pulse SVG at given size (default 24)
- The SVG uses `linearGradient` with `id` scoped per-instance to avoid conflicts across multiple renders

- [ ] **Step 1: Create LogoMark.svelte**

Create `packages/desktop/src/lib/assets/LogoMark.svelte`:

```svelte
<script lang="ts">
  let { size = 24 }: { size?: number } = $props()
  const id = `logo-grad-${Math.random().toString(36).slice(2, 7)}`
</script>

<svg
  width={size}
  height={size}
  viewBox="0 0 64 64"
  xmlns="http://www.w3.org/2000/svg"
  aria-hidden="true"
  focusable="false"
>
  <defs>
    <linearGradient {id} x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%"   stop-color="#6366f1" />
      <stop offset="50%"  stop-color="#a855f7" />
      <stop offset="100%" stop-color="#06b6d4" />
    </linearGradient>
  </defs>
  <rect x="3" y="3" width="58" height="58" rx="16" fill="#111128" />
  <path
    d="M7 32 L14 32 L18 19 L22 45 L26 27 L30 37 L34 32 L57 32"
    fill="none"
    stroke="url(#{id})"
    stroke-width="3.5"
    stroke-linecap="round"
    stroke-linejoin="round"
  />
  <circle cx="57" cy="32" r="4" fill="#06b6d4" />
</svg>
```

- [ ] **Step 2: Build check**
```bash
cd packages/desktop && npx vite build 2>&1 | tail -5
```
Expected: `✓ built in`

- [ ] **Step 3: Commit**
```bash
git add packages/desktop/src/lib/assets/LogoMark.svelte
git commit -m "feat(desktop): LogoMark — Signal Pulse SVG component"
```

---

### Task 3: Nav store

**Files:**
- Create: `packages/desktop/src/lib/stores/nav.ts`
- Test: `packages/desktop/src/lib/stores/nav.test.ts`

**Interfaces:**
- Produces: `navStore` — writable store, value is `'collections' | 'environments' | 'history' | 'settings'`
- Produces: `type NavTab = 'collections' | 'environments' | 'history' | 'settings'`

- [ ] **Step 1: Write failing tests**

Create `packages/desktop/src/lib/stores/nav.test.ts`:
```typescript
import { describe, it, expect } from 'vitest'
import { get } from 'svelte/store'
import { navStore, type NavTab } from './nav.js'

describe('navStore', () => {
  it('defaults to collections', () => {
    expect(get(navStore)).toBe('collections')
  })
  it('switches tabs', () => {
    navStore.set('environments')
    expect(get(navStore)).toBe('environments')
    navStore.set('collections')
  })
})
```

- [ ] **Step 2: Run — confirm FAIL**
```bash
cd packages/desktop && npx vitest run src/lib/stores/nav.test.ts 2>&1 | tail -5
```
Expected: `Cannot find module './nav.js'`

- [ ] **Step 3: Implement nav.ts**

Create `packages/desktop/src/lib/stores/nav.ts`:
```typescript
import { writable } from 'svelte/store'

export type NavTab = 'collections' | 'environments' | 'history' | 'settings'

export const navStore = writable<NavTab>('collections')
```

- [ ] **Step 4: Run — confirm PASS**
```bash
cd packages/desktop && npx vitest run src/lib/stores/nav.test.ts 2>&1 | tail -5
```
Expected: `2 passed`

- [ ] **Step 5: Commit**
```bash
git add packages/desktop/src/lib/stores/nav.ts packages/desktop/src/lib/stores/nav.test.ts
git commit -m "feat(desktop): navStore — active titlebar tab"
```

---

### Task 4: Custom Titlebar component

**Files:**
- Create: `packages/desktop/src/lib/components/Titlebar.svelte`

**Interfaces:**
- Consumes: `navStore` from `../stores/nav.js`
- Consumes: `LogoMark` from `../assets/LogoMark.svelte`
- Consumes: `runStore` from `../stores/collection.js` — for run counter badge and run button state
- Consumes: Tauri `getCurrentWindow` from `@tauri-apps/api/window` — for minimize/maximize/close
- Produces: `<Titlebar />` — full-width custom titlebar, 40px height

- [ ] **Step 1: Create Titlebar.svelte**

Create `packages/desktop/src/lib/components/Titlebar.svelte`:

```svelte
<script lang="ts">
  import { getCurrentWindow } from '@tauri-apps/api/window'
  import LogoMark from '../assets/LogoMark.svelte'
  import { navStore, type NavTab } from '../stores/nav.js'
  import { runStore } from '../stores/collection.js'

  const appWindow = getCurrentWindow()

  const tabs: { id: NavTab; label: string; icon: string }[] = [
    { id: 'collections',  label: 'Collections',  icon: '⚡' },
    { id: 'environments', label: 'Environments', icon: '🌐' },
    { id: 'history',      label: 'History',      icon: '📜' },
    { id: 'settings',     label: 'Settings',     icon: '⚙' },
  ]

  let isMaximized = $state(false)

  async function toggleMaximize() {
    await appWindow.toggleMaximize()
    isMaximized = await appWindow.isMaximized()
  }
</script>

<div class="titlebar" data-tauri-drag-region>
  <!-- Logo mark — no text -->
  <div class="logo-wrap" data-tauri-drag-region="false">
    <LogoMark size={24} />
  </div>

  <!-- Navigation tabs -->
  <nav class="tb-nav" data-tauri-drag-region="false" aria-label="Main navigation">
    {#each tabs as tab}
      <button
        class="tb-tab"
        class:active={$navStore === tab.id}
        onclick={() => navStore.set(tab.id)}
        aria-current={$navStore === tab.id ? 'page' : undefined}
      >
        <span class="tb-tab-icon" aria-hidden="true">{tab.icon}</span>
        {tab.label}
      </button>
    {/each}
  </nav>

  <!-- Right group: env selector, run counter, run button -->
  <div class="tb-right" data-tauri-drag-region="false">
    <button class="env-chip" aria-label="Switch environment">
      <span class="env-alive" aria-hidden="true"></span>
      staging ▾
    </button>

    {#if $runStore.state !== 'idle'}
      <span class="run-badge" aria-label="Run count">
        #{$runStore.results.length > 0 ? 'N' : '0'}
      </span>
    {/if}

    <slot name="run-btn" />
  </div>

  <!-- Window controls (Windows-style) -->
  <div class="wc" data-tauri-drag-region="false">
    <button class="wc-btn" onclick={() => appWindow.minimize()} aria-label="Minimize">─</button>
    <button class="wc-btn" onclick={toggleMaximize} aria-label={isMaximized ? 'Restore' : 'Maximize'}>
      {isMaximized ? '❐' : '⬜'}
    </button>
    <button class="wc-btn close" onclick={() => appWindow.close()} aria-label="Close">✕</button>
  </div>
</div>

<style>
  .titlebar {
    height: var(--titlebar-h, 40px);
    background: var(--titlebar-bg, #040408);
    border-bottom: 1px solid var(--border, #161628);
    display: flex;
    align-items: center;
    padding: 0 12px;
    gap: 10px;
    flex-shrink: 0;
    user-select: none;
  }

  .logo-wrap { flex-shrink: 0; display: flex; align-items: center; }

  .tb-nav { display: flex; gap: 2px; flex: 1; }

  .tb-tab {
    padding: 5px 11px;
    border-radius: 7px;
    font-size: 10.5px;
    color: var(--text-muted, #334155);
    background: none;
    border: none;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 5px;
    transition: background var(--dur-fast, 150ms), color var(--dur-fast, 150ms);
  }
  .tb-tab:hover:not(.active) {
    background: rgba(255,255,255,.04);
    color: var(--text-secondary, #475569);
  }
  .tb-tab.active {
    background: rgba(99,102,241,.13);
    color: #a5b4fc;
  }
  .tb-tab-icon { font-size: 12px; }

  .tb-right { display: flex; align-items: center; gap: 8px; }

  .env-chip {
    padding: 4px 9px;
    border-radius: 7px;
    font-size: 10px;
    background: rgba(255,255,255,.05);
    color: var(--text-secondary, #475569);
    border: 1px solid var(--border2, #1e1e32);
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 5px;
    transition: background var(--dur-fast, 150ms);
  }
  .env-chip:hover { background: rgba(255,255,255,.08); }

  .env-alive {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--success, #22c55e);
  }

  .run-badge {
    font-size: 9px;
    color: var(--text-muted, #334155);
    font-family: var(--font-mono, monospace);
    background: rgba(255,255,255,.06);
    padding: 2px 5px;
    border-radius: 4px;
  }

  .wc { display: flex; }

  .wc-btn {
    width: 34px;
    height: 40px;
    border: none;
    background: none;
    cursor: pointer;
    color: var(--text-muted, #334155);
    font-size: 11px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background var(--dur-fast, 150ms), color var(--dur-fast, 150ms);
  }
  .wc-btn:hover {
    background: rgba(255,255,255,.05);
    color: var(--text-secondary, #475569);
  }
  .wc-btn.close:hover {
    background: rgba(239,68,68,.12);
    color: #ef4444;
  }

  @media (prefers-reduced-motion: reduce) {
    .tb-tab, .env-chip, .wc-btn { transition: none; }
  }
</style>
```

- [ ] **Step 2: Build check**
```bash
cd packages/desktop && npx vite build 2>&1 | tail -8
```
Expected: `✓ built in`

- [ ] **Step 3: Commit**
```bash
git add packages/desktop/src/lib/components/Titlebar.svelte
git commit -m "feat(desktop): Titlebar — frameless custom titlebar with Signal Pulse logo + nav tabs"
```

---

### Task 5: SplashScreen component

**Files:**
- Create: `packages/desktop/src/lib/components/SplashScreen.svelte`

**Interfaces:**
- Produces: `<SplashScreen />` — full-window overlay, auto-dismisses after 500ms with 200ms fade-out
- Produces: emits `dismiss` event when fade completes (parent can remove from DOM)

- [ ] **Step 1: Create SplashScreen.svelte**

Animation sequence (Option A — Waveform Draw + Cascade, approved 2026-06-22):
1. **100ms** — Logo box fades in with radial glow behind it
2. **200ms** — Signal Pulse waveform draws itself left-to-right via `stroke-dashoffset` animation (700ms)
3. **850ms** — Cyan endpoint dot fades in
4. **1000ms** — "FlowProbe" title slides down + fades in
5. **1200ms** — "Event-Driven System Testing" tagline fades in
6. **1400ms** — 5 flow nodes cascade in with 120ms stagger (exactly like Hitro's protocol badges): ↑ Publish → 📨 Kafka → ⚙️ Consume → 🗄 DB Check → ⚡ Assert; each node uses `cubic-bezier(0.175,0.885,0.32,1.275)` spring. Connecting edge lines appear 80ms after each node.
7. **1700ms** — Progress bar fades in and fills over 1400ms
8. **2350ms total** — Entire screen fades out (200ms `opacity: 0`), then `visible = false`

On `prefers-reduced-motion: reduce`: skip all animations, show static content for 300ms then dismiss.

Create `packages/desktop/src/lib/components/SplashScreen.svelte`:

```svelte
<script lang="ts">
  import { onMount, createEventDispatcher } from 'svelte'

  const dispatch = createEventDispatcher<{ dismiss: void }>()

  let visible = $state(true)
  let fading = $state(false)

  // Animation state — all start hidden
  let glowVisible = $state(false)
  let waveDraw = $state(false)
  let dotVisible = $state(false)
  let titleVisible = $state(false)
  let taglineVisible = $state(false)
  let progressVisible = $state(false)
  let progressFill = $state(false)
  // Each node: 0 = hidden, 1 = visible
  let nodes = $state([false, false, false, false, false])
  let edges = $state([false, false, false, false])

  const FLOW_NODES = [
    { icon: '↑',  label: 'PUBLISH',    bg: 'rgba(99,102,241,.15)',  border: 'rgba(99,102,241,.5)' },
    { icon: '📨', label: 'KAFKA',      bg: 'rgba(168,85,247,.12)', border: 'rgba(168,85,247,.4)' },
    { icon: '⚙️', label: 'CONSUME',   bg: 'rgba(6,182,212,.12)',  border: 'rgba(6,182,212,.4)'  },
    { icon: '🗄', label: 'DB CHECK',  bg: 'rgba(34,197,94,.10)',  border: 'rgba(34,197,94,.4)'  },
    { icon: '⚡', label: 'ASSERT',    bg: 'rgba(245,158,11,.10)', border: 'rgba(245,158,11,.4)' },
  ]

  const T = (fn: () => void, ms: number) => setTimeout(fn, ms)

  function prefersReducedMotion() {
    return typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
  }

  onMount(() => {
    const timers: ReturnType<typeof setTimeout>[] = []
    const add = (fn: () => void, ms: number) => { timers.push(T(fn, ms)); }

    if (prefersReducedMotion()) {
      // Static: show everything immediately, dismiss after 300ms
      glowVisible = waveDraw = dotVisible = titleVisible = taglineVisible =
        progressVisible = progressFill = true
      nodes = [true, true, true, true, true]
      edges = [true, true, true, true]
      add(() => { fading = true; T(() => { visible = false; dispatch('dismiss') }, 200) }, 300)
      return () => timers.forEach(clearTimeout)
    }

    // Animated sequence
    add(() => { glowVisible = true }, 100)
    add(() => { waveDraw = true }, 200)
    add(() => { dotVisible = true }, 850)
    add(() => { titleVisible = true }, 1000)
    add(() => { taglineVisible = true }, 1200)

    // Cascade nodes — 120ms apart (Hitro pattern)
    for (let i = 0; i < 5; i++) {
      add(() => { nodes = nodes.map((v, idx) => idx === i ? true : v) }, 1400 + i * 120)
      if (i < 4) {
        add(() => { edges = edges.map((v, idx) => idx === i ? true : v) }, 1400 + i * 120 + 80)
      }
    }

    add(() => { progressVisible = true; T(() => { progressFill = true }, 50) }, 1700)

    // Total ~2350ms → fade out
    add(() => {
      fading = true
      T(() => { visible = false; dispatch('dismiss') }, 200)
    }, 2350)

    return () => timers.forEach(clearTimeout)
  })

  // Gradient ID unique per instance
  const gid = `sg-${Math.random().toString(36).slice(2, 7)}`
</script>

{#if visible}
  <div class="splash" class:fading role="status" aria-label="FlowProbe loading">
    <div class="splash-content">

      <!-- Logo box with glow -->
      <div class="logo-wrap">
        <div class="logo-glow" class:glow-vis={glowVisible}></div>
        <div class="logo-box">
          <svg width="56" height="56" viewBox="0 0 64 64" aria-hidden="true">
            <defs>
              <linearGradient id={gid} x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%"   stop-color="#6366f1" />
                <stop offset="50%"  stop-color="#a855f7" />
                <stop offset="100%" stop-color="#06b6d4" />
              </linearGradient>
            </defs>
            <rect x="3" y="3" width="58" height="58" rx="16" fill="#111128" />
            <!-- Waveform: stroke-dashoffset animates from 300 → 0 -->
            <path
              class="wave"
              class:wave-draw={waveDraw}
              d="M7 32 L14 32 L18 19 L22 45 L26 27 L30 37 L34 32 L57 32"
              fill="none"
              stroke="url(#{gid})"
              stroke-width="3.5"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
            <circle
              class="wave-dot"
              class:wave-dot-vis={dotVisible}
              cx="57" cy="32" r="4" fill="#06b6d4"
            />
          </svg>
        </div>
      </div>

      <!-- Title -->
      <div class="wordmark" class:wordmark-vis={titleVisible}>FlowProbe</div>
      <div class="tagline" class:tagline-vis={taglineVisible}>Event-Driven System Testing</div>

      <!-- Flow node cascade (Hitro-style protocol badges) -->
      <div class="flow-row" aria-hidden="true">
        {#each FLOW_NODES as node, i}
          <div class="flow-node" class:node-vis={nodes[i]}
            style:background={node.bg}
            style:border-color={node.border}
          >
            <span class="node-icon">{node.icon}</span>
            <span class="node-label">{node.label}</span>
          </div>
          {#if i < 4}
            <div class="flow-edge" class:edge-vis={edges[i]}></div>
          {/if}
        {/each}
      </div>

      <!-- Progress bar -->
      <div class="progress" class:prog-vis={progressVisible}>
        <div class="progress-fill" class:fill-anim={progressFill}></div>
      </div>

    </div>
  </div>
{/if}

<style>
  .splash {
    position: fixed; inset: 0;
    background: var(--splash-bg, #07070f);
    display: flex; align-items: center; justify-content: center;
    z-index: 9999;
    opacity: 1;
    transition: opacity 200ms ease-out;
  }
  .splash.fading { opacity: 0; }

  .splash-content {
    display: flex; flex-direction: column; align-items: center; gap: 0;
  }

  /* ── Logo ── */
  .logo-wrap { position: relative; margin-bottom: 22px; }
  .logo-box {
    width: 80px; height: 80px; border-radius: 22px;
    display: flex; align-items: center; justify-content: center;
  }
  .logo-glow {
    position: absolute; inset: -10px; border-radius: 30px;
    background: radial-gradient(circle, rgba(99,102,241,.18) 0%, transparent 70%);
    opacity: 0; transform: scale(0.7);
    transition: opacity 400ms, transform 400ms cubic-bezier(0.175,0.885,0.32,1.275);
  }
  .logo-glow.glow-vis { opacity: 1; transform: scale(1); }

  /* Waveform stroke-dasharray draw */
  .wave {
    stroke-dasharray: 300;
    stroke-dashoffset: 300;
  }
  .wave.wave-draw {
    stroke-dashoffset: 0;
    transition: stroke-dashoffset 700ms cubic-bezier(0.25, 0.46, 0.45, 0.94);
  }
  .wave-dot { opacity: 0; transition: opacity 200ms; }
  .wave-dot.wave-dot-vis { opacity: 1; }

  /* ── Title ── */
  .wordmark {
    font-size: 32px; font-weight: 800; letter-spacing: -0.5px;
    background: linear-gradient(90deg, #f1f5f9 0%, #a5b4fc 50%, #06b6d4 100%);
    -webkit-background-clip: text; -webkit-text-fill-color: transparent;
    background-clip: text;
    opacity: 0; transform: translateY(-10px);
    transition: opacity 350ms, transform 350ms cubic-bezier(0.175,0.885,0.32,1.275);
    margin-bottom: 6px;
  }
  .wordmark.wordmark-vis { opacity: 1; transform: translateY(0); }

  .tagline {
    font-size: 11px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase;
    color: #334155; opacity: 0; transition: opacity 300ms;
    margin-bottom: 28px;
  }
  .tagline.tagline-vis { opacity: 1; }

  /* ── Flow node cascade ── */
  .flow-row {
    display: flex; align-items: center; gap: 0; margin-bottom: 26px;
  }

  .flow-node {
    display: flex; flex-direction: column; align-items: center; gap: 4px;
    padding: 7px 9px; border-radius: 10px; border: 1.5px solid transparent;
    opacity: 0; transform: scale(0.75) translateY(10px);
    transition: opacity 300ms, transform 300ms cubic-bezier(0.175,0.885,0.32,1.275);
  }
  .flow-node.node-vis { opacity: 1; transform: scale(1) translateY(0); }

  .node-icon { font-size: 16px; line-height: 1; }
  .node-label {
    font-size: 7.5px; font-weight: 700; font-family: monospace;
    color: rgba(255,255,255,.35); letter-spacing: .06em;
  }

  .flow-edge {
    width: 22px; height: 1.5px;
    background: rgba(99,102,241,.35);
    opacity: 0; transition: opacity 250ms; flex-shrink: 0;
  }
  .flow-edge.edge-vis { opacity: 1; }

  /* ── Progress bar ── */
  .progress {
    width: 200px; height: 2.5px;
    background: rgba(255,255,255,.08); border-radius: 2px; overflow: hidden;
    opacity: 0; transition: opacity 300ms;
  }
  .progress.prog-vis { opacity: 1; }

  .progress-fill {
    height: 100%; width: 0%; border-radius: 2px;
    background: linear-gradient(90deg, #6366f1, #a855f7, #06b6d4);
    box-shadow: 0 0 8px rgba(99,102,241,.4);
  }
  .progress-fill.fill-anim {
    width: 100%;
    transition: width 1400ms linear;
  }

  /* Reduced motion: skip all transitions */
  @media (prefers-reduced-motion: reduce) {
    .splash, .logo-glow, .wave, .wave-dot,
    .wordmark, .tagline, .flow-node, .flow-edge,
    .progress, .progress-fill { transition: none !important; }
  }
</style>
```

- [ ] **Step 2: Build check**
```bash
cd packages/desktop && npx vite build 2>&1 | tail -5
```

- [ ] **Step 3: Commit**
```bash
git add packages/desktop/src/lib/components/SplashScreen.svelte
git commit -m "feat(desktop): SplashScreen — 500ms launch overlay, FlowProbe text only here"
```

---

### Task 6: Wire Titlebar + SplashScreen into layout, remove old titlebar

**Files:**
- Modify: `packages/desktop/src/routes/+layout.svelte` (create if not exists)
- Modify: `packages/desktop/src/routes/+page.svelte` — remove `.tb` titlebar div and macOS buttons

**Interfaces:**
- Consumes: `Titlebar`, `SplashScreen` components

- [ ] **Step 1: Read current +page.svelte and +layout.svelte**

Read both files to find the existing `.tb` div with macOS `.td.r`, `.td.y`, `.td.g` elements and the existing Run button.

- [ ] **Step 2: Create or modify +layout.svelte**

Check if `packages/desktop/src/routes/+layout.svelte` exists. If not, create it:

```svelte
<script lang="ts">
  import Titlebar from '$lib/components/Titlebar.svelte'
  import SplashScreen from '$lib/components/SplashScreen.svelte'
  import { runStore } from '$lib/stores/collection.js'
  import '../lib/design/tokens.css'

  let splashDone = $state(false)
</script>

{#if !splashDone}
  <SplashScreen ondismiss={() => { splashDone = true }} />
{/if}

<div class="app-root">
  <Titlebar>
    {#snippet run-btn()}
      <!-- Run/Stop button injected from page -->
    {/snippet}
  </Titlebar>
  <div class="app-body">
    <slot />
  </div>
</div>

<style>
  :global(*, *::before, *::after) { box-sizing: border-box; margin: 0; padding: 0; }
  :global(body) {
    font-family: var(--font-sans, system-ui);
    background: var(--bg, #07070f);
    color: var(--text-primary, #e2e8f0);
    overflow: hidden;
    height: 100vh;
  }
  .app-root {
    display: flex;
    flex-direction: column;
    height: 100vh;
    overflow: hidden;
  }
  .app-body {
    flex: 1;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }
</style>
```

If `+layout.svelte` already exists, add `Titlebar` and `SplashScreen` at the top while preserving existing content.

- [ ] **Step 3: Remove old titlebar from +page.svelte**

Read `packages/desktop/src/routes/+page.svelte`. Find and remove:
- The `.tb` div (the old titlebar containing `.tl`, `.t-center`, `.t-actions` elements)
- The `.td.r`, `.td.y`, `.td.g` macOS-style buttons
- Move the Run/Stop button logic to a local variable that can be passed to the Titlebar slot

The `.app` div in +page.svelte becomes just the body content (sidebar + canvas + result panel + status bar), no longer the full app shell.

- [ ] **Step 4: Build check**
```bash
cd packages/desktop && npx vite build 2>&1 | tail -10
```
Expected: `✓ built in`

- [ ] **Step 5: svelte-check — 0 errors**
```bash
cd packages/desktop && npx svelte-check --tsconfig ./tsconfig.json 2>&1 | tail -10
```

- [ ] **Step 6: Commit**
```bash
git add packages/desktop/src/routes/
git commit -m "feat(desktop): wire Titlebar + SplashScreen, remove macOS buttons from +page.svelte"
```
