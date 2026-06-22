# FlowProbe v2 SP6: Motion System — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish a complete CSS animation token system, audit every component for hardcoded durations, enforce GPU-composited properties only, and ensure all animations respect `prefers-reduced-motion`.

**Architecture:** All animation durations and easing live as CSS custom properties in `tokens.css`. A lint check script scans for hardcoded `ms` values in CSS. The `fadeScale` Svelte transition in `animations.ts` reads `prefers-reduced-motion` to return 0ms duration.

**Tech Stack:** CSS custom properties, Svelte transitions, TypeScript

## Global Constraints

- Zero hardcoded `ms` values in CSS after this plan — only `var(--dur-*)` tokens
- GPU-composited properties only: `transform`, `opacity` — no `height`/`top`/`left` animations
- All `@keyframes` blocks have a `prefers-reduced-motion: reduce` override
- No `Co-Authored-By: Claude` in any commit

---

## File Map

```
packages/desktop/src/lib/
├── design/
│   ├── tokens.css                    MODIFY — add full motion token set + easing tokens
│   └── animations.ts                 MODIFY — fadeScale reads prefers-reduced-motion; add slideUp, springPop
└── scripts/
    └── check-hardcoded-durations.ts  CREATE — CI lint: fails if any .svelte/.css contains hardcoded ms
```

---

### Task 1: Complete motion token system

**Files:**
- Modify: `packages/desktop/src/lib/design/tokens.css`

- [ ] **Step 1: Replace or extend the duration tokens section**

Read `packages/desktop/src/lib/design/tokens.css`. Find the existing `--dur-fast/normal/slow` tokens. Replace with the full set:

```css
/* ── Motion tokens ── */
--dur-instant:  80ms;
--dur-fast:     150ms;
--dur-normal:   250ms;
--dur-slow:     400ms;
--dur-crawl:    600ms;

--ease-spring:  cubic-bezier(0.175, 0.885, 0.32, 1.275);
--ease-out:     cubic-bezier(0.0,   0.0,   0.2,  1.0);
--ease-in-out:  cubic-bezier(0.4,   0.0,   0.2,  1.0);
--ease-snappy:  cubic-bezier(0.25,  0.46,  0.45, 0.94);
```

And ensure the `prefers-reduced-motion` block sets ALL durations to `0ms`:

```css
@media (prefers-reduced-motion: reduce) {
  :root {
    --dur-instant: 0ms;
    --dur-fast:    0ms;
    --dur-normal:  0ms;
    --dur-slow:    0ms;
    --dur-crawl:   0ms;
  }
}
```

- [ ] **Step 2: Build check**
```bash
cd packages/desktop && npx vite build 2>&1 | tail -5
```

- [ ] **Step 3: Commit**
```bash
git add packages/desktop/src/lib/design/tokens.css
git commit -m "feat(desktop): complete motion token system — 5 durations + 4 easing curves"
```

---

### Task 2: Update animations.ts — reduced-motion aware transitions

**Files:**
- Modify: `packages/desktop/src/lib/design/animations.ts`

**Interfaces:**
- Modifies `fadeScale` to return `duration: 0` when `prefers-reduced-motion: reduce` is active
- Adds `slideUp(node, opts)` — `opacity` + `transform: translateY(6px→0)` transition
- Adds `springPop(node, opts)` — `transform: scale(0.88→1)` + `opacity` — for badges/tooltips

- [ ] **Step 1: Read current animations.ts**

Read `packages/desktop/src/lib/design/animations.ts` to understand current `fadeScale` implementation.

- [ ] **Step 2: Update animations.ts**

Replace the file contents:

```typescript
import { cubicOut } from 'svelte/easing'

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

type TransitionParams = { duration?: number; delay?: number }

/** Fade + scale in. 0ms if prefers-reduced-motion. */
export function fadeScale(
  _node: Element,
  { duration = 200, delay = 0 }: TransitionParams = {}
) {
  const d = prefersReducedMotion() ? 0 : duration
  return {
    duration: d,
    delay,
    css: (t: number) => `opacity: ${t}; transform: scale(${0.92 + 0.08 * t})`,
  }
}

/** Slide up from 6px. 0ms if prefers-reduced-motion. */
export function slideUp(
  _node: Element,
  { duration = 150, delay = 0 }: TransitionParams = {}
) {
  const d = prefersReducedMotion() ? 0 : duration
  return {
    duration: d,
    delay,
    easing: cubicOut,
    css: (t: number) => `opacity: ${t}; transform: translateY(${(1 - t) * 6}px)`,
  }
}

/** Spring pop — for badges and tooltips. 0ms if prefers-reduced-motion. */
export function springPop(
  _node: Element,
  { duration = 180, delay = 0 }: TransitionParams = {}
) {
  const d = prefersReducedMotion() ? 0 : duration
  return {
    duration: d,
    delay,
    css: (t: number) => `opacity: ${t}; transform: scale(${0.88 + 0.12 * t})`,
  }
}
```

