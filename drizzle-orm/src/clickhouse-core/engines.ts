import { entityKind } from '~/entity.ts';
import type { SQL } from '~/sql/sql.ts';
import { sql } from '~/sql/sql.ts';
import type { ClickHouseColumn } from './columns/common.ts';

/** An expression usable in `ORDER BY`, `PARTITION BY`, `PRIMARY KEY` or `SAMPLE BY`. */
export type ClickHouseExpression = ClickHouseColumn | SQL;

/** One or more key expressions. A bare value is treated as a single-element key. */
export type ClickHouseKey = ClickHouseExpression | ClickHouseExpression[];

/** Values accepted in a table's `SETTINGS` clause. */
export type ClickHouseSettings = Record<string, string | number | boolean>;

/**
 * The table-level clauses the MergeTree family accepts after `ENGINE = …`.
 *
 * Log-family, `Memory` and integration engines accept none of these, which is why they are typed onto
 * the MergeTree factories rather than onto the engine base.
 */
export interface MergeTreeOptions {
	/**
	 * `ORDER BY` — the sorting key, which determines on-disk order and the granule index.
	 *
	 * MergeTree requires one. Omitting it emits `ORDER BY tuple()`, ClickHouse's way of spelling "no
	 * sorting key", which is only appropriate for tables you never filter on a key.
	 */
	orderBy?: ClickHouseKey;

	/** `PARTITION BY` — the partitioning key. Keep the cardinality low; monthly is a common choice. */
	partitionBy?: ClickHouseKey;

	/**
	 * `PRIMARY KEY` — the sparse index key.
	 *
	 * Defaults to the sorting key, and only needs to be given when it should be a *prefix* of
	 * `ORDER BY` rather than equal to it.
	 */
	primaryKey?: ClickHouseKey;

	/** `SAMPLE BY` — the sampling key. Must be present in the primary key. */
	sampleBy?: ClickHouseKey;

	/** `TTL` — when rows expire, e.g. ``sql`createdAt + INTERVAL 90 DAY` ``. */
	ttl?: SQL;

	/** `SETTINGS` — engine settings such as `index_granularity`. */
	settings?: ClickHouseSettings;

	/**
	 * Wraps the engine in its `Replicated…` variant.
	 *
	 * On ClickHouse Cloud and on servers with a configured default replication path both fields can be
	 * omitted, and `ENGINE = ReplicatedMergeTree` is emitted without arguments.
	 */
	replicated?: {
		/** The ZooKeeper/Keeper path, e.g. `'/clickhouse/tables/{shard}/events'`. */
		zooPath?: string;
		/** The replica name, e.g. `'{replica}'`. */
		replicaName?: string;
	};
}

function toExpressionList(key: ClickHouseKey | undefined): ClickHouseExpression[] | undefined {
	if (key === undefined) return undefined;
	return Array.isArray(key) ? key : [key];
}

/**
 * A ClickHouse table engine together with the table-level clauses that follow it.
 *
 * Instances are produced by {@link mergeTree} and friends and are declared in a table's extra-config
 * array:
 *
 * ```ts
 * export const events = clickhouseTable('events', {
 * 	id: uint64().notNull(),
 * 	ts: dateTime({ timezone: 'UTC' }).notNull(),
 * }, (t) => [
 * 	mergeTree({ orderBy: [t.ts, t.id], partitionBy: sql`toYYYYMM(${t.ts})` }),
 * ]);
 * ```
 */
export class ClickHouseTableEngine {
	static readonly [entityKind]: string = 'ClickHouseTableEngine';

	readonly orderBy: ClickHouseExpression[] | undefined;
	readonly partitionBy: ClickHouseExpression[] | undefined;
	readonly primaryKey: ClickHouseExpression[] | undefined;
	readonly sampleBy: ClickHouseExpression[] | undefined;
	readonly ttl: SQL | undefined;
	readonly settings: ClickHouseSettings | undefined;

	constructor(
		/** The engine name as it appears after `ENGINE = `, e.g. `ReplacingMergeTree`. */
		readonly name: string,
		/** Positional engine arguments, e.g. the version column of `ReplacingMergeTree`. */
		readonly args: ClickHouseExpression[] = [],
		options: MergeTreeOptions = {},
	) {
		this.orderBy = toExpressionList(options.orderBy);
		this.partitionBy = toExpressionList(options.partitionBy);
		this.primaryKey = toExpressionList(options.primaryKey);
		this.sampleBy = toExpressionList(options.sampleBy);
		this.ttl = options.ttl;
		this.settings = options.settings;
	}

	/** Whether this engine belongs to the MergeTree family and therefore takes a sorting key. */
	get isMergeTree(): boolean {
		return this.name.endsWith('MergeTree');
	}

