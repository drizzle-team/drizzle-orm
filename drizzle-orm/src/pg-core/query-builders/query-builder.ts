import { entityKind } from '~/entity.ts';
import { PgDialect } from '~/pg-core/dialect.ts';
import type { TypedQueryBuilder } from '~/query-builders/query-builder.ts';
import type { ColumnsSelection, SQLWrapper } from '~/sql/sql.ts';
import type { PgColumn } from '../columns/index.ts';
import type { WithSubqueryWithSelection } from '../subquery.ts';
import { PgSelectBuilder } from './select.ts';
import type { SelectedFields } from './select.types.ts';
import { WithSubquery } from '~/subquery.ts';
import { SelectionProxyHandler } from '~/selection-proxy.ts';

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

	with(...queries: WithSubquery[]) {
		const self = this;

		function select(): PgSelectBuilder<undefined, 'qb'>;
		function select<TSelection extends SelectedFields>(fields: TSelection): PgSelectBuilder<TSelection, 'qb'>;
		function select<TSelection extends SelectedFields>(
			fields?: TSelection,
		): PgSelectBuilder<TSelection | undefined, 'qb'> {
			return new PgSelectBuilder({
				fields: fields ?? undefined,
				session: undefined,
				dialect: self.getDialect(),
				withList: queries,
			});
		}

		function selectDistinct(): PgSelectBuilder<undefined, 'qb'>;
		function selectDistinct<TSelection extends SelectedFields>(fields: TSelection): PgSelectBuilder<TSelection, 'qb'>;
		function selectDistinct(fields?: SelectedFields): PgSelectBuilder<SelectedFields | undefined, 'qb'> {
			return new PgSelectBuilder({
				fields: fields ?? undefined,
				session: undefined,
				dialect: self.getDialect(),
				distinct: true,
			});
		}

		function selectDistinctOn(on: (PgColumn | SQLWrapper)[]): PgSelectBuilder<undefined, 'qb'>;
		function selectDistinctOn<TSelection extends SelectedFields>(
			on: (PgColumn | SQLWrapper)[],
			fields: TSelection,
		): PgSelectBuilder<TSelection, 'qb'>;
		function selectDistinctOn(
			on: (PgColumn | SQLWrapper)[],
			fields?: SelectedFields,
		): PgSelectBuilder<SelectedFields | undefined, 'qb'> {
			return new PgSelectBuilder({
				fields: fields ?? undefined,
				session: undefined,
				dialect: self.getDialect(),
				distinct: { on },
			});
		}

		return { select, selectDistinct, selectDistinctOn };
	}

	select(): PgSelectBuilder<undefined, 'qb'>;
	select<TSelection extends SelectedFields>(fields: TSelection): PgSelectBuilder<TSelection, 'qb'>;
	select<TSelection extends SelectedFields>(fields?: TSelection): PgSelectBuilder<TSelection | undefined, 'qb'> {
		return new PgSelectBuilder({
			fields: fields ?? undefined,
			session: undefined,
			dialect: this.getDialect(),
		});
	}

	selectDistinct(): PgSelectBuilder<undefined>;
	selectDistinct<TSelection extends SelectedFields>(fields: TSelection): PgSelectBuilder<TSelection>;
	selectDistinct(fields?: SelectedFields): PgSelectBuilder<SelectedFields | undefined> {
		return new PgSelectBuilder({
			fields: fields ?? undefined,
			session: undefined,
			dialect: this.getDialect(),
			distinct: true,
		});
	}

	selectDistinctOn(on: (PgColumn | SQLWrapper)[]): PgSelectBuilder<undefined>;
	selectDistinctOn<TSelection extends SelectedFields>(
		on: (PgColumn | SQLWrapper)[],
		fields: TSelection,
	): PgSelectBuilder<TSelection>;
	selectDistinctOn(
		on: (PgColumn | SQLWrapper)[],
		fields?: SelectedFields,
	): PgSelectBuilder<SelectedFields | undefined> {
		return new PgSelectBuilder({
			fields: fields ?? undefined,
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
