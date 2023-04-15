import { PgDialect } from '~/pg-core/dialect';
import type { QueryBuilder } from '~/query-builders/query-builder';
import { SelectionProxyHandler, WithSubquery } from '~/subquery';
import { type ColumnsSelection } from '~/view';
import type { WithSubqueryWithSelection } from '../subquery';
import type { PgSelectBuilder } from './select';
import type { SelectedFields } from './select.types';

export class QueryBuilderInstance {
	private dialect: PgDialect | undefined;
	private PgSelectBuilder: typeof PgSelectBuilder;

	constructor() {
		// Required to avoid circular dependency
		this.PgSelectBuilder = require('./select').PgSelectBuilder;
	}

	$with<TAlias extends string>(alias: TAlias) {
		const queryBuilder = this;

		return {
			as<TSelection extends ColumnsSelection>(
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

		function select(): PgSelectBuilder<undefined, 'qb'>;
		function select<TSelection extends SelectedFields>(fields: TSelection): PgSelectBuilder<TSelection, 'qb'>;
		function select<TSelection extends SelectedFields>(
			fields?: TSelection,
		): PgSelectBuilder<TSelection | undefined, 'qb'> {
			return new self.PgSelectBuilder(fields ?? undefined, undefined, self.getDialect(), queries);
		}

		return { select };
	}

	select(): PgSelectBuilder<undefined, 'qb'>;
	select<TSelection extends SelectedFields>(fields: TSelection): PgSelectBuilder<TSelection, 'qb'>;
	select<TSelection extends SelectedFields>(fields?: TSelection): PgSelectBuilder<TSelection | undefined, 'qb'> {
		return new this.PgSelectBuilder(fields ?? undefined, undefined, this.getDialect());
	}

	// Lazy load dialect to avoid circular dependency
	private getDialect() {
		if (!this.dialect) {
			this.dialect = new PgDialect();
		}

		return this.dialect;
	}
}

export const queryBuilder = new QueryBuilderInstance();