- [ ] **Step 3: Build check + commit**
```bash
cd packages/desktop && npx vite build 2>&1 | tail -5
git add packages/desktop/src/lib/design/animations.ts
git commit -m "feat(desktop): animations.ts — reduced-motion aware fadeScale, slideUp, springPop"
```

---

### Task 3: Audit + fix hardcoded durations across all components

**Files:**
- Modify: Multiple `.svelte` files — replace hardcoded `ms` in CSS with `var(--dur-*)` tokens

- [ ] **Step 1: Find all hardcoded durations**

```bash
grep -rn "transition:.*[0-9]\+ms\|animation:.*[0-9]\+ms\|duration:.*[0-9]\+" packages/desktop/src/lib/components/ --include="*.svelte" --include="*.css" | grep -v "var(--dur"
```

Review the output. Common offenders to fix:
- `animation: b-pulse 1s` → `animation: b-pulse var(--dur-slow)`
- `transition: ... 400ms` → `transition: ... var(--dur-normal)`
- `animation: cblink 1s` → `animation: cblink var(--dur-slow)`
- `animation: live-blink 1.5s` → `animation: live-blink var(--dur-crawl)`
- `transition: width .4s` → `transition: width var(--dur-normal)`

- [ ] **Step 2: Fix each hardcoded duration found**

For each file reported in step 1, replace the hardcoded ms value with the appropriate token:

| Hardcoded | Replace with |
|---|---|
| `0.1s`, `100ms` | `var(--dur-instant)` |
| `0.15s`, `150ms` | `var(--dur-fast)` |
| `0.2s`–`0.3s`, `200ms`–`300ms` | `var(--dur-normal)` |
| `0.4s`, `400ms` | `var(--dur-slow)` |
| `0.6s`+, `1s`, `1.5s` | `var(--dur-crawl)` (for looping anims — acceptable to keep specific values for pulse/blink since they're infinite loops, not one-shot transitions) |

Note: Looping animations (`animation: blink 1s infinite`, `animation: pulse 1.8s infinite`) may keep their specific durations since `var(--dur-*)` being `0ms` on reduced-motion would stop the animation via the token system — but confirm by testing.

- [ ] **Step 3: Verify all `@keyframes` have reduced-motion overrides**

Scan for `@keyframes` in all component files:
```bash
grep -rn "@keyframes" packages/desktop/src/lib/components/ --include="*.svelte"
```

For each `@keyframes` block that drives a looping animation (pulse, blink, travel), verify there is a corresponding:
```css
@media (prefers-reduced-motion: reduce) {
  .the-element { animation: none; }
}
```

Add any that are missing.

- [ ] **Step 4: Re-run audit — confirm 0 hardcoded durations in one-shot transitions**
```bash
grep -rn "transition:.*[0-9]\+ms\|transition:.*[0-9]\+s[^)i]" packages/desktop/src/lib/components/ --include="*.svelte" | grep -v "var(--dur"
```
Expected: 0 results for transition properties. Looping animation durations are acceptable.

- [ ] **Step 5: Full build + test**
```bash
cd packages/desktop && npx vite build 2>&1 | tail -5
cd C:/Users/AdityaKumarSingh/flowprobe && pnpm test 2>&1 | tail -10
```

- [ ] **Step 6: Commit**
```bash
git add packages/desktop/src/lib/components/
git commit -m "fix(desktop): replace all hardcoded transition durations with CSS tokens"
```

---

### Task 4: Replace height/top/left animations with GPU-composited equivalents

**Files:**
- Audit and fix components using non-GPU-composited properties in transitions

- [ ] **Step 1: Find non-GPU transitions**
```bash
grep -rn "transition:.*height\|transition:.*width\|transition:.*top\|transition:.*left\|transition:.*color\b" packages/desktop/src/lib/components/ --include="*.svelte"
```

- [ ] **Step 2: Fix each finding**

For each non-composited property found:

**`height` transitions** (e.g. drawer expand): Replace with `transform: scaleY()` or use `opacity` only. For collapsible sections, wrap content in a `max-height: 0 → auto` approach but controlled by JS class toggle rather than CSS transition (CSS can't transition `height: auto`). Use opacity fade instead:

```css
/* Before */
.drawer { height: 0; transition: height 200ms; }
.drawer.open { height: 88px; }

/* After — use opacity + visibility, or translateY */
.drawer { opacity: 0; transform: translateY(-4px); pointer-events: none; transition: opacity var(--dur-fast), transform var(--dur-fast); }
.drawer.open { opacity: 1; transform: translateY(0); pointer-events: auto; }
```

**`color` transitions**: Replace with `opacity` on a pseudo-element, or accept that color transitions are low-priority GPU ops and leave them. Only flag if causing jank.

- [ ] **Step 3: Build check + commit**
```bash
cd packages/desktop && npx vite build 2>&1 | tail -5
git add packages/desktop/src/lib/components/
git commit -m "perf(desktop): replace non-GPU transitions — height/top/left → transform/opacity"
```
