import type { CockroachDbDialectConfig } from '~/cockroachdb-core/dialect.ts';
import { CockroachDbDialect } from '~/cockroachdb-core/dialect.ts';
import { entityKind, is } from '~/entity.ts';
import type { TypedQueryBuilder } from '~/query-builders/query-builder.ts';
import { SelectionProxyHandler } from '~/selection-proxy.ts';
import type { ColumnsSelection, SQL, SQLWrapper } from '~/sql/sql.ts';
import { WithSubquery } from '~/subquery.ts';
import type { CockroachDbColumn } from '../columns/index.ts';
import type { WithBuilder } from '../subquery.ts';
import { CockroachDbSelectBuilder } from './select.ts';
import type { SelectedFields } from './select.types.ts';

export class QueryBuilder {
	static readonly [entityKind]: string = 'CockroachDbQueryBuilder';

	private dialect: CockroachDbDialect | undefined;
	private dialectConfig: CockroachDbDialectConfig | undefined;

	constructor(dialect?: CockroachDbDialect | CockroachDbDialectConfig) {
		this.dialect = is(dialect, CockroachDbDialect) ? dialect : undefined;
		this.dialectConfig = is(dialect, CockroachDbDialect) ? undefined : dialect;
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

		function select(): CockroachDbSelectBuilder<undefined, 'qb'>;
		function select<TSelection extends SelectedFields>(fields: TSelection): CockroachDbSelectBuilder<TSelection, 'qb'>;
		function select<TSelection extends SelectedFields>(
			fields?: TSelection,
		): CockroachDbSelectBuilder<TSelection | undefined, 'qb'> {
			return new CockroachDbSelectBuilder({
				fields: fields ?? undefined,
				session: undefined,
				dialect: self.getDialect(),
				withList: queries,
			});
		}

		function selectDistinct(): CockroachDbSelectBuilder<undefined, 'qb'>;
		function selectDistinct<TSelection extends SelectedFields>(
			fields: TSelection,
		): CockroachDbSelectBuilder<TSelection, 'qb'>;
		function selectDistinct<TSelection extends SelectedFields>(
			fields?: TSelection,
		): CockroachDbSelectBuilder<TSelection | undefined, 'qb'> {
			return new CockroachDbSelectBuilder({
				fields: fields ?? undefined,
				session: undefined,
				dialect: self.getDialect(),
				distinct: true,
			});
		}

		function selectDistinctOn(on: (CockroachDbColumn | SQLWrapper)[]): CockroachDbSelectBuilder<undefined, 'qb'>;
		function selectDistinctOn<TSelection extends SelectedFields>(
			on: (CockroachDbColumn | SQLWrapper)[],
			fields: TSelection,
		): CockroachDbSelectBuilder<TSelection, 'qb'>;
		function selectDistinctOn<TSelection extends SelectedFields>(
			on: (CockroachDbColumn | SQLWrapper)[],
			fields?: TSelection,
		): CockroachDbSelectBuilder<TSelection | undefined, 'qb'> {
			return new CockroachDbSelectBuilder({
				fields: fields ?? undefined,
				session: undefined,
				dialect: self.getDialect(),
				distinct: { on },
			});
		}

		return { select, selectDistinct, selectDistinctOn };
	}

	select(): CockroachDbSelectBuilder<undefined, 'qb'>;
	select<TSelection extends SelectedFields>(fields: TSelection): CockroachDbSelectBuilder<TSelection, 'qb'>;
	select<TSelection extends SelectedFields>(
		fields?: TSelection,
	): CockroachDbSelectBuilder<TSelection | undefined, 'qb'> {
		return new CockroachDbSelectBuilder({
			fields: fields ?? undefined,
			session: undefined,
			dialect: this.getDialect(),
		});
	}

	selectDistinct(): CockroachDbSelectBuilder<undefined>;
	selectDistinct<TSelection extends SelectedFields>(fields: TSelection): CockroachDbSelectBuilder<TSelection>;
	selectDistinct<TSelection extends SelectedFields>(
		fields?: TSelection,
	): CockroachDbSelectBuilder<TSelection | undefined> {
		return new CockroachDbSelectBuilder({
			fields: fields ?? undefined,
			session: undefined,
			dialect: this.getDialect(),
			distinct: true,
		});
	}

	selectDistinctOn(on: (CockroachDbColumn | SQLWrapper)[]): CockroachDbSelectBuilder<undefined>;
	selectDistinctOn<TSelection extends SelectedFields>(
		on: (CockroachDbColumn | SQLWrapper)[],
		fields: TSelection,
	): CockroachDbSelectBuilder<TSelection>;
	selectDistinctOn<TSelection extends SelectedFields>(
		on: (CockroachDbColumn | SQLWrapper)[],
		fields?: TSelection,
	): CockroachDbSelectBuilder<TSelection | undefined> {
		return new CockroachDbSelectBuilder({
			fields: fields ?? undefined,
			session: undefined,
			dialect: this.getDialect(),
			distinct: { on },
		});
	}

	// Lazy load dialect to avoid circular dependency
	private getDialect() {
		if (!this.dialect) {
			this.dialect = new CockroachDbDialect(this.dialectConfig);
		}

		return this.dialect;
	}
}
