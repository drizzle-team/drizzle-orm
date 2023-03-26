import { PgDialect } from '~/pg-core/dialect';
import type { PgSelectBuilder } from '~/pg-core/query-builders/select';
import type { SelectFields } from '~/pg-core/query-builders/select.types';
import type { SQL, SQLWrapper } from '~/sql';
import { SelectionProxyHandler, WithSubquery } from '~/subquery';
import type { WithSubqueryWithSelection } from '../subquery';

export class QueryBuilderInstance {
	private dialect: PgDialect | undefined;
	private PgSelectBuilder: typeof PgSelectBuilder;

	constructor() {
		// Required to avoid circular dependency
		this.PgSelectBuilder = require('~/pg-core/query-builders/select').PgSelectBuilder;
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
					new WithSubquery(qb.getSQL(), qb.getSelection() as SelectFields, alias, true),
					new SelectionProxyHandler({ alias, sqlAliasedBehavior: 'alias', sqlBehavior: 'error' }),
				) as WithSubqueryWithSelection<TSelection, TAlias>;
			},
		};
	}

	with(...queries: WithSubquery[]) {
		const self = this;

		function select(): PgSelectBuilder<undefined, 'qb'>;
		function select<TSelection extends SelectFields>(fields: TSelection): PgSelectBuilder<TSelection, 'qb'>;
		function select<TSelection extends SelectFields>(
			fields?: TSelection,
		): PgSelectBuilder<TSelection | undefined, 'qb'> {
			return new self.PgSelectBuilder(fields ?? undefined, undefined, self.getDialect(), queries);
		}

		return { select };
	}

	select(): PgSelectBuilder<undefined, 'qb'>;
	select<TSelection extends SelectFields>(fields: TSelection): PgSelectBuilder<TSelection, 'qb'>;
	select<TSelection extends SelectFields>(fields?: TSelection): PgSelectBuilder<TSelection | undefined, 'qb'> {
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

export abstract class QueryBuilder<TSelection> implements SQLWrapper {
	protected abstract $subquerySelection: TSelection;

	/** @internal */
	getSelection(): TSelection {
		return this.$subquerySelection;
	}

	abstract getSQL(): SQL;
}

export type GetQueryBuilderSelection<T extends QueryBuilder<any>> = T extends QueryBuilder<infer TSelection>
	? TSelection
	: never;

export const queryBuilder = new QueryBuilderInstance();
