import { type AnyTable, type InferModelFromColumns, isTable, Table } from '~/table.ts';
import { type AnyColumn, Column } from './column.ts';
import { entityKind, is } from './entity.ts';
import { PrimaryKeyBuilder } from './pg-core/primary-keys.ts';
import {
	and,
	asc,
	between,
	desc,
	eq,
	exists,
	gt,
	gte,
	ilike,
	inArray,
	isNotNull,
	isNull,
	like,
	lt,
	lte,
	ne,
	not,
	notBetween,
	notExists,
	notIlike,
	notInArray,
	notLike,
	or,
} from './sql/expressions/index.ts';
import { type Placeholder, SQL, sql } from './sql/sql.ts';
import type { Assume, ColumnsWithTable, Equal, Simplify, ValueOrArray } from './utils.ts';

export abstract class Relation<TTableName extends string = string> {
	static readonly [entityKind]: string = 'Relation';

	declare readonly $brand: 'Relation';
	readonly referencedTableName: TTableName;
	fieldName!: string;

	constructor(
		readonly sourceTable: Table,
		readonly referencedTable: AnyTable<{ name: TTableName }>,
		readonly relationName: string | undefined,
	) {
		this.referencedTableName = referencedTable[Table.Symbol.Name] as TTableName;
	}

	abstract withFieldName(fieldName: string): Relation<TTableName>;

	abstract getConfig(): RelationConfigBase<any> | undefined;
}

export class Relations<
	TTableName extends string = string,
	TConfig extends Record<string, Relation> = Record<string, Relation>,
> {
	static readonly [entityKind]: string = 'Relations';

	declare readonly $brand: 'Relations';

	constructor(
		readonly table: AnyTable<{ name: TTableName }>,
		readonly config: (helpers: TableRelationsHelpers<TTableName>) => TConfig,
	) {}
}

export class One<
	TTableName extends string = string,
	TIsNullable extends boolean = boolean,
> extends Relation<TTableName> {
	static readonly [entityKind]: string = 'One';

	declare protected $relationBrand: 'One';

	constructor(
		sourceTable: Table,
		referencedTable: AnyTable<{ name: TTableName }>,
		readonly config:
			| RelationConfig<
				TTableName,
				string,
				AnyColumn<{ tableName: TTableName }>[]
			>
			| undefined,
		readonly isNullable: TIsNullable,
	) {
		super(sourceTable, referencedTable, config?.relationName);
	}

	withFieldName(fieldName: string): One<TTableName, TIsNullable> {
		const relation = new One(
			this.sourceTable,
			this.referencedTable,
			this.config,
			this.isNullable,
		);
		relation.fieldName = fieldName;
		return relation;
	}

	getConfig() {
		return this.config;
	}
}

export class Many<TTableName extends string> extends Relation<TTableName> {
	static readonly [entityKind]: string = 'Many';

	declare protected $relationBrand: 'Many';

	constructor(
		sourceTable: Table,
		referencedTable: AnyTable<{ name: TTableName }>,
		readonly config: RelationConfigBase | undefined,
	) {
		super(sourceTable, referencedTable, config?.relationName);
	}

	withFieldName(fieldName: string): Many<TTableName> {
		const relation = new Many(
			this.sourceTable,
			this.referencedTable,
			this.config,
		);
		relation.fieldName = fieldName;
		return relation;
	}

	getConfig() {
		return this.config;
	}
}

export type TableRelationsKeysOnly<
	TSchema extends Record<string, unknown>,
	TTableName extends string,
	K extends keyof TSchema,
> = TSchema[K] extends Relations<TTableName> ? K : never;

export type ExtractTableRelationsFromSchema<
	TSchema extends Record<string, unknown>,
	TTableName extends string,
> = ExtractObjectValues<
	{
		[
			K in keyof TSchema as TableRelationsKeysOnly<
				TSchema,
				TTableName,
				K
			>
		]: TSchema[K] extends Relations<TTableName, infer TConfig> ? TConfig : never;
	}
>;

export type ExtractObjectValues<T> = T[keyof T];

export type ExtractRelationsFromTableExtraConfigSchema<
	TConfig extends unknown[],
