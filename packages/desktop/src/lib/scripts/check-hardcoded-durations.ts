#!/usr/bin/env tsx
// CI lint: fails if any .svelte or .css file contains hardcoded ms/s animation durations
// Exceptions: SplashScreen.svelte (intentional splash-sequence timings: 700ms, 1400ms)
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, extname, relative } from 'node:path'

const SCAN_DIR = 'src/lib/components'
const EXTENSIONS = ['.svelte', '.css', '.ts']
const HARDCODED_RE = /(?:transition|animation)\s*:[^;]*\b(\d+\.?\d*)(ms|s)\b(?![^)]*\))/g
const EXCEPTIONS = ['SplashScreen.svelte']

function scan(dir: string): string[] {
  const violations: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      violations.push(...scan(full))
    } else if (EXTENSIONS.includes(extname(full))) {
      if (EXCEPTIONS.some(ex => full.endsWith(ex))) continue
      const content = readFileSync(full, 'utf8')
      let match: RegExpExecArray | null
      HARDCODED_RE.lastIndex = 0
      const lines = content.split('\n')
      for (let i = 0; i < lines.length; i++) {
        HARDCODED_RE.lastIndex = 0
        while ((match = HARDCODED_RE.exec(lines[i])) !== null) {
          if (!lines[i].includes('var(--dur')) {
            violations.push(`${relative(process.cwd(), full)}:${i + 1}: hardcoded ${match[1]}${match[2]} — use var(--dur-*)`)
          }
        }
      }
    }
  }
  return violations
}

const violations = scan(SCAN_DIR)
if (violations.length > 0) {
  console.error('Hardcoded animation durations found:')
  violations.forEach(v => console.error('  ' + v))
  process.exit(1)
} else {
  console.log('✓ No hardcoded animation durations found')
}
