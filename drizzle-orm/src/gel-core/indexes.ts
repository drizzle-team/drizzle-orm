import { SQL } from '~/sql/sql.ts';

import { entityKind, is } from '~/entity.ts';
import type { GelColumn, GelExtraConfigColumn } from './columns/index.ts';
import { IndexedColumn } from './columns/index.ts';
import type { GelTable } from './table.ts';

interface IndexConfig {
	name?: string;

	columns: Partial<IndexedColumn | SQL>[];

	/**
	 * If true, the index will be created as `create unique index` instead of `create index`.
	 */
	unique: boolean;

	/**
	 * If true, the index will be created as `create index concurrently` instead of `create index`.
	 */
	concurrently?: boolean;

	/**
	 * If true, the index will be created as `create index ... on only <table>` instead of `create index ... on <table>`.
	 */
	only: boolean;

	/**
	 * Condition for partial index.
	 */
	where?: SQL;

	/**
	 * The optional WITH clause specifies storage parameters for the index
	 */
	with?: Record<string, any>;

	/**
	 * The optional WITH clause method for the index
	 */
	method?: 'btree' | string;
}

export type IndexColumn = GelColumn;

export type GelIndexMethod =
	| 'btree'
	| 'hash'
	| 'gist'
	| 'sGelist'
	| 'gin'
	| 'brin'
	| 'hnsw'
	| 'ivfflat'
	| (string & {});

export type GelIndexOpClass =
	| 'abstime_ops'
	| 'access_method'
	| 'anyarray_eq'
	| 'anyarray_ge'
	| 'anyarray_gt'
	| 'anyarray_le'
	| 'anyarray_lt'
	| 'anyarray_ne'
	| 'bigint_ops'
	| 'bit_ops'
	| 'bool_ops'
	| 'box_ops'
	| 'bpchar_ops'
	| 'char_ops'
	| 'cidr_ops'
	| 'cstring_ops'
	| 'date_ops'
	| 'float_ops'
	| 'int2_ops'
	| 'int4_ops'
	| 'int8_ops'
	| 'interval_ops'
	| 'jsonb_ops'
	| 'macaddr_ops'
	| 'name_ops'
	| 'numeric_ops'
	| 'oid_ops'
	| 'oidint4_ops'
	| 'oidint8_ops'
	| 'oidname_ops'
	| 'oidvector_ops'
	| 'point_ops'
	| 'polygon_ops'
	| 'range_ops'
	| 'record_eq'
	| 'record_ge'
	| 'record_gt'
	| 'record_le'
	| 'record_lt'
	| 'record_ne'
	| 'text_ops'
	| 'time_ops'
	| 'timestamp_ops'
	| 'timestamptz_ops'
	| 'timetz_ops'
	| 'uuid_ops'
	| 'varbit_ops'
	| 'varchar_ops'
	| 'xml_ops'
	| 'vector_l2_ops'
	| 'vector_ip_ops'
	| 'vector_cosine_ops'
	| 'vector_l1_ops'
	| 'bit_hamming_ops'
	| 'bit_jaccard_ops'
	| 'halfvec_l2_ops'
	| 'sparsevec_l2_op'
	| (string & {});

export class IndexBuilderOn {
	static readonly [entityKind]: string = 'GelIndexBuilderOn';

	constructor(private unique: boolean, private name?: string) {}

	on(...columns: [Partial<GelExtraConfigColumn> | SQL, ...Partial<GelExtraConfigColumn | SQL>[]]): IndexBuilder {
		return new IndexBuilder(
			columns.map((it) => {
				if (is(it, SQL)) {
					return it;
				}
				it = it as GelExtraConfigColumn;
				const clonedIndexedColumn = new IndexedColumn(it.name, !!it.keyAsName, it.columnType!, it.indexConfig!);
				it.indexConfig = JSON.parse(JSON.stringify(it.defaultConfig));
				return clonedIndexedColumn;
			}),
			this.unique,
			false,
			this.name,
		);
	}

	onOnly(...columns: [Partial<GelExtraConfigColumn | SQL>, ...Partial<GelExtraConfigColumn | SQL>[]]): IndexBuilder {
		return new IndexBuilder(
			columns.map((it) => {
				if (is(it, SQL)) {
					return it;
				}
				it = it as GelExtraConfigColumn;
				const clonedIndexedColumn = new IndexedColumn(it.name, !!it.keyAsName, it.columnType!, it.indexConfig!);
				it.indexConfig = it.defaultConfig;
				return clonedIndexedColumn;
			}),
			this.unique,
			true,
			this.name,
		);
	}

	/**
	 * Specify what index method to use. Choices are `btree`, `hash`, `gist`, `sGelist`, `gin`, `brin`, or user-installed access methods like `bloom`. The default method is `btree.
	 *
	 * If you have the `Gel_vector` extension installed in your database, you can use the `hnsw` and `ivfflat` options, which are predefined types.
	 *
	 * **You can always specify any string you want in the method, in case Drizzle doesn't have it natively in its types**
	 *
	 * @param method The name of the index method to be used
	 * @param columns
	 * @returns
	 */
	using(
		method: GelIndexMethod,
		...columns: [Partial<GelExtraConfigColumn | SQL>, ...Partial<GelExtraConfigColumn | SQL>[]]
	): IndexBuilder {
		return new IndexBuilder(
			columns.map((it) => {
				if (is(it, SQL)) {
					return it;
				}
				it = it as GelExtraConfigColumn;
				const clonedIndexedColumn = new IndexedColumn(it.name, !!it.keyAsName, it.columnType!, it.indexConfig!);
				it.indexConfig = JSON.parse(JSON.stringify(it.defaultConfig));
				return clonedIndexedColumn;
			}),
			this.unique,
			true,
			this.name,
			method,
		);
	}
}

export interface AnyIndexBuilder {
	build(table: GelTable): Index;
}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface IndexBuilder extends AnyIndexBuilder {}

export class IndexBuilder implements AnyIndexBuilder {
	static readonly [entityKind]: string = 'GelIndexBuilder';

	/** @internal */
	config: IndexConfig;

	constructor(
		columns: Partial<IndexedColumn | SQL>[],
		unique: boolean,
		only: boolean,
		name?: string,
		method: string = 'btree',
	) {
		this.config = {
			name,
			columns,
			unique,
			only,
			method,
		};
	}

	concurrently(): this {
		this.config.concurrently = true;
		return this;
	}

	with(obj: Record<string, any>): this {
		this.config.with = obj;
		return this;
	}

	where(condition: SQL): this {
		this.config.where = condition;
		return this;
	}

	/** @internal */
	build(table: GelTable): Index {
		return new Index(this.config, table);
	}
}

export class Index {
	static readonly [entityKind]: string = 'GelIndex';

	readonly config: IndexConfig & { table: GelTable };

	constructor(config: IndexConfig, table: GelTable) {
		this.config = { ...config, table };
	}
}

export type GetColumnsTableName<TColumns> = TColumns extends GelColumn ? TColumns['_']['name']
	: TColumns extends GelColumn[] ? TColumns[number]['_']['name']
	: never;

export function index(name?: string): IndexBuilderOn {
	return new IndexBuilderOn(false, name);
}

export function uniqueIndex(name?: string): IndexBuilderOn {
	return new IndexBuilderOn(true, name);
}
