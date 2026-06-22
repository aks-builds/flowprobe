# FlowProbe v2 SP7: Cross-Platform Distribution — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship FlowProbe as a signed, auto-updating standalone executable on Windows (NSIS .exe), macOS (.dmg with notarization), and Linux (.AppImage + .deb) via GitHub Actions CI triggered on pushes to the `release` branch.

**Architecture:** `tauri-apps/tauri-action` drives the cross-platform build matrix. App icons are generated from a single 1024×1024 SVG source. The auto-updater checks a GitHub releases endpoint on startup. Version is single-sourced from `tauri.conf.json`.

**Tech Stack:** Tauri 2.0, GitHub Actions, `tauri-plugin-updater`

## Global Constraints

- No `Co-Authored-By: Claude` in any commit
- SP1–SP6 must be merged before this plan
- Version in `tauri.conf.json` is the single source of truth — `package.json` syncs to it via a pre-build script
- Windows: `webviewInstallMode: embedBootstrapper` — app works offline
- macOS: notarization required for Apple Silicon to avoid "app is damaged" error

---

## File Map

```
.github/
└── workflows/
    └── release.yml                   CREATE — cross-platform build + GitHub Release

packages/desktop/
├── src-tauri/
│   ├── tauri.conf.json               MODIFY — bundle config, identifier, WebView2 mode
│   ├── icons/                        CREATE — all icon sizes from SVG source
│   │   ├── 32x32.png
│   │   ├── 128x128.png
│   │   ├── 128x128@2x.png
│   │   ├── icon.ico
│   │   └── icon.icns
│   └── Cargo.toml                    MODIFY — add tauri-plugin-updater
└── src/lib/
    └── components/
        └── UpdateBanner.svelte       CREATE — status bar update notification

scripts/
└── sync-version.js                   CREATE — sync package.json versions from tauri.conf.json
```

---

### Task 1: App icons — generate all required sizes

**Files:**
- Create: `packages/desktop/src-tauri/icons/` directory with all icon files

**Interfaces:**
- Produces: all icon formats required by Tauri bundler

- [ ] **Step 1: Create the Signal Pulse logo as a high-res SVG**

Create `packages/desktop/src-tauri/icons/icon-source.svg`:

```svg
<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <defs>
    <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%"   stop-color="#6366f1"/>
      <stop offset="50%"  stop-color="#a855f7"/>
      <stop offset="100%" stop-color="#06b6d4"/>
    </linearGradient>
  </defs>
  <rect width="1024" height="1024" rx="220" fill="#111128"/>
  <path d="M112 512 L224 512 L288 304 L352 720 L416 432 L480 592 L544 512 L912 512"
        fill="none" stroke="url(#g)" stroke-width="56" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="912" cy="512" r="64" fill="#06b6d4"/>
</svg>
```

- [ ] **Step 2: Generate PNG sizes using Tauri's icon generator**

```bash
cd packages/desktop && npx tauri icon src-tauri/icons/icon-source.svg 2>&1
```

This generates all required sizes into `src-tauri/icons/`. If `tauri icon` is not available:
```bash
# Fallback: use sharp or imagemagick if available
# Check what's generated and confirm these exist:
ls packages/desktop/src-tauri/icons/
```
Expected files: `32x32.png`, `128x128.png`, `128x128@2x.png`, `icon.icns` (macOS), `icon.ico` (Windows)

- [ ] **Step 3: Commit**
```bash
git add packages/desktop/src-tauri/icons/
git commit -m "feat(desktop): app icons — Signal Pulse logo in all required sizes"
```

---

### Task 2: Update tauri.conf.json for production bundle

**Files:**
- Modify: `packages/desktop/src-tauri/tauri.conf.json`

- [ ] **Step 1: Read current tauri.conf.json**

Read the full file.

- [ ] **Step 2: Update bundle configuration**

Merge the following into `tauri.conf.json`:

