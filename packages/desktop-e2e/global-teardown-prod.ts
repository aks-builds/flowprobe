export default async function globalTeardown() {
  const pid = Number(process.env.E2E_PROD_APP_PID)
  if (!pid) return
  try {
    process.kill(pid)
    console.log(`[E2E-PROD] Killed app process PID ${pid}`)
  } catch {
    // process may have already exited — not an error
  }
}
