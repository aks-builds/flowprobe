# FlowProbe v2 — Design Specification

**Date:** 2026-06-22
**Status:** Approved for implementation planning
**Approved via:** Brainstorming session with visual companion (screens 01–05)

---

## Objective

Evolve FlowProbe from a working prototype into a production-grade desktop tool that engineers reach for every time they need to test an event-driven system. The app must feel as considered as Postman, as powerful as Playwright's trace viewer, and as unique as nothing else in the market — because no other tool lets you define "publish message X, expect it on topic B within 200ms, assert the DB side-effect, assert the HTTP response" as a single runnable flow.

The two constraints that override everything else:
1. **No regression on what works today.** The existing run engine, CLI, and adapters stay intact.
2. **Performance first.** Every animation is GPU-composited. The topology map renders even on low-end machines. No JS animation libraries.

---

## Sub-projects (in build order)

| # | Name | Scope |
|---|---|---|
| 1 | Brand & App Shell | Logo, splash, titlebar, remove macOS buttons, "FlowProbe" text only on splash |
| 2 | UI Architecture | Activity nav, tabbed workspace, sidebar, dark/light theme, properties dock |
| 3 | Middle Canvas — Event Topology | Live animated topology map, bidirectional selection, insight bar, event stream |
| 4 | Right Panel — Analysis Dock | Results / Assertions / Diff / Payload / History tabs, inline diff view |
| 5 | Feature Depth | Environments, history persistence, pre/post hooks, DB-assert adapter, sequence view toggle |
| 6 | Motion System | CSS spring tokens, performance budget, reduced-motion compliance |
| 7 | Cross-Platform Distribution | GitHub Actions CI, Windows NSIS, macOS DMG + notarization, Linux AppImage, auto-updater |

Each sub-project gets its own implementation plan. They are designed to be independently mergeable in order.

---

## Sub-project 1: Brand & App Shell

### Logo mark: Signal Pulse

