// The public API minus connect/createPool — what every TCP entry (core, cf, deno) re-exports next to
// its OWN connect/createPool. Kept separate so no entry has to shadow a star export: `export *`
// over a same-named local export is spec-legal, but some module transforms resolve it the wrong way.
export { Connection } from './connection.ts'
export { Pool } from './pool.ts'
export { replication, ReplicationConnection, ReplicationStreamEnded, ReplicationSessionSpent, ReplicationReceiveTimeout, InvalidSlotName, ReplicationBusy, PublicationMissing, PublicationEmpty, InvalidReplicationShape, lsnToString, lsnFromString, batchTransactions } from './replication.ts'
export { Cursor } from './cursor.ts'
export type { CursorOptions } from './cursor.ts'
export type { ReplicationConfig, ReplicationEvent, ReplicationRelation, ReplicationWarning, StartOptions, TableShape, Row, TransactionBatch } from './replication.ts'
export { PoolQuery } from './pool.ts'
export { parseConnectionString } from './url.ts'
export { PgError } from './errors.ts'
export { defaultDecoders } from './decode.ts'
export { rawParams, isRawParams, type RawParams } from './encode.ts'
export { defineType, isCustomMarker, type CustomMarker, type CustomType, type CustomTypeDef, type RawCell } from './registry.ts'
export { Shape } from './shape.ts'
export type { ShapeMapper } from './shape.ts'
export type { ShapeSpec, ShapeEntries, ShapeValue, TypeSpec, PgType } from './spec.ts'
export { Json, JsonArray, Jsonb, JsonbArray, Collect, CollectNullable, Transform, Nullable } from './json.ts'
export type { JsonSpec, SpecEntries, JsonMarker, JsTarget, CollectMarker, TransformMarker, NullableMarker } from './json.ts'
export type {
  ConnectConfig, PoolConfig, QueryOptions, StreamOptions, TxOptions,
  QueryResult, ResultMode, Decoder, Field, MinipgSocket, Transport, TransportTarget,
} from './types.ts'
export type { TxFn } from './connection.ts'
