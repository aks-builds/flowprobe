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