An ECG-style waveform on a dark rounded square. Purple (#6366f1) → violet (#a855f7) → cyan (#06b6d4) horizontal gradient. The waveform has a glowing cyan endpoint dot.

```
Sizes and use:
  64×64   Splash screen (with "FlowProbe" wordmark below)
  32×32   Taskbar / dock icon
  24×24   Titlebar (left-most element)
  22×22   Windows .ico / macOS .icns base
  16×16   Favicon
  10×10   Favicon fallback (waveform only, no container)
```

SVG path (canonical):
```svg
<rect x="3" y="3" width="58" height="58" rx="16" fill="#111128"/>
<path d="M7 32 L14 32 L18 19 L22 45 L26 27 L30 37 L34 32 L57 32"
      fill="none" stroke="url(#grad-purple-cyan)"
      stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>
<circle cx="57" cy="32" r="4" fill="#06b6d4"/>
```

Gradient: `linearGradient` id `logo-grad`, x1=0% x2=100%, stops: `#6366f1` → `#a855f7` → `#06b6d4`.

### "FlowProbe" text rules

- **Appears ONLY on the splash screen** (shown for exactly 500ms on cold launch).
- After splash: the logo mark replaces all text branding everywhere in the app.
- The titlebar, sidebar, status bar, tooltips, and all UI surfaces show the mark, not the name.
- Exception: window title bar text (OS-managed, for alt-tab / taskbar) stays "FlowProbe" — this is the OS-level label, not the in-app brand.

### Splash screen

- Full-window overlay on app launch, shown for 500ms then cross-fades out (200ms).
- Black background (#07070f), logo mark at 64px centered, "FlowProbe" wordmark below in 24px weight-800.
- Tagline: "Event-driven system testing" in 13px #475569.
- If app state (collections) is already loaded from disk, splash can dismiss at 300ms minimum.

### Titlebar (replacing macOS traffic lights)

```
┌──────────────────────────────────────────────────────────────────────┐
│ [logo 24px] [⚡ Collections] [🌐 Environments] [📜 History] [⚙ Settings]  ···  [staging ▾] [#4] [▶ Run Collection] [─][⬜][✕] │
└──────────────────────────────────────────────────────────────────────┘
```

- Height: 40px. Background: `#040408`. Frameless (no OS decorations).
- **Logo mark** (24×24) flush left — no text beside it.
- **Navigation tabs** (inline, not sidebar): Collections · Environments · History · Settings. Active tab: `rgba(99,102,241,.13)` background, `#a5b4fc` text. Inactive: `#334155`.
- **Right group**: environment selector chip → run counter badge → Run Collection pill → window controls (─ ⬜ ✕) on the far right. No colored circles anywhere.
- Window controls: Windows-style (minimize/maximize/close), right-aligned. Close on hover: `rgba(239,68,68,.12)` bg. No macOS-style pill buttons.
- The titlebar is the drag region. Nav tabs and right group are `-webkit-app-region: no-drag`.

---

## Sub-project 2: UI Architecture

### Layout

```
┌─ Titlebar (40px) ──────────────────────────────────────────────────────┐
├─ Body ─────────────────────────────────────────────────────────────────┤
│ Sidebar │ Tab bar (33px)                                                │
│ (220px) ├────────────────────────────────────────────────────────────  │
│         │ Workspace                                                     │
│         │  ┌─ Middle Canvas (flex:1) ─┐ ┌─ Right Panel (300px) ─┐     │
│         │  │  Event Topology          │ │  Tabs + content         │     │
│         │  └──────────────────────────┘ └──────────────────────── ┘    │
├─ Status bar (22px) ───────────────────────────────────────────────────┤
```

### Sidebar (220px, `#05050d`)

Two stacked sections controlled by the active titlebar navigation tab:

**Collections tab active:**
- Search box (top, 27px, fuzzy search across all collections + flows)
- Collection tree: collection items with color dots → flow sub-items with pass/fail status badges
- New collection button (+ in section header)
- Drag to reorder flows within a collection

**Environments tab active:**
- List of environments with active badge
- Each environment shows a collapsed preview (2–3 variables, secrets as `••••••••`)
- Click to expand/edit inline
- New environment button

**History tab active:**
- Chronological run list: run number, flow name, duration, pass/fail, timestamp
- "Compare with current run" button per row (opens Diff tab pre-loaded)

**Settings tab active:**
- App settings: theme toggle, keyboard shortcuts, update channel, telemetry opt-out

### Tabbed workspace

- Tab bar (33px, `#040408`) sits above the workspace.
- Each open flow is a tab: colored dot (accent color) + flow name + close ✕.
- Dirty state: dot changes to orange when flow has unsaved edits.
- Max visible tabs before overflow scroll: determined by available width.
- `Ctrl+T` new tab, `Ctrl+W` close tab, `Ctrl+Tab` cycle.

### Dark/light theme

- **Default: dark** (the Option C shell shown in mockups).
- Light mode: Option B palette from screen 01 (white `#ffffff` surface, `#f4f6fb` background, `#4f46e5` accents).
- Toggle in Settings tab sidebar. Persisted to `~/.config/flowprobe/settings.json`.
- No flicker on load — initial theme applied before first paint via `preload.js` that reads settings synchronously.
- CSS custom properties (`--bg`, `--surface`, `--border`, `--accent`, `--text-*`) swapped at `<html>` level via `data-theme="dark|light"`.

---

## Sub-project 3: Middle Canvas — Event Topology Map

### Concept

When a flow runs, the middle canvas renders a **live animated node-graph** of the system under test: every producer, broker/topic, consumer service, database, and HTTP endpoint as a node — with animated message pulses travelling along edges in real time.

This is the unique visualization. No other testing tool shows you the topology of your async test executing live.

### Node types and visual treatment

| Node type | Shape | Border color | Icon |
|---|---|---|---|
| FlowProbe (test runner) | 60px circle | `#6366f1` with glow | Signal Pulse mark |
| Kafka topic | 52px circle | `#8b5cf6` | 📨 |
| RabbitMQ exchange | 52px circle | `#a855f7` | 📨 |
| SNS/SQS | 52px circle | `#f59e0b` | ☁️ |
| Consumer service | 56px circle | `#06b6d4` | ⚙️ |
| Database | 48px circle | `#22c55e` | 🗄 |
| HTTP endpoint | 50px circle | `#f59e0b` | 🌐 |
| Webhook | 50px circle | `#f59e0b` | 🪝 |

**Pass state:** Node border stays its accent color. Status badge `#22c55e`.
**Fail state:** Node border turns `#ef4444`, red glow `0 0 20px rgba(239,68,68,.3)`, badge `#ef4444 ✕`.
**Running:** Pulse ring animation `pr 1.8s ease-out infinite`, border brightens.
**Pending:** Greyed out (`#1e293b` border), no badge.

### Edges

- SVG overlay covering the full canvas.
- Edges are `<line>` elements with `rgba(color, .4)` stroke and `<marker>` arrowheads.
- During run: **message dots** (8px circles, matching the sender's accent color, with matching `box-shadow` glow) animate along the edge path using CSS `offset-path` or left/top transitions.
- After run: edges stay static. Failed edges turn `rgba(239,68,68,.5)` dashed.
- Timing label on each edge: "48ms lag", "PUBLISH", "consumed".

### Selection model (bidirectional)

- Clicking a node: sets `selectedNodeId` in a shared Svelte store.
- Effect in canvas: selected node gets `scale(1.06)` + 6px outer glow ring.
- Effect in right panel: Assertions tab automatically switches focus to that node's assertions. Other nodes' assertions are dimmed (opacity .55).
- Clicking an assertion in the right panel: sets `selectedNodeId` to that assertion's node — the corresponding node pulses once in the topology.
- Clicking canvas background: clears selection.

### Node tooltip (inline, inside canvas)

Appears immediately on click or keyboard focus of a node (not hover — hover is unreliable for keyboard/touch users). Position: below-right of the node, collision-detected to stay within canvas bounds. Dismissed by clicking canvas background or pressing Escape.

Shows: node type label, key metrics (consume lag, message count, assertion count, DB rows), one-line hint ("→ View full assertions in panel").

### Dot grid background

`radial-gradient(circle, rgba(255,255,255,.05) 1px, transparent 1px)` at `26px 26px` background-size. Two radial color washes (indigo at 30%/40%, cyan at 70%/60%) at very low opacity to give depth without clutter.

### Flow name strip

32px strip at top of canvas: flow name + pass/fail badge + run duration (right-aligned) + hint text ("Click any node to inspect · drag to reposition"). Subtle `backdrop-filter: blur(8px)`.

### Event Stream Drawer (bottom of canvas, collapsible)

- 3-line monospace log, always visible when open. Toggle arrow ▸/▾.
- Height: 60px open. Collapsed: 26px header only.
- Background: `#04040b`. Font: monospace 9px.
- Log lines: timestamp (dimmed) + message colored by type:
  - `↑ PUBLISH` → `#a78bfa`
  - `↓ consumed` → `#34d399`
  - `⚡ HTTP` → `#60a5fa`
  - `✓ pass` → `#22c55e`
  - `✕ fail` → `#f87171`
- Auto-scrolls to bottom on new events.
- LIVE dot (6px cyan, blink animation) visible during run.

### Auto-insight bar (bottom of canvas, above event stream)

One-line strip. Background: `rgba(245,158,11,.08)`. Visible for 8 seconds after run completes, then fades out (or stays if there's a degradation).

Content: auto-generated from run delta. Examples:
- *"Consumer lag improved: 48ms vs Run #3's 312ms"*
- *"⚠ 3 assertions degraded vs last run — Click 'Compare runs →' to diff"*
- *"First passing run after 2 failures"*

One-click "Compare runs →" button opens the Diff tab in run-comparison mode.

### Edit mode (when no run has happened)

When `runStore.state === 'idle'`, the canvas shows the flow in **edit mode**: step cards in a horizontal pipeline (the existing FlowCanvas edit mode from v1). Step type pickers, inline editors, add step button.

The topology map only appears after the first run. Toggle between edit and topology views via a pill switch in the flow name strip.

---

## Sub-project 4: Right Panel — Analysis Dock (300px)

Five tabs. Shared `selectedNodeId` from the topology binds Assertions, Diff, and Payload to the selected node.

### Tab 1: Results

- **Run summary card**: PASSED/FAILED badge + total duration. Green/red background tint.
- **Spark-line section** ("Timing history — last N runs"): per step, bars showing last 6 runs, latest bar in cyan. Step name (monospace, truncated), current duration (right-aligned).
- **Run counter**: large `#N` in monospace, green if passed, red if any failure. Label "RUN COUNT".
- **Step cards** (compact): each step's pass/fail icon, name, type, duration.

### Tab 2: Assertions

- **Selection context banner** (if node selected): "⚙️ Order Service — showing its assertions" + "Show all ›" link.
- **Assertion rows**, each showing:
  - Status icon (✓ green / ✕ red circle)
  - Assertion label (monospace, e.g. `consume lag < 200ms`)
  - Node chip (which step/node this belongs to)
  - Expand chevron ▾
- **Expanded assertion row**: Expected vs Actual diff (two columns, green/red backgrounds, matching row shows indigo).
- Failing assertions auto-expanded by default.
- Scroll position preserved when switching tabs.

### Tab 3: Diff (Expected vs Actual)

Two sub-modes toggled by a pill switch:

**"Expected vs Actual" mode** (default):
- Two columns: EXPECTED (from flow definition) | ACTUAL (from last run).
- Each event as a card: event type icon, name, timing, payload excerpt.
- Cards are color-coded: `match` (indigo left border), `better` (green, faster than expected), `worse` (red, slower/missing), `added` (extra unexpected event), `missing` (expected event never fired).
- Inline payload diff for changed/failed events: `di-exp` (green) / `di-act` (red) micro-diff.

**"Compare runs" mode** (activated by insight bar click or History tab "Compare"):
- Same two-column layout but left = Run N, right = Run M (selected from history).
- Delta pill on each card: `↑ 12ms faster`, `↓ 4× slower`, `same`.
- Pre-selects the most recent failing run on the left by default.

### Tab 4: Payload

- Node chip selector (which node's payload to inspect — defaults to selected node).
- Raw JSON view with syntax highlighting: keys `#93c5fd`, strings `#86efac`, numbers `#fcd34d`, booleans `#f9a8d4`.
- Copy to clipboard button.
- For Kafka steps: shows message headers (foldable) + message body.
- For HTTP steps: shows request body (top) + response body (bottom), split by a labeled divider.
- For DB steps: shows the SQL query + result rows as a table.

### Tab 5: History

- Chronological run list (most recent first). Persisted to `~/.config/flowprobe/history.json` (last 100 runs per flow).
- Each row: run number (#N), pass/fail dot, flow name, duration, environment, timestamp.
- "Compare with current run" link per row → switches Diff tab to "Compare runs" mode with that run pre-loaded.
- "Export" button (top-right): downloads history as JSON or CSV.

---

## Sub-project 5: Feature Depth

### Environment Management

**Storage:** Platform config dir via Tauri `path.appConfigDir()` — `environments.json` inside it. Structure:
```json
{
  "environments": [
    {
      "name": "staging",
      "vars": [
        { "key": "API_BASE_URL", "value": "https://api.staging.example.com", "secret": false },
        { "key": "API_KEY", "value": "sk-...", "secret": true }
      ]
    }
  ],
  "active": "staging"
}
```

**Secret masking:** Variables with `"secret": true` are shown as `••••••••` in all UI surfaces (sidebar preview, payload tab, event stream). The raw value is only revealed by clicking a reveal button, and is never written to log files.

**Variable resolution:** `{{API_BASE_URL}}` in flow JSON resolves to the active environment's value at run time. Resolution order: run-level override → collection-level override → active environment → global defaults.

**UI:** Environments sidebar panel (when Environments tab is active). Inline edit fields per variable. Toggle secret/plain with lock icon. Active environment shown in titlebar chip; clicking the chip opens a quick-switch dropdown.

### Run History Persistence

- On each run completion, append a run record to the platform config dir: `~/.config/flowprobe/history.json` (Linux/macOS) or `%APPDATA%\flowprobe\history.json` (Windows). Use Tauri's `path.appConfigDir()` API — never hardcode the path.
- Record includes: `runId`, `flowId`, `collectionName`, `environment`, `startedAt`, `durationMs`, `passed`, `failed`, `stepResults[]`, `assertionResults[]`.
- History tab reads from disk on mount; paginated (50 per page).
- Export button: `history.json` download or CSV with columns: run#, flow, env, duration, passed, failed, timestamp.

### Pre/Post Hook Scripting (per step)

Each step in the collection schema gains optional `beforeScript` and `afterScript` string fields.

```json
{
  "id": "publish-order",
  "type": "producer",
  "broker": "kafka-local",
  "topic": "orders",
  "payload": { "id": "{{$uuid}}", "ts": "{{$isoDate}}" },
  "beforeScript": "context.set('orderId', crypto.randomUUID())",
  "afterScript": "assert(context.get('orderId').length === 36)"
}
```

**Runtime:** Scripts run in a `vm.runInNewContext()` sandbox (Node.js). The `context` object exposes:
- `context.get(key)` / `context.set(key, value)` — cross-step data
- `context.env(key)` — environment variable
- `context.steps` — previous step results
- `assert(condition, message)` — throw a named assertion failure

**UI:** StepCard expands to show a code editor (CodeMirror Lite or a styled `<textarea>` with monospace) for `beforeScript` and `afterScript`. Collapsible by default.

### DB-Assert Adapter

Create `packages/adapters/db/` with a PostgreSQL-first implementation using `pg` (Node.js).

```typescript
// packages/adapters/db/src/index.ts
export interface DbAssertConfig {
  connection: string;  // postgres://user:pass@host:5432/dbname
  query: string;       // SELECT * FROM orders WHERE id = $1
  params: unknown[];
  assertions: DbAssertion[];
}
export interface DbAssertion {
  type: 'rowCount' | 'cellValue' | 'jsonPath';
  expected: unknown;
  row?: number;       // 0-indexed, for cellValue
  column?: string;    // for cellValue
  path?: string;      // JSONPath, for jsonPath
}
```

The adapter connects, runs the query, and evaluates each assertion. Errors: connection failure, query syntax error, assertion mismatch — all surface as `StepRunResult.error` strings.

### Sequence Diagram Toggle

The topology map has a **view toggle** in the flow name strip: `[Topology] [Sequence] [Edit]`.

- **Topology**: the live node-graph (Sub-project 3).
- **Sequence**: an animated UML sequence diagram (Option B from screen 04). Auto-generated from the same run data. Vertical actor lanes (FlowProbe, each topic, each service, DB, HTTP). Horizontal arrows appearing in temporal order with timing labels.
- **Edit**: the existing step-card pipeline editor.

State is preserved per flow tab when switching views.

---

## Sub-project 6: Motion System

### Principle

Every animation uses only GPU-composited properties: `transform` (translate, scale) and `opacity`. No `height`, `width`, `top`, `left`, or `color` transitions (these trigger layout/paint). The result is smooth 60fps even on integrated GPUs.

### CSS tokens

```css
:root {
  --dur-instant: 80ms;
  --dur-fast:    150ms;
  --dur-normal:  250ms;
  --dur-slow:    400ms;
  --dur-crawl:   600ms;

  --ease-spring:  cubic-bezier(0.175, 0.885, 0.32, 1.275);  /* overshoot */
  --ease-out:     cubic-bezier(0.0, 0.0, 0.2, 1.0);
  --ease-in-out:  cubic-bezier(0.4, 0.0, 0.2, 1.0);
  --ease-snappy:  cubic-bezier(0.25, 0.46, 0.45, 0.94);
}
@media (prefers-reduced-motion: reduce) {
  :root {
    --dur-instant: 0ms; --dur-fast: 0ms;
    --dur-normal: 0ms; --dur-slow: 0ms; --dur-crawl: 0ms;
  }
}
```

### Animation inventory

| Element | Property | Duration | Easing |
|---|---|---|---|
| Panel/drawer open | `transform: translateX` | `--dur-normal` | `--ease-spring` |
| Tab switch | `opacity` + `transform: translateY(4px→0)` | `--dur-fast` | `--ease-out` |
| Node entrance (topology) | `opacity` + `transform: scale(0.8→1)` | `--dur-normal` | `--ease-spring` |
| Node pass/fail badge | `transform: scale(0→1)` | `--dur-fast` | `--ease-spring` |
| Message dot travel | `transform: translate` | `1.6s` | `linear` |
| Pulse ring | `transform: scale` + `opacity` | `1.8s` | `ease-out infinite` |
| Assertion row expand | `opacity` + `transform: translateY(-4px→0)` | `--dur-fast` | `--ease-out` |
| Sidebar fade between panels | `opacity` | `--dur-fast` | `--ease-in-out` |
| Node select glow | `box-shadow` — avoid; use `outline` or `ring` via border | `--dur-fast` | — |
| Confetti on all-pass | CSS `@keyframes` confetti bar gradient sweep | `2s infinite` | `linear` |
| Splash fade out | `opacity` | `200ms` | `--ease-in-out` |
| LIVE dot blink | `opacity` | `1.4s infinite` | `ease-in-out` |

### Performance budget

- No single animation may exceed 300ms of total duration in the happy path (non-entrance animations).
- Topology node re-layout on window resize: debounced 150ms, no transition during resize.
- Message dots: maximum 6 simultaneously animated dots. If more edges are active, queue them.
- Topology with > 12 nodes: disable pulse-ring animations (only pass/fail badge remains).

---

## Sub-project 7: Cross-Platform Distribution

### GitHub Actions workflow

File: `.github/workflows/release.yml`

Trigger: push to `release` branch OR manual `workflow_dispatch`.

Matrix:
```yaml
matrix:
  include:
    - platform: windows-latest    # produces .msi + NSIS .exe
    - platform: macos-latest      # produces .dmg (arm64 + x86_64 universal)
    - platform: ubuntu-22.04      # produces .deb + .AppImage
```

### Windows

- **Output**: NSIS installer `.exe` (~5MB). Configure as portable: no admin rights required, no registry writes. Single file the user double-clicks and runs from any folder.
- `tauri.conf.json → bundle.windows.webviewInstallMode`: `"embedBootstrapper"` — embeds WebView2 bootstrapper (+1.8MB) so it works offline without pre-installed WebView2.
- Code signing: optional for v1, configure via Azure Key Vault in v2. Without signing, Windows SmartScreen shows a warning on first run — document this in README.

### macOS

- **Output**: Universal `.dmg` targeting both `aarch64-apple-darwin` and `x86_64-apple-darwin`.
- Notarization: required for Gatekeeper. Needs `APPLE_ID`, `APPLE_PASSWORD` (app-specific), `APPLE_TEAM_ID` in GitHub secrets. Adds ~3 minutes to build.
- Without notarization: users see "app is damaged" on Apple Silicon. At minimum, ad-hoc sign: `codesign --force --deep --sign - FlowProbe.app`.

### Linux

- **Output**: `.deb` (Ubuntu/Debian, ~4MB) + `.AppImage` (universal, ~79MB). Primary recommendation for most users: `.deb` if on Ubuntu/Debian, `.AppImage` otherwise.
- AppImage is large because it bundles WebKitGTK 4.1. Acceptable tradeoff for maximum compatibility.
- `apt-get` deps on Ubuntu runner: `libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf`.

### tauri.conf.json additions

```json
{
  "bundle": {
    "active": true,
    "targets": "all",
    "identifier": "com.flowprobe.app",
    "icon": ["icons/32x32.png","icons/128x128.png","icons/128x128@2x.png","icons/icon.icns","icons/icon.ico"],
    "windows": {
      "webviewInstallMode": { "type": "embedBootstrapper" },
      "nsis": { "displayLanguageSelector": false, "installMode": "perMachine" }
    }
  },
  "app": {
    "windows": [{
      "decorations": false,
      "transparent": false,
      "titleBarStyle": "Overlay"
    }]
  }
}
```

### Auto-updater

Use `tauri-plugin-updater`. On app start (after splash), check `https://releases.flowprobe.dev/latest.json` (or GitHub releases API). If update available: show a subtle banner in the status bar ("v1.2.0 available — restart to update"). Never interrupt the user mid-session.

Update check: async, never blocking. Failure (offline, server error): silently swallowed.

### Version management

Single source of truth: `packages/desktop/src-tauri/tauri.conf.json → version`. GitHub Action uses `tauri-action` tag `app-v__VERSION__`. A pre-release script syncs `package.json` versions to match `tauri.conf.json` to prevent drift.

---

## Global Constraints (all sub-projects)

- All Svelte components: Svelte 5 syntax (`$state`, `$derived`, `$effect`, runes). No Svelte 4 `onMount`/`$:` reactive statements in new code.
- All Tauri commands: `Result<T, String>` return type. No `unwrap()` in production paths.
- All `invoke()` calls: wrapped in `try/catch`. Errors surface via `ErrorBanner` component.
- All `Channel<T>` streaming: `channel.onmessage` handler guarded by `if (isStopped) return`.
- All RunEvent field names: use fallback pattern `event.duration_ms ?? event.durationMs` until serde field-rename behavior is confirmed and locked.
- All animations: CSS tokens only. No `setTimeout`-based animations. No JS animation libraries.
- No `Co-Authored-By: Claude` in any commit message.
- No `git config user.name/email` at local scope.
- All subagents in implementation: `model: "sonnet"`.

---

## Open questions (resolved before implementation)

All resolved during brainstorming:

| Question | Decision |
|---|---|
| App shell direction | Option C — Dark Pro (always dark, nav tabs in titlebar) |
| Logo mark | Signal Pulse (ECG waveform, purple→cyan gradient) |
| Middle canvas | Live Event Topology Map (Option A) |
| Right panel | Tabbed dock: Results / Assertions / Diff / Payload / History |
| Topology + Diff connection | Bidirectional selection: click node → right panel scopes to that node |
| "FlowProbe" text visibility | Splash only (500ms), never in running app |
| macOS traffic light buttons | Removed entirely — Windows-style controls (─ ⬜ ✕) on right |
| Animation philosophy | CSS-only spring tokens, GPU-composited only, 0ms on reduced-motion |
| Light mode | Available as toggle in Settings, dark is default |
