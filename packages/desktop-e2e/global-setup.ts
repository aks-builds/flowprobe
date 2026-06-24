import { spawn, execSync } from 'child_process'
import { existsSync } from 'fs'
import { join, resolve } from 'path'

const ROOT = resolve(__dirname, '../..')
const DESKTOP = join(ROOT, 'packages/desktop')
const BINARY_EXT = process.platform === 'win32' ? '.exe' : ''
const BINARY = join(DESKTOP, `src-tauri/target/release/flowprobe${BINARY_EXT}`)
const CDP_PORT = 9222

// Try common cargo locations: CI PATH, then local Windows default
const CARGO = (() => {
  const local = 'C:/Users/AdityaKumarSingh/.cargo/bin/cargo.exe'
  if (process.platform === 'win32' && existsSync(local)) return local
  return 'cargo'
})()

async function waitForCDP(port: number, timeout = 30_000): Promise<void> {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://localhost:${port}/json/version`)
      if (res.ok) return
    } catch { /* not ready yet */ }
    await new Promise(r => setTimeout(r, 500))
  }
  throw new Error(`CDP http://localhost:${port}/json/version not ready after ${timeout}ms`)
}

export default async function globalSetup() {
  const needsBuild = !existsSync(BINARY) || process.env.TAURI_E2E_REBUILD === '1'

  if (needsBuild) {
    console.log('[E2E] Building Vite frontend...')
    execSync('pnpm build', { cwd: DESKTOP, stdio: 'inherit' })

    console.log('[E2E] Building e2e-mock Tauri binary...')
    execSync(`${CARGO} build --release --features e2e-mock`, {
      cwd: join(DESKTOP, 'src-tauri'),
      stdio: 'inherit',
    })
  }

  console.log('[E2E] Launching app...')
  const app = spawn(BINARY, [], {
    detached: false,
    env: {
      ...process.env,
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${CDP_PORT} --remote-allow-origins=*`,
    },
  })

  app.on('error', err => { throw new Error(`[E2E] Failed to launch app: ${err.message}`) })

  if (!app.pid) throw new Error('[E2E] App process has no PID — binary may be missing')
  process.env.E2E_APP_PID = String(app.pid)

  console.log(`[E2E] App PID ${app.pid} — waiting for CDP on :${CDP_PORT}...`)
  await waitForCDP(CDP_PORT)
  console.log('[E2E] CDP ready.')
}
