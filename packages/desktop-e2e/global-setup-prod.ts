import { spawn, execSync } from 'child_process'
import { existsSync } from 'fs'
import { join, resolve } from 'path'

const ROOT = resolve(__dirname, '../..')
const DESKTOP = join(ROOT, 'packages/desktop')
const BINARY_EXT = process.platform === 'win32' ? '.exe' : ''

// The workspace .cargo/config.toml forces target = "x86_64-pc-windows-gnu" on Windows,
// so the binary lands in target/<triple>/release/ rather than target/release/.
// On Linux/macOS the default target is used (no triple subdirectory).
const GNU_TRIPLE = 'x86_64-pc-windows-gnu'
const BINARY_NAME = `flowprobe-desktop${BINARY_EXT}`
const BINARY_GNU = join(DESKTOP, `src-tauri/target/${GNU_TRIPLE}/release/${BINARY_NAME}`)
const BINARY_DEFAULT = join(DESKTOP, `src-tauri/target/release/${BINARY_NAME}`)

// Resolve after a potential build: check GNU target path first (Windows MinGW), then plain release
function resolveBinary(): string {
  if (existsSync(BINARY_GNU)) return BINARY_GNU
  if (existsSync(BINARY_DEFAULT)) return BINARY_DEFAULT
  return BINARY_GNU // expected location on Windows — will produce a clear error if still missing
}

const CDP_PORT = 9223

// Try common cargo locations: CI PATH, then local Windows default
const CARGO = process.env.CARGO ??
  (process.platform === 'win32' && existsSync('C:/Users/AdityaKumarSingh/.cargo/bin/cargo.exe')
    ? 'C:/Users/AdityaKumarSingh/.cargo/bin/cargo.exe'
    : 'cargo')

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
  const needsBuild = (!existsSync(BINARY_GNU) && !existsSync(BINARY_DEFAULT)) || process.env.TAURI_E2E_REBUILD === '1'

  if (needsBuild) {
    console.log('[E2E-PROD] Building Vite frontend...')
    execSync('pnpm build', { cwd: DESKTOP, stdio: 'inherit' })

    console.log('[E2E-PROD] Building production Tauri binary (--features custom-protocol)...')
    execSync(`${CARGO} build --release --features custom-protocol`, {
      cwd: join(DESKTOP, 'src-tauri'),
      stdio: 'inherit',
    })
  }

  const binary = resolveBinary()
  console.log(`[E2E-PROD] Launching app from ${binary}...`)
  const app = spawn(binary, [], {
    detached: false,
    env: {
      ...process.env,
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${CDP_PORT} --remote-allow-origins=*`,
    },
  })

  app.on('error', err => { throw new Error(`[E2E-PROD] Failed to launch app: ${err.message}`) })

  if (!app.pid) throw new Error('[E2E-PROD] App process has no PID — binary may be missing')
  process.env.E2E_PROD_APP_PID = String(app.pid)

  console.log(`[E2E-PROD] App PID ${app.pid} — waiting for CDP on :${CDP_PORT}...`)
  await waitForCDP(CDP_PORT)
  console.log('[E2E-PROD] CDP ready.')
}
