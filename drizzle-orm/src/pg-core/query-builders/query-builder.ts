import { entityKind, is } from '~/entity.ts';
import type { PgDialectConfig } from '~/pg-core/dialect.ts';
import { PgDialect } from '~/pg-core/dialect.ts';
import type { TypedQueryBuilder } from '~/query-builders/query-builder.ts';
import { SelectionProxyHandler } from '~/selection-proxy.ts';
import type { ColumnsSelection, SQL, SQLWrapper } from '~/sql/sql.ts';
import { WithSubquery } from '~/subquery.ts';
import type { PgColumn } from '../columns/index.ts';
import type { WithBuilder } from '../subquery.ts';
import { PgSelectBase, type PgSelectBuilder } from './select.ts';
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

		function select(): PgSelectBuilder<undefined>;
		function select<TSelection extends SelectedFields>(fields: TSelection): PgSelectBuilder<TSelection>;
		function select<TSelection extends SelectedFields>(
			fields?: TSelection,
		): PgSelectBuilder<TSelection | undefined> {
			return new PgSelectBase({
				fields: fields ?? undefined,
				session: undefined,
				dialect: self.getDialect(),
				withList: queries,
			}) as any;
		}

		function selectDistinct(): PgSelectBuilder<undefined>;
		function selectDistinct<TSelection extends SelectedFields>(
			fields: TSelection,
		): PgSelectBuilder<TSelection>;
		function selectDistinct<TSelection extends SelectedFields>(
			fields?: TSelection,
		): PgSelectBuilder<TSelection | undefined> {
			return new PgSelectBase({
				fields: fields ?? undefined,
				session: undefined,
				dialect: self.getDialect(),
				distinct: true,
			}) as any;
		}

		function selectDistinctOn(on: (PgColumn | SQLWrapper)[]): PgSelectBuilder<undefined>;
		function selectDistinctOn<TSelection extends SelectedFields>(
			on: (PgColumn | SQLWrapper)[],
			fields: TSelection,
		): PgSelectBuilder<TSelection>;
		function selectDistinctOn<TSelection extends SelectedFields>(
			on: (PgColumn | SQLWrapper)[],
			fields?: TSelection,
		): PgSelectBuilder<TSelection | undefined> {
			return new PgSelectBase({
				fields: fields ?? undefined,
				session: undefined,
				dialect: self.getDialect(),
				distinct: { on },
			}) as any;
		}

		return { select, selectDistinct, selectDistinctOn };
	}

	select(): PgSelectBuilder<undefined>;
	select<TSelection extends SelectedFields>(fields: TSelection): PgSelectBuilder<TSelection>;
	select<TSelection extends SelectedFields>(
		fields?: TSelection,
	): PgSelectBuilder<TSelection | undefined> {
		return new PgSelectBase({
			fields: fields ?? undefined,
			session: undefined,
			dialect: this.getDialect(),
		}) as any;
	}

	selectDistinct(): PgSelectBuilder<undefined>;
	selectDistinct<TSelection extends SelectedFields>(fields: TSelection): PgSelectBuilder<TSelection>;
	selectDistinct<TSelection extends SelectedFields>(
		fields?: TSelection,
	): PgSelectBuilder<TSelection | undefined> {
		return new PgSelectBase({
			fields: fields ?? undefined,
			session: undefined,
			dialect: this.getDialect(),
			distinct: true,
		}) as any;
	}

	selectDistinctOn(on: (PgColumn | SQLWrapper)[]): PgSelectBuilder<undefined>;
	selectDistinctOn<TSelection extends SelectedFields>(
		on: (PgColumn | SQLWrapper)[],
		fields: TSelection,
	): PgSelectBuilder<TSelection>;
	selectDistinctOn<TSelection extends SelectedFields>(
		on: (PgColumn | SQLWrapper)[],
		fields?: TSelection,
	): PgSelectBuilder<TSelection | undefined> {
		return new PgSelectBase({
			fields: fields ?? undefined,
			session: undefined,
			dialect: this.getDialect(),
			distinct: { on },
		}) as any;
	}

	// Lazy load dialect to avoid circular dependency
	private getDialect() {
		if (!this.dialect) {
			this.dialect = new PgDialect(this.dialectConfig);
		}

		return this.dialect;
	}
}
