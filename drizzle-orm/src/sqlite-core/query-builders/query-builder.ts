import { entityKind } from '~/entity.ts';
import type { TypedQueryBuilder } from '~/query-builders/query-builder.ts';
import { SelectionProxyHandler } from '~/selection-proxy.ts';
import type { ColumnsSelection } from '~/sql/sql.ts';
import { SQLiteSyncDialect } from '~/sqlite-core/dialect.ts';
import type { WithSubqueryWithSelection } from '~/sqlite-core/subquery.ts';
import { WithSubquery } from '~/subquery.ts';
import { SQLiteSelectBuilder, SQLiteSelectQueryBuilderBase } from './select.ts';
import type { SelectedFields, SQLiteSelectQueryBuilderHKT } from './select.types.ts';

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

	$withRecursive<TAlias extends string>(alias: TAlias) {
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

		function select(): SQLiteSelectBuilder<'sync', void, 'qb'>;
		function select<TSelection extends SelectedFields>(
			fields: TSelection,
		): SQLiteSelectQueryBuilderBase<SQLiteSelectQueryBuilderHKT, undefined, 'sync', void, TSelection, 'partial'>;
		function select<TSelection extends SelectedFields>(
			fields?: TSelection,
		):
			| SQLiteSelectBuilder<'sync', void, 'qb'>
			| SQLiteSelectQueryBuilderBase<SQLiteSelectQueryBuilderHKT, undefined, 'sync', void, TSelection, 'partial'>
		{
			return fields
				? new SQLiteSelectQueryBuilderBase({
					table: undefined,
					fields,
					session: undefined,
					dialect: self.getDialect(),
					withList: queries,
					isPartialSelect: true,
				})
				: new SQLiteSelectBuilder({
					session: undefined,
					dialect: self.getDialect(),
					withList: queries,
				});
		}

		function selectDistinct(): SQLiteSelectBuilder<'sync', void, 'qb'>;
		function selectDistinct<TSelection extends SelectedFields>(
			fields: TSelection,
		): SQLiteSelectQueryBuilderBase<SQLiteSelectQueryBuilderHKT, undefined, 'sync', void, TSelection, 'partial'>;
		function selectDistinct<TSelection extends SelectedFields>(
			fields?: TSelection,
		):
			| SQLiteSelectBuilder<'sync', void, 'qb'>
			| SQLiteSelectQueryBuilderBase<SQLiteSelectQueryBuilderHKT, undefined, 'sync', void, TSelection, 'partial'>
		{
			return fields
				? new SQLiteSelectQueryBuilderBase({
					table: undefined,
					fields,
					session: undefined,
					dialect: self.getDialect(),
					withList: queries,
					isPartialSelect: true,
					distinct: true,
				})
				: new SQLiteSelectBuilder({
					session: undefined,
					dialect: self.getDialect(),
					withList: queries,
					distinct: true,
				});
		}

		return { select, selectDistinct };
	}

	withRecursive(...queries: WithSubquery[]) {
		const self = this;

		function select(): SQLiteSelectBuilder<'sync', void, 'qb'>;
		function select<TSelection extends SelectedFields>(
			fields: TSelection,
		): SQLiteSelectQueryBuilderBase<SQLiteSelectQueryBuilderHKT, undefined, 'sync', void, TSelection, 'partial'>;
		function select<TSelection extends SelectedFields>(
			fields?: TSelection,
		):
			| SQLiteSelectBuilder<'sync', void, 'qb'>
			| SQLiteSelectQueryBuilderBase<SQLiteSelectQueryBuilderHKT, undefined, 'sync', void, TSelection, 'partial'>
		{
			return fields
				? new SQLiteSelectQueryBuilderBase({
					table: undefined,
					fields,
					session: undefined,
					dialect: self.getDialect(),
					withList: queries,
					isPartialSelect: true,
					recursive: true,
				})
				: new SQLiteSelectBuilder({
					session: undefined,
					dialect: self.getDialect(),
					withList: queries,
					recursive: true,
				});
		}

		function selectDistinct(): SQLiteSelectBuilder<'sync', void, 'qb'>;
		function selectDistinct<TSelection extends SelectedFields>(
			fields: TSelection,
		): SQLiteSelectQueryBuilderBase<SQLiteSelectQueryBuilderHKT, undefined, 'sync', void, TSelection, 'partial'>;
		function selectDistinct<TSelection extends SelectedFields>(
			fields?: TSelection,
		):
			| SQLiteSelectBuilder<'sync', void, 'qb'>
			| SQLiteSelectQueryBuilderBase<SQLiteSelectQueryBuilderHKT, undefined, 'sync', void, TSelection, 'partial'>
		{
			return fields
				? new SQLiteSelectQueryBuilderBase({
					table: undefined,
					fields,
					session: undefined,
					dialect: self.getDialect(),
					withList: queries,
					isPartialSelect: true,
					distinct: true,
					recursive: true,
				})
				: new SQLiteSelectBuilder({
					session: undefined,
					dialect: self.getDialect(),
					withList: queries,
					distinct: true,
					recursive: true,
				});
		}

		return { select, selectDistinct };
	}

	select(): SQLiteSelectBuilder<'sync', void, 'qb'>;
	select<TSelection extends SelectedFields>(
		fields: TSelection,
	): SQLiteSelectQueryBuilderBase<SQLiteSelectQueryBuilderHKT, undefined, 'sync', void, TSelection, 'partial'>;
	select<TSelection extends SelectedFields>(
		fields?: TSelection,
	):
		| SQLiteSelectBuilder<'sync', void, 'qb'>
		| SQLiteSelectQueryBuilderBase<SQLiteSelectQueryBuilderHKT, undefined, 'sync', void, TSelection, 'partial'>
	{
		return fields
			? new SQLiteSelectQueryBuilderBase({
				table: undefined,
				fields,
				session: undefined,
				dialect: this.getDialect(),
				isPartialSelect: true,
			})
			: new SQLiteSelectBuilder({
				session: undefined,
				dialect: this.getDialect(),
			});
	}

	selectDistinct(): SQLiteSelectBuilder<'sync', void, 'qb'>;
	selectDistinct<TSelection extends SelectedFields>(
		fields: TSelection,
	): SQLiteSelectQueryBuilderBase<SQLiteSelectQueryBuilderHKT, undefined, 'sync', void, TSelection, 'partial'>;
	selectDistinct<TSelection extends SelectedFields>(
		fields?: TSelection,
	):
		| SQLiteSelectBuilder<'sync', void, 'qb'>
		| SQLiteSelectQueryBuilderBase<SQLiteSelectQueryBuilderHKT, undefined, 'sync', void, TSelection, 'partial'>
	{
		return fields
			? new SQLiteSelectQueryBuilderBase({
				table: undefined,
				fields,
				session: undefined,
				dialect: this.getDialect(),
				isPartialSelect: true,
				distinct: true,
			})
			: new SQLiteSelectBuilder({
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