> = ExtractObjectValues<
	{
		[
			K in keyof TConfig as TConfig[K] extends Relations<any> ? K
				: never
		]: TConfig[K] extends Relations<infer TRelationConfig> ? TRelationConfig
			: never;
	}
>;

export function getOperators() {
	return {
		and,
		between,
		eq,
		exists,
		gt,
		gte,
		ilike,
		inArray,
		isNull,
		isNotNull,
		like,
		lt,
		lte,
		ne,
		not,
		notBetween,
		notExists,
		notLike,
		notIlike,
		notInArray,
		or,
		sql,
	};
}

export type Operators = ReturnType<typeof getOperators>;

export function getOrderByOperators() {
	return {
		sql,
		asc,
		desc,
	};
}

export type OrderByOperators = ReturnType<typeof getOrderByOperators>;

export type FindTableByDBName<
	TSchema extends TablesRelationalConfig,
	TTableName extends string,
> = ExtractObjectValues<
	{
		[
			K in keyof TSchema as TSchema[K]['dbName'] extends TTableName ? K
				: never
		]: TSchema[K];
	}
>;

export type DBQueryConfig<
	TRelationType extends 'one' | 'many' = 'one' | 'many',
	TIsRoot extends boolean = boolean,
	TSchema extends TablesRelationalConfig = TablesRelationalConfig,
	TTableConfig extends TableRelationalConfig = TableRelationalConfig,
> =
	& {
		columns?: {
			[K in keyof TTableConfig['columns']]?: boolean;
		};
		with?: {
			[K in keyof TTableConfig['relations']]?:
				| true
				| DBQueryConfig<
					TTableConfig['relations'][K] extends One ? 'one' : 'many',
					false,
					TSchema,
					FindTableByDBName<
						TSchema,
						TTableConfig['relations'][K]['referencedTableName']
					>
				>;
		};
		extras?:
			| Record<string, SQL.Aliased>
			| ((
				fields: Simplify<
					[TTableConfig['columns']] extends [never] ? {}
						: TTableConfig['columns']
				>,
				operators: { sql: Operators['sql'] },
			) => Record<string, SQL.Aliased>);
	}
	& (TRelationType extends 'many' ? 
			& {
				where?:
					| SQL
					| undefined
					| ((
						fields: Simplify<
							[TTableConfig['columns']] extends [never] ? {}
								: TTableConfig['columns']
						>,
						operators: Operators,
					) => SQL | undefined);
				orderBy?:
					| ValueOrArray<AnyColumn | SQL>
					| ((
						fields: Simplify<
							[TTableConfig['columns']] extends [never] ? {}
								: TTableConfig['columns']
						>,
						operators: OrderByOperators,
					) => ValueOrArray<AnyColumn | SQL>);
				limit?: number | Placeholder;
			}
			& (TIsRoot extends true ? {
					offset?: number | Placeholder;
				}
				: {})
		: {});

export interface TableRelationalConfig {
	tsName: string;
	dbName: string;
	columns: Record<string, Column>;
	relations: Record<string, Relation>;
	primaryKey: AnyColumn[];
	schema?: string;
}

export type TablesRelationalConfig = Record<string, TableRelationalConfig>;

export interface RelationalSchemaConfig<
	TSchema extends TablesRelationalConfig,
> {
	fullSchema: Record<string, unknown>;
	schema: TSchema;
	tableNamesMap: Record<string, string>;
}

export type ExtractTablesWithRelations<
	TSchema extends Record<string, unknown>,
> = {
	[
		K in keyof TSchema as TSchema[K] extends Table ? K
			: never
	]: TSchema[K] extends Table ? {
			tsName: K & string;
			dbName: TSchema[K]['_']['name'];
			columns: TSchema[K]['_']['columns'];
			relations: ExtractTableRelationsFromSchema<
				TSchema,
				TSchema[K]['_']['name']
			>;
			primaryKey: AnyColumn[];
		}
		: never;
};

export type ReturnTypeOrValue<T> = T extends (...args: any[]) => infer R ? R
	: T;

export type BuildRelationResult<
	TSchema extends TablesRelationalConfig,
	TInclude,
	TRelations extends Record<string, Relation>,
