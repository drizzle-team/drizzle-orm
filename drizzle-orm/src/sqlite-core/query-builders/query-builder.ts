import type { QueryBuilder } from '~/query-builders/query-builder';
import { SQLiteSyncDialect } from '~/sqlite-core/dialect';
import type { WithSubqueryWithSelection } from '~/sqlite-core/subquery';
import { SelectionProxyHandler, WithSubquery } from '~/subquery';
import type { SQLiteSelectBuilder } from './select';
import type { SelectedFields } from './select.types';

export class QueryBuilderInstance {
	private dialect = new SQLiteSyncDialect();
	private SQLiteSelectBuilder: typeof SQLiteSelectBuilder;

	constructor() {
		// Required to avoid circular dependency
		this.SQLiteSelectBuilder = require('~/sqlite-core/query-builders/select').SQLiteSelectBuilder;
	}

	$with<TAlias extends string>(alias: TAlias) {
		const queryBuilder = this;

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

		function select(): SQLiteSelectBuilder<undefined, 'sync', void, 'qb'>;
		function select<TSelection extends SelectedFields>(
			fields: TSelection,
		): SQLiteSelectBuilder<TSelection, 'sync', void, 'qb'>;
		function select<TSelection extends SelectedFields>(
			fields?: TSelection,
		): SQLiteSelectBuilder<TSelection | undefined, 'sync', void, 'qb'> {
			return new self.SQLiteSelectBuilder(fields ?? undefined, undefined, self.dialect, queries);
		}

		return { select };
	}

	select(): SQLiteSelectBuilder<undefined, 'sync', void, 'qb'>;
	select<TSelection extends SelectedFields>(fields: TSelection): SQLiteSelectBuilder<TSelection, 'sync', void, 'qb'>;
	select<TSelection extends SelectedFields>(
		fields?: TSelection,
	): SQLiteSelectBuilder<TSelection | undefined, 'sync', void, 'qb'> {
		return new this.SQLiteSelectBuilder(fields ?? undefined, undefined, this.dialect);
	}
}

export const queryBuilder = new QueryBuilderInstance();
