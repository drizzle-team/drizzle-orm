import { entityKind, is } from '~/entity.ts';
import type { PgDialectConfig } from '~/pg-core/dialect.ts';
import { PgDialect } from '~/pg-core/dialect.ts';
import type { TypedQueryBuilder } from '~/query-builders/query-builder.ts';
import { SelectionProxyHandler } from '~/selection-proxy.ts';
import type { ColumnsSelection, SQL, SQLWrapper } from '~/sql/sql.ts';
import { WithSubquery } from '~/subquery.ts';
import type { PgColumn } from '../columns/index.ts';
import type { WithBuilder } from '../subquery.ts';
import { PgSelectBase, type PgSelectQueryBuilderInit } from './select.ts';
import type { SelectedFields } from './select.types.ts';

export class QueryBuilder {
	static readonly [entityKind]: string = 'PgQueryBuilder';

	private dialect: PgDialect | undefined;
	private dialectConfig: PgDialectConfig | undefined;

	constructor(dialect?: PgDialect | PgDialectConfig) {
		this.dialect = is(dialect, PgDialect) ? dialect : undefined;
		this.dialectConfig = is(dialect, PgDialect) ? undefined : dialect;
	}

	$with: WithBuilder = (alias: string, selection?: ColumnsSelection) => {
		const queryBuilder = this;
		const as = (
			qb:
				| TypedQueryBuilder<ColumnsSelection | undefined>
				| SQL
				| ((qb: QueryBuilder) => TypedQueryBuilder<ColumnsSelection | undefined> | SQL),
		) => {
			if (typeof qb === 'function') {
				qb = qb(queryBuilder);
			}

			return new Proxy(
				new WithSubquery(
					qb.getSQL(),
					selection ?? ('getSelectedFields' in qb ? qb.getSelectedFields() ?? {} : {}) as SelectedFields,
					alias,
					true,
				),
				new SelectionProxyHandler({ alias, sqlAliasedBehavior: 'alias', sqlBehavior: 'error' }),
			) as any;
		};
		return { as };
	};

	with(...queries: WithSubquery[]) {
		const self = this;

		function select(): PgSelectQueryBuilderInit<undefined>;
		function select<TSelection extends SelectedFields>(fields: TSelection): PgSelectQueryBuilderInit<TSelection>;
		function select<TSelection extends SelectedFields>(
			fields?: TSelection,
		): PgSelectQueryBuilderInit<TSelection | undefined> {
			return new PgSelectBase({
				fields: fields ?? undefined,
				session: undefined,
				dialect: self.getDialect(),
				withList: queries,
			});
		}

		function selectDistinct(): PgSelectQueryBuilderInit<undefined>;
		function selectDistinct<TSelection extends SelectedFields>(
			fields: TSelection,
		): PgSelectQueryBuilderInit<TSelection>;
		function selectDistinct<TSelection extends SelectedFields>(
			fields?: TSelection,
		): PgSelectQueryBuilderInit<TSelection | undefined> {
			return new PgSelectBase({
				fields: fields ?? undefined,
				session: undefined,
				dialect: self.getDialect(),
				distinct: true,
			});
		}

		function selectDistinctOn(on: (PgColumn | SQLWrapper)[]): PgSelectQueryBuilderInit<undefined>;
		function selectDistinctOn<TSelection extends SelectedFields>(
			on: (PgColumn | SQLWrapper)[],
			fields: TSelection,
		): PgSelectQueryBuilderInit<TSelection>;
		function selectDistinctOn<TSelection extends SelectedFields>(
			on: (PgColumn | SQLWrapper)[],
			fields?: TSelection,
		): PgSelectQueryBuilderInit<TSelection | undefined> {
			return new PgSelectBase({
				fields: fields ?? undefined,
				session: undefined,
				dialect: self.getDialect(),
				distinct: { on },
			});
		}

		return { select, selectDistinct, selectDistinctOn };
	}

	select(): PgSelectQueryBuilderInit<undefined>;
	select<TSelection extends SelectedFields>(fields: TSelection): PgSelectQueryBuilderInit<TSelection>;
	select<TSelection extends SelectedFields>(
		fields?: TSelection,
	): PgSelectQueryBuilderInit<TSelection | undefined> {
		return new PgSelectBase({
			fields: fields ?? undefined,
			session: undefined,
			dialect: this.getDialect(),
		});
	}

	selectDistinct(): PgSelectQueryBuilderInit<undefined>;
	selectDistinct<TSelection extends SelectedFields>(fields: TSelection): PgSelectQueryBuilderInit<TSelection>;
	selectDistinct<TSelection extends SelectedFields>(
		fields?: TSelection,
	): PgSelectQueryBuilderInit<TSelection | undefined> {
		return new PgSelectBase({
			fields: fields ?? undefined,
			session: undefined,
			dialect: this.getDialect(),
			distinct: true,
		});
	}

	selectDistinctOn(on: (PgColumn | SQLWrapper)[]): PgSelectQueryBuilderInit<undefined>;
	selectDistinctOn<TSelection extends SelectedFields>(
		on: (PgColumn | SQLWrapper)[],
		fields: TSelection,
	): PgSelectQueryBuilderInit<TSelection>;
	selectDistinctOn<TSelection extends SelectedFields>(
		on: (PgColumn | SQLWrapper)[],
		fields?: TSelection,
	): PgSelectQueryBuilderInit<TSelection | undefined> {
		return new PgSelectBase({
			fields: fields ?? undefined,
			session: undefined,
			dialect: this.getDialect(),
			distinct: { on },
		});
	}

	// Lazy load dialect to avoid circular dependency
	private getDialect() {
		if (!this.dialect) {
			this.dialect = new PgDialect(this.dialectConfig);
		}

		return this.dialect;
	}
}
