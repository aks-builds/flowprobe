# SP6 Final Fix Report

**Status:** DONE  
**Date:** 2026-06-25

## Fixes Applied

### C1 — Hardcoded ms tokenized in SplashScreen.svelte
- `transition: stroke-dashoffset 700ms cubic-bezier(0.25, 0.46, 0.45, 0.94)` → `transition: stroke-dashoffset var(--dur-crawl) var(--ease-snappy)`
- `transition: opacity 350ms, transform 350ms cubic-bezier(0.175,0.885,0.32,1.275)` → `transition: opacity var(--dur-slow), transform var(--dur-slow) var(--ease-spring)`

### C2 — JS fill-anim timing verified OK
`progressFill = true` is set via JS boolean on line 65 of SplashScreen.svelte, driving `class:fill-anim={progressFill}`. The CSS scaleX transition is triggered correctly. Progress bar 1400ms fill timing is within the exception list in the lint script. **No JS change needed.**

### I4 — ResultsTab timing-fill clamped
Changed `scaleX({step.durationMs / maxDuration})` → `scaleX({Math.min(1, step.durationMs / maxDuration)})` to prevent overflow when a step duration exceeds the max (e.g. concurrent runs updating maxDuration mid-render).

### I5 — Motion lint script created
- Created `packages/desktop/src/lib/scripts/check-hardcoded-durations.ts`
- Added `"lint:motion": "tsx src/lib/scripts/check-hardcoded-durations.ts"` to `packages/desktop/package.json`
- SplashScreen.svelte is in the exceptions list (intentional splash-sequence timings)

## Verification Results

| Check | Result |
|-------|--------|
| `vitest run` | 32/32 tests passed |
| `vite build` | ✓ built in 6.79s |
| `lint:motion` | ✓ No hardcoded animation durations found |