> = {
	[
		K in
			& NonUndefinedKeysOnly<TInclude>
			& keyof TRelations
	]: TRelations[K] extends infer TRel extends Relation ? BuildQueryResult<
			TSchema,
			FindTableByDBName<TSchema, TRel['referencedTableName']>,
			Assume<TInclude[K], true | Record<string, unknown>>
		> extends infer TResult ? TRel extends One ? 
					| TResult
					| (Equal<TRel['isNullable'], false> extends true ? null : never)
			: TResult[]
		: never
		: never;
};

export type NonUndefinedKeysOnly<T> =
	& ExtractObjectValues<
		{
			[K in keyof T as T[K] extends undefined ? never : K]: K;
		}
	>
	& keyof T;

export type BuildQueryResult<
	TSchema extends TablesRelationalConfig,
	TTableConfig extends TableRelationalConfig,
	TFullSelection extends true | Record<string, unknown>,
> = Equal<TFullSelection, true> extends true ? InferModelFromColumns<TTableConfig['columns']>
	: TFullSelection extends Record<string, unknown> ? Simplify<
			& (TFullSelection['columns'] extends Record<string, unknown> ? InferModelFromColumns<
					{
						[
							K in Equal<
								Exclude<
									TFullSelection['columns'][
										& keyof TFullSelection['columns']
										& keyof TTableConfig['columns']
									],
									undefined
								>,
								false
							> extends true ? Exclude<
									keyof TTableConfig['columns'],
									NonUndefinedKeysOnly<TFullSelection['columns']>
								>
								: 
									& {
										[K in keyof TFullSelection['columns']]: Equal<
											TFullSelection['columns'][K],
											true
										> extends true ? K
											: never;
									}[keyof TFullSelection['columns']]
									& keyof TTableConfig['columns']
						]: TTableConfig['columns'][K];
					}
				>
				: InferModelFromColumns<TTableConfig['columns']>)
			& (TFullSelection['extras'] extends
				| Record<string, unknown>
				| ((...args: any[]) => Record<string, unknown>) ? {
					[
						K in NonUndefinedKeysOnly<
							ReturnTypeOrValue<TFullSelection['extras']>
						>
					]: Assume<
						ReturnTypeOrValue<TFullSelection['extras']>[K],
						SQL.Aliased
					>['_']['type'];
				}
				: {})
			& (TFullSelection['with'] extends Record<string, unknown> ? BuildRelationResult<
					TSchema,
					TFullSelection['with'],
					TTableConfig['relations']
				>
				: {})
		>
	: never;

export interface RelationConfig<
	TTableName extends string,
	TForeignTableName extends string,
	TColumns extends AnyColumn<{ tableName: TTableName }>[],
	TWhere extends SQL | undefined = SQL | undefined,
> extends RelationConfigBase<TWhere> {
	fields: TColumns;
	references: ColumnsWithTable<TTableName, TForeignTableName, TColumns>;
}

export interface RelationConfigBase<TWhere extends SQL | undefined = SQL | undefined> {
	relationName?: string;
	where?: TWhere;
}

export function extractTablesRelationalConfig<
	TTables extends TablesRelationalConfig,
