import type { SQLWrapper } from '~/sql';

import type { SQLiteAsyncDialect, SQLiteSyncDialect } from '~/sqlite-core/dialect';
import {
	type QueryBuilder,
	queryBuilder,
	type QueryBuilderInstance,
	SQLiteDelete,
	SQLiteInsertBuilder,
	SQLiteSelectBuilder,
	SQLiteUpdateBuilder,
} from '~/sqlite-core/query-builders';
import type { ResultKind, SQLiteSession } from '~/sqlite-core/session';
import type { AnySQLiteTable } from '~/sqlite-core/table';
import { SelectionProxyHandler, WithSubquery } from '~/subquery';
import type { SelectFields } from './query-builders/select.types';
import type { WithSubqueryWithSelection } from './subquery';

export class BaseSQLiteDatabase<TResultType extends 'sync' | 'async', TRunResult> {
	constructor(
		/** @internal */
		readonly dialect: { sync: SQLiteSyncDialect; async: SQLiteAsyncDialect }[TResultType],
		/** @internal */
		readonly session: SQLiteSession<TResultType, TRunResult>,
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
					new SelectionProxyHandler({ alias, sqlAliasedBehavior: 'alias', sqlBehavior: 'error' }),
				) as WithSubqueryWithSelection<TSelection, TAlias>;
			},
		};
	}

	with(...queries: WithSubquery[]) {
		const self = this;

		function select(): SQLiteSelectBuilder<undefined, TResultType, TRunResult>;
		function select<TSelection extends SelectFields>(
			fields: TSelection,
		): SQLiteSelectBuilder<TSelection, TResultType, TRunResult>;
		function select(fields?: SelectFields): SQLiteSelectBuilder<SelectFields | undefined, TResultType, TRunResult> {
			return new SQLiteSelectBuilder(fields ?? undefined, self.session, self.dialect, queries);
		}

		return { select };
	}

	select(): SQLiteSelectBuilder<undefined, TResultType, TRunResult>;
	select<TSelection extends SelectFields>(fields: TSelection): SQLiteSelectBuilder<TSelection, TResultType, TRunResult>;
	select(fields?: SelectFields): SQLiteSelectBuilder<SelectFields | undefined, TResultType, TRunResult> {
		return new SQLiteSelectBuilder(fields ?? undefined, this.session, this.dialect);
	}

	update<TTable extends AnySQLiteTable>(table: TTable): SQLiteUpdateBuilder<TTable, TResultType, TRunResult> {
		return new SQLiteUpdateBuilder(table, this.session, this.dialect);
	}

	insert<TTable extends AnySQLiteTable>(into: TTable): SQLiteInsertBuilder<TTable, TResultType, TRunResult> {
		return new SQLiteInsertBuilder(into, this.session, this.dialect);
	}

	delete<TTable extends AnySQLiteTable>(from: TTable): SQLiteDelete<TTable, TResultType, TRunResult> {
		return new SQLiteDelete(from, this.session, this.dialect);
	}

	run(query: SQLWrapper): ResultKind<TResultType, TRunResult> {
		return this.session.run(query.getSQL());
	}

	all<T extends any = unknown>(query: SQLWrapper): ResultKind<TResultType, T[]> {
		return this.session.all(query.getSQL());
	}

	get<T extends any = unknown>(query: SQLWrapper): ResultKind<TResultType, T> {
		return this.session.get(query.getSQL());
	}

	values<T extends any[] = unknown[]>(query: SQLWrapper): ResultKind<TResultType, T[]> {
		return this.session.values(query.getSQL());
	}
}
