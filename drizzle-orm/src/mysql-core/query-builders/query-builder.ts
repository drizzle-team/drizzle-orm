import { entityKind, is } from '~/entity.ts';
import { MySqlDialect } from '~/mysql-core/dialect.ts';
import type { WithSubqueryWithSelection } from '~/mysql-core/subquery.ts';
import type { TypedQueryBuilder } from '~/query-builders/query-builder.ts';
import { SelectionProxyHandler } from '~/selection-proxy.ts';
import type { ColumnsSelection } from '~/sql/sql.ts';
import { WithSubquery } from '~/subquery.ts';
import { MySqlSelectBuilder, MySqlSelectQueryBuilderBase } from './select.ts';
import type { MySqlSelectQueryBuilderHKT, SelectedFields } from './select.types.ts';

export class QueryBuilder {
	static readonly [entityKind]: string = 'MySqlQueryBuilder';

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

	$withRecursive<TAlias extends string>(alias: TAlias) {
		const queryBuilder = this;

		return {
			as<TSelection extends ColumnsSelection>(
				qb: TypedQueryBuilder<TSelection> | ((qb: QueryBuilder) => TypedQueryBuilder<TSelection>),
			): WithSubqueryWithSelection<TSelection, TAlias> {
				if (typeof qb === 'function') {
					qb = qb(queryBuilder);
				}

				if (is(qb, MySqlSelectQueryBuilderBase)) {
					qb.setSelfReferenceName(alias);
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

		function select(): MySqlSelectBuilder<never, 'qb'>;
		function select<TSelection extends SelectedFields>(
			fields: TSelection,
		): MySqlSelectQueryBuilderBase<MySqlSelectQueryBuilderHKT, undefined, TSelection, 'partial', never>;
		function select(
			fields?: SelectedFields,
		):
			| MySqlSelectBuilder<never, 'qb'>
			| MySqlSelectQueryBuilderBase<MySqlSelectQueryBuilderHKT, undefined, SelectedFields, 'partial', never>
		{
			return fields
				? new MySqlSelectQueryBuilderBase({
					table: undefined,
					fields,
					session: undefined,
					dialect: self.getDialect(),
					withList: queries,
					isPartialSelect: true,
				})
				: new MySqlSelectBuilder({
					session: undefined,
					dialect: self.getDialect(),
					withList: queries,
				});
		}

		function selectDistinct(): MySqlSelectBuilder<never, 'qb'>;
		function selectDistinct<TSelection extends SelectedFields>(
			fields: TSelection,
		): MySqlSelectQueryBuilderBase<MySqlSelectQueryBuilderHKT, undefined, TSelection, 'partial', never>;
		function selectDistinct(
			fields?: SelectedFields,
		):
			| MySqlSelectBuilder<never, 'qb'>
			| MySqlSelectQueryBuilderBase<MySqlSelectQueryBuilderHKT, undefined, SelectedFields, 'partial', never>
		{
			return fields
				? new MySqlSelectQueryBuilderBase({
					table: undefined,
					fields,
					session: undefined,
					dialect: self.getDialect(),
					withList: queries,
					isPartialSelect: true,
					distinct: true,
				})
				: new MySqlSelectBuilder({
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

		function select(): MySqlSelectBuilder<never, 'qb'>;
		function select<TSelection extends SelectedFields>(
			fields: TSelection,
		): MySqlSelectQueryBuilderBase<MySqlSelectQueryBuilderHKT, undefined, TSelection, 'partial', never>;
		function select(
			fields?: SelectedFields,
		):
			| MySqlSelectBuilder<never, 'qb'>
			| MySqlSelectQueryBuilderBase<MySqlSelectQueryBuilderHKT, undefined, SelectedFields, 'partial', never>
		{
			return fields
				? new MySqlSelectQueryBuilderBase({
					table: undefined,
					fields,
					session: undefined,
					dialect: self.getDialect(),
					withList: queries,
					isPartialSelect: true,
					recursive: true,
				})
				: new MySqlSelectBuilder({
					session: undefined,
					dialect: self.getDialect(),
					withList: queries,
					recursive: true,
				});
		}

		function selectDistinct(): MySqlSelectBuilder<never, 'qb'>;
		function selectDistinct<TSelection extends SelectedFields>(
			fields: TSelection,
		): MySqlSelectQueryBuilderBase<MySqlSelectQueryBuilderHKT, undefined, TSelection, 'partial', never>;
		function selectDistinct(
			fields?: SelectedFields,
		):
			| MySqlSelectBuilder<never, 'qb'>
			| MySqlSelectQueryBuilderBase<MySqlSelectQueryBuilderHKT, undefined, SelectedFields, 'partial', never>
		{
			return fields
				? new MySqlSelectQueryBuilderBase({
					table: undefined,
					fields,
					session: undefined,
					dialect: self.getDialect(),
					withList: queries,
					isPartialSelect: true,
					distinct: true,
					recursive: true,
				})
				: new MySqlSelectBuilder({
					session: undefined,
					dialect: self.getDialect(),
					withList: queries,
					distinct: true,
					recursive: true,
				});
		}

		return { select, selectDistinct };
	}

	select(): MySqlSelectBuilder<never, 'qb'>;
	select<TSelection extends SelectedFields>(
		fields: TSelection,
	): MySqlSelectQueryBuilderBase<MySqlSelectQueryBuilderHKT, undefined, TSelection, 'partial', never>;
	select<TSelection extends SelectedFields>(
		fields?: TSelection,
	):
		| MySqlSelectBuilder<never, 'qb'>
		| MySqlSelectQueryBuilderBase<MySqlSelectQueryBuilderHKT, undefined, SelectedFields, 'partial', never>
	{
		return fields
			? new MySqlSelectQueryBuilderBase({
				table: undefined,
				fields,
				session: undefined,
				dialect: this.getDialect(),
				isPartialSelect: true,
			})
			: new MySqlSelectBuilder({
				session: undefined,
				dialect: this.getDialect(),
			});
	}

	selectDistinct(): MySqlSelectBuilder<never, 'qb'>;
	selectDistinct<TSelection extends SelectedFields>(
		fields: TSelection,
	): MySqlSelectQueryBuilderBase<MySqlSelectQueryBuilderHKT, undefined, TSelection, 'partial', never>;
	selectDistinct<TSelection extends SelectedFields>(
		fields?: TSelection,
	):
		| MySqlSelectBuilder<never, 'qb'>
		| MySqlSelectQueryBuilderBase<MySqlSelectQueryBuilderHKT, undefined, SelectedFields, 'partial', never>
	{
		return fields
			? new MySqlSelectQueryBuilderBase({
				table: undefined,
				fields,
				session: undefined,
				dialect: this.getDialect(),
				isPartialSelect: true,
				distinct: true,
			})
			: new MySqlSelectBuilder({
				session: undefined,
				dialect: this.getDialect(),
				distinct: true,
			});
	}

	// Lazy load dialect to avoid circular dependency
	private getDialect() {
		if (!this.dialect) {
			this.dialect = new MySqlDialect();
		}

		return this.dialect;
	}
}
