import type {
	CollectMarker,
	CustomMarker,
	JsonMarker,
	JsonSpec,
	NullableMarker,
	ShapeEntries,
	ShapeSpec,
	TransformMarker,
	TypeSpec,
} from '#postgres';

// The client reads these markers by their fields, so the driver builds them itself and does not load the
// bundled client for them. A pool from the standalone package then runs the driver's shapes as they are.

export const Collect = (spec: ShapeSpec | ShapeEntries): CollectMarker => ({ __collect: true, nullable: false, spec });

export const CollectNullable = (spec: ShapeSpec | ShapeEntries): CollectMarker => ({
	__collect: true,
	nullable: true,
	spec,
});

export const Json = (spec: JsonSpec): JsonMarker => ({ __json: 'object', type: 'json', spec });

export const JsonArray = (spec: JsonSpec): JsonMarker => ({ __json: 'array', type: 'json', spec });

export const Nullable = (inner: TypeSpec | TransformMarker | JsonMarker | CustomMarker): NullableMarker => ({
	__nullable: true,
	inner,
});

// The client keeps its Transform id counter under the same registered symbol. The id is part of a
// connection's mapper cache key, so the driver and every copy of the client must take ids from one counter.
const transformIdKey = Symbol.for('@drizzle-team/postgres:transformId');

export function Transform(type: TypeSpec, fn: (v: never) => unknown): TransformMarker {
	const ids = globalThis as unknown as Record<symbol, number | undefined>;
	const id = ids[transformIdKey] ?? 0;
	ids[transformIdKey] = id + 1;
	return { __transform: true, id, type, fn };
}