	/** Renders `ENGINE = <name>(<args>)`. */
	getEngineSQL(): SQL {
		const engine = sql.raw(this.name);
		return this.args.length > 0
			? sql`ENGINE = ${engine}(${sql.join(this.args, sql`, `)})`
			: sql`ENGINE = ${engine}`;
	}

	/**
	 * Renders the clauses that follow the engine, in the order ClickHouse expects them.
	 *
	 * Returns `undefined` when the engine takes no clauses at all — `Memory`, the Log family and the
	 * integration engines.
	 */
	getClausesSQL(): SQL | undefined {
		const chunks: SQL[] = [];

		if (this.partitionBy) {
			chunks.push(sql`PARTITION BY ${keySQL(this.partitionBy)}`);
		}

		if (this.isMergeTree) {
			// MergeTree tables must declare a sorting key; `tuple()` is how ClickHouse spells "none".
			chunks.push(sql`ORDER BY ${this.orderBy ? keySQL(this.orderBy) : sql`tuple()`}`);
		} else if (this.orderBy) {
			chunks.push(sql`ORDER BY ${keySQL(this.orderBy)}`);
		}

		if (this.primaryKey) {
			chunks.push(sql`PRIMARY KEY ${keySQL(this.primaryKey)}`);
		}

		if (this.sampleBy) {
			chunks.push(sql`SAMPLE BY ${keySQL(this.sampleBy)}`);
		}

		if (this.ttl) {
			chunks.push(sql`TTL ${this.ttl}`);
		}

		if (this.settings && Object.keys(this.settings).length > 0) {
			chunks.push(sql`SETTINGS ${settingsSQL(this.settings)}`);
		}

		return chunks.length > 0 ? sql.join(chunks, sql` `) : undefined;
	}
}

/** Renders a key as a bare expression when it has one element, or a tuple when it has several. */
export function keySQL(expressions: ClickHouseExpression[]): SQL {
	return expressions.length === 1
		? sql`${expressions[0]!}`
		: sql`(${sql.join(expressions, sql`, `)})`;
}

/** Renders `name = value` pairs for a `SETTINGS` clause. */
export function settingsSQL(settings: ClickHouseSettings): SQL {
	return sql.join(
		Object.entries(settings).map(([name, value]) =>
			sql`${sql.raw(name)} = ${typeof value === 'boolean' ? sql.raw(value ? '1' : '0') : value}`
		),
		sql`, `,
	);
}

function mergeTreeFactory(baseName: string) {
	return (options: MergeTreeOptions = {}, args: ClickHouseExpression[] = []): ClickHouseTableEngine => {
		const { replicated } = options;
		if (!replicated) {
			return new ClickHouseTableEngine(baseName, args, options);
		}

		const replicationArgs: ClickHouseExpression[] = [];
		if (replicated.zooPath !== undefined) {
			replicationArgs.push(sql`${replicated.zooPath}`);
		}
		if (replicated.replicaName !== undefined) {
			replicationArgs.push(sql`${replicated.replicaName}`);
		}
		return new ClickHouseTableEngine(`Replicated${baseName}`, [...replicationArgs, ...args], options);
	};
}

const buildMergeTree = mergeTreeFactory('MergeTree');
const buildReplacingMergeTree = mergeTreeFactory('ReplacingMergeTree');
const buildSummingMergeTree = mergeTreeFactory('SummingMergeTree');
const buildAggregatingMergeTree = mergeTreeFactory('AggregatingMergeTree');
const buildCollapsingMergeTree = mergeTreeFactory('CollapsingMergeTree');
const buildVersionedCollapsingMergeTree = mergeTreeFactory('VersionedCollapsingMergeTree');

/**
 * `MergeTree` — the default engine, and the right choice for almost every analytical table.
 */
export function mergeTree(options: MergeTreeOptions = {}): ClickHouseTableEngine {
	return buildMergeTree(options);
}

export interface ReplacingMergeTreeOptions extends MergeTreeOptions {
	/**
	 * The column that decides which of two rows with the same sorting key wins — the largest value is
	 * kept. Defaults to "the last row inserted".
	 */
	version?: ClickHouseExpression;
	/** A `UInt8` column marking a row as deleted; requires `version`. */
	isDeleted?: ClickHouseExpression;
}

/**
 * `ReplacingMergeTree` — deduplicates rows sharing a sorting key during background merges.
 *
 * Deduplication is eventual, so reads either need `FINAL` or have to tolerate duplicates.
 */
