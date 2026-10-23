// ./effect/core must load on runtimes without node:net and node:tls, such as Cloudflare Workers.
import { test, expect } from 'bun:test'
import { fileURLToPath } from 'node:url'

test('./effect/core pulls in no Node transport', async () => {
  const result = await Bun.build({
    entrypoints: [fileURLToPath(new URL('../../src/effect/core.ts', import.meta.url))],
    external: ['effect', 'node:*'],
    target: 'browser',
  })
  expect(result.success).toBe(true)
  const code = await result.outputs[0]!.text()
  expect(code).not.toMatch(/node:net|node:tls/)
})
