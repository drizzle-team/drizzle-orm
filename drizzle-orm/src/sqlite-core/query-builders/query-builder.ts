import { entityKind, is } from '~/entity.ts';
import type { TypedQueryBuilder } from '~/query-builders/query-builder.ts';
import { SelectionProxyHandler } from '~/selection-proxy.ts';
import type { ColumnsSelection, SQL } from '~/sql/sql.ts';
import type { SQLiteDialectConfig } from '~/sqlite-core/dialect.ts';
import { SQLiteDialect, SQLiteSyncDialect } from '~/sqlite-core/dialect.ts';
import type { WithBuilder } from '~/sqlite-core/subquery.ts';
import { WithSubquery } from '~/subquery.ts';
import { SQLiteSelectBuilder } from './select.ts';
import type { SelectedFields } from './select.types.ts';

export class QueryBuilder {
	static readonly [entityKind]: string = 'SQLiteQueryBuilder';

	private dialect: SQLiteDialect | undefined;
	private dialectConfig: SQLiteDialectConfig | undefined;

	constructor(dialect?: SQLiteDialect | SQLiteDialectConfig) {
		this.dialect = is(dialect, SQLiteDialect) ? dialect : undefined;
		this.dialectConfig = is(dialect, SQLiteDialect) ? undefined : dialect;
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

		function select(): SQLiteSelectBuilder<undefined, 'sync', void, 'qb'>;
		function select<TSelection extends SelectedFields>(
			fields: TSelection,
		): SQLiteSelectBuilder<TSelection, 'sync', void, 'qb'>;
		function select<TSelection extends SelectedFields>(
			fields?: TSelection,
		): SQLiteSelectBuilder<TSelection | undefined, 'sync', void, 'qb'> {
			return new SQLiteSelectBuilder({
				fields: fields ?? undefined,
				session: undefined,
				dialect: self.getDialect(),
				withList: queries,
			});
		}

		function selectDistinct(): SQLiteSelectBuilder<undefined, 'sync', void, 'qb'>;
		function selectDistinct<TSelection extends SelectedFields>(
			fields: TSelection,
		): SQLiteSelectBuilder<TSelection, 'sync', void, 'qb'>;
		function selectDistinct<TSelection extends SelectedFields>(
			fields?: TSelection,
		): SQLiteSelectBuilder<TSelection | undefined, 'sync', void, 'qb'> {
			return new SQLiteSelectBuilder({
				fields: fields ?? undefined,
				session: undefined,
				dialect: self.getDialect(),
				withList: queries,
				distinct: true,
			});
		}

		return { select, selectDistinct };
	}

	select(): SQLiteSelectBuilder<undefined, 'sync', void, 'qb'>;
	select<TSelection extends SelectedFields>(
		fields: TSelection,
	): SQLiteSelectBuilder<TSelection, 'sync', void, 'qb'>;
	select<TSelection extends SelectedFields>(
		fields?: TSelection,
	): SQLiteSelectBuilder<TSelection | undefined, 'sync', void, 'qb'> {
		return new SQLiteSelectBuilder({ fields: fields ?? undefined, session: undefined, dialect: this.getDialect() });
	}

	selectDistinct(): SQLiteSelectBuilder<undefined, 'sync', void, 'qb'>;
	selectDistinct<TSelection extends SelectedFields>(
		fields: TSelection,
	): SQLiteSelectBuilder<TSelection, 'sync', void, 'qb'>;
	selectDistinct<TSelection extends SelectedFields>(
		fields?: TSelection,
	): SQLiteSelectBuilder<TSelection | undefined, 'sync', void, 'qb'> {
		return new SQLiteSelectBuilder({
			fields: fields ?? undefined,
			session: undefined,
			dialect: this.getDialect(),
			distinct: true,
		});
	}

	// Lazy load dialect to avoid circular dependency
	private getDialect() {
		if (!this.dialect) {
			this.dialect = new SQLiteSyncDialect(this.dialectConfig);
		}

		return this.dialect;
	}
}
