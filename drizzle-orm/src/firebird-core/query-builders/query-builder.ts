import { entityKind, is } from '~/entity.ts';
import type { TypedQueryBuilder } from '~/query-builders/query-builder.ts';
import { SelectionProxyHandler } from '~/selection-proxy.ts';
import type { ColumnsSelection, SQL } from '~/sql/sql.ts';
import type { FirebirdDialectConfig } from '~/firebird-core/dialect.ts';
import { FirebirdDialect, FirebirdSyncDialect } from '~/firebird-core/dialect.ts';
import type { WithBuilder } from '~/firebird-core/subquery.ts';
import { WithSubquery } from '~/subquery.ts';
import { FirebirdSelectBuilder } from './select.ts';
import type { SelectedFields } from './select.types.ts';

export class QueryBuilder {
	static readonly [entityKind]: string = 'FirebirdQueryBuilder';

	private dialect: FirebirdDialect | undefined;
	private dialectConfig: FirebirdDialectConfig | undefined;

	constructor(dialect?: FirebirdDialect | FirebirdDialectConfig) {
		this.dialect = is(dialect, FirebirdDialect) ? dialect : undefined;
		this.dialectConfig = is(dialect, FirebirdDialect) ? undefined : dialect;
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

		function select(): FirebirdSelectBuilder<undefined, 'sync', void, 'qb'>;
		function select<TSelection extends SelectedFields>(
			fields: TSelection,
		): FirebirdSelectBuilder<TSelection, 'sync', void, 'qb'>;
		function select<TSelection extends SelectedFields>(
			fields?: TSelection,
		): FirebirdSelectBuilder<TSelection | undefined, 'sync', void, 'qb'> {
			return new FirebirdSelectBuilder({
				fields: fields ?? undefined,
				session: undefined,
				dialect: self.getDialect(),
				withList: queries,
			});
		}

		function selectDistinct(): FirebirdSelectBuilder<undefined, 'sync', void, 'qb'>;
		function selectDistinct<TSelection extends SelectedFields>(
			fields: TSelection,
		): FirebirdSelectBuilder<TSelection, 'sync', void, 'qb'>;
		function selectDistinct<TSelection extends SelectedFields>(
			fields?: TSelection,
		): FirebirdSelectBuilder<TSelection | undefined, 'sync', void, 'qb'> {
			return new FirebirdSelectBuilder({
				fields: fields ?? undefined,
				session: undefined,
				dialect: self.getDialect(),
				withList: queries,
				distinct: true,
			});
		}

		return { select, selectDistinct };
	}

	select(): FirebirdSelectBuilder<undefined, 'sync', void, 'qb'>;
	select<TSelection extends SelectedFields>(
		fields: TSelection,
	): FirebirdSelectBuilder<TSelection, 'sync', void, 'qb'>;
	select<TSelection extends SelectedFields>(
		fields?: TSelection,
	): FirebirdSelectBuilder<TSelection | undefined, 'sync', void, 'qb'> {
		return new FirebirdSelectBuilder({ fields: fields ?? undefined, session: undefined, dialect: this.getDialect() });
	}

	selectDistinct(): FirebirdSelectBuilder<undefined, 'sync', void, 'qb'>;
	selectDistinct<TSelection extends SelectedFields>(
		fields: TSelection,
	): FirebirdSelectBuilder<TSelection, 'sync', void, 'qb'>;
	selectDistinct<TSelection extends SelectedFields>(
		fields?: TSelection,
	): FirebirdSelectBuilder<TSelection | undefined, 'sync', void, 'qb'> {
		return new FirebirdSelectBuilder({
			fields: fields ?? undefined,
			session: undefined,
			dialect: this.getDialect(),
			distinct: true,
		});
	}

	// Lazy load dialect to avoid circular dependency
	private getDialect() {
		if (!this.dialect) {
			this.dialect = new FirebirdSyncDialect(this.dialectConfig);
		}

		return this.dialect;
	}
}
