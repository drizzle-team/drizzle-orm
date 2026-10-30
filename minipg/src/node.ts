// minipg for Node.js / Bun — `import { connect, createPool } from 'minipg/node'`.
// Explicit alias of the default entry: the native net/tls transport. (Bun implements node:net, so it
// uses this too; a Bun.connect-based transport could be added later if it measures faster.)
export * from './index.ts'
