import { entityKind, is } from '~/entity.ts';
import type { PgDialectConfig } from '~/pg-core/dialect.ts';
import { PgDialect } from '~/pg-core/dialect.ts';
import type { TypedQueryBuilder } from '~/query-builders/query-builder.ts';
import { SelectionProxyHandler } from '~/selection-proxy.ts';
import type { ColumnsSelection, SQL, SQLWrapper } from '~/sql/sql.ts';
import { WithSubquery } from '~/subquery.ts';
import type { PgColumn } from '../columns/index.ts';
import type { SelectedFields } from '../query-builders/select.types.ts';
import { EffectPgSelectBuilder } from './select.ts';
import type { WithBuilder } from './subquery.ts';

export class EffectQueryBuilder {
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
				| ((qb: EffectQueryBuilder) => TypedQueryBuilder<ColumnsSelection | undefined> | SQL),
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

		function select(): EffectPgSelectBuilder<undefined, 'qb'>;
		function select<TSelection extends SelectedFields>(fields: TSelection): EffectPgSelectBuilder<TSelection, 'qb'>;
		function select<TSelection extends SelectedFields>(
			fields?: TSelection,
		): EffectPgSelectBuilder<TSelection | undefined, 'qb'> {
			return new EffectPgSelectBuilder({
				fields: fields ?? undefined,
				session: undefined,
				dialect: self.getDialect(),
				withList: queries,
			});
		}

		function selectDistinct(): EffectPgSelectBuilder<undefined, 'qb'>;
		function selectDistinct<TSelection extends SelectedFields>(
			fields: TSelection,
		): EffectPgSelectBuilder<TSelection, 'qb'>;
		function selectDistinct<TSelection extends SelectedFields>(
			fields?: TSelection,
		): EffectPgSelectBuilder<TSelection | undefined, 'qb'> {
			return new EffectPgSelectBuilder({
				fields: fields ?? undefined,
				session: undefined,
				dialect: self.getDialect(),
				distinct: true,
			});
		}

		function selectDistinctOn(on: (PgColumn | SQLWrapper)[]): EffectPgSelectBuilder<undefined, 'qb'>;
		function selectDistinctOn<TSelection extends SelectedFields>(
			on: (PgColumn | SQLWrapper)[],
			fields: TSelection,
		): EffectPgSelectBuilder<TSelection, 'qb'>;
		function selectDistinctOn<TSelection extends SelectedFields>(
			on: (PgColumn | SQLWrapper)[],
			fields?: TSelection,
		): EffectPgSelectBuilder<TSelection | undefined, 'qb'> {
			return new EffectPgSelectBuilder({
				fields: fields ?? undefined,
				session: undefined,
				dialect: self.getDialect(),
				distinct: { on },
			});
		}

		return { select, selectDistinct, selectDistinctOn };
	}

	select(): EffectPgSelectBuilder<undefined, 'qb'>;
	select<TSelection extends SelectedFields>(fields: TSelection): EffectPgSelectBuilder<TSelection, 'qb'>;
	select<TSelection extends SelectedFields>(fields?: TSelection): EffectPgSelectBuilder<TSelection | undefined, 'qb'> {
		return new EffectPgSelectBuilder({
			fields: fields ?? undefined,
			session: undefined,
			dialect: this.getDialect(),
		});
	}

	selectDistinct(): EffectPgSelectBuilder<undefined>;
	selectDistinct<TSelection extends SelectedFields>(fields: TSelection): EffectPgSelectBuilder<TSelection>;
	selectDistinct<TSelection extends SelectedFields>(
		fields?: TSelection,
	): EffectPgSelectBuilder<TSelection | undefined> {
		return new EffectPgSelectBuilder({
			fields: fields ?? undefined,
			session: undefined,
			dialect: this.getDialect(),
			distinct: true,
		});
	}

	selectDistinctOn(on: (PgColumn | SQLWrapper)[]): EffectPgSelectBuilder<undefined>;
	selectDistinctOn<TSelection extends SelectedFields>(
		on: (PgColumn | SQLWrapper)[],
		fields: TSelection,
	): EffectPgSelectBuilder<TSelection>;
	selectDistinctOn<TSelection extends SelectedFields>(
		on: (PgColumn | SQLWrapper)[],
		fields?: TSelection,
	): EffectPgSelectBuilder<TSelection | undefined> {
		return new EffectPgSelectBuilder({
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
