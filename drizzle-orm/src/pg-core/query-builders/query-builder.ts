import { entityKind, is } from '~/entity.ts';
import { PgDialect } from '~/pg-core/dialect.ts';
import type { TypedQueryBuilder } from '~/query-builders/query-builder.ts';
import { SelectionProxyHandler } from '~/selection-proxy.ts';
import type { ColumnsSelection, SQLWrapper } from '~/sql/sql.ts';
import { WithSubquery } from '~/subquery.ts';
import type { PgColumn } from '../columns/index.ts';
import type { WithSubqueryWithSelection } from '../subquery.ts';
import { PgSelectBuilder, PgSelectQueryBuilderBase } from './select.ts';
import type { PgSelectQueryBuilderHKT, SelectedFields } from './select.types.ts';

export class QueryBuilder {
	static readonly [entityKind]: string = 'PgQueryBuilder';

	private dialect: PgDialect | undefined;

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

				if (is(qb, PgSelectQueryBuilderBase)) {
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

		function select(): PgSelectBuilder<'qb'>;
		function select<TSelection extends SelectedFields>(
			fields: TSelection,
		): PgSelectQueryBuilderBase<PgSelectQueryBuilderHKT, undefined, TSelection, 'partial'>;
		function select<TSelection extends SelectedFields>(
			fields?: TSelection,
		): PgSelectBuilder<'qb'> | PgSelectQueryBuilderBase<PgSelectQueryBuilderHKT, undefined, TSelection, 'partial'> {
			return fields
				? new PgSelectQueryBuilderBase({
					table: undefined,
					fields,
					session: undefined,
					dialect: self.getDialect(),
					withList: queries,
					isPartialSelect: true,
				})
				: new PgSelectBuilder({
					session: undefined,
					dialect: self.getDialect(),
					withList: queries,
				});
		}

		function selectDistinct(): PgSelectBuilder<'qb'>;
		function selectDistinct<TSelection extends SelectedFields>(
			fields: TSelection,
		): PgSelectQueryBuilderBase<PgSelectQueryBuilderHKT, undefined, TSelection, 'partial'>;
		function selectDistinct<TSelection extends SelectedFields>(
			fields?: TSelection,
		): PgSelectBuilder<'qb'> | PgSelectQueryBuilderBase<PgSelectQueryBuilderHKT, undefined, TSelection, 'partial'> {
			return fields
				? new PgSelectQueryBuilderBase({
					table: undefined,
					fields,
					session: undefined,
					dialect: self.getDialect(),
					withList: queries,
					isPartialSelect: true,
					distinct: true,
				})
				: new PgSelectBuilder({
					session: undefined,
					dialect: self.getDialect(),
					withList: queries,
					distinct: true,
				});
		}

		function selectDistinctOn(on: (PgColumn | SQLWrapper)[]): PgSelectBuilder<'qb'>;
		function selectDistinctOn<TSelection extends SelectedFields>(
			on: (PgColumn | SQLWrapper)[],
			fields: TSelection,
		): PgSelectQueryBuilderBase<PgSelectQueryBuilderHKT, undefined, TSelection, 'partial'>;
		function selectDistinctOn<TSelection extends SelectedFields>(
			on: (PgColumn | SQLWrapper)[],
			fields?: SelectedFields,
		): PgSelectBuilder<'qb'> | PgSelectQueryBuilderBase<PgSelectQueryBuilderHKT, undefined, TSelection, 'partial'> {
			return fields
				? new PgSelectQueryBuilderBase({
					table: undefined,
					fields,
					session: undefined,
					dialect: self.getDialect(),
					withList: queries,
					isPartialSelect: true,
					distinct: { on },
				})
				: new PgSelectBuilder({
					session: undefined,
					dialect: self.getDialect(),
					withList: queries,
					distinct: { on },
				});
		}

		return { select, selectDistinct, selectDistinctOn };
	}