```json
{
  "productName": "FlowProbe",
  "version": "1.0.0",
  "identifier": "com.flowprobe.app",
  "build": {
    "frontendDist": "../build",
    "devUrl": "http://localhost:5173"
  },
  "bundle": {
    "active": true,
    "targets": "all",
    "icon": [
      "icons/32x32.png",
      "icons/128x128.png",
      "icons/128x128@2x.png",
      "icons/icon.icns",
      "icons/icon.ico"
    ],
    "windows": {
      "webviewInstallMode": { "type": "embedBootstrapper" },
      "nsis": {
        "displayLanguageSelector": false,
        "installMode": "currentUser"
      }
    },
    "macOS": {
      "signingIdentity": null,
      "entitlements": null
    },
    "linux": {
      "deb": {
        "depends": ["libwebkit2gtk-4.1-0", "libappindicator3-1"]
      }
    }
  },
  "app": {
    "windows": [
      {
        "label": "main",
        "title": "FlowProbe",
        "width": 1280,
        "height": 800,
        "minWidth": 900,
        "minHeight": 600,
        "decorations": false,
        "transparent": false,
        "titleBarStyle": "Overlay",
        "center": true
      }
    ],
    "security": {
      "csp": null
    }
  }
}
```

- [ ] **Step 3: Build check (Vite only — no Rust compile needed for this step)**
```bash
cd packages/desktop && npx vite build 2>&1 | tail -5
```

- [ ] **Step 4: Commit**
```bash
git add packages/desktop/src-tauri/tauri.conf.json
git commit -m "feat(desktop): tauri.conf.json — production bundle config, NSIS, embedded WebView2"
```

---

### Task 3: Auto-updater integration

**Files:**
- Modify: `packages/desktop/src-tauri/Cargo.toml`
- Modify: `packages/desktop/src-tauri/src/lib.rs`
- Create: `packages/desktop/src/lib/components/UpdateBanner.svelte`
- Modify: `packages/desktop/src/routes/+layout.svelte`

**Interfaces:**
- Produces: `check_for_update() -> Result<Option<String>, String>` — returns new version string or None
- Produces: `install_update() -> Result<(), String>` — downloads and applies update
- Produces: `<UpdateBanner />` — status bar update chip

- [ ] **Step 1: Add tauri-plugin-updater to Cargo.toml**

Read `packages/desktop/src-tauri/Cargo.toml`. Add to `[dependencies]`:
```toml
tauri-plugin-updater = "2"
```

- [ ] **Step 2: Register updater plugin in lib.rs**

Read `packages/desktop/src-tauri/src/lib.rs`. Add to the builder chain:
```rust
.plugin(tauri_plugin_updater::Builder::new().build())
```

- [ ] **Step 3: Add pubkey to tauri.conf.json**

In `tauri.conf.json` under `plugins`:
```json
{
  "plugins": {
    "updater": {
      "pubkey": "REPLACE_WITH_GENERATED_PUBKEY",
      "endpoints": ["https://github.com/aks-builds/flowprobe/releases/latest/download/latest.json"]
    }
  }
}
```

Note: The actual pubkey is generated by `tauri signer generate`. Run in CI secrets setup. For now use a placeholder.

- [ ] **Step 4: Create UpdateBanner.svelte**

Create `packages/desktop/src/lib/components/UpdateBanner.svelte`:

