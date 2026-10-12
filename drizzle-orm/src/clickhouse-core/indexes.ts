import { entityKind } from '~/entity.ts';
import type { SQL } from '~/sql/sql.ts';
import { sql } from '~/sql/sql.ts';
import type { ClickHouseColumn } from './columns/common.ts';
import type { ClickHouseTable } from './table.ts';

/**
 * The data-skipping index types ClickHouse supports.
 *
 * These are not row-lookup indexes: each one summarises a block of `GRANULARITY × index_granularity`
 * rows so that blocks which cannot match a predicate are skipped entirely.
 */
export type ClickHouseIndexType =
	| 'minmax'
	| 'set'
	| 'bloom_filter'
	| 'ngrambf_v1'
	| 'tokenbf_v1';

export interface IndexConfig {
	name: string;
	/** The expression the index summarises. */
	expressions: (ClickHouseColumn | SQL)[];
	type: ClickHouseIndexType;
	/** Positional arguments for the index type, e.g. the false-positive rate of `bloom_filter`. */
	typeArgs: number[];
	/** How many table granules each index granule covers. */
	granularity: number | undefined;
}

export class IndexBuilderOn {
	static readonly [entityKind]: string = 'ClickHouseIndexBuilderOn';

	constructor(private name: string) {}

	/** The column or expression to index. */
	on(...expressions: (ClickHouseColumn | SQL)[]): IndexBuilder {
		if (expressions.length === 0) {
			throw new Error(`Index "${this.name}" must be declared on at least one column or expression`);
		}
		return new IndexBuilder(this.name, expressions);
	}
}

export class IndexBuilder {
	static readonly [entityKind]: string = 'ClickHouseIndexBuilder';

	/** @internal */
	config: IndexConfig;

	constructor(name: string, expressions: (ClickHouseColumn | SQL)[]) {
		this.config = {
			name,
			expressions,
			// `minmax` is the cheapest index and the one that helps most often, so it is the default.
			type: 'minmax',
			typeArgs: [],
			granularity: undefined,
		};
	}

	/** `TYPE minmax` — stores the extremes of the expression per granule. */
	minmax(): this {
		this.config.type = 'minmax';
		this.config.typeArgs = [];
		return this;
	}

	/**
	 * `TYPE set(max_rows)` — stores up to `maxRows` distinct values per granule, or all of them when
	 * `maxRows` is `0`.
	 */
	set(maxRows: number): this {
		this.config.type = 'set';
		this.config.typeArgs = [maxRows];
		return this;
	}

	/** `TYPE bloom_filter([false_positive_rate])` — a Bloom filter over the expression's values. */
	bloomFilter(falsePositiveRate?: number): this {
		this.config.type = 'bloom_filter';
		this.config.typeArgs = falsePositiveRate === undefined ? [] : [falsePositiveRate];
		return this;
	}

	/**
	 * `TYPE ngrambf_v1(n, size_of_bloom_filter_in_bytes, number_of_hash_functions, random_seed)` — a
	 * Bloom filter over character n-grams, which speeds up `LIKE` and substring searches.
	 */
	ngrambf(
		n: number,
		sizeOfBloomFilterInBytes: number,
		numberOfHashFunctions: number,
		randomSeed: number,
	): this {
		this.config.type = 'ngrambf_v1';
		this.config.typeArgs = [n, sizeOfBloomFilterInBytes, numberOfHashFunctions, randomSeed];
		return this;
	}

	/**
	 * `TYPE tokenbf_v1(size_of_bloom_filter_in_bytes, number_of_hash_functions, random_seed)` — like
	 * {@link ngrambf} but tokenised on non-alphanumeric characters.
	 */
	tokenbf(
		sizeOfBloomFilterInBytes: number,
		numberOfHashFunctions: number,
		randomSeed: number,
	): this {
		this.config.type = 'tokenbf_v1';
		this.config.typeArgs = [sizeOfBloomFilterInBytes, numberOfHashFunctions, randomSeed];
		return this;
	}

	/** `GRANULARITY n` — how many table granules each index entry covers. Defaults to `1`. */
	granularity(value: number): this {
		this.config.granularity = value;
		return this;
	}

	/** @internal */
	build(table: ClickHouseTable): Index {
		return new Index(this.config, table);
	}
}

export class Index {
	static readonly [entityKind]: string = 'ClickHouseIndex';

	readonly config: IndexConfig & { table: ClickHouseTable };

	constructor(config: IndexConfig, table: ClickHouseTable) {
		this.config = { ...config, table };
	}

	/** Renders the `INDEX …` entry as it appears inside `CREATE TABLE`. */
	getSQL(): SQL {
		const { name, expressions, type, typeArgs, granularity } = this.config;
		const expression = expressions.length === 1
			? sql`${expressions[0]!}`
			: sql`(${sql.join(expressions, sql`, `)})`;
		const typeSQL = typeArgs.length > 0
			? sql`${sql.raw(type)}(${sql.raw(typeArgs.join(', '))})`
			: sql`${sql.raw(type)}`;
		return sql`INDEX ${sql.identifier(name)} ${expression} TYPE ${typeSQL} GRANULARITY ${
			sql.raw(String(granularity ?? 1))
		}`;
	}
}

export type AnyIndexBuilder = IndexBuilder;

/**
 * Declares a data-skipping index.
 *
 * ```ts
 * index('idx_url').on(t.url).bloomFilter(0.01).granularity(4)
 * index('idx_ts').on(t.ts).minmax()
 * ```
 */
export function index(name: string): IndexBuilderOn {
	return new IndexBuilderOn(name);
}

export interface ProjectionConfig {
	name: string;
	/** The projection's query, without the surrounding `SELECT` keyword being implied. */
	query: SQL;
}

export class ProjectionBuilder {
	static readonly [entityKind]: string = 'ClickHouseProjectionBuilder';

	/** @internal */
	config: ProjectionConfig | undefined;

	constructor(private name: string) {}

	/** The projection body, e.g. ``sql`SELECT url, count() GROUP BY url` ``. */
	as(query: SQL): this {
		this.config = { name: this.name, query };
		return this;
	}

	/** @internal */
	build(table: ClickHouseTable): Projection {
		if (!this.config) {
			throw new Error(`Projection "${this.name}" is missing its query; call .as(sql\`…\`)`);
		}
		return new Projection(this.config, table);
	}
}

export class Projection {
	static readonly [entityKind]: string = 'ClickHouseProjection';

	readonly config: ProjectionConfig & { table: ClickHouseTable };

	constructor(config: ProjectionConfig, table: ClickHouseTable) {
		this.config = { ...config, table };
	}

	/** Renders the `PROJECTION …` entry as it appears inside `CREATE TABLE`. */
	getSQL(): SQL {
		return sql`PROJECTION ${sql.identifier(this.config.name)} (${this.config.query})`;
	}
}

/**
 * Declares a projection — an alternate physical ordering or pre-aggregation of the table that
 * ClickHouse maintains automatically and picks up when it makes a query cheaper.
 *
 * ```ts
 * projection('by_url').as(sql`SELECT url, count() GROUP BY url`)
 * ```
 */
export function projection(name: string): ProjectionBuilder {
	return new ProjectionBuilder(name);
}