export function replacingMergeTree(options: ReplacingMergeTreeOptions = {}): ClickHouseTableEngine {
	const args: ClickHouseExpression[] = [];
	if (options.version !== undefined) args.push(options.version);
	if (options.isDeleted !== undefined) {
		if (options.version === undefined) {
			throw new Error('ReplacingMergeTree: `isDeleted` requires `version` to be set as well');
		}
		args.push(options.isDeleted);
	}
	return buildReplacingMergeTree(options, args);
}

export interface SummingMergeTreeOptions extends MergeTreeOptions {
	/** The numeric columns to sum. Defaults to every numeric column outside the sorting key. */
	columns?: ClickHouseExpression[];
}

/** `SummingMergeTree` — collapses rows sharing a sorting key by summing their numeric columns. */
export function summingMergeTree(options: SummingMergeTreeOptions = {}): ClickHouseTableEngine {
	const args = options.columns?.length ? [keySQL(options.columns)] : [];
	return buildSummingMergeTree(options, args);
}

/** `AggregatingMergeTree` — collapses rows sharing a sorting key using `AggregateFunction` states. */
export function aggregatingMergeTree(options: MergeTreeOptions = {}): ClickHouseTableEngine {
	return buildAggregatingMergeTree(options);
}

export interface CollapsingMergeTreeOptions extends MergeTreeOptions {
	/** The `Int8` sign column: `1` marks a state row, `-1` marks its cancellation. */
	sign: ClickHouseExpression;
}

/** `CollapsingMergeTree` — cancels out pairs of rows with opposite `sign` values during merges. */
export function collapsingMergeTree(options: CollapsingMergeTreeOptions): ClickHouseTableEngine {
	return buildCollapsingMergeTree(options, [options.sign]);
}

export interface VersionedCollapsingMergeTreeOptions extends CollapsingMergeTreeOptions {
	/** The version column, so that rows collapse correctly even when inserted out of order. */
	version: ClickHouseExpression;
}

/** `VersionedCollapsingMergeTree` — `CollapsingMergeTree` that tolerates out-of-order inserts. */
export function versionedCollapsingMergeTree(
	options: VersionedCollapsingMergeTreeOptions,
): ClickHouseTableEngine {
	return buildVersionedCollapsingMergeTree(options, [options.sign, options.version]);
}

/** `Memory` — rows live in RAM only and are lost on restart. Useful for tests and staging data. */
export function memory(): ClickHouseTableEngine {
	return new ClickHouseTableEngine('Memory');
}

/** `Log` — a simple append-only engine for small tables written once and read whole. */
export function log(): ClickHouseTableEngine {
	return new ClickHouseTableEngine('Log');
}

/** `TinyLog` — the simplest engine; one file per column, no concurrent reads. */
export function tinyLog(): ClickHouseTableEngine {
	return new ClickHouseTableEngine('TinyLog');
}

/** `StripeLog` — a log engine that stores all columns in a single file. */
export function stripeLog(): ClickHouseTableEngine {
	return new ClickHouseTableEngine('StripeLog');
}

/** `Null` — discards everything written to it. Useful as the source of a materialized view. */
export function nullEngine(): ClickHouseTableEngine {
	return new ClickHouseTableEngine('Null');
}

/** `Set` — an in-memory set, usable only on the right-hand side of `IN`. */
export function setEngine(): ClickHouseTableEngine {
	return new ClickHouseTableEngine('Set');
}

export interface DistributedOptions {
	/** The cluster name as defined in the server's `remote_servers` config. */
	cluster: string;
	/** The database holding the local shard tables. */
	database: string;
	/** The local table on each shard. */
	table: string;
	/** How rows are routed to shards, e.g. ``sql`rand()` ``. */
	shardingKey?: ClickHouseExpression;
	/** The policy name for storing temporary files during asynchronous sends. */
	policyName?: string;
}

/** `Distributed` — a view over shards of the same table on every node of a cluster. */
export function distributed(options: DistributedOptions): ClickHouseTableEngine {
	const args: ClickHouseExpression[] = [
		sql`${options.cluster}`,
		sql`${options.database}`,
		sql`${options.table}`,
	];
	if (options.shardingKey !== undefined) args.push(options.shardingKey);
	if (options.policyName !== undefined) {
		if (options.shardingKey === undefined) {
			throw new Error('Distributed: `policyName` requires `shardingKey` to be set as well');
		}
		args.push(sql`${options.policyName}`);
	}
	return new ClickHouseTableEngine('Distributed', args);
}

/**
 * Any other engine, spelled out by hand.
 *
 * ```ts
 * customEngine('S3', [sql`'https://bucket.s3.amazonaws.com/data/*.csv'`, sql`'CSV'`])
 * ```
 */
export function customEngine(
	name: string,
	args: ClickHouseExpression[] = [],
	options: MergeTreeOptions = {},
): ClickHouseTableEngine {
	return new ClickHouseTableEngine(name, args, options);
}
