// Import-resolution smoke test for the packed @drizzle-team/postgres tarball.
// Installs the tarball into a scratch dir and dynamic-imports every subpath
// export from there, under node — Bun's resolver is more permissive and would
// mask exports-map bugs that break Node consumers.
//   node scripts/smoke-pack.mjs <path-to-tgz>
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const tgz = process.argv[2]
if (!tgz) {
  console.error('usage: node scripts/smoke-pack.mjs <tgz>')
  process.exit(2)
}

const PKG = '@drizzle-team/postgres'

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'postgres-smoke-'))
process.on('exit', () => fs.rmSync(scratch, { recursive: true, force: true }))
execFileSync('npm', ['init', '-y'], { cwd: scratch, stdio: 'ignore' })
execFileSync('npm', ['i', path.resolve(tgz)], { cwd: scratch, stdio: 'ignore' })

// Derived from the installed tarball's own manifest, not hand-mirrored from package.json,
// so a new export added upstream is smoke-tested automatically.
const manifest = JSON.parse(fs.readFileSync(path.join(scratch, 'node_modules', PKG, 'package.json'), 'utf8'))
// The ./effect subpaths need the optional peer dependency, as a consumer of them would install it.
for (const [name, range] of Object.entries(manifest.peerDependencies ?? {})) {
  execFileSync('npm', ['i', `${name}@${range}`], { cwd: scratch, stdio: 'ignore' })
}
const subpaths = Object.keys(manifest.exports).map((k) => k.replace(/^\./, ''))

// src/cf.ts statically imports cloudflare:sockets, which Node cannot resolve.
const probe = `
const PKG = ${JSON.stringify(PKG)}
const subpaths = ${JSON.stringify(subpaths)}
const expectedFail = { '/cf': 'ERR_UNSUPPORTED_ESM_URL_SCHEME', '/effect/cf': 'ERR_UNSUPPORTED_ESM_URL_SCHEME' }
let failed = false
for (const s of subpaths) {
  try {
    await import(\`\${PKG}\${s}\`)
    if (expectedFail[s]) { console.error(\`unexpectedly resolved: \${PKG}\${s}\`); failed = true }
  } catch (e) {
    const expected = expectedFail[s]
    if (!expected || e.code !== expected) { console.error(\`\${PKG}\${s}: \${e.code ?? e.name} \${e.message}\`); failed = true }
  }
}
process.exit(failed ? 1 : 0)
`
fs.writeFileSync(path.join(scratch, 'probe.mjs'), probe)

// CJS consumers load the ESM build through require(esm) (Node >=22.12), so every subpath must resolve
// under the `require` condition too — an `import`-only entry fails with ERR_PACKAGE_PATH_NOT_EXPORTED.
// '/cf' and '/effect/cf' are only resolved: require() of their cloudflare:sockets import trips a Node
// internal assertion.
const required = `
const PKG = ${JSON.stringify(PKG)}
const subpaths = ${JSON.stringify(subpaths)}
let failed = false
for (const s of subpaths) {
  try {
    if (s === '/cf' || s === '/effect/cf') require.resolve(PKG + s)
    else require(PKG + s)
  } catch (e) { console.error(\`require \${PKG}\${s}: \${e.code ?? e.name} \${e.message}\`); failed = true }
}
process.exit(failed ? 1 : 0)
`
fs.writeFileSync(path.join(scratch, 'required.cjs'), required)

// The root entry and ./effect route by runtime condition and have NO fallback on purpose: a target
// without TCP (browser, edge-light) must fail to resolve them at build time. `import`/`default` would be
// a fallback.
const routedSubpaths = ['', '/effect']
for (const s of routedSubpaths) {
  const fallback = ['import', 'default', 'require'].filter((k) => k in manifest.exports[`.${s}`])
  if (fallback.length > 0) {
    console.error(`.${s} export has a fallback condition (${fallback.join(', ')}) — it must stay strict`)
    process.exit(1)
  }
}

// Under the `workerd` condition both must land on their Cloudflare entry — proven the same way as
// '/cf' above: that file statically imports cloudflare:sockets, which Node cannot resolve.
const routed = `
for (const s of ${JSON.stringify(routedSubpaths)}) {
  try {
    await import(${JSON.stringify(PKG)} + s)
    console.error(\`\${s || 'root'} under --conditions=workerd resolved to a node-loadable file, expected the cf entry\`)
    process.exit(1)
  } catch (e) {
    if (e.code !== 'ERR_UNSUPPORTED_ESM_URL_SCHEME') { console.error(\`\${s || 'root'} under workerd: \${e.code ?? e.name} \${e.message}\`); process.exit(1) }
  }
}
`
fs.writeFileSync(path.join(scratch, 'routed.mjs'), routed)

// The Deno entries load under Node, so the `deno` routing is checked by the resolved path instead.
const routedDeno = `
for (const s of ${JSON.stringify(routedSubpaths)}) {
  const resolved = import.meta.resolve(${JSON.stringify(PKG)} + s)
  if (!resolved.endsWith(\`/dist\${s}/deno.js\`)) { console.error(\`\${s || 'root'} under --conditions=deno resolved to \${resolved}\`); process.exit(1) }
}
`
fs.writeFileSync(path.join(scratch, 'routed-deno.mjs'), routedDeno)

try {
  execFileSync('node', ['probe.mjs'], { cwd: scratch, stdio: 'inherit' })
  execFileSync('node', ['required.cjs'], { cwd: scratch, stdio: 'inherit' })
  execFileSync('node', ['--conditions=workerd', 'routed.mjs'], { cwd: scratch, stdio: 'inherit' })
  execFileSync('node', ['--conditions=deno', 'routed-deno.mjs'], { cwd: scratch, stdio: 'inherit' })
  process.exit(0)
} catch {
  process.exit(1)
}