>(
	schema: Record<string, unknown>,
	configHelpers: (table: Table) => any,
): { tables: TTables; tableNamesMap: Record<string, string> } {
	if (
		Object.keys(schema).length === 1
		&& 'default' in schema
		&& !is(schema['default'], Table)
	) {
		schema = schema['default'] as Record<string, unknown>;
	}

	// table DB name -> schema table key
	const tableNamesMap: Record<string, string> = {};
	// Table relations found before their tables - need to buffer them until we know the schema table key
	const relationsBuffer: Record<
		string,
		{ relations: Record<string, Relation>; primaryKey?: AnyColumn[] }
	> = {};
	const tablesConfig: TablesRelationalConfig = {};
	for (const [key, value] of Object.entries(schema)) {
		if (isTable(value)) {
			const dbName = value[Table.Symbol.Name];
			const bufferedRelations = relationsBuffer[dbName];
			tableNamesMap[dbName] = key;
			tablesConfig[key] = {
				tsName: key,
				dbName: value[Table.Symbol.Name],
				schema: value[Table.Symbol.Schema],
				columns: value[Table.Symbol.Columns],
				relations: bufferedRelations?.relations ?? {},
				primaryKey: bufferedRelations?.primaryKey ?? [],
			};

			// Fill in primary keys
			for (
				const column of Object.values(
					(value as Table)[Table.Symbol.Columns],
				)
			) {
				if (column.primary) {
					tablesConfig[key]!.primaryKey.push(column);
				}
			}

			const extraConfig = value[Table.Symbol.ExtraConfigBuilder]?.(value);
			if (extraConfig) {
				for (const configEntry of Object.values(extraConfig)) {
					if (is(configEntry, PrimaryKeyBuilder)) {
						tablesConfig[key]!.primaryKey.push(...configEntry.columns);
					}
				}
			}
		} else if (is(value, Relations)) {
			const dbName: string = value.table[Table.Symbol.Name];
			const tableName = tableNamesMap[dbName];
			const relations: Record<string, Relation> = value.config(
				configHelpers(value.table),
			);
			let primaryKey: AnyColumn[] | undefined;

			for (const [relationName, relation] of Object.entries(relations)) {
				if (tableName) {
					const tableConfig = tablesConfig[tableName]!;
					tableConfig.relations[relationName] = relation;
					if (primaryKey) {
						tableConfig.primaryKey.push(...primaryKey);
					}
				} else {
					if (!(dbName in relationsBuffer)) {
						relationsBuffer[dbName] = {
							relations: {},
							primaryKey,
						};
					}
					relationsBuffer[dbName]!.relations[relationName] = relation;
				}
			}
		}
	}

	return { tables: tablesConfig as TTables, tableNamesMap };
}

export function relations<
	TTableName extends string,
	TRelations extends Record<string, Relation<any>>,
>(
	table: AnyTable<{ name: TTableName }>,
	relations: (helpers: TableRelationsHelpers<TTableName>) => TRelations,
): Relations<TTableName, TRelations> {
	return new Relations<TTableName, TRelations>(
		table,
		(helpers: TableRelationsHelpers<TTableName>) =>
			Object.fromEntries(
				Object.entries(relations(helpers)).map(([key, value]) => [
					key,
					value.withFieldName(key),
				]),
			) as TRelations,
	);
}

export function createOne<TTableName extends string>(sourceTable: Table) {
	return function one<
		TForeignTable extends Table,
		TColumns extends [
			AnyColumn<{ tableName: TTableName }>,
			...AnyColumn<{ tableName: TTableName }>[],
		],
		TWhere extends SQL | undefined = undefined,
	>(
		table: TForeignTable,
		config?: RelationConfig<TTableName, TForeignTable['_']['name'], TColumns, TWhere>,
	): One<
		TForeignTable['_']['name'],
		Equal<TColumns[number]['_']['notNull'], TWhere extends SQL ? false : true>
	> {
		return new One(
			sourceTable,
			table,
			config,
			((config?.fields.reduce<boolean>((res, f) => res && f.notNull, true) && !config?.where)
				?? false) as Equal<TColumns[number]['_']['notNull'], TWhere extends SQL ? false : true>,
		);
	};
}

export function createMany(sourceTable: Table) {
	return function many<TForeignTable extends Table>(
		referencedTable: TForeignTable,
		config?: RelationConfigBase,
	): Many<TForeignTable['_']['name']> {
		return new Many(sourceTable, referencedTable, config);
	};
}

export interface NormalizedRelation {
	fields: AnyColumn[];
	references: AnyColumn[];
}

