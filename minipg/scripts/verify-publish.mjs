// Packaging gauntlet for @drizzle-team/minipg: packs the tree exactly as found
// and runs four independent validators against that one tarball. Consumes
// dist/ as-is and never builds — tsdown's clean:true would regenerate any
// file removed from dist/, which would make a deleted-file check untestable.
//   node scripts/verify-publish.mjs   (or: bun run verify:publish)
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'minipg-verify-'))
process.on('exit', () => fs.rmSync(tmp, { recursive: true, force: true }))
execFileSync('npm', ['pack', '--pack-destination', tmp], { stdio: 'inherit' })
// scoped names flatten: @drizzle-team/minipg -> drizzle-team-minipg-<version>.tgz
const tgz = path.join(tmp, fs.readdirSync(tmp).find((f) => f.endsWith('.tgz')))

const bin = (name) => path.join(process.cwd(), 'node_modules', '.bin', name)

const validators = [
  ['publint', bin('publint'), [tgz, '--strict']],
  ['attw', bin('attw'), [tgz, '--profile', 'esm-only']],
  ['pack-check', 'node', ['scripts/pack-check.mjs', tgz]],
  ['smoke-pack', 'node', ['scripts/smoke-pack.mjs', tgz]],
]

let failed = false
for (const [name, cmd, args] of validators) {
  try {
    execFileSync(cmd, args, { stdio: 'inherit' })
  } catch {
    console.error(`verify:publish — ${name} failed`)
    failed = true
  }
}

process.exit(failed ? 1 : 0)
