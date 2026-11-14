import type { ClickHouseDialectConfig } from '~/clickhouse-core/dialect.ts';
import { ClickHouseDialect } from '~/clickhouse-core/dialect.ts';
import type { WithBuilder } from '~/clickhouse-core/subquery.ts';
import { entityKind, is } from '~/entity.ts';
import type { TypedQueryBuilder } from '~/query-builders/query-builder.ts';
import { SelectionProxyHandler } from '~/selection-proxy.ts';
import type { ColumnsSelection, SQL } from '~/sql/sql.ts';
import { WithSubquery } from '~/subquery.ts';
import { ClickHouseSelectBuilder } from './select.ts';
import type { SelectedFields } from './select.types.ts';

export class QueryBuilder {
	static readonly [entityKind]: string = 'ClickHouseQueryBuilder';

	private dialect: ClickHouseDialect | undefined;
	private dialectConfig: ClickHouseDialectConfig | undefined;

	constructor(dialect?: ClickHouseDialect | ClickHouseDialectConfig) {
		this.dialect = is(dialect, ClickHouseDialect) ? dialect : undefined;
		this.dialectConfig = is(dialect, ClickHouseDialect) ? undefined : dialect;
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

		function select(): ClickHouseSelectBuilder<undefined, never, 'qb'>;
		function select<TSelection extends SelectedFields>(
			fields: TSelection,
		): ClickHouseSelectBuilder<TSelection, never, 'qb'>;
		function select<TSelection extends SelectedFields>(
			fields?: TSelection,
		): ClickHouseSelectBuilder<TSelection | undefined, never, 'qb'> {
			return new ClickHouseSelectBuilder({
				fields: fields ?? undefined,
				session: undefined,
				dialect: self.getDialect(),
				withList: queries,
			});
		}

		function selectDistinct(): ClickHouseSelectBuilder<undefined, never, 'qb'>;
		function selectDistinct<TSelection extends SelectedFields>(
			fields: TSelection,
		): ClickHouseSelectBuilder<TSelection, never, 'qb'>;
		function selectDistinct<TSelection extends SelectedFields>(
			fields?: TSelection,
		): ClickHouseSelectBuilder<TSelection | undefined, never, 'qb'> {
			return new ClickHouseSelectBuilder({
				fields: fields ?? undefined,
				session: undefined,
				dialect: self.getDialect(),
				withList: queries,
				distinct: true,
			});
		}

		return { select, selectDistinct };
	}

	select(): ClickHouseSelectBuilder<undefined, never, 'qb'>;
	select<TSelection extends SelectedFields>(fields: TSelection): ClickHouseSelectBuilder<TSelection, never, 'qb'>;
	select<TSelection extends SelectedFields>(
		fields?: TSelection,
	): ClickHouseSelectBuilder<TSelection | undefined, never, 'qb'> {
		return new ClickHouseSelectBuilder({
			fields: fields ?? undefined,
			session: undefined,
			dialect: this.getDialect(),
		});
	}

	selectDistinct(): ClickHouseSelectBuilder<undefined, never, 'qb'>;
	selectDistinct<TSelection extends SelectedFields>(
		fields: TSelection,
	): ClickHouseSelectBuilder<TSelection, never, 'qb'>;
	selectDistinct<TSelection extends SelectedFields>(
		fields?: TSelection,
	): ClickHouseSelectBuilder<TSelection | undefined, never, 'qb'> {
		return new ClickHouseSelectBuilder({
			fields: fields ?? undefined,
			session: undefined,
			dialect: this.getDialect(),
			distinct: true,
		});
	}

	// Lazy load dialect to avoid circular dependency
	private getDialect() {
		if (!this.dialect) {
			this.dialect = new ClickHouseDialect(this.dialectConfig);
		}

		return this.dialect;
	}
}
