import { entityKind } from '~/entity.ts';
import type { SQL } from '~/sql/sql.ts';
import type { AnyGoogleSqlColumn, GoogleSqlColumn } from './columns/index.ts';
import type { GoogleSqlTable } from './table.ts';

interface IndexConfig {
	name: string;

	columns: IndexColumn[];

	/**
	 * If true, the index will be created as `create unique index` instead of `create index`.
	 */
	unique?: boolean;

	// TODO: SPANNER - add support for nullFiltered https://cloud.google.com/spanner/docs/reference/standard-sql/data-definition-language#parameters_12
	// nullFiltered?: boolean;

	// TODO: SPANNER - add support for INTERLEAVE IN https://cloud.google.com/spanner/docs/reference/standard-sql/data-definition-language#create-index-interleave
	// interleaveIn?: GoogleSqlTable;

	// TODO: SPANNER - add support for stored columns https://cloud.google.com/spanner/docs/reference/standard-sql/data-definition-language#create-index
	// storing?: GoogleSqlColumn[];

	// TODO: SPANNER - add support for WHERE IS NOT NULL clause https://cloud.google.com/spanner/docs/reference/standard-sql/data-definition-language#create-index
	// whereIsNotNull?: GoogleSqlColumn;
}

export type IndexColumn = GoogleSqlColumn | SQL;

export class IndexBuilderOn {
	static readonly [entityKind]: string = 'GoogleSqlIndexBuilderOn';

	constructor(private name: string, private unique: boolean) {}

	on(...columns: [IndexColumn, ...IndexColumn[]]): IndexBuilder {
		return new IndexBuilder(this.name, columns, this.unique);
	}
}

export interface AnyIndexBuilder {
	build(table: GoogleSqlTable): Index;
}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface IndexBuilder extends AnyIndexBuilder {}

export class IndexBuilder implements AnyIndexBuilder {
	static readonly [entityKind]: string = 'GoogleSqlIndexBuilder';

	/** @internal */
	config: IndexConfig;

	constructor(name: string, columns: IndexColumn[], unique: boolean) {
		this.config = {
			name,
			columns,
			unique,
		};
	}

	/** @internal */
	build(table: GoogleSqlTable): Index {
		return new Index(this.config, table);
	}
}

export class Index {
	static readonly [entityKind]: string = 'GoogleSqlIndex';

	readonly config: IndexConfig & { table: GoogleSqlTable };

	constructor(config: IndexConfig, table: GoogleSqlTable) {
		this.config = { ...config, table };
	}
}

export type GetColumnsTableName<TColumns> = TColumns extends
	AnyGoogleSqlColumn<{ tableName: infer TTableName extends string }> | AnyGoogleSqlColumn<
		{ tableName: infer TTableName extends string }
	>[] ? TTableName
	: never;

export function index(name: string): IndexBuilderOn {
	return new IndexBuilderOn(name, false);
}

export function uniqueIndex(name: string): IndexBuilderOn {
	return new IndexBuilderOn(name, true);
}
