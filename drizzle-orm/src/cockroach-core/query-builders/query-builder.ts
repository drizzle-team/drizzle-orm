import type { CockroachDialectConfig } from '~/cockroach-core/dialect.ts';
import { CockroachDialect } from '~/cockroach-core/dialect.ts';
import { entityKind, is } from '~/entity.ts';
import type { TypedQueryBuilder } from '~/query-builders/query-builder.ts';
import { SelectionProxyHandler } from '~/selection-proxy.ts';
import type { ColumnsSelection, SQL, SQLWrapper } from '~/sql/sql.ts';
import { WithSubquery } from '~/subquery.ts';
import type { CockroachColumn } from '../columns/index.ts';
import type { WithBuilder } from '../subquery.ts';
import { CockroachSelectBuilder } from './select.ts';
import type { SelectedFields } from './select.types.ts';

export class QueryBuilder {
	static readonly [entityKind]: string = 'CockroachQueryBuilder';

	private dialect: CockroachDialect | undefined;
	private dialectConfig: CockroachDialectConfig | undefined;

	constructor(dialect?: CockroachDialect | CockroachDialectConfig) {
		this.dialect = is(dialect, CockroachDialect) ? dialect : undefined;
		this.dialectConfig = is(dialect, CockroachDialect) ? undefined : dialect;
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

		function select(): CockroachSelectBuilder<undefined, 'qb'>;
		function select<TSelection extends SelectedFields>(fields: TSelection): CockroachSelectBuilder<TSelection, 'qb'>;
		function select<TSelection extends SelectedFields>(
			fields?: TSelection,
		): CockroachSelectBuilder<TSelection | undefined, 'qb'> {
			return new CockroachSelectBuilder({
				fields: fields ?? undefined,
				session: undefined,
				dialect: self.getDialect(),
				withList: queries,
			});
		}

		function selectDistinct(): CockroachSelectBuilder<undefined, 'qb'>;
		function selectDistinct<TSelection extends SelectedFields>(
			fields: TSelection,
		): CockroachSelectBuilder<TSelection, 'qb'>;
		function selectDistinct<TSelection extends SelectedFields>(
			fields?: TSelection,
		): CockroachSelectBuilder<TSelection | undefined, 'qb'> {
			return new CockroachSelectBuilder({
				fields: fields ?? undefined,
				session: undefined,
				dialect: self.getDialect(),
				distinct: true,
			});
		}

		function selectDistinctOn(on: (CockroachColumn | SQLWrapper)[]): CockroachSelectBuilder<undefined, 'qb'>;
		function selectDistinctOn<TSelection extends SelectedFields>(
			on: (CockroachColumn | SQLWrapper)[],
			fields: TSelection,
		): CockroachSelectBuilder<TSelection, 'qb'>;
		function selectDistinctOn<TSelection extends SelectedFields>(
			on: (CockroachColumn | SQLWrapper)[],
			fields?: TSelection,
		): CockroachSelectBuilder<TSelection | undefined, 'qb'> {
			return new CockroachSelectBuilder({
				fields: fields ?? undefined,
				session: undefined,
				dialect: self.getDialect(),
				distinct: { on },
			});
		}

		return { select, selectDistinct, selectDistinctOn };
	}

	select(): CockroachSelectBuilder<undefined, 'qb'>;
	select<TSelection extends SelectedFields>(fields: TSelection): CockroachSelectBuilder<TSelection, 'qb'>;
	select<TSelection extends SelectedFields>(
		fields?: TSelection,
	): CockroachSelectBuilder<TSelection | undefined, 'qb'> {
		return new CockroachSelectBuilder({
			fields: fields ?? undefined,
			session: undefined,
			dialect: this.getDialect(),
		});
	}

	selectDistinct(): CockroachSelectBuilder<undefined>;
	selectDistinct<TSelection extends SelectedFields>(fields: TSelection): CockroachSelectBuilder<TSelection>;
	selectDistinct<TSelection extends SelectedFields>(
		fields?: TSelection,
	): CockroachSelectBuilder<TSelection | undefined> {
		return new CockroachSelectBuilder({
			fields: fields ?? undefined,
			session: undefined,
			dialect: this.getDialect(),
			distinct: true,
		});
	}

	selectDistinctOn(on: (CockroachColumn | SQLWrapper)[]): CockroachSelectBuilder<undefined>;
	selectDistinctOn<TSelection extends SelectedFields>(
		on: (CockroachColumn | SQLWrapper)[],
		fields: TSelection,
	): CockroachSelectBuilder<TSelection>;
	selectDistinctOn<TSelection extends SelectedFields>(
		on: (CockroachColumn | SQLWrapper)[],
		fields?: TSelection,
	): CockroachSelectBuilder<TSelection | undefined> {
		return new CockroachSelectBuilder({
			fields: fields ?? undefined,
			session: undefined,
			dialect: this.getDialect(),
			distinct: { on },
		});
	}

	// Lazy load dialect to avoid circular dependency
	private getDialect() {
		if (!this.dialect) {
			this.dialect = new CockroachDialect(this.dialectConfig);
		}

		return this.dialect;
	}
}