```svelte
<script lang="ts">
  import { onMount } from 'svelte'
  import { invoke } from '@tauri-apps/api/core'

  let availableVersion = $state<string | null>(null)
  let installing = $state(false)

  onMount(async () => {
    // Check on startup, silently fail if offline
    try {
      const version = await invoke<string | null>('plugin:updater|check')
      availableVersion = version
    } catch { /* offline or no update */ }
  })

  async function installUpdate() {
    installing = true
    try {
      await invoke('plugin:updater|install')
    } catch (e) {
      console.error('Update failed:', e)
      installing = false
    }
  }
</script>

{#if availableVersion}
  <div class="update-chip" role="status">
    v{availableVersion} available
    <button class="update-btn" onclick={installUpdate} disabled={installing}>
      {installing ? 'Installing…' : 'Restart to update'}
    </button>
    <button class="dismiss" onclick={() => availableVersion = null} aria-label="Dismiss">✕</button>
  </div>
{/if}

<style>
  .update-chip {
    display: flex; align-items: center; gap: 8px;
    font-size: 9.5px; color: #a5b4fc;
  }
  .update-btn {
    padding: 1px 7px; border-radius: 4px; font-size: 9px; font-weight: 700;
    background: rgba(99,102,241,.2); color: #a5b4fc; border: 1px solid rgba(99,102,241,.35); cursor: pointer;
  }
  .update-btn:disabled { opacity: .6; cursor: not-allowed; }
  .dismiss { background: none; border: none; color: #475569; cursor: pointer; font-size: 10px; }
</style>
```

- [ ] **Step 5: Add UpdateBanner to status bar in +page.svelte**

Read `packages/desktop/src/routes/+page.svelte`. Find the `.stbar` div and add `<UpdateBanner />` inside it, after the existing status items.

- [ ] **Step 6: Cargo check + build + commit**
```bash
cd packages/desktop/src-tauri && "/c/Users/AdityaKumarSingh/.cargo/bin/cargo.exe" check 2>&1 | tail -5
cd packages/desktop && npx vite build 2>&1 | tail -5
git add packages/desktop/src-tauri/Cargo.toml packages/desktop/src-tauri/src/lib.rs packages/desktop/src/lib/components/UpdateBanner.svelte packages/desktop/src/routes/+page.svelte packages/desktop/src-tauri/tauri.conf.json
git commit -m "feat(desktop): auto-updater integration + UpdateBanner status chip"
```

---

### Task 4: Version sync script

**Files:**
- Create: `scripts/sync-version.js`
- Modify: root `package.json` — add `prerelease` script

- [ ] **Step 1: Create sync-version.js**

Create `scripts/sync-version.js`:
```javascript
#!/usr/bin/env node
// Reads version from packages/desktop/src-tauri/tauri.conf.json
// Writes it to packages/desktop/package.json and root package.json
import { readFileSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dir = dirname(fileURLToPath(import.meta.url))
const root = join(__dir, '..')

const tauriConf = JSON.parse(readFileSync(join(root, 'packages/desktop/src-tauri/tauri.conf.json'), 'utf8'))
const version = tauriConf.version

if (!version) { console.error('No version in tauri.conf.json'); process.exit(1) }

function bumpPkg(path) {
  const pkg = JSON.parse(readFileSync(path, 'utf8'))
  if (pkg.version === version) return
  pkg.version = version
  writeFileSync(path, JSON.stringify(pkg, null, 2) + '\n')
  console.log(`Updated ${path} → ${version}`)
}

bumpPkg(join(root, 'package.json'))
bumpPkg(join(root, 'packages/desktop/package.json'))
console.log(`Version synced: ${version}`)
```

- [ ] **Step 2: Commit**
```bash
git add scripts/sync-version.js
git commit -m "chore: version sync script — single source of truth from tauri.conf.json"
```

---

### Task 5: GitHub Actions release workflow

**Files:**
- Create: `.github/workflows/release.yml`

- [ ] **Step 1: Create release.yml**

Create `.github/workflows/release.yml`:

