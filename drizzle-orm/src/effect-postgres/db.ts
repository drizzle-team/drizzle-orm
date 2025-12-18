import type * as V1 from '~/_relations.ts';
import { entityKind } from '~/entity.ts';
import type { PgDialect } from '~/pg-core/dialect.ts';
import { EffectPgCountBuilder } from '~/pg-core/effect/count.ts';
import { PgEffectSelectQueryBuilderBase, type PgEffectSelectQueryBuilderInit } from '~/pg-core/effect/select.ts';
import type { SelectedFields } from '~/pg-core/index.ts';
import type { _RelationalQueryBuilder } from '~/pg-core/query-builders/_query.ts';
import type { RelationalQueryBuilder } from '~/pg-core/query-builders/query.ts';
import type { PgTable } from '~/pg-core/table.ts';
import type { PgViewBase } from '~/pg-core/view-base.ts';
import type { AnyRelations, EmptyRelations } from '~/relations.ts';
import type { SQL, SQLWrapper } from '~/sql/sql.ts';
import type { DrizzleTypeError } from '~/utils.ts';
import type { EffectPgSession } from './session.ts';

export class EffectPgDatabase<
	TFullSchema extends Record<string, unknown> = Record<string, never>,
	TRelations extends AnyRelations = EmptyRelations,
	TSchema extends V1.TablesRelationalConfig = V1.ExtractTablesWithRelations<TFullSchema>,
> {
	static readonly [entityKind]: string = 'EffectPgDatabase';

	declare readonly _: {
		readonly schema: TSchema | undefined;
		readonly fullSchema: TFullSchema;
		readonly tableNamesMap: Record<string, string>;
		readonly relations: TRelations;
		readonly session: EffectPgSession<TFullSchema, TRelations, TSchema>;
	};

	/** @deprecated */
	_query: TFullSchema extends Record<string, never>
		? DrizzleTypeError<'Seems like the schema generic is missing - did you forget to add it to your DB type?'>
		: {
			[K in keyof TSchema]: _RelationalQueryBuilder<TSchema, TSchema[K]>;
		};

	// TO-DO: Figure out how to pass DrizzleTypeError without breaking withReplicas
	query: {
		[K in keyof TRelations]: RelationalQueryBuilder<
			TRelations,
			TRelations[K]
		>;
	};

	constructor(
		/** @internal */
		readonly dialect: PgDialect,
		/** @internal */
		readonly session: EffectPgSession<any, any, any>,
		relations: TRelations,
		schema: V1.RelationalSchemaConfig<TSchema> | undefined,
		_parseRqbJson: boolean = false,
	) {
		this._ = schema
			? {
				schema: schema.schema,
				fullSchema: schema.fullSchema as TFullSchema,
				tableNamesMap: schema.tableNamesMap,
				relations: relations,
				session,
			}
			: {
				schema: undefined,
				fullSchema: {} as TFullSchema,
				tableNamesMap: {},
				relations: relations,
				session,
			};
		this._query = {} as typeof this['_query'];
		// if (this._.schema) {
		// 	for (const [tableName, columns] of Object.entries(this._.schema)) {
		// 		(this._query as PgDatabase<TQueryResult, Record<string, any>>['_query'])[tableName] =
		// 			new _RelationalQueryBuilder(
		// 				schema!.fullSchema,
		// 				this._.schema,
		// 				this._.tableNamesMap,
		// 				schema!.fullSchema[tableName] as PgTable,
		// 				columns,
		// 				dialect,
		// 				session,
		// 			);
		// 	}
		// }
		this.query = {} as typeof this['query'];
		// for (const [tableName, relation] of Object.entries(relations)) {
		// 	(this.query as EffectPgDatabase<
		// 		TSchema,
		// 		AnyRelations,
		// 		V1.TablesRelationalConfig
		// 	>['query'])[tableName] = new RelationalQueryBuilder(
		// 		relations,
		// 		relations[relation.name]!.table as PgTable,
		// 		relation,
		// 		dialect,
		// 		session,
		// 		parseRqbJson,
		// 	);
		// }

		// this.$cache = { invalidate: async (_params: any) => {} };
	}

	// $cache: { invalidate: Cache['onMutate'] };

	$count(
		source: PgTable | PgViewBase | SQL | SQLWrapper,
		filters?: SQL<unknown>,
	) {
		return new EffectPgCountBuilder({ source, filters, session: this.session, dialect: this.dialect });
	}

	/**
	 * Creates a select query.
	 *
	 * Calling this method with no arguments will select all columns from the table. Pass a selection object to specify the columns you want to select.
	 *
	 * Use `.from()` method to specify which table to select from.
	 *
	 * See docs: {@link https://orm.drizzle.team/docs/select}
	 *
	 * @param fields The selection object.
	 *
	 * @example
	 *
	 * ```ts
	 * // Select all columns and all rows from the 'cars' table
	 * const allCars: Car[] = yield* db.select().from(cars);
	 *
	 * // Select specific columns and all rows from the 'cars' table
	 * const carsIdsAndBrands: { id: number; brand: string }[] = yield* db.select({
	 *   id: cars.id,
	 *   brand: cars.brand
	 * })
	 *   .from(cars);
	 * ```
	 *
	 * Like in SQL, you can use arbitrary expressions as selection fields, not just table columns:
	 *
	 * ```ts
	 * // Select specific columns along with expression and all rows from the 'cars' table
	 * const carsIdsAndLowerNames: { id: number; lowerBrand: string }[] = yield* db.select({
	 *   id: cars.id,
	 *   lowerBrand: sql<string>`lower(${cars.brand})`,
	 * })
	 *   .from(cars);
	 * ```
	 */
	select(): PgEffectSelectQueryBuilderInit<undefined>;
	select<TSelection extends SelectedFields>(fields: TSelection): PgEffectSelectQueryBuilderInit<TSelection>;
	select<TSelection extends SelectedFields | undefined>(
		fields?: TSelection,
	): PgEffectSelectQueryBuilderInit<TSelection> {
		return new PgEffectSelectQueryBuilderBase({
			fields: fields ?? undefined,
			session: this.session,
			dialect: this.dialect,
		});
	}
}
