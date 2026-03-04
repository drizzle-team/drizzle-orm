import { entityKind } from '~/entity.ts';
import type { TypedQueryBuilder } from '~/query-builders/query-builder.ts';
import type { ExtractTablesWithRelations, RelationalSchemaConfig, TablesRelationalConfig } from '~/relations.ts';
import type { ColumnsSelection, SQLWrapper } from '~/sql/sql.ts';
import { SQL, sql } from '~/sql/sql.ts';
import type { SurrealDBColumn } from './columns/common.ts';
import type { SurrealDBDialect } from './dialect.ts';
import type {
	PreparedQueryHKTBase,
	SurrealDBPreparedQueryHKT,
	SurrealDBQueryResultHKT,
	SurrealDBSession,
	SurrealDBTransactionConfig,
} from './session.ts';
import type { SurrealDBTable } from './table.ts';

export class SurrealDBDatabase<
	TQueryResult extends SurrealDBQueryResultHKT = SurrealDBQueryResultHKT,
	TPreparedQueryHKT extends SurrealDBPreparedQueryHKT = PreparedQueryHKTBase,
	TFullSchema extends Record<string, unknown> = Record<string, never>,
	TSchema extends TablesRelationalConfig = ExtractTablesWithRelations<TFullSchema>,
> {
	static readonly [entityKind]: string = 'SurrealDBDatabase';

	declare readonly _: {
		readonly schema: TSchema | undefined;
		readonly fullSchema: TFullSchema;
		readonly tableNamesMap: Record<string, string>;
	};

	constructor(
		/** @internal */
		readonly dialect: SurrealDBDialect,
		/** @internal */
		readonly session: SurrealDBSession<TQueryResult, PreparedQueryHKTBase, TFullSchema, TSchema>,
		protected readonly schema: RelationalSchemaConfig<TSchema> | undefined,
	) {
		this._ = schema
			? {
				schema: schema.schema,
				fullSchema: schema.fullSchema as TFullSchema,
				tableNamesMap: schema.tableNamesMap,
			}
			: {
				schema: undefined,
				fullSchema: {} as TFullSchema,
				tableNamesMap: {},
			} as any;
	}

	$count(source: SurrealDBTable | SQL | SQLWrapper, filters?: SQL): SQL<number> {
		return sql<number>`select count(*) from ${source}${
			filters ? sql` where ${filters}` : undefined
		}`.mapWith(Number);
	}

	execute<T extends Record<string, unknown> = Record<string, unknown>>(query: SQL): Promise<T[]> {
		return this.session.all(query);
	}

	async transaction<T>(
		transaction: (tx: any) => Promise<T>,
		config?: SurrealDBTransactionConfig,
	): Promise<T> {
		return this.session.transaction(transaction, config);
	}
}
