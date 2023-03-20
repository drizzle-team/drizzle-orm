import type { PgDialect } from '~/pg-core/dialect';
import type { QueryBuilder, QueryBuilderInstance } from '~/pg-core/query-builders';
import { PgDelete, PgInsertBuilder, PgSelectBuilder, PgUpdateBuilder, queryBuilder } from '~/pg-core/query-builders';
import type { PgSession, QueryResultHKT, QueryResultKind } from '~/pg-core/session';
import type { AnyPgTable } from '~/pg-core/table';
import type { SQLWrapper } from '~/sql';
import { SelectionProxyHandler, WithSubquery } from '~/subquery';
import { PgRefreshMaterializedView } from './query-builders/refresh-materialized-view';
import type { SelectFields } from './query-builders/select.types';
import type { WithSubqueryWithSelection } from './subquery';
import type { PgMaterializedView } from './view';

export class PgDatabase<TQueryResult extends QueryResultHKT, TSession extends PgSession> {
	constructor(
		/** @internal */
		readonly dialect: PgDialect,
		/** @internal */
		readonly session: TSession,
	) {}

	$with<TAlias extends string>(alias: TAlias) {
		return {
			as<TSelection>(
				qb: QueryBuilder<TSelection> | ((qb: QueryBuilderInstance) => QueryBuilder<TSelection>),
			): WithSubqueryWithSelection<TSelection, TAlias> {
				if (typeof qb === 'function') {
					qb = qb(queryBuilder);
				}

				return new Proxy(
					new WithSubquery(qb.getSQL(), qb.getSelection() as SelectFields, alias, true),
					new SelectionProxyHandler({ alias, sqlAliasedBehavior: 'subquery_selection', sqlBehavior: 'error' }),
				) as WithSubqueryWithSelection<TSelection, TAlias>;
			},
		};
	}

	with(...queries: WithSubquery[]) {
		const self = this;

		function select(): PgSelectBuilder<undefined>;
		function select<TSelection extends SelectFields>(fields: TSelection): PgSelectBuilder<TSelection>;
		function select(fields?: SelectFields): PgSelectBuilder<SelectFields | undefined> {
			return new PgSelectBuilder(fields ?? undefined, self.session, self.dialect, queries);
		}

		return { select };
	}

	select(): PgSelectBuilder<undefined>;
	select<TSelection extends SelectFields>(fields: TSelection): PgSelectBuilder<TSelection>;
	select(fields?: SelectFields): PgSelectBuilder<SelectFields | undefined> {
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

	refreshMaterializedView<TView extends PgMaterializedView>(view: TView) {
		return new PgRefreshMaterializedView(view, this.session, this.dialect);
	}

	execute<TRow extends Record<string, unknown> = Record<string, unknown>>(
		query: SQLWrapper,
	): Promise<QueryResultKind<TQueryResult, TRow>> {
		return this.session.execute(query.getSQL());
	}
}
