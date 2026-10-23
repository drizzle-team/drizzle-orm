// The MinipgClient namespace of /effect/core. Its make, layer and layerConfig need a MinipgTransport in
// context; the runtime entries provide theirs.
import * as Config from 'effect/Config'
import * as Duration from 'effect/Duration'
import * as Effect from 'effect/Effect'
import * as Redacted from 'effect/Redacted'
import { Pool } from '../pool.ts'
import type { PoolConfig, Transport } from '../types.ts'
import { fromPool, layerFrom, toSqlError, type MinipgClientConfig } from './MinipgClient.ts'
import { MinipgTransport } from './MinipgTransport.ts'

export * from './MinipgClient.ts'

const toPoolConfig = (config: MinipgClientConfig, transport: Transport) => {
  const toMillis = (duration: Duration.Input | undefined) => (duration === undefined ? undefined : Duration.toMillis(duration))
  return {
    url: config.url && Redacted.value(config.url),
    host: config.host,
    port: config.port,
    path: config.path,
    // The core's `ssl: true` only encrypts, like libpq's sslmode=require, so `true` becomes 'verify-full' here.
    ssl: config.ssl === true ? 'verify-full' : config.ssl,
    database: config.database,
    user: config.username,
    password: config.password && Redacted.value(config.password),
    connectTimeout: toMillis(config.connectTimeout),
    idleTimeoutMillis: toMillis(config.idleTimeout),
    max: config.maxConnections,
    applicationName: config.applicationName,
    decode: config.decode,
    temporal: config.temporal,
    prepare: config.prepare,
    pooler: config.pooler,
    pipeline: config.pipeline,
    types: config.types,
    transport,
  } satisfies PoolConfig
}

/** Creates a client with its own pool, which dials with the MinipgTransport from context. The pool opens
 *  now and ends when the scope closes. */
export const make = (config: MinipgClientConfig) =>
  Effect.flatMap(Effect.service(MinipgTransport), (transport) =>
    fromPool({
      ...config,
      acquire: Effect.acquireRelease(
        Effect.try({ try: () => new Pool(toPoolConfig(config, transport)), catch: (e) => toSqlError(e, 'connect') }),
        (pool) => Effect.promise(() => pool.end()),
      ),
    }))

/** A layer with its own pool, opened when the layer is built and ended when its scope closes. It needs
 *  a MinipgTransport, such as `MinipgTransport.layer` from the runtime's entry point. */
export const layer = (config: MinipgClientConfig) =>
  layerFrom(make(config))

/** Like `layer`, with the settings read from Effect Config. */
export const layerConfig = (config: Config.Wrap<MinipgClientConfig>) =>
  layerFrom(Effect.flatMap(Config.unwrap(config), make))