```yaml
name: Release

on:
  push:
    branches: [release]
  workflow_dispatch:

jobs:
  publish-tauri:
    permissions:
      contents: write
    strategy:
      fail-fast: false
      matrix:
        include:
          - platform: windows-latest
            args: ''
          - platform: macos-latest
            args: '--target universal-apple-darwin'
          - platform: ubuntu-22.04
            args: ''
    runs-on: ${{ matrix.platform }}

    steps:
      - uses: actions/checkout@v4

      - name: Install Linux webkit deps
        if: matrix.platform == 'ubuntu-22.04'
        run: |
          sudo apt-get update
          sudo apt-get install -y \
            libwebkit2gtk-4.1-dev \
            libappindicator3-dev \
            librsvg2-dev \
            patchelf

      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'npm'

      - name: Setup pnpm
        uses: pnpm/action-setup@v4
        with:
          version: 9

      - uses: dtolnay/rust-toolchain@stable
        with:
          targets: ${{ matrix.platform == 'macos-latest' && 'aarch64-apple-darwin,x86_64-apple-darwin' || '' }}

      - uses: swatinem/rust-cache@v2
        with:
          workspaces: './packages/desktop/src-tauri -> target'

      - name: Install frontend deps
        run: pnpm install

      - name: Sync version
        run: node scripts/sync-version.js

      - uses: tauri-apps/tauri-action@v0
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY }}
          TAURI_SIGNING_PRIVATE_KEY_PASSWORD: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY_PASSWORD }}
          # macOS notarization (optional, set in repo secrets to enable)
          APPLE_ID: ${{ secrets.APPLE_ID }}
          APPLE_PASSWORD: ${{ secrets.APPLE_PASSWORD }}
          APPLE_TEAM_ID: ${{ secrets.APPLE_TEAM_ID }}
        with:
          projectPath: packages/desktop
          tagName: v__VERSION__
          releaseName: FlowProbe v__VERSION__
          releaseBody: |
            ## FlowProbe v__VERSION__

            ### Downloads
            - **Windows**: `FlowProbe_VERSION_x64-setup.exe` (NSIS, no admin required)
            - **macOS**: `FlowProbe_VERSION_universal.dmg`
            - **Linux**: `FlowProbe_VERSION_amd64.AppImage` or `flowprobe_VERSION_amd64.deb`
          releaseDraft: true
          prerelease: false
          args: ${{ matrix.args }}
```

- [ ] **Step 2: Create `.github/` directory structure if needed**
```bash
mkdir -p "C:/Users/AdityaKumarSingh/flowprobe/.github/workflows"
```

- [ ] **Step 3: Commit**
```bash
git add .github/workflows/release.yml
git commit -m "feat(ci): GitHub Actions release workflow — Windows/macOS/Linux via tauri-action"
```

---

### Task 6: README distribution section

**Files:**
- Modify: `README.md` (if exists) or skip if no README

- [ ] **Step 1: Check if README.md exists**
```bash
ls "C:/Users/AdityaKumarSingh/flowprobe/README.md" 2>/dev/null && echo "exists" || echo "not found"
```

- [ ] **Step 2: If README exists, add download section**

Find or create a "## Download" section:

```markdown
## Download

| Platform | File | Notes |
|---|---|---|
| Windows | `FlowProbe_VERSION_x64-setup.exe` | NSIS installer, no admin required |
| macOS | `FlowProbe_VERSION_universal.dmg` | Universal binary (Apple Silicon + Intel) |
| Linux | `FlowProbe_VERSION_amd64.AppImage` | Portable, no install needed |
| Linux | `flowprobe_VERSION_amd64.deb` | For Ubuntu/Debian |

Download from [GitHub Releases](https://github.com/aks-builds/flowprobe/releases).

### macOS first-run note

If macOS blocks the app on first launch, right-click → Open → Open to bypass Gatekeeper (one-time only).

### Windows SmartScreen note

Until the app is code-signed with an EV certificate, Windows SmartScreen may show a warning. Click "More info" → "Run anyway".
```

- [ ] **Step 3: Commit**
```bash
git add README.md
git commit -m "docs: add download section with platform-specific install notes"
```

---

### Final verification

- [ ] **Confirm tauri dev still works locally after all changes**
```bash
cd packages/desktop && RUST_MIN_STACK=67108864 PATH="/c/Users/AdityaKumarSingh/.cargo/bin:$PATH" npx tauri dev 2>&1 | grep -E "Finished|error" | head -5
```

- [ ] **Confirm full test suite still passes**
```bash
cd C:/Users/AdityaKumarSingh/flowprobe && pnpm test 2>&1 | tail -10
```
