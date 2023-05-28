import type { TypedQueryBuilder } from '~/query-builders/query-builder';
import { type ExtractTablesWithRelations, type RelationalSchemaConfig, type TablesRelationalConfig } from '~/relations';
import type { SQLWrapper } from '~/sql';
import type { SQLiteAsyncDialect, SQLiteSyncDialect } from '~/sqlite-core/dialect';
import {
	QueryBuilder,
	SQLiteDelete,
	SQLiteInsertBuilder,
	SQLiteSelectBuilder,
	SQLiteUpdateBuilder,
} from '~/sqlite-core/query-builders';
import type { Result, SQLiteSession, SQLiteTransaction, SQLiteTransactionConfig } from '~/sqlite-core/session';
import type { AnySQLiteTable } from '~/sqlite-core/table';
import { SelectionProxyHandler, WithSubquery } from '~/subquery';
import { type ColumnsSelection } from '~/view';
import { AsyncRelationalQueryBuilder, SyncRelationalQueryBuilder } from './query-builders/query';
import type { SelectedFields } from './query-builders/select.types';
import type { WithSubqueryWithSelection } from './subquery';

export class BaseSQLiteDatabase<
	TResultKind extends 'sync' | 'async',
	TRunResult,
	TFullSchema extends Record<string, unknown> = Record<string, never>,
	TSchema extends TablesRelationalConfig = ExtractTablesWithRelations<TFullSchema>,
> {
	declare readonly _: {
		readonly schema: TSchema | undefined;
		readonly tableNamesMap: Record<string, string>;
	};

	query: {
		[K in keyof TSchema]: TResultKind extends 'async' ? AsyncRelationalQueryBuilder<TFullSchema, TSchema, TSchema[K]>
			: SyncRelationalQueryBuilder<TFullSchema, TSchema, TSchema[K]>;
	};

	constructor(
		resultKind: TResultKind,
		/** @internal */
		readonly dialect: { sync: SQLiteSyncDialect; async: SQLiteAsyncDialect }[TResultKind],
		/** @internal */
		readonly session: SQLiteSession<TResultKind, TRunResult, TFullSchema, TSchema>,
		schema: RelationalSchemaConfig<TSchema> | undefined,
	) {
		this._ = schema
			? { schema: schema.schema, tableNamesMap: schema.tableNamesMap }
			: { schema: undefined, tableNamesMap: {} };
		this.query = {} as typeof this['query'];
		if (this._.schema) {
			for (const [tableName, columns] of Object.entries(this._.schema)) {
				this.query[tableName as keyof TSchema] =
					new (resultKind === 'async' ? AsyncRelationalQueryBuilder : SyncRelationalQueryBuilder)(
						schema!.fullSchema,
						this._.schema,
						this._.tableNamesMap,
						schema!.fullSchema[tableName] as AnySQLiteTable,
						columns,
						dialect,
						session as SQLiteSession<any, any, any, any> as any,
					) as this['query'][keyof TSchema];
			}
		}
	}

	$with<TAlias extends string>(alias: TAlias) {
		return {
			as<TSelection extends ColumnsSelection>(
				qb: TypedQueryBuilder<TSelection> | ((qb: QueryBuilder) => TypedQueryBuilder<TSelection>),
			): WithSubqueryWithSelection<TSelection, TAlias> {
				if (typeof qb === 'function') {
					qb = qb(new QueryBuilder());
				}

				return new Proxy(
					new WithSubquery(qb.getSQL(), qb.getSelectedFields() as SelectedFields, alias, true),
					new SelectionProxyHandler({ alias, sqlAliasedBehavior: 'alias', sqlBehavior: 'error' }),
				) as WithSubqueryWithSelection<TSelection, TAlias>;
			},
		};
	}

	with(...queries: WithSubquery[]) {
		const self = this;

		function select(): SQLiteSelectBuilder<undefined, TResultKind, TRunResult>;
		function select<TSelection extends SelectedFields>(
			fields: TSelection,
		): SQLiteSelectBuilder<TSelection, TResultKind, TRunResult>;
		function select(fields?: SelectedFields): SQLiteSelectBuilder<SelectedFields | undefined, TResultKind, TRunResult> {
			return new SQLiteSelectBuilder(fields ?? undefined, self.session, self.dialect, queries);
		}

		return { select };
	}

	select(): SQLiteSelectBuilder<undefined, TResultKind, TRunResult>;
	select<TSelection extends SelectedFields>(
		fields: TSelection,
	): SQLiteSelectBuilder<TSelection, TResultKind, TRunResult>;
	select(fields?: SelectedFields): SQLiteSelectBuilder<SelectedFields | undefined, TResultKind, TRunResult> {
		return new SQLiteSelectBuilder(fields ?? undefined, this.session, this.dialect);
	}

	update<TTable extends AnySQLiteTable>(table: TTable): SQLiteUpdateBuilder<TTable, TResultKind, TRunResult> {
		return new SQLiteUpdateBuilder(table, this.session, this.dialect);
	}

	insert<TTable extends AnySQLiteTable>(into: TTable): SQLiteInsertBuilder<TTable, TResultKind, TRunResult> {
		return new SQLiteInsertBuilder(into, this.session, this.dialect);
	}

	delete<TTable extends AnySQLiteTable>(from: TTable): SQLiteDelete<TTable, TResultKind, TRunResult> {
		return new SQLiteDelete(from, this.session, this.dialect);
	}

	run(query: SQLWrapper): Result<TResultKind, TRunResult> {
		return this.session.run(query.getSQL());
	}

	all<T = unknown>(query: SQLWrapper): Result<TResultKind, T[]> {
		return this.session.all(query.getSQL());
	}

	get<T = unknown>(query: SQLWrapper): Result<TResultKind, T> {
		return this.session.get(query.getSQL());
	}

	values<T extends unknown[] = unknown[]>(query: SQLWrapper): Result<TResultKind, T[]> {
		return this.session.values(query.getSQL());
	}

	transaction<T>(
		transaction: (tx: SQLiteTransaction<TResultKind, TRunResult, TFullSchema, TSchema>) => Result<TResultKind, T>,
		config?: SQLiteTransactionConfig,
	): Result<TResultKind, T> {
		return this.session.transaction(transaction, config);
	}
}
