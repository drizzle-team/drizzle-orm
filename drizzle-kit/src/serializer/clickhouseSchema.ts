import { any, boolean, literal, object, record, string, TypeOf, union } from 'zod';
import { mapValues, originUUID } from '../global';

/**
 * A ClickHouse column as it appears in a snapshot.
 *
 * `type` is the fully rendered ClickHouse type, `Nullable(...)` and all — ClickHouse has no separate
 * nullability flag, and the wrapper's position matters (`LowCardinality(Nullable(String))` is not
 * `Nullable(LowCardinality(String))`), so keeping it in the type string is what round-trips.
 */
const column = object({
	name: string(),
	type: string(),
	default: any().optional(),
	/** A `MATERIALIZED` expression: computed on insert and stored. */
	materialized: string().optional(),
	/** An `ALIAS` expression: not stored, computed on read. */
	alias: string().optional(),
	/** An `EPHEMERAL` column: accepted on insert, never stored. */
	ephemeral: boolean().optional(),
	/** The rendered `CODEC(...)` arguments, e.g. `ZSTD(3), Delta`. */
	codec: string().optional(),
	/** A column-level `TTL` expression. */
	ttl: string().optional(),
	comment: string().optional(),
}).strict();

/** A data-skipping index. */
const index = object({
	name: string(),
	expression: string(),
	type: string(),
	granularity: string().optional(),
}).strict();

const projection = object({
	name: string(),
	query: string(),
}).strict();

/**
 * The table engine and the clauses that follow it.
 *
 * None of `orderBy`, `partitionBy`, `primaryKey` or `sampleBy` can be altered after creation (aside
 * from extending the sorting key), so a change to any of them forces the table to be recreated.
 */
const engine = object({
	name: string(),
	args: string().array().default([]),
	orderBy: string().optional(),
	partitionBy: string().optional(),
	primaryKey: string().optional(),
	sampleBy: string().optional(),
	ttl: string().optional(),
	settings: record(string(), string()).default({}),
}).strict();

const table = object({
	name: string(),
	schema: string().default(''),
	columns: record(string(), column),
	indexes: record(string(), index).default({}),
	projections: record(string(), projection).default({}),
	engine: engine,
}).strict();

const dialect = literal('clickhouse');

const schemaHash = object({
	id: string(),
	prevId: string(),
});

export const kitInternals = object({
	tables: record(
		string(),
		object({
			columns: record(
				string(),
				object({ isDefaultAnExpression: boolean().optional() }).optional(),
			),
		}).optional(),
	).optional(),
}).optional();

export const schemaInternal = object({
	version: literal('1'),
	dialect: dialect,
	tables: record(string(), table),
	_meta: object({
		tables: record(string(), string()),
		columns: record(string(), string()),
	}),
	internal: kitInternals,
}).strict();

export const schema = schemaInternal.merge(schemaHash);

const tableSquashed = object({
	name: string(),
	schema: string().default(''),
	columns: record(string(), column),
	indexes: record(string(), string()),
	projections: record(string(), string()),
	engine: string(),
}).strict();

export const schemaSquashed = object({
	version: literal('1'),
	dialect: dialect,
	tables: record(string(), tableSquashed),
}).strict();

export type Column = TypeOf<typeof column>;
export type Index = TypeOf<typeof index>;
export type Projection = TypeOf<typeof projection>;
export type Engine = TypeOf<typeof engine>;
export type Table = TypeOf<typeof table>;
export type ClickHouseSchema = TypeOf<typeof schema>;
export type ClickHouseSchemaInternal = TypeOf<typeof schemaInternal>;
export type ClickHouseSchemaSquashed = TypeOf<typeof schemaSquashed>;
export type ClickHouseKitInternals = TypeOf<typeof kitInternals>;

/**
 * Squashing collapses each nested object to a single string so that the generic differ, which
 * compares record values, reports one change per index/projection/engine rather than a tree of them.
 *
 * JSON is used rather than the `;`-delimited form the other dialects use because ClickHouse
 * expressions routinely contain `;`, `,` and quotes.
 */
export const ClickHouseSquasher = {
	squashIdx: (idx: Index): string => {
		index.parse(idx);
		return JSON.stringify(idx);
	},
	unsquashIdx: (input: string): Index => {
		return index.parse(JSON.parse(input));
	},
	squashProjection: (value: Projection): string => {
		projection.parse(value);
		return JSON.stringify(value);
	},
	unsquashProjection: (input: string): Projection => {
		return projection.parse(JSON.parse(input));
	},
	squashEngine: (value: Engine): string => {
		engine.parse(value);
		return JSON.stringify(value);
	},
	unsquashEngine: (input: string): Engine => {
		return engine.parse(JSON.parse(input));
	},
};

export const squashClickHouseScheme = (json: ClickHouseSchema): ClickHouseSchemaSquashed => {
	const mappedTables = Object.fromEntries(
		Object.entries(json.tables).map((it) => {
			const squashedIndexes = mapValues(it[1].indexes, (index) => ClickHouseSquasher.squashIdx(index));
			const squashedProjections = mapValues(
				it[1].projections,
				(value) => ClickHouseSquasher.squashProjection(value),
			);

			return [it[0], {
				name: it[1].name,
				schema: it[1].schema,
				columns: it[1].columns,
				indexes: squashedIndexes,
				projections: squashedProjections,
				engine: ClickHouseSquasher.squashEngine(it[1].engine),
			}];
		}),
	);

	return {
		version: '1',
		dialect: json.dialect,
		tables: mappedTables,
	};
};

export const clickhouseSchema = schema;
export const clickhouseSchemaSquashed = schemaSquashed;

export const backwardCompatibleClickHouseSchema = union([clickhouseSchema, schema]);

export const dryClickHouse = clickhouseSchema.parse({
	version: '1',
	dialect: 'clickhouse',
	id: originUUID,
	prevId: '',
	tables: {},
	_meta: {
		tables: {},
		columns: {},
	},
});