	withRecursive(...queries: WithSubquery[]) {
		const self = this;

		function select(): PgSelectBuilder<'qb'>;
		function select<TSelection extends SelectedFields>(
			fields: TSelection,
		): PgSelectQueryBuilderBase<PgSelectQueryBuilderHKT, undefined, TSelection, 'partial'>;
		function select<TSelection extends SelectedFields>(
			fields?: TSelection,
		): PgSelectBuilder<'qb'> | PgSelectQueryBuilderBase<PgSelectQueryBuilderHKT, undefined, TSelection, 'partial'> {
			return fields
				? new PgSelectQueryBuilderBase({
					table: undefined,
					fields,
					session: undefined,
					dialect: self.getDialect(),
					withList: queries,
					isPartialSelect: true,
					recursive: true,
				})
				: new PgSelectBuilder({
					session: undefined,
					dialect: self.getDialect(),
					withList: queries,
					recursive: true,
				});
		}

		function selectDistinct(): PgSelectBuilder<'qb'>;
		function selectDistinct<TSelection extends SelectedFields>(
			fields: TSelection,
		): PgSelectQueryBuilderBase<PgSelectQueryBuilderHKT, undefined, TSelection, 'partial'>;
		function selectDistinct<TSelection extends SelectedFields>(
			fields?: TSelection,
		): PgSelectBuilder<'qb'> | PgSelectQueryBuilderBase<PgSelectQueryBuilderHKT, undefined, TSelection, 'partial'> {
			return fields
				? new PgSelectQueryBuilderBase({
					table: undefined,
					fields,
					session: undefined,
					dialect: self.getDialect(),
					withList: queries,
					isPartialSelect: true,
					distinct: true,
					recursive: true,
				})
				: new PgSelectBuilder({
					session: undefined,
					dialect: self.getDialect(),
					withList: queries,
					distinct: true,
					recursive: true,
				});
		}

		function selectDistinctOn(on: (PgColumn | SQLWrapper)[]): PgSelectBuilder<'qb'>;
		function selectDistinctOn<TSelection extends SelectedFields>(
			on: (PgColumn | SQLWrapper)[],
			fields: TSelection,
		): PgSelectQueryBuilderBase<PgSelectQueryBuilderHKT, undefined, TSelection, 'partial'>;
		function selectDistinctOn<TSelection extends SelectedFields>(
			on: (PgColumn | SQLWrapper)[],
			fields?: SelectedFields,
		): PgSelectBuilder<'qb'> | PgSelectQueryBuilderBase<PgSelectQueryBuilderHKT, undefined, TSelection, 'partial'> {
			return fields
				? new PgSelectQueryBuilderBase({
					table: undefined,
					fields,
					session: undefined,
					dialect: self.getDialect(),
					withList: queries,
					isPartialSelect: true,
					distinct: { on },
					recursive: true,
				})
				: new PgSelectBuilder({
					session: undefined,
					dialect: self.getDialect(),
					withList: queries,
					distinct: { on },
					recursive: true,
				});
		}

		return { select, selectDistinct, selectDistinctOn };
	}

	select(): PgSelectBuilder<'qb'>;
	select<TSelection extends SelectedFields>(
		fields: TSelection,
	): PgSelectQueryBuilderBase<PgSelectQueryBuilderHKT, undefined, TSelection, 'partial'>;
	select<TSelection extends SelectedFields>(
		fields?: TSelection,
	): PgSelectBuilder<'qb'> | PgSelectQueryBuilderBase<PgSelectQueryBuilderHKT, undefined, TSelection, 'partial'> {
		return fields
			? new PgSelectQueryBuilderBase({
				table: undefined,
				fields,
				session: undefined,
				dialect: this.getDialect(),
				isPartialSelect: true,
			})
			: new PgSelectBuilder({
				session: undefined,
				dialect: this.getDialect(),
			});
	}

	selectDistinct(): PgSelectBuilder<'qb'>;
	selectDistinct<TSelection extends SelectedFields>(
		fields: TSelection,
	): PgSelectQueryBuilderBase<PgSelectQueryBuilderHKT, undefined, TSelection, 'partial'>;
	selectDistinct<TSelection extends SelectedFields>(
		fields?: TSelection,
	): PgSelectBuilder<'qb'> | PgSelectQueryBuilderBase<PgSelectQueryBuilderHKT, undefined, TSelection, 'partial'> {
		return fields
			? new PgSelectQueryBuilderBase({
				table: undefined,
				fields,
				session: undefined,
				dialect: this.getDialect(),
				isPartialSelect: true,
				distinct: true,
			})
			: new PgSelectBuilder({
				session: undefined,
				dialect: this.getDialect(),
				distinct: true,
			});
	}

	selectDistinctOn(on: (PgColumn | SQLWrapper)[]): PgSelectBuilder<'qb'>;
	selectDistinctOn<TSelection extends SelectedFields>(
		on: (PgColumn | SQLWrapper)[],
		fields: TSelection,
	): PgSelectQueryBuilderBase<PgSelectQueryBuilderHKT, undefined, TSelection, 'partial'>;
	selectDistinctOn<TSelection extends SelectedFields>(
		on: (PgColumn | SQLWrapper)[],
		fields?: SelectedFields,
	): PgSelectBuilder<'qb'> | PgSelectQueryBuilderBase<PgSelectQueryBuilderHKT, undefined, TSelection, 'partial'> {
		return fields
			? new PgSelectQueryBuilderBase({
				table: undefined,
				fields,
				session: undefined,
				dialect: this.getDialect(),
				isPartialSelect: true,
				distinct: { on },
			})
			: new PgSelectBuilder({
				session: undefined,
				dialect: this.getDialect(),
				distinct: { on },
			});
	}

	// Lazy load dialect to avoid circular dependency
	private getDialect() {
		if (!this.dialect) {
			this.dialect = new PgDialect();
		}

		return this.dialect;
	}
}
