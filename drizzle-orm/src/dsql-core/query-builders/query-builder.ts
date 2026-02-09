import { entityKind, is } from '~/entity.ts';
import { SelectionProxyHandler } from '~/selection-proxy.ts';
import type { ColumnsSelection, SQL, SQLWrapper } from '~/sql/sql.ts';
import { WithSubquery } from '~/subquery.ts';
import type { DSQLColumn } from '../columns/common.ts';
import type { DSQLDialect, DSQLDialectConfig } from '../dialect.ts';
import { DSQLDialect as DSQLDialectClass } from '../dialect.ts';
import type { WithBuilder } from '../subquery.ts';
import { DSQLSelectBuilder, type SelectedFields } from './select.ts';

export class QueryBuilder {
	static readonly [entityKind]: string = 'DSQLQueryBuilder';

	private dialect: DSQLDialect | undefined;
	private dialectConfig: DSQLDialectConfig | undefined;

	constructor(dialect?: DSQLDialect | DSQLDialectConfig) {
		this.dialect = is(dialect, DSQLDialectClass) ? dialect : undefined;
		this.dialectConfig = is(dialect, DSQLDialectClass) ? undefined : dialect;
	}

	$with: WithBuilder = (alias: string, selection?: ColumnsSelection) => {
		const queryBuilder = this;
		const as = (
			qb:
				| { getSQL: () => SQL; getSelectedFields?: () => ColumnsSelection | undefined }
				| SQL
				| ((qb: QueryBuilder) => { getSQL: () => SQL; getSelectedFields?: () => ColumnsSelection | undefined } | SQL),
		) => {
			if (typeof qb === 'function') {
				qb = qb(queryBuilder);
			}

			return new Proxy(
				new WithSubquery(
					qb.getSQL(),
					selection ?? ('getSelectedFields' in qb ? qb.getSelectedFields?.() ?? {} : {}) as SelectedFields,
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

		function select(): DSQLSelectBuilder<undefined>;
		function select<TSelection extends SelectedFields>(fields: TSelection): DSQLSelectBuilder<TSelection>;
		function select<TSelection extends SelectedFields>(
			fields?: TSelection,
		): DSQLSelectBuilder<TSelection | undefined> {
			return new DSQLSelectBuilder({
				fields: fields ?? undefined,
				session: undefined,
				dialect: self.getDialect(),
				withList: queries,
			}) as any;
		}

		function selectDistinct(): DSQLSelectBuilder<undefined>;
		function selectDistinct<TSelection extends SelectedFields>(
			fields: TSelection,
		): DSQLSelectBuilder<TSelection>;
		function selectDistinct<TSelection extends SelectedFields>(
			fields?: TSelection,
		): DSQLSelectBuilder<TSelection | undefined> {
			return new DSQLSelectBuilder({
				fields: fields ?? undefined,
				session: undefined,
				dialect: self.getDialect(),
				distinct: true,
			}) as any;
		}

		function selectDistinctOn(on: (DSQLColumn | SQLWrapper)[]): DSQLSelectBuilder<undefined>;
		function selectDistinctOn<TSelection extends SelectedFields>(
			on: (DSQLColumn | SQLWrapper)[],
			fields: TSelection,
		): DSQLSelectBuilder<TSelection>;
		function selectDistinctOn<TSelection extends SelectedFields>(
			on: (DSQLColumn | SQLWrapper)[],
			fields?: TSelection,
		): DSQLSelectBuilder<TSelection | undefined> {
			return new DSQLSelectBuilder({
				fields: fields ?? undefined,
				session: undefined,
				dialect: self.getDialect(),
				distinct: { on },
			}) as any;
		}

		return { select, selectDistinct, selectDistinctOn };
	}

	select(): DSQLSelectBuilder<undefined>;
	select<TSelection extends SelectedFields>(fields: TSelection): DSQLSelectBuilder<TSelection>;
	select<TSelection extends SelectedFields>(
		fields?: TSelection,
	): DSQLSelectBuilder<TSelection | undefined> {
		return new DSQLSelectBuilder({
			fields: fields ?? undefined,
			session: undefined,
			dialect: this.getDialect(),
		}) as any;
	}

	selectDistinct(): DSQLSelectBuilder<undefined>;
	selectDistinct<TSelection extends SelectedFields>(fields: TSelection): DSQLSelectBuilder<TSelection>;
	selectDistinct<TSelection extends SelectedFields>(
		fields?: TSelection,
	): DSQLSelectBuilder<TSelection | undefined> {
		return new DSQLSelectBuilder({
			fields: fields ?? undefined,
			session: undefined,
			dialect: this.getDialect(),
			distinct: true,
		}) as any;
	}

	selectDistinctOn(on: (DSQLColumn | SQLWrapper)[]): DSQLSelectBuilder<undefined>;
	selectDistinctOn<TSelection extends SelectedFields>(
		on: (DSQLColumn | SQLWrapper)[],
		fields: TSelection,
	): DSQLSelectBuilder<TSelection>;
	selectDistinctOn<TSelection extends SelectedFields>(
		on: (DSQLColumn | SQLWrapper)[],
		fields?: TSelection,
	): DSQLSelectBuilder<TSelection | undefined> {
		return new DSQLSelectBuilder({
			fields: fields ?? undefined,
			session: undefined,
			dialect: this.getDialect(),
			distinct: { on },
		}) as any;
	}

	// Lazy load dialect to avoid circular dependency
	private getDialect() {
		if (!this.dialect) {
			this.dialect = new DSQLDialectClass(this.dialectConfig);
		}

		return this.dialect;
	}
}
