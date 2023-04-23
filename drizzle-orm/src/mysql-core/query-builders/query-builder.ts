import { MySqlDialect } from '~/mysql-core/dialect';
import type { WithSubqueryWithSelection } from '~/mysql-core/subquery';
import type { TypedQueryBuilder } from '~/query-builders/query-builder';
import { SelectionProxyHandler, WithSubquery } from '~/subquery';
import { type ColumnsSelection } from '~/view';
import { MySqlSelectBuilder } from './select';
import type { SelectedFields } from './select.types';

export class QueryBuilder {
	private dialect: MySqlDialect | undefined;

	$with<TAlias extends string>(alias: TAlias) {
		const queryBuilder = this;

		return {
			as<TSelection extends ColumnsSelection>(
				qb: TypedQueryBuilder<TSelection> | ((qb: QueryBuilder) => TypedQueryBuilder<TSelection>),
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

		function select(): MySqlSelectBuilder<undefined, never, 'qb'>;
		function select<TSelection extends SelectedFields>(fields: TSelection): MySqlSelectBuilder<TSelection, never, 'qb'>;
		function select<TSelection extends SelectedFields>(
			fields?: TSelection,
		): MySqlSelectBuilder<TSelection | undefined, never, 'qb'> {
			return new MySqlSelectBuilder(fields ?? undefined, undefined, self.getDialect(), queries);
		}

		return { select };
	}

	select(): MySqlSelectBuilder<undefined, never, 'qb'>;
	select<TSelection extends SelectedFields>(fields: TSelection): MySqlSelectBuilder<TSelection, never, 'qb'>;
	select<TSelection extends SelectedFields>(
		fields?: TSelection,
	): MySqlSelectBuilder<TSelection | undefined, never, 'qb'> {
		return new MySqlSelectBuilder(fields ?? undefined, undefined, this.getDialect());
	}

	// Lazy load dialect to avoid circular dependency
	private getDialect() {
		if (!this.dialect) {
			this.dialect = new MySqlDialect();
		}

		return this.dialect;
	}
}
