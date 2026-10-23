// Vercel Fluid-compute compatibility. @vercel/functions attachDatabasePool() duck-types a
// pg-style pool: it reads `pool.options.idleTimeoutMillis` and subscribes `pool.on('release')`
// to keep the function instance alive long enough to drain idle connections. minipg's Pool is
// not an EventEmitter, so this shim grafts that minimal surface onto each instance at
// construction (Pool's constructor calls installVercelCompat; release() fires the notifier).
// Pool itself carries zero Vercel knowledge beyond those two calls — future pg-compat shims
// for other platforms belong in this directory too.
import type { Pool } from '../pool.ts' // type-only: no runtime cycle

/** The attachDatabasePool() detection surface, merged into Pool's type (declaration merge in pool.ts). */
export interface VercelPoolSurface {
  /** pg-compat: attachDatabasePool() reads the idle timeout from here. */
  readonly options: { idleTimeoutMillis: number }
  /** EventEmitter-style subscription (only `'release'` is emitted). */
  on(event: string, listener: (...args: unknown[]) => void): Pool
}

/** Graft the surface onto a pool instance. Returns the notifier the pool calls on every
 *  release() — listener errors never break the pool. */
export function installVercelCompat(pool: Pool, idleTimeoutMillis: number): () => void {
  const listeners = new Map<string, Array<(...args: unknown[]) => void>>()
  const surface = pool as unknown as { options: VercelPoolSurface['options']; on: VercelPoolSurface['on'] }
  surface.options = { idleTimeoutMillis }
  surface.on = (event, listener) => {
    const arr = listeners.get(event) ?? []
    arr.push(listener)
    listeners.set(event, arr)
    return pool
  }
  return () => {
    const arr = listeners.get('release')
    if (arr) for (const l of arr) try { l() } catch { /* listener errors never break the pool */ }
  }
}
