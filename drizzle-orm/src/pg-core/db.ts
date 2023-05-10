import type { PgDialect } from '~/pg-core/dialect';
import { PgDelete, PgInsertBuilder, PgSelectBuilder, PgUpdateBuilder, QueryBuilder } from '~/pg-core/query-builders';
import type { PgSession, PgTransaction, PgTransactionConfig, QueryResultHKT, QueryResultKind } from '~/pg-core/session';
import { type AnyPgTable } from '~/pg-core/table';
import type { TypedQueryBuilder } from '~/query-builders/query-builder';
import {
	type BuildQueryResult,
	createTableRelationsHelpers,
	type DBQueryConfig,
	extractTablesRelationalConfig,
	mapRelationalRow,
	type TableRelationalConfig,
	type TablesRelationalConfig,
} from '~/relations';
import { type SQLWrapper } from '~/sql';
import { SelectionProxyHandler, WithSubquery } from '~/subquery';
import { type KnownKeysOnly } from '~/utils';
import { type ColumnsSelection } from '~/view';
import { PgRefreshMaterializedView } from './query-builders/refresh-materialized-view';
import type { SelectedFields } from './query-builders/select.types';
import type { WithSubqueryWithSelection } from './subquery';
import type { PgMaterializedView } from './view';

export class PgDatabase<
	TQueryResult extends QueryResultHKT,
	TSchema extends TablesRelationalConfig = {},
> {
	declare readonly _: {
		readonly schema: TSchema | undefined;
		readonly tableNamesMap: Record<string, string>;
	};

	query: {
		[K in keyof TSchema]: RelationalQueryBuilder<TSchema, TSchema[K]>;
	};

	constructor(
		/** @internal */
		readonly dialect: PgDialect,
		/** @internal */
		readonly session: PgSession<any>,
		schema: Record<string, unknown> | undefined,
	) {
		if (schema) {
			const { tables: extractedSchema, tableNamesMap } = extractTablesRelationalConfig<TSchema>(
				schema,
				createTableRelationsHelpers,
			);
			this._ = { schema: extractedSchema, tableNamesMap };
		} else {
			this._ = { schema: undefined, tableNamesMap: {} };
		}
		this.query = {} as typeof this['query'];
		if (this._.schema) {
			for (const [tableName, columns] of Object.entries(this._.schema)) {
				this.query[tableName as keyof TSchema] = new RelationalQueryBuilder(
					schema!,
					this._.schema,
					this._.tableNamesMap,
					schema![tableName] as AnyPgTable,
					columns,
					dialect,
					session,
				);
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

		function select(): PgSelectBuilder<undefined>;
		function select<TSelection extends SelectedFields>(fields: TSelection): PgSelectBuilder<TSelection>;
		function select(fields?: SelectedFields): PgSelectBuilder<SelectedFields | undefined> {
			return new PgSelectBuilder(fields ?? undefined, self.session, self.dialect, queries);
		}

		return { select };
	}

	select(): PgSelectBuilder<undefined>;
	select<TSelection extends SelectedFields>(fields: TSelection): PgSelectBuilder<TSelection>;
	select(fields?: SelectedFields): PgSelectBuilder<SelectedFields | undefined> {
		return new PgSelectBuilder(fields ?? undefined, this.session, this.dialect);
	}

	update<TTable extends AnyPgTable>(table: TTable): PgUpdateBuilder<TTable, TQueryResult> {
		return new PgUpdateBuilder(table, this.session, this.dialect);
	}

	insert<TTable extends AnyPgTable>(table: TTable): PgInsertBuilder<TTable, TQueryResult> {
		return new PgInsertBuilder(table, this.session, this.dialect);
	}

	delete<TTable extends AnyPgTable>(table: TTable): PgDelete<TTable, TQueryResult> {
		return new PgDelete(table, this.session, this.dialect);
	}

	refreshMaterializedView<TView extends PgMaterializedView>(view: TView): PgRefreshMaterializedView<TQueryResult> {
		return new PgRefreshMaterializedView(view, this.session, this.dialect);
	}

	execute<TRow extends Record<string, unknown> = Record<string, unknown>>(
		query: SQLWrapper,
	): Promise<QueryResultKind<TQueryResult, TRow>> {
		return this.session.execute(query.getSQL());
	}

	transaction<T>(
		transaction: (tx: PgTransaction<TQueryResult>) => Promise<T>,
		config?: PgTransactionConfig,
	): Promise<T> {
		return this.session.transaction(transaction, config);
	}
}

class RelationalQueryBuilder<TSchema extends TablesRelationalConfig, TFields extends TableRelationalConfig> {
	constructor(
		private fullSchema: Record<string, unknown>,
		private schema: TSchema,
		private tableNamesMap: Record<string, string>,
		private table: AnyPgTable,
		private tableConfig: TableRelationalConfig,
		private dialect: PgDialect,
		private session: PgSession,
	) {}

	async findMany<TConfig extends DBQueryConfig<'many', true, TSchema, TFields>>(
		config?: KnownKeysOnly<TConfig, DBQueryConfig<'many', true, TSchema, TFields>>,
	): Promise<BuildQueryResult<TSchema, TFields, TConfig>[]> {
		const query = this.dialect.buildRelationalQuery(
			this.fullSchema,
			this.schema,
			this.tableNamesMap,
			this.table,
			this.tableConfig,
			(config as DBQueryConfig<'many', true> | undefined) ?? true,
			this.tableConfig.tsName,
			[],
			true,
		);

		const rows = await this.session.values<unknown[]>(query.sql);
		return rows.map((row) => mapRelationalRow(this.schema, this.tableConfig, row, query.selection)) as any;
	}

	async findFirst<TSelection extends Omit<DBQueryConfig<'many', true, TSchema, TFields>, 'limit'>>(
		config?: KnownKeysOnly<TSelection, Omit<DBQueryConfig<'many', true, TSchema, TFields>, 'limit'>>,
	): Promise<BuildQueryResult<TSchema, TFields, TSelection> | undefined> {
		const query = this.dialect.buildRelationalQuery(
			this.fullSchema,
			this.schema,
			this.tableNamesMap,
			this.table,
			this.tableConfig,
			config ? { ...(config as DBQueryConfig<'many', true> | undefined), limit: 1 } : { limit: 1 },
			this.tableConfig.tsName,
			[],
			true,
		);

		const rows = await this.session.values<unknown[]>(query.sql);
		if (!rows[0]) {
			return undefined;
		}
		return mapRelationalRow(this.schema, this.tableConfig, rows[0], query.selection) as any;
	}
}
