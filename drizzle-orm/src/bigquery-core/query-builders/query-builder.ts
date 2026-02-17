import { BigQueryDialect } from '~/bigquery-core/dialect.ts';
import { entityKind, is } from '~/entity.ts';
import type { TypedQueryBuilder } from '~/query-builders/query-builder.ts';
import { SelectionProxyHandler } from '~/selection-proxy.ts';
import type { ColumnsSelection, SQL } from '~/sql/sql.ts';
import { WithSubquery } from '~/subquery.ts';
import type { BigQueryColumn } from '../columns/index.ts';
import type { WithBuilder } from '../subquery.ts';
import { BigQuerySelectBuilder } from './select.ts';
import type { SelectedFields } from './select.types.ts';

export class QueryBuilder {
	static readonly [entityKind]: string = 'BigQueryQueryBuilder';

	private dialect: BigQueryDialect | undefined;

	constructor(dialect?: BigQueryDialect) {
		this.dialect = is(dialect, BigQueryDialect) ? dialect : undefined;
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

		function select(): BigQuerySelectBuilder<undefined, 'qb'>;
		function select<TSelection extends SelectedFields>(fields: TSelection): BigQuerySelectBuilder<TSelection, 'qb'>;
		function select<TSelection extends SelectedFields>(
			fields?: TSelection,
		): BigQuerySelectBuilder<TSelection | undefined, 'qb'> {
			return new BigQuerySelectBuilder({
				fields: fields ?? undefined,
				session: undefined,
				dialect: self.getDialect(),
				withList: queries,
			});
		}

		function selectDistinct(): BigQuerySelectBuilder<undefined, 'qb'>;
		function selectDistinct<TSelection extends SelectedFields>(
			fields: TSelection,
		): BigQuerySelectBuilder<TSelection, 'qb'>;
		function selectDistinct<TSelection extends SelectedFields>(
			fields?: TSelection,
		): BigQuerySelectBuilder<TSelection | undefined, 'qb'> {
			return new BigQuerySelectBuilder({
				fields: fields ?? undefined,
				session: undefined,
				dialect: self.getDialect(),
				withList: queries,
				distinct: true,
			});
		}

		return { select, selectDistinct };
	}

	select(): BigQuerySelectBuilder<undefined, 'qb'>;
	select<TSelection extends SelectedFields>(fields: TSelection): BigQuerySelectBuilder<TSelection, 'qb'>;
	select<TSelection extends SelectedFields>(fields?: TSelection): BigQuerySelectBuilder<TSelection | undefined, 'qb'> {
		return new BigQuerySelectBuilder({
			fields: fields ?? undefined,
			session: undefined,
			dialect: this.getDialect(),
		});
	}

	selectDistinct(): BigQuerySelectBuilder<undefined>;
	selectDistinct<TSelection extends SelectedFields>(fields: TSelection): BigQuerySelectBuilder<TSelection>;
	selectDistinct<TSelection extends SelectedFields>(
		fields?: TSelection,
	): BigQuerySelectBuilder<TSelection | undefined> {
		return new BigQuerySelectBuilder({
			fields: fields ?? undefined,
			session: undefined,
			dialect: this.getDialect(),
			distinct: true,
		});
	}

	// Lazy load dialect to avoid circular dependency
	private getDialect() {
		if (!this.dialect) {
			this.dialect = new BigQueryDialect();
		}

		return this.dialect;
	}
}
