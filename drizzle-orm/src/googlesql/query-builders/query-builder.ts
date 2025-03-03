import { entityKind, is } from '~/entity.ts';
import type { GoogleSqlDialectConfig } from '~/googlesql/dialect.ts';
import { GoogleSqlDialect } from '~/googlesql/dialect.ts';
import type { WithBuilder } from '~/googlesql/subquery.ts';
import type { TypedQueryBuilder } from '~/query-builders/query-builder.ts';
import { SelectionProxyHandler } from '~/selection-proxy.ts';
import type { ColumnsSelection, SQL } from '~/sql/sql.ts';
import { WithSubquery } from '~/subquery.ts';
import { GoogleSqlSelectBuilder } from './select.ts';
import type { SelectedFields } from './select.types.ts';

export class QueryBuilder {
	static readonly [entityKind]: string = 'GoogleSqlQueryBuilder';

	private dialect: GoogleSqlDialect | undefined;
	private dialectConfig: GoogleSqlDialectConfig | undefined;

	constructor(dialect?: GoogleSqlDialect | GoogleSqlDialectConfig) {
		this.dialect = is(dialect, GoogleSqlDialect) ? dialect : undefined;
		this.dialectConfig = is(dialect, GoogleSqlDialect) ? undefined : dialect;
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

		function select(): GoogleSqlSelectBuilder<undefined, never, 'qb'>;
		function select<TSelection extends SelectedFields>(
			fields: TSelection,
		): GoogleSqlSelectBuilder<TSelection, never, 'qb'>;
		function select<TSelection extends SelectedFields>(
			fields?: TSelection,
		): GoogleSqlSelectBuilder<TSelection | undefined, never, 'qb'> {
			return new GoogleSqlSelectBuilder({
				fields: fields ?? undefined,
				session: undefined,
				dialect: self.getDialect(),
				withList: queries,
			});
		}

		function selectDistinct(): GoogleSqlSelectBuilder<undefined, never, 'qb'>;
		function selectDistinct<TSelection extends SelectedFields>(
			fields: TSelection,
		): GoogleSqlSelectBuilder<TSelection, never, 'qb'>;
		function selectDistinct<TSelection extends SelectedFields>(
			fields?: TSelection,
		): GoogleSqlSelectBuilder<TSelection | undefined, never, 'qb'> {
			return new GoogleSqlSelectBuilder({
				fields: fields ?? undefined,
				session: undefined,
				dialect: self.getDialect(),
				withList: queries,
				distinct: true,
			});
		}

		return { select, selectDistinct };
	}

	select(): GoogleSqlSelectBuilder<undefined, never, 'qb'>;
	select<TSelection extends SelectedFields>(fields: TSelection): GoogleSqlSelectBuilder<TSelection, never, 'qb'>;
	select<TSelection extends SelectedFields>(
		fields?: TSelection,
	): GoogleSqlSelectBuilder<TSelection | undefined, never, 'qb'> {
		return new GoogleSqlSelectBuilder({ fields: fields ?? undefined, session: undefined, dialect: this.getDialect() });
	}

	selectDistinct(): GoogleSqlSelectBuilder<undefined, never, 'qb'>;
	selectDistinct<TSelection extends SelectedFields>(
		fields: TSelection,
	): GoogleSqlSelectBuilder<TSelection, never, 'qb'>;
	selectDistinct<TSelection extends SelectedFields>(
		fields?: TSelection,
	): GoogleSqlSelectBuilder<TSelection | undefined, never, 'qb'> {
		return new GoogleSqlSelectBuilder({
			fields: fields ?? undefined,
			session: undefined,
			dialect: this.getDialect(),
			distinct: true,
		});
	}

	// Lazy load dialect to avoid circular dependency
	private getDialect() {
		if (!this.dialect) {
			this.dialect = new GoogleSqlDialect(this.dialectConfig);
		}

		return this.dialect;
	}
}
