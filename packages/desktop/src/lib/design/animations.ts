import { cubicOut } from 'svelte/easing'

/** Returns true when the user has requested reduced motion. */
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

/**
 * Svelte action: shake once on mount (for failure / error states).
 * Usage: `<div use:shake>…</div>`
 */
export function shake(node: HTMLElement): { destroy(): void } {
  if (prefersReducedMotion()) return { destroy() {} }

  const keyframes: Keyframe[] = [
    { transform: 'translateX(0)' },
    { transform: 'translateX(-4px)' },
    { transform: 'translateX(4px)' },
    { transform: 'translateX(-4px)' },
    { transform: 'translateX(4px)' },
    { transform: 'translateX(0)' }
  ]
  const anim = node.animate(keyframes, { duration: 300, easing: 'ease-in-out' })

  return { destroy() { anim.cancel() } }
}

/**
 * Svelte action: loading shimmer effect.
 * Usage: `<div use:shimmer>…</div>`
 */
export function shimmer(node: HTMLElement): { destroy(): void } {
  if (prefersReducedMotion()) {
    node.style.background = 'var(--border)'
    return { destroy() {} }
  }

  node.style.background =
    'linear-gradient(90deg, var(--border) 25%, var(--bg) 50%, var(--border) 75%)'
  node.style.backgroundSize = '200% 100%'

  const anim = node.animate(
    [
      { backgroundPosition: '200% 0' },
      { backgroundPosition: '-200% 0' }
    ],
    { duration: 1500, iterations: Infinity, easing: 'linear' }
  )

  return { destroy() { anim.cancel() } }
}

/**
 * Svelte action: pulse border (for degraded / warning states).
 * Usage: `<div use:pulseBorder>…</div>`
 *        `<div use:pulseBorder={{ color: 'var(--error)' }}>…</div>`
 */
export function pulseBorder(
  node: HTMLElement,
  { color = 'var(--warning)' }: { color?: string } = {}
): { destroy(): void } {
  if (prefersReducedMotion()) {
    node.style.borderColor = color
    return { destroy() {} }
  }

  const anim = node.animate(
    [
      { borderColor: color, boxShadow: `0 0 0 0 ${color}22` },
      { borderColor: color, boxShadow: `0 0 0 4px ${color}00` }
    ],
    { duration: 1500, iterations: Infinity, easing: 'ease-out' }
  )

  return { destroy() { anim.cancel() } }
}
