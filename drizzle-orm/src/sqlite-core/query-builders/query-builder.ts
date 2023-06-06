import { entityKind } from '~/entity';
import type { TypedQueryBuilder } from '~/query-builders/query-builder';
import { SQLiteSyncDialect } from '~/sqlite-core/dialect';
import type { WithSubqueryWithSelection } from '~/sqlite-core/subquery';
import { SelectionProxyHandler, WithSubquery } from '~/subquery';
import { type ColumnsSelection } from '~/view';
import { SQLiteSelectBuilder } from './select';
import type { SelectedFields } from './select.types';

export class QueryBuilder {
	static readonly [entityKind]: string = 'SQLiteQueryBuilder';

	private dialect: SQLiteSyncDialect | undefined;

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

		function select(): SQLiteSelectBuilder<undefined, 'sync', void, 'qb'>;
		function select<TSelection extends SelectedFields>(
			fields: TSelection,
		): SQLiteSelectBuilder<TSelection, 'sync', void, 'qb'>;
		function select<TSelection extends SelectedFields>(
			fields?: TSelection,
		): SQLiteSelectBuilder<TSelection | undefined, 'sync', void, 'qb'> {
			return new SQLiteSelectBuilder(fields ?? undefined, undefined, self.getDialect(), queries);
		}

		return { select };
	}

	select(): SQLiteSelectBuilder<undefined, 'sync', void, 'qb'>;
	select<TSelection extends SelectedFields>(fields: TSelection): SQLiteSelectBuilder<TSelection, 'sync', void, 'qb'>;
	select<TSelection extends SelectedFields>(
		fields?: TSelection,
	): SQLiteSelectBuilder<TSelection | undefined, 'sync', void, 'qb'> {
		return new SQLiteSelectBuilder(fields ?? undefined, undefined, this.getDialect());
	}

	// Lazy load dialect to avoid circular dependency
	private getDialect() {
		if (!this.dialect) {
			this.dialect = new SQLiteSyncDialect();
		}

		return this.dialect;
	}
}
