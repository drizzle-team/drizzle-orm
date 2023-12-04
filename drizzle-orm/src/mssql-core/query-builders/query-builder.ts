import { entityKind } from '~/entity.ts';
import { MsSqlDialect } from '~/mssql-core/dialect.ts';
import type { WithSubqueryWithSelection } from '~/mssql-core/subquery.ts';
import type { TypedQueryBuilder } from '~/query-builders/query-builder.ts';
import { MsSqlSelectBuilder } from './select.ts';
import type { SelectedFields } from './select.types.ts';
import { WithSubquery } from '~/subquery.ts';
import { SelectionProxyHandler } from '~/selection-proxy.ts';
import type { ColumnsSelection } from '~/sql/sql.ts';

export class QueryBuilder {
	static readonly [entityKind]: string = 'MsSqlQueryBuilder';

	private dialect: MsSqlDialect | undefined;

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

		function select(): MsSqlSelectBuilder<undefined, never, 'qb'>;
		function select<TSelection extends SelectedFields>(
			fields: TSelection,
		): MsSqlSelectBuilder<TSelection, never, 'qb'>;
		function select<TSelection extends SelectedFields>(
			fields?: TSelection,
		): MsSqlSelectBuilder<TSelection | undefined, never, 'qb'> {
			return new MsSqlSelectBuilder({
				fields: fields ?? undefined,
				session: undefined,
				dialect: self.getDialect(),
				withList: queries,
			});
		}

		function selectDistinct(): MsSqlSelectBuilder<undefined, never, 'qb'>;
		function selectDistinct<TSelection extends SelectedFields>(
			fields: TSelection,
		): MsSqlSelectBuilder<TSelection, never, 'qb'>;
		function selectDistinct<TSelection extends SelectedFields>(
			fields?: TSelection,
		): MsSqlSelectBuilder<TSelection | undefined, never, 'qb'> {
			return new MsSqlSelectBuilder({
				fields: fields ?? undefined,
				session: undefined,
				dialect: self.getDialect(),
				withList: queries,
				distinct: true,
			});
		}

		return { select, selectDistinct };
	}

	select(): MsSqlSelectBuilder<undefined, never, 'qb'>;
	select<TSelection extends SelectedFields>(fields: TSelection): MsSqlSelectBuilder<TSelection, never, 'qb'>;
	select<TSelection extends SelectedFields>(
		fields?: TSelection,
	): MsSqlSelectBuilder<TSelection | undefined, never, 'qb'> {
		return new MsSqlSelectBuilder({ fields: fields ?? undefined, session: undefined, dialect: this.getDialect() });
	}

	selectDistinct(): MsSqlSelectBuilder<undefined, never, 'qb'>;
	selectDistinct<TSelection extends SelectedFields>(
		fields: TSelection,
	): MsSqlSelectBuilder<TSelection, never, 'qb'>;
	selectDistinct<TSelection extends SelectedFields>(
		fields?: TSelection,
	): MsSqlSelectBuilder<TSelection | undefined, never, 'qb'> {
		return new MsSqlSelectBuilder({
			fields: fields ?? undefined,
			session: undefined,
			dialect: this.getDialect(),
			distinct: true,
		});
	}

	// Lazy load dialect to avoid circular dependency
	private getDialect() {
		if (!this.dialect) {
			this.dialect = new MsSqlDialect();
		}

		return this.dialect;
	}
}
