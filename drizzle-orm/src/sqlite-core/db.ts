import { TransactionRollbackError } from '~/errors';
import type { QueryBuilder } from '~/query-builders/query-builder';
import type { SQLWrapper } from '~/sql';
import type { SQLiteAsyncDialect, SQLiteSyncDialect } from '~/sqlite-core/dialect';
import {
	queryBuilder,
	type QueryBuilderInstance,
	SQLiteDelete,
	SQLiteInsertBuilder,
	SQLiteSelectBuilder,
	SQLiteUpdateBuilder,
} from '~/sqlite-core/query-builders';
import type { ResultKind, SQLiteSession, SQLiteTransactionConfig } from '~/sqlite-core/session';
import type { AnySQLiteTable } from '~/sqlite-core/table';
import { SelectionProxyHandler, WithSubquery } from '~/subquery';
import type { SelectedFields } from './query-builders/select.types';
import type { WithSubqueryWithSelection } from './subquery';

export class BaseSQLiteDatabase<TResultKind extends 'sync' | 'async', TRunResult> {
	constructor(
		/** @internal */
		readonly dialect: { sync: SQLiteSyncDialect; async: SQLiteAsyncDialect }[TResultKind],
		/** @internal */
		readonly session: SQLiteSession<TResultKind, TRunResult>,
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

	run(query: SQLWrapper): ResultKind<TResultKind, TRunResult> {
		return this.session.run(query.getSQL());
	}

	all<T = unknown>(query: SQLWrapper): ResultKind<TResultKind, T[]> {
		return this.session.all(query.getSQL());
	}

	get<T = unknown>(query: SQLWrapper): ResultKind<TResultKind, T> {
		return this.session.get(query.getSQL());
	}

	values<T extends unknown[] = unknown[]>(query: SQLWrapper): ResultKind<TResultKind, T[]> {
		return this.session.values(query.getSQL());
	}

	transaction<T>(
		transaction: (tx: SQLiteTransaction<TResultKind, TRunResult>) => ResultKind<TResultKind, T>,
		config?: SQLiteTransactionConfig,
	): ResultKind<TResultKind, T> {
		return this.session.transaction(transaction, config);
	}
}

export abstract class SQLiteTransaction<TResultType extends 'sync' | 'async', TRunResult>
	extends BaseSQLiteDatabase<TResultType, TRunResult>
{
	constructor(
		dialect: { sync: SQLiteSyncDialect; async: SQLiteAsyncDialect }[TResultType],
		session: SQLiteSession<TResultType, TRunResult>,
		protected readonly nestedIndex = 0,
	) {
		super(dialect, session);
	}

	rollback(): never {
		throw new TransactionRollbackError();
	}
}
