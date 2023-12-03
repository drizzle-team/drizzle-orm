import { entityKind } from '~/entity.ts';
import type { TypedQueryBuilder } from '~/query-builders/query-builder.ts';
import { SQLiteSyncDialect } from '~/sqlite-core/dialect.ts';
import type { WithSubqueryWithSelection } from '~/sqlite-core/subquery.ts';
import { SQLiteSelectBuilder } from './select.ts';
import type { SelectedFields } from './select.types.ts';
import type { ColumnsSelection } from '~/sql/sql.ts';
import { WithSubquery } from '~/subquery.ts';
import { SelectionProxyHandler } from '~/selection-proxy.ts';

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
			return new SQLiteSelectBuilder({
				fields: fields ?? undefined,
				session: undefined,
				dialect: self.getDialect(),
				withList: queries,
			});
		}

		function selectDistinct(): SQLiteSelectBuilder<undefined, 'sync', void, 'qb'>;
		function selectDistinct<TSelection extends SelectedFields>(
			fields: TSelection,
		): SQLiteSelectBuilder<TSelection, 'sync', void, 'qb'>;
		function selectDistinct<TSelection extends SelectedFields>(
			fields?: TSelection,
		): SQLiteSelectBuilder<TSelection | undefined, 'sync', void, 'qb'> {
			return new SQLiteSelectBuilder({
				fields: fields ?? undefined,
				session: undefined,
				dialect: self.getDialect(),
				withList: queries,
				distinct: true,
			});
		}

		return { select, selectDistinct };
	}

	select(): SQLiteSelectBuilder<undefined, 'sync', void, 'qb'>;
	select<TSelection extends SelectedFields>(
		fields: TSelection,
	): SQLiteSelectBuilder<TSelection, 'sync', void, 'qb'>;
	select<TSelection extends SelectedFields>(
		fields?: TSelection,
	): SQLiteSelectBuilder<TSelection | undefined, 'sync', void, 'qb'> {
		return new SQLiteSelectBuilder({ fields: fields ?? undefined, session: undefined, dialect: this.getDialect() });
	}

	selectDistinct(): SQLiteSelectBuilder<undefined, 'sync', void, 'qb'>;
	selectDistinct<TSelection extends SelectedFields>(
		fields: TSelection,
	): SQLiteSelectBuilder<TSelection, 'sync', void, 'qb'>;
	selectDistinct<TSelection extends SelectedFields>(
		fields?: TSelection,
	): SQLiteSelectBuilder<TSelection | undefined, 'sync', void, 'qb'> {
		return new SQLiteSelectBuilder({
			fields: fields ?? undefined,
			session: undefined,
			dialect: this.getDialect(),
			distinct: true,
		});
	}

	// Lazy load dialect to avoid circular dependency
	private getDialect() {
		if (!this.dialect) {
			this.dialect = new SQLiteSyncDialect();
		}

		return this.dialect;
	}
}
