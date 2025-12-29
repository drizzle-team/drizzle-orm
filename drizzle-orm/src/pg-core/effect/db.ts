import type * as V1 from '~/_relations.ts';
import { entityKind } from '~/entity.ts';
import type { PgDialect } from '~/pg-core/dialect.ts';
import { PgEffectCountBuilder } from '~/pg-core/effect/count.ts';
import { PgEffectInsertBase, type PgEffectInsertHKT } from '~/pg-core/effect/insert.ts';
import { PgEffectSelectBase, type PgEffectSelectInit } from '~/pg-core/effect/select.ts';
import type { _RelationalQueryBuilder } from '~/pg-core/query-builders/_query.ts';
import { PgInsertBuilder } from '~/pg-core/query-builders/insert.ts';
import type { RelationalQueryBuilder } from '~/pg-core/query-builders/query.ts';
import type { PgTable } from '~/pg-core/table.ts';
import type { PgViewBase } from '~/pg-core/view-base.ts';
import type { AnyRelations, EmptyRelations } from '~/relations.ts';
import type { SQL, SQLWrapper } from '~/sql/sql.ts';
import type { DrizzleTypeError } from '~/utils.ts';
import type { SelectedFields } from '../query-builders/select.types.ts';
import type { PgQueryResultHKT } from '../session.ts';
import type { PgEffectSession } from './session.ts';

export class PgEffectDatabase<
	TQueryResult extends PgQueryResultHKT,
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
		readonly session: PgEffectSession<TFullSchema, TRelations, TSchema>;
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
		readonly session: PgEffectSession<any, any, any>,
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
		return new PgEffectCountBuilder({ source, filters, session: this.session, dialect: this.dialect });
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
	select(): PgEffectSelectInit<undefined>;
	select<TSelection extends SelectedFields>(fields: TSelection): PgEffectSelectInit<TSelection>;
	select<TSelection extends SelectedFields | undefined>(
		fields?: TSelection,
	): PgEffectSelectInit<TSelection> {
		return new PgEffectSelectBase({
			fields: fields ?? undefined,
			session: this.session,
			dialect: this.dialect,
		});
	}

	/**
	 * Creates an insert query.
	 *
	 * Calling this method will create new rows in a table. Use `.values()` method to specify which values to insert.
	 *
	 * See docs: {@link https://orm.drizzle.team/docs/insert}
	 *
	 * @param table The table to insert into.
	 *
	 * @example
	 *
	 * ```ts
	 * // Insert one row
	 * yield* db.insert(cars).values({ brand: 'BMW' });
	 *
	 * // Insert multiple rows
	 * yield* db.insert(cars).values([{ brand: 'BMW' }, { brand: 'Porsche' }]);
	 *
	 * // Insert with returning clause
	 * const insertedCar: Car[] = yield* db.insert(cars)
	 *   .values({ brand: 'BMW' })
	 *   .returning();
	 * ```
	 */
	insert<TTable extends PgTable>(table: TTable): PgInsertBuilder<TTable, TQueryResult, false, PgEffectInsertHKT> {
		return new PgInsertBuilder(table, this.session, this.dialect, undefined, undefined, PgEffectInsertBase);
	}
}