export function normalizeRelation(
	schema: TablesRelationalConfig,
	tableNamesMap: Record<string, string>,
	relation: Relation,
): NormalizedRelation {
	if (is(relation, One) && relation.config) {
		return {
			fields: relation.config.fields,
			references: relation.config.references,
		};
	}

	const referencedTableTsName = tableNamesMap[relation.referencedTable[Table.Symbol.Name]];
	if (!referencedTableTsName) {
		throw new Error(
			`Table "${relation.referencedTable[Table.Symbol.Name]}" not found in schema`,
		);
	}

	const referencedTableConfig = schema[referencedTableTsName];
	if (!referencedTableConfig) {
		throw new Error(`Table "${referencedTableTsName}" not found in schema`);
	}

	const sourceTable = relation.sourceTable;
	const sourceTableTsName = tableNamesMap[sourceTable[Table.Symbol.Name]];
	if (!sourceTableTsName) {
		throw new Error(
			`Table "${sourceTable[Table.Symbol.Name]}" not found in schema`,
		);
	}

	const reverseRelations: Relation[] = [];
	for (
		const referencedTableRelation of Object.values(
			referencedTableConfig.relations,
		)
	) {
		if (
			(relation.relationName
				&& relation !== referencedTableRelation
				&& referencedTableRelation.relationName === relation.relationName)
			|| (!relation.relationName
				&& referencedTableRelation.referencedTable === relation.sourceTable)
		) {
			reverseRelations.push(referencedTableRelation);
		}
	}

	if (reverseRelations.length > 1) {
		throw relation.relationName
			? new Error(
				`There are multiple relations with name "${relation.relationName}" in table "${referencedTableTsName}"`,
			)
			: new Error(
				`There are multiple relations between "${referencedTableTsName}" and "${
					relation.sourceTable[Table.Symbol.Name]
				}". Please specify relation name`,
			);
	}

	if (
		reverseRelations[0]
		&& is(reverseRelations[0], One)
		&& reverseRelations[0].config
	) {
		return {
			fields: reverseRelations[0].config.references,
			references: reverseRelations[0].config.fields,
		};
	}

	throw new Error(
		`There is not enough information to infer relation "${sourceTableTsName}.${relation.fieldName}"`,
	);
}

export function createTableRelationsHelpers<TTableName extends string>(
	sourceTable: AnyTable<{ name: TTableName }>,
) {
	return {
		one: createOne<TTableName>(sourceTable),
		many: createMany(sourceTable),
	};
}

export type TableRelationsHelpers<TTableName extends string> = ReturnType<
	typeof createTableRelationsHelpers<TTableName>
>;

export interface BuildRelationalQueryResult<
	TTable extends Table = Table,
	TColumn extends Column = Column,
> {
	tableTsKey: string;
	selection: {
		dbKey: string;
		tsKey: string;
		field: TColumn | SQL | SQL.Aliased;
		relationTableTsKey: string | undefined;
		isJson: boolean;
		isExtra?: boolean;
		selection: BuildRelationalQueryResult<TTable>['selection'];
	}[];
	sql: TTable | SQL;
}

export function mapRelationalRow(
	tablesConfig: TablesRelationalConfig,
	tableConfig: TableRelationalConfig,
	row: unknown[],
	buildQueryResultSelection: BuildRelationalQueryResult['selection'],
	mapColumnValue: (value: unknown) => unknown = (value) => value,
): Record<string, unknown> {
	const result: Record<string, unknown> = {};

	for (
		const [
			selectionItemIndex,
			selectionItem,
		] of buildQueryResultSelection.entries()
	) {
		if (selectionItem.isJson) {
			const relation = tableConfig.relations[selectionItem.tsKey]!;
			const rawSubRows = row[selectionItemIndex] as
				| unknown[]
				| null
				| [null]
				| string;
			const subRows = typeof rawSubRows === 'string'
				? (JSON.parse(rawSubRows) as unknown[])
				: rawSubRows;
			result[selectionItem.tsKey] = is(relation, One)
				? subRows
					&& mapRelationalRow(
						tablesConfig,
						tablesConfig[selectionItem.relationTableTsKey!]!,
						subRows,
						selectionItem.selection,
						mapColumnValue,
					)
				: (subRows as unknown[][]).map((subRow) =>
					mapRelationalRow(
						tablesConfig,
						tablesConfig[selectionItem.relationTableTsKey!]!,
						subRow,
						selectionItem.selection,
						mapColumnValue,
					)
				);
		} else {
			const value = mapColumnValue(row[selectionItemIndex]);
			const field = selectionItem.field!;
			let decoder;
			if (is(field, Column)) {
				decoder = field;
			} else if (is(field, SQL)) {
				decoder = field.decoder;
			} else {
				decoder = field.sql.decoder;
			}
			result[selectionItem.tsKey] = value === null ? null : decoder.mapFromDriverValue(value);
		}
	}

	return result;
}
