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
