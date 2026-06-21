<script lang="ts">
  export let error: string | null = null
</script>

{#if error}
  <div class="badge" role="alert" aria-live="polite">{error}</div>
{/if}

<style>
  .badge {
    font-size: var(--text-xs);
    color: var(--error);
    margin-top: 3px;
    display: flex;
    align-items: center;
    gap: 3px;
  }
  .badge::before {
    content: '⚠';
    font-size: 10px;
  }
</style>
