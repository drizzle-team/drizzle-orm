import { MySqlDialect } from '~/mysql-core/dialect';
import type { WithSubqueryWithSelection } from '~/mysql-core/subquery';
import type { QueryBuilder } from '~/query-builders/query-builder';
import { SelectionProxyHandler, WithSubquery } from '~/subquery';
import type { MySqlSelectBuilder } from './select';
import type { SelectedFields } from './select.types';

export class QueryBuilderInstance {
	private dialect: MySqlDialect | undefined;
	private MySqlSelectBuilder: typeof MySqlSelectBuilder;

	constructor() {
		// Required to avoid circular dependency
		this.MySqlSelectBuilder = require('~/mysql-core/query-builders/select').MySqlSelectBuilder;
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

		function select(): MySqlSelectBuilder<undefined, 'qb'>;
		function select<TSelection extends SelectedFields>(fields: TSelection): MySqlSelectBuilder<TSelection, 'qb'>;
		function select<TSelection extends SelectedFields>(
			fields?: TSelection,
		): MySqlSelectBuilder<TSelection | undefined, 'qb'> {
			return new self.MySqlSelectBuilder(fields ?? undefined, undefined, self.getDialect(), queries);
		}

		return { select };
	}

	select(): MySqlSelectBuilder<undefined, 'qb'>;
	select<TSelection extends SelectedFields>(fields: TSelection): MySqlSelectBuilder<TSelection, 'qb'>;
	select<TSelection extends SelectedFields>(fields?: TSelection): MySqlSelectBuilder<TSelection | undefined, 'qb'> {
		return new this.MySqlSelectBuilder(fields ?? undefined, undefined, this.getDialect());
	}

	// Lazy load dialect to avoid circular dependency
	private getDialect() {
		if (!this.dialect) {
			this.dialect = new MySqlDialect();
		}

		return this.dialect;
	}
}

export const queryBuilder = new QueryBuilderInstance();
