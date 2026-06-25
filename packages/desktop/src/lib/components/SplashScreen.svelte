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
      add(() => { fading = true; timers.push(T(() => { visible = false; dispatch('dismiss') }, 200)) }, 300)
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

    add(() => { progressVisible = true; timers.push(T(() => { progressFill = true }, 50)) }, 1700)

    // Total ~2350ms → fade out
    add(() => {
      fading = true
      timers.push(T(() => { visible = false; dispatch('dismiss') }, 200))
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
    transition: opacity var(--dur-normal) ease-out;
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
    transition: opacity var(--dur-slow), transform var(--dur-slow) cubic-bezier(0.175,0.885,0.32,1.275);
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
  .wave-dot { opacity: 0; transition: opacity var(--dur-normal); }
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
    color: #334155; opacity: 0; transition: opacity var(--dur-normal);
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
    transition: opacity var(--dur-normal), transform var(--dur-normal) cubic-bezier(0.175,0.885,0.32,1.275);
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
    opacity: 0; transition: opacity var(--dur-normal); flex-shrink: 0;
  }
  .flow-edge.edge-vis { opacity: 1; }

  /* ── Progress bar ── */
  .progress {
    width: 200px; height: 2.5px;
    background: rgba(255,255,255,.08); border-radius: 2px; overflow: hidden;
    opacity: 0; transition: opacity var(--dur-normal);
  }
  .progress.prog-vis { opacity: 1; }

  .progress-fill {
    height: 100%; width: 100%; border-radius: 2px;
    background: linear-gradient(90deg, #6366f1, #a855f7, #06b6d4);
    box-shadow: 0 0 8px rgba(99,102,241,.4);
    transform: scaleX(0);
    transform-origin: left center;
    transition: transform 1400ms linear;
  }
  .progress-fill.fill-anim {
    transform: scaleX(1);
  }

  /* Reduced motion: skip all transitions */
  @media (prefers-reduced-motion: reduce) {
    .splash, .logo-glow, .wave, .wave-dot,
    .wordmark, .tagline, .flow-node, .flow-edge,
    .progress, .progress-fill { transition: none !important; }
  }
</style>
