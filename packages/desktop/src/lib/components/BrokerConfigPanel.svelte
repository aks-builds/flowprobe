<script lang="ts">
  import { createEventDispatcher } from 'svelte'
  import { invoke } from '@tauri-apps/api/core'
  import { fadeScale } from '../design/animations.js'
  import ValidationBadge from './ValidationBadge.svelte'
  import { brokerStatusStore } from '../stores/collection.js'

  export let brokerId: string

  const dispatch = createEventDispatcher<{ close: void }>()

  let url = ''
  let mechanism = 'plaintext'
  let username = ''
  let password = ''
  let showPassword = false
  let testing = false
  let testError: string | null = null
  let urlError: string | null = null

  function validateUrl() {
    urlError = url.trim() ? null : 'Required — enter broker URL (e.g. localhost:9092)'
  }

  async function handleConnect() {
    validateUrl()
    if (urlError) return
    testing = true
    testError = null
    brokerStatusStore.set(brokerId, { connected: false, connecting: true, latencyMs: null, error: null })
    try {
      await invoke('connect_broker', {
        id: brokerId,
        url: url.trim(),
        auth: mechanism !== 'plaintext' ? { mechanism, username: username || null, password: password || null } : null,
      })
      const latencyMs = await invoke<number>('ping_broker', { id: brokerId })
      brokerStatusStore.set(brokerId, { connected: true, connecting: false, latencyMs, error: null })
      dispatch('close')
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      testError = message
      brokerStatusStore.set(brokerId, { connected: false, connecting: false, latencyMs: null, error: message })
    } finally {
      testing = false
    }
  }

  async function handleDisconnect() {
    try {
      await invoke('disconnect_broker', { id: brokerId })
      brokerStatusStore.set(brokerId, { connected: false, connecting: false, latencyMs: null, error: null })
      dispatch('close')
    } catch (err) {
      testError = err instanceof Error ? err.message : String(err)
    }
  }

  $: status = $brokerStatusStore.get(brokerId)
  $: isConnected = status?.connected ?? false
</script>

<div class="panel" in:fadeScale={{ duration: 150 }}>
  <div class="panel-header">
    <span class="panel-title">Configure: {brokerId}</span>
    <button class="close-btn" on:click={() => dispatch('close')} aria-label="Close">✕</button>
  </div>

  <div class="field">
    <label class="field-label">Broker URL</label>
    <input
      class="field-input"
      class:error={!!urlError}
      placeholder="localhost:9092"
      bind:value={url}
      on:blur={validateUrl}
      disabled={testing}
    />
    <ValidationBadge error={urlError} />
  </div>

  <div class="field">
    <label class="field-label">Auth</label>
    <select class="field-input" bind:value={mechanism} disabled={testing}>
      <option value="plaintext">No auth (plaintext)</option>
      <option value="SASL/PLAIN">SASL/PLAIN</option>
      <option value="SASL/SCRAM-SHA-256">SASL/SCRAM-256</option>
    </select>
  </div>

  {#if mechanism !== 'plaintext'}
    <div class="field">
      <label class="field-label">Username</label>
      <input class="field-input" bind:value={username} placeholder="username" disabled={testing} />
    </div>
    <div class="field">
      <label class="field-label">Password</label>
      <div class="pass-wrap">
        <input
          class="field-input"
          type={showPassword ? 'text' : 'password'}
          bind:value={password}
          placeholder="password"
          disabled={testing}
        />
        <button class="reveal-btn" on:click={() => (showPassword = !showPassword)}>{showPassword ? '🙈' : '👁'}</button>
      </div>
    </div>
  {/if}

  {#if testError}
    <div class="test-error">⚠ {testError}</div>
  {/if}

  <div class="actions">
    {#if isConnected}
      <button class="btn-danger" on:click={handleDisconnect} disabled={testing}>Disconnect</button>
    {:else}
      <button class="btn-primary" on:click={handleConnect} disabled={testing || !!urlError}>
        {testing ? 'Connecting…' : 'Connect & Test'}
      </button>
    {/if}
    <button class="btn-cancel" on:click={() => dispatch('close')} disabled={testing}>Cancel</button>
  </div>
</div>

<style>
  .panel {
    background: var(--surface);
    border: 1.5px solid var(--accent);
    border-radius: var(--radius-md);
    padding: 10px 12px;
    margin-top: 4px;
  }
  .panel-header {
    display: flex;
    align-items: center;
    margin-bottom: 8px;
  }
  .panel-title {
    font-size: var(--text-sm);
    font-weight: 600;
    color: var(--accent);
    flex: 1;
  }
  .close-btn {
    border: none;
    background: none;
    cursor: pointer;
    color: var(--text-muted);
    font-size: 11px;
    padding: 0;
  }
  .field {
    margin-bottom: 7px;
  }
  .field-label {
    font-size: var(--text-xs);
    color: var(--text-muted);
    display: block;
    margin-bottom: 3px;
  }
  .field-input {
    width: 100%;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: 4px 7px;
    font-size: var(--text-sm);
    font-family: var(--font-mono);
    color: var(--text-primary);
    background: var(--bg);
    box-sizing: border-box;
  }
  .field-input.error {
    border-color: var(--error);
  }
  .field-input:focus {
    outline: none;
    border-color: var(--accent);
  }
  .field-input:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
  .pass-wrap {
    display: flex;
    gap: 4px;
  }
  .reveal-btn {
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--bg);
    cursor: pointer;
    padding: 0 6px;
    font-size: 11px;
  }
  .test-error {
    font-size: var(--text-xs);
    color: var(--error);
    margin-bottom: 7px;
    background: var(--error-light);
    border-radius: var(--radius-sm);
    padding: 5px 8px;
  }
  .actions {
    display: flex;
    gap: 6px;
  }
  .btn-primary {
    flex: 1;
    background: var(--accent);
    color: #fff;
    border: none;
    border-radius: var(--radius-md);
    padding: 6px 10px;
    font-size: var(--text-sm);
    font-weight: 600;
    cursor: pointer;
  }
  .btn-primary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .btn-danger {
    flex: 1;
    background: var(--error-light);
    border: 1px solid #fecaca;
    color: var(--error);
    border-radius: var(--radius-md);
    padding: 6px 10px;
    font-size: var(--text-sm);
    font-weight: 600;
    cursor: pointer;
  }
  .btn-cancel {
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    padding: 6px 10px;
    font-size: var(--text-sm);
    cursor: pointer;
    color: var(--text-secondary);
  }
</style>
