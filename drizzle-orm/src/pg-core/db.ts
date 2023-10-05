import { entityKind } from '~/entity.ts';
import type { PgDialect } from '~/pg-core/dialect.ts';
import {
	PgDeleteBase,
	PgInsertBuilder,
	PgSelectBuilder,
	PgUpdateBuilder,
	QueryBuilder,
} from '~/pg-core/query-builders/index.ts';
import type {
	PgSession,
	PgTransaction,
	PgTransactionConfig,
	QueryResultHKT,
	QueryResultKind,
} from '~/pg-core/session.ts';
import { type PgTable } from '~/pg-core/table.ts';
import type { TypedQueryBuilder } from '~/query-builders/query-builder.ts';
import {
	type ExtractTablesWithRelations,
	type RelationalSchemaConfig,
	type TablesRelationalConfig,
} from '~/relations.ts';
import { type SQLWrapper } from '~/sql/index.ts';
import { SelectionProxyHandler, WithSubquery } from '~/subquery.ts';
import { type DrizzleTypeError } from '~/utils.ts';
import { type ColumnsSelection } from '~/view.ts';
import { type PgColumn } from './columns/index.ts';
import { RelationalQueryBuilder } from './query-builders/query.ts';
import { PgRefreshMaterializedView } from './query-builders/refresh-materialized-view.ts';
import type { SelectedFields } from './query-builders/select.types.ts';
import type { WithSubqueryWithSelection } from './subquery.ts';
import type { PgMaterializedView } from './view.ts';

export class PgDatabase<
	TQueryResult extends QueryResultHKT,
	TFullSchema extends Record<string, unknown> = Record<string, never>,
	TSchema extends TablesRelationalConfig = ExtractTablesWithRelations<TFullSchema>,
> {
	static readonly [entityKind]: string = 'PgDatabase';

	declare readonly _: {
		readonly schema: TSchema | undefined;
		readonly tableNamesMap: Record<string, string>;
	};

	query: TFullSchema extends Record<string, never>
		? DrizzleTypeError<'Seems like the schema generic is missing - did you forget to add it to your DB type?'>
		: {
			[K in keyof TSchema]: RelationalQueryBuilder<TSchema, TSchema[K]>;
		};

	constructor(
		/** @internal */
		readonly dialect: PgDialect,
		/** @internal */
		readonly session: PgSession<any, any, any>,
		schema: RelationalSchemaConfig<TSchema> | undefined,
	) {
		this._ = schema
			? { schema: schema.schema, tableNamesMap: schema.tableNamesMap }
			: { schema: undefined, tableNamesMap: {} };
		this.query = {} as typeof this['query'];
		if (this._.schema) {
			for (const [tableName, columns] of Object.entries(this._.schema)) {
				(this.query as PgDatabase<TQueryResult, Record<string, any>>['query'])[tableName] = new RelationalQueryBuilder(
					schema!.fullSchema,
					this._.schema,
					this._.tableNamesMap,
					schema!.fullSchema[tableName] as PgTable,
					columns,
					dialect,
					session,
				);
			}
		}
	}

	$withRecursive<TAlias extends string>(alias: TAlias) {
		return {
			as<TSelection extends ColumnsSelection>(
				qb: TypedQueryBuilder<TSelection> | ((qb: QueryBuilder) => TypedQueryBuilder<TSelection>),
			): WithSubqueryWithSelection<TSelection, TAlias> {
				if (typeof qb === 'function') {
					qb = qb(new QueryBuilder());
				}

				return new Proxy(
					new WithSubquery(qb.getSQL(), qb.getSelectedFields() as SelectedFields, alias, true, true),
					new SelectionProxyHandler({ alias, sqlAliasedBehavior: 'alias', sqlBehavior: 'error' }),
				) as WithSubqueryWithSelection<TSelection, TAlias>;
			},
		};
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
			return new PgSelectBuilder({
				fields: fields ?? undefined,
				session: self.session,
				dialect: self.dialect,
				withList: queries,
			});
		}

		return { select };
	}

	select(): PgSelectBuilder<undefined>;
	select<TSelection extends SelectedFields>(fields: TSelection): PgSelectBuilder<TSelection>;
	select(fields?: SelectedFields): PgSelectBuilder<SelectedFields | undefined> {
		return new PgSelectBuilder({
			fields: fields ?? undefined,
			session: this.session,
			dialect: this.dialect,
		});
	}

	selectDistinct(): PgSelectBuilder<undefined>;
	selectDistinct<TSelection extends SelectedFields>(fields: TSelection): PgSelectBuilder<TSelection>;
	selectDistinct(fields?: SelectedFields): PgSelectBuilder<SelectedFields | undefined> {
		return new PgSelectBuilder({
			fields: fields ?? undefined,
			session: this.session,
			dialect: this.dialect,
			distinct: true,
		});
	}

	selectDistinctOn(on: (PgColumn | SQLWrapper)[]): PgSelectBuilder<undefined>;
	selectDistinctOn<TSelection extends SelectedFields>(
		on: (PgColumn | SQLWrapper)[],
		fields: TSelection,
	): PgSelectBuilder<TSelection>;
	selectDistinctOn(
		on: (PgColumn | SQLWrapper)[],
		fields?: SelectedFields,
	): PgSelectBuilder<SelectedFields | undefined> {
		return new PgSelectBuilder({
			fields: fields ?? undefined,
			session: this.session,
			dialect: this.dialect,
			distinct: { on },
		});
	}

	update<TTable extends PgTable>(table: TTable): PgUpdateBuilder<TTable, TQueryResult> {
		return new PgUpdateBuilder(table, this.session, this.dialect);
	}

	insert<TTable extends PgTable>(table: TTable): PgInsertBuilder<TTable, TQueryResult> {
		return new PgInsertBuilder(table, this.session, this.dialect);
	}

	delete<TTable extends PgTable>(table: TTable): PgDeleteBase<TTable, TQueryResult> {
		return new PgDeleteBase(table, this.session, this.dialect);
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
		transaction: (tx: PgTransaction<TQueryResult, TFullSchema, TSchema>) => Promise<T>,
		config?: PgTransactionConfig,
	): Promise<T> {
		return this.session.transaction(transaction, config);
	}
}
