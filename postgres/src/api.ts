// The public API minus connect/createPool — what every TCP entry (core, cf, deno) re-exports next to
// its OWN connect/createPool. Kept separate so no entry has to shadow a star export: `export *`
// over a same-named local export is spec-legal, but some module transforms resolve it the wrong way.
export { Connection } from './connection.ts';
export type { TxFn } from './connection.ts';
export { Cursor } from './cursor.ts';
export type { CursorOptions } from './cursor.ts';
export { defaultDecoders } from './decode.ts';
export { isRawParams, type RawParams, rawParams } from './encode.ts';
export { PgError } from './errors.ts';
export { Collect, CollectNullable, Json, JsonArray, Jsonb, JsonbArray, Nullable, Transform } from './json.ts';
export type {
	CollectMarker,
	JsonMarker,
	JsonSpec,
	JsTarget,
	NullableMarker,
	SpecEntries,
	TransformMarker,
} from './json.ts';
export { Pool } from './pool.ts';
export { PoolQuery } from './pool.ts';
export {
	type CustomMarker,
	type CustomType,
	type CustomTypeDef,
	defineType,
	isCustomMarker,
	type RawCell,
} from './registry.ts';
export {
	batchTransactions,
	InvalidReplicationShape,
	InvalidSlotName,
	lsnFromString,
	lsnToString,
	PublicationEmpty,
	PublicationMissing,
	replication,
	ReplicationBusy,
	ReplicationConnection,
	ReplicationReceiveTimeout,
	ReplicationSessionSpent,
	ReplicationStreamEnded,
} from './replication.ts';
export type {
	ReplicationConfig,
	ReplicationEvent,
	ReplicationRelation,
	ReplicationWarning,
	Row,
	StartOptions,
	TableShape,
	TransactionBatch,
} from './replication.ts';
export { Shape } from './shape.ts';
export type { ShapeMapper } from './shape.ts';
export type { PgType, ShapeEntries, ShapeSpec, ShapeValue, TypeSpec } from './spec.ts';
export type {
	ConnectConfig,
	Decoder,
	Field,
	PoolConfig,
	PostgresSocket,
	QueryOptions,
	QueryResult,
	ResultMode,
	StreamOptions,
	Transport,
	TransportTarget,
	TxOptions,
} from './types.ts';
export { parseConnectionString } from './url.ts';
