import type { TransitionConfig } from 'svelte/transition'

/** Returns true when the user has requested reduced motion. */
function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * Svelte custom transition: fade + scale entrance.
 * Usage: `<div transition:fadeScale>…</div>`
 */
export function fadeScale(
  node: Element,
  { duration = 200, delay = 0 }: { duration?: number; delay?: number } = {}
): TransitionConfig {
  if (prefersReducedMotion()) return { duration: 0 }
  return {
    duration,
    delay,
    css: (t: number) => `
      opacity: ${t};
      transform: scale(${0.95 + 0.05 * t});
    `
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
