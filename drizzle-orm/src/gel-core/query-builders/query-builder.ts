import { entityKind, is } from '~/entity.ts';
import type { GelDialectConfig } from '~/gel-core/dialect.ts';
import { GelDialect } from '~/gel-core/dialect.ts';
import type { TypedQueryBuilder } from '~/query-builders/query-builder.ts';
import { SelectionProxyHandler } from '~/selection-proxy.ts';
import type { ColumnsSelection, SQLWrapper } from '~/sql/sql.ts';
import { WithSubquery } from '~/subquery.ts';
import type { GelColumn } from '../columns/index.ts';
import type { WithSubqueryWithSelection } from '../subquery.ts';
import { GelSelectBuilder } from './select.ts';
import type { SelectedFields } from './select.types.ts';

export class QueryBuilder {
	static readonly [entityKind]: string = 'GelQueryBuilder';

	private dialect: GelDialect | undefined;
	private dialectConfig: GelDialectConfig | undefined;

	constructor(dialect?: GelDialect | GelDialectConfig) {
		this.dialect = is(dialect, GelDialect) ? dialect : undefined;
		this.dialectConfig = is(dialect, GelDialect) ? undefined : dialect;
	}

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

		function select(): GelSelectBuilder<undefined, 'qb'>;
		function select<TSelection extends SelectedFields>(fields: TSelection): GelSelectBuilder<TSelection, 'qb'>;
		function select<TSelection extends SelectedFields>(
			fields?: TSelection,
		): GelSelectBuilder<TSelection | undefined, 'qb'> {
			return new GelSelectBuilder({
				fields: fields ?? undefined,
				session: undefined,
				dialect: self.getDialect(),
				withList: queries,
			});
		}

		function selectDistinct(): GelSelectBuilder<undefined, 'qb'>;
		function selectDistinct<TSelection extends SelectedFields>(fields: TSelection): GelSelectBuilder<TSelection, 'qb'>;
		function selectDistinct(fields?: SelectedFields): GelSelectBuilder<SelectedFields | undefined, 'qb'> {
			return new GelSelectBuilder({
				fields: fields ?? undefined,
				session: undefined,
				dialect: self.getDialect(),
				distinct: true,
			});
		}

		function selectDistinctOn(on: (GelColumn | SQLWrapper)[]): GelSelectBuilder<undefined, 'qb'>;
		function selectDistinctOn<TSelection extends SelectedFields>(
			on: (GelColumn | SQLWrapper)[],
			fields: TSelection,
		): GelSelectBuilder<TSelection, 'qb'>;
		function selectDistinctOn(
			on: (GelColumn | SQLWrapper)[],
			fields?: SelectedFields,
		): GelSelectBuilder<SelectedFields | undefined, 'qb'> {
			return new GelSelectBuilder({
				fields: fields ?? undefined,
				session: undefined,
				dialect: self.getDialect(),
				distinct: { on },
			});
		}

		return { select, selectDistinct, selectDistinctOn };
	}

	select(): GelSelectBuilder<undefined, 'qb'>;
	select<TSelection extends SelectedFields>(fields: TSelection): GelSelectBuilder<TSelection, 'qb'>;
	select<TSelection extends SelectedFields>(fields?: TSelection): GelSelectBuilder<TSelection | undefined, 'qb'> {
		return new GelSelectBuilder({
			fields: fields ?? undefined,
			session: undefined,
			dialect: this.getDialect(),
		});
	}

	selectDistinct(): GelSelectBuilder<undefined>;
	selectDistinct<TSelection extends SelectedFields>(fields: TSelection): GelSelectBuilder<TSelection>;
	selectDistinct(fields?: SelectedFields): GelSelectBuilder<SelectedFields | undefined> {
		return new GelSelectBuilder({
			fields: fields ?? undefined,
			session: undefined,
			dialect: this.getDialect(),
			distinct: true,
		});
	}

	selectDistinctOn(on: (GelColumn | SQLWrapper)[]): GelSelectBuilder<undefined>;
	selectDistinctOn<TSelection extends SelectedFields>(
		on: (GelColumn | SQLWrapper)[],
		fields: TSelection,
	): GelSelectBuilder<TSelection>;
	selectDistinctOn(
		on: (GelColumn | SQLWrapper)[],
		fields?: SelectedFields,
	): GelSelectBuilder<SelectedFields | undefined> {
		return new GelSelectBuilder({
			fields: fields ?? undefined,
			session: undefined,
			dialect: this.getDialect(),
			distinct: { on },
		});
	}

	// Lazy load dialect to avoid circular dependency
	private getDialect() {
		if (!this.dialect) {
			this.dialect = new GelDialect(this.dialectConfig);
		}

		return this.dialect;
	}
}
