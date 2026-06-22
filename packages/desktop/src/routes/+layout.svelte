<script lang="ts">
  import Titlebar from '$lib/components/Titlebar.svelte'
  import SplashScreen from '$lib/components/SplashScreen.svelte'
  import '../lib/design/tokens.css'

  let splashDone = $state(false)
</script>

{#if !splashDone}
  <SplashScreen on:dismiss={() => { splashDone = true }} />
{/if}

<div class="app-root">
  <Titlebar />
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
