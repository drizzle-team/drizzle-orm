import { type AnyTable, type InferModelFromColumns, isTable, Table } from '~/table';
import { type AnyColumn, Column } from './column';
import { PrimaryKeyBuilder } from './pg-core';
import { and, asc, desc, eq, or, type Placeholder, SQL, sql } from './sql';
import { type Assume, type ColumnsWithTable, type Equal, type SimplifyShallow, type ValueOrArray } from './utils';

export abstract class Relation<TTableName extends string = string> {
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
}

export class Relations<
	TTableName extends string = string,
	TConfig extends Record<string, Relation> = Record<string, Relation>,
> {
	declare readonly $brand: 'Relations';

	constructor(
		readonly table: AnyTable<{ name: TTableName }>,
		readonly config: (helpers: TableRelationsHelpers<TTableName>) => TConfig,
	) {}
}

export class One<TTableName extends string = string> extends Relation<TTableName> {
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
	) {
		super(sourceTable, referencedTable, config?.relationName);
	}

	withFieldName(fieldName: string): One<TTableName> {
		const relation = new One(this.sourceTable, this.referencedTable, this.config);
		relation.fieldName = fieldName;
		return relation;
	}
}

export class Many<TTableName extends string> extends Relation<TTableName> {
	declare protected $relationBrand: 'Many';

	constructor(
		sourceTable: Table,
		referencedTable: AnyTable<{ name: TTableName }>,
		readonly config: { relationName: string } | undefined,
	) {
		super(sourceTable, referencedTable, config?.relationName);
	}

	withFieldName(fieldName: string): Many<TTableName> {
		const relation = new Many(this.sourceTable, this.referencedTable, this.config);
		relation.fieldName = fieldName;
		return relation;
	}
}

export type TableRelationsKeysOnly<
	TSchema extends Record<string, unknown>,
	TTableName extends string,
	K extends keyof TSchema,
> = TSchema[K] extends Relations<TTableName> ? K : never;

export type ExtractTableRelationsFromSchema<TSchema extends Record<string, unknown>, TTableName extends string> =
	ExtractObjectValues<
		{
			[K in keyof TSchema as TableRelationsKeysOnly<TSchema, TTableName, K>]: TSchema[K] extends
				Relations<TTableName, infer TConfig> ? TConfig : never;
		}
	>;

export type ExtractObjectValues<T> = T[keyof T];

export type ExtractRelationsFromTableExtraConfigSchema<TConfig extends unknown[]> = ExtractObjectValues<
	{
		[K in keyof TConfig as TConfig[K] extends Relations<any> ? K : never]: TConfig[K] extends
			Relations<infer TRelationConfig> ? TRelationConfig : never;
	}
>;

export const operators = {
	sql,
	eq,
	and,
	or,
};

export type Operators = typeof operators;

export const orderByOperators = {
	sql,
	asc,
	desc,
};

export type OrderByOperators = typeof orderByOperators;

export type FindTableByDBName<TSchema extends TablesRelationalConfig, TTableName extends string> = ExtractObjectValues<
	{
		[K in keyof TSchema as TSchema[K]['dbName'] extends TTableName ? K : never]: TSchema[K];
	}
>;

export type DBQueryConfig<
	TRelationType extends 'one' | 'many' = 'one' | 'many',
	TSchema extends TablesRelationalConfig = TablesRelationalConfig,
	TTableConfig extends TableRelationalConfig = TableRelationalConfig,
> =
	& {
		select?:
			& {
				[K in keyof TTableConfig['columns']]?: boolean;
			}
			& {
				[K in keyof TTableConfig['relations']]?:
					| true
					| DBQueryConfig<
						TTableConfig['relations'][K] extends One ? 'one' : 'many',
						TSchema,
						FindTableByDBName<TSchema, TTableConfig['relations'][K]['referencedTableName']>
					>;
			};
		include?: {
			[K in keyof TTableConfig['relations']]?:
				| true
				| DBQueryConfig<
					TTableConfig['relations'][K] extends One ? 'one' : 'many',
					TSchema,
					FindTableByDBName<TSchema, TTableConfig['relations'][K]['referencedTableName']>
				>;
		};
		includeCustom?: (
			fields: TTableConfig['columns'],
			operators: { sql: Operators['sql'] },
		) => Record<string, SQL.Aliased>;
	}
	& (TRelationType extends 'many' ? {
			where?: (
				fields: SimplifyShallow<TTableConfig['columns'] & TTableConfig['relations']>,
				operators: Operators,
			) => SQL | undefined;
			orderBy?: (
				fields: SimplifyShallow<TTableConfig['columns'] & TTableConfig['relations']>,
				operators: OrderByOperators,
			) => ValueOrArray<AnyColumn | SQL>;
			limit?: number | Placeholder;
			offset?: number | Placeholder;
		}
		: {});
export interface TableRelationalConfig {
	tsName: string;
	dbName: string;
	columns: Record<string, AnyColumn>;
	relations: Record<string, Relation>;
	primaryKey: AnyColumn[];
}

export type TablesRelationalConfig = Record<string, TableRelationalConfig>;

export type ExtractTablesWithRelations<TSchema extends Record<string, unknown>> = {
	[K in keyof TSchema as TSchema[K] extends Table ? K : never]: TSchema[K] extends Table ? {
			tsName: K;
			dbName: TSchema[K]['_']['name'];
			columns: TSchema[K]['_']['columns'];
			relations: ExtractTableRelationsFromSchema<TSchema, TSchema[K]['_']['name']>;
			primaryKey: AnyColumn[];
		}
		: never;
};

export interface RelationSelectionBase {
	select?: Record<string, boolean | Record<string, unknown> | undefined>;
	include?: Record<string, boolean | Record<string, unknown> | undefined>;
	includeCustom?: (...args: any[]) => Record<string, SQL | SQL.Aliased>;
	limit?: number | Placeholder;
}

export type BuildQueryResult<
	TSchema extends TablesRelationalConfig,
	TTableConfig extends TableRelationalConfig,
	TFullSelection extends RelationSelectionBase,
> = (TFullSelection['select'] extends Record<string, unknown> ? ['select', TFullSelection['select']]
	: TFullSelection['include'] extends Record<string, unknown> ? ['include', TFullSelection['include']]
	: never) extends [
	infer TSelectionMode,
	infer TSelection,
] ? SimplifyShallow<
		& InferModelFromColumns<
			TSelectionMode extends 'select' ? {
					[
						K
							in (Equal<TSelection[keyof TSelection & keyof TTableConfig['columns']], false> extends true
								? Exclude<keyof TTableConfig['columns'], keyof TSelection>
								: 
									& { [K in keyof TSelection]: Equal<TSelection[K], true> extends true ? K : never }[keyof TSelection]
									& keyof TTableConfig['columns'])
					]: TTableConfig['columns'][K];
				}
				: TTableConfig['columns']
		>
		& (TFullSelection['includeCustom'] extends (...args: any[]) => Record<string, SQL | SQL.Aliased> ? {
				[K in keyof ReturnType<TFullSelection['includeCustom']>]: ReturnType<
					TFullSelection['includeCustom']
				>[K]['_']['type'];
			}
			: {})
		& (TSelectionMode extends 'include' | 'select' ? {
				[K in keyof TSelection & keyof TTableConfig['relations']]: TTableConfig['relations'][K] extends
					infer TRel extends Relation ? BuildQueryResult<
						TSchema,
						FindTableByDBName<TSchema, TRel['referencedTableName']>,
						TSelection[K] extends true ? Record<string, undefined> : Assume<TSelection[K], RelationSelectionBase>
					> extends infer TResult ? TRel extends One<any> ? TResult : TResult[] : never
					: never;
			}
			: {})
	>
	: InferModelFromColumns<TTableConfig['columns']>;

export interface RelationConfig<
	TTableName extends string,
	TForeignTableName extends string,
	TColumns extends AnyColumn<{ tableName: TTableName }>[],
> {
	relationName?: string;
	fields: TColumns;
	references: ColumnsWithTable<TTableName, TForeignTableName, TColumns>;
}

export function extractTablesRelationalConfig<TTables extends TablesRelationalConfig>(
	schema: Record<string, unknown>,
	configHelpers: (table: Table) => any,
): { tables: TTables; tableNamesMap: Record<string, string> } {
	if (Object.keys(schema).length === 1 && 'default' in schema && !(schema['default'] instanceof Table)) {
		schema = schema['default'] as Record<string, unknown>;
	}

	// table DB name -> schema table key
	const tableNamesMap: Record<string, string> = {};
	// Table relations found before their tables - need to buffer them until we know the schema table key
	const relationsBuffer: Record<string, { relations: Record<string, Relation>; primaryKey?: AnyColumn[] }> = {};
	const tablesConfig: TablesRelationalConfig = {};
	for (const [key, value] of Object.entries(schema)) {
		if (isTable(value)) {
			const dbName = value[Table.Symbol.Name];
			const bufferedRelations = relationsBuffer[dbName];
			tableNamesMap[dbName] = key;
			tablesConfig[key] = {
				tsName: key,
				dbName: value[Table.Symbol.Name],
				columns: value[Table.Symbol.Columns],
				relations: bufferedRelations?.relations ?? {},
				primaryKey: bufferedRelations?.primaryKey ?? [],
			};

			// Fill in primary keys
			for (const column of Object.values((value as Table)[Table.Symbol.Columns])) {
				if (column.primary) {
					tablesConfig[key]!.primaryKey.push(column);
				}
			}

			const extraConfig = value[Table.Symbol.ExtraConfigBuilder]?.(value);
			if (extraConfig) {
				for (const configEntry of Object.values(extraConfig)) {
					if (configEntry instanceof PrimaryKeyBuilder) {
						tablesConfig[key]!.primaryKey.push(...configEntry.columns);
					}
				}
			}
		} else if (value instanceof Relations) {
			const dbName: string = value.table[Table.Symbol.Name];
			const tableName = tableNamesMap[dbName];
			const relations: Record<string, Relation> = value.config(configHelpers(value.table));
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

export function relations<TTableName extends string, TRelations extends Record<string, Relation<any>>>(
	table: AnyTable<{ name: TTableName }>,
	relations: (helpers: TableRelationsHelpers<TTableName>) => TRelations,
): Relations<TTableName, TRelations> {
	return new Relations<TTableName, TRelations>(
		table,
		(helpers: TableRelationsHelpers<TTableName>) =>
			Object.fromEntries(
				Object.entries(relations(helpers))
					.map(([key, value]) => [key, value.withFieldName(key)]),
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
	>(
		table: TForeignTable,
		config?: RelationConfig<TTableName, TForeignTable['_']['name'], TColumns>,
	): One<TForeignTable['_']['name']> {
		return new One(sourceTable, table, config);
	};
}

export function createMany(sourceTable: Table) {
	return function many<TForeignTable extends Table>(
		referencedTable: TForeignTable,
		config?: { relationName: string },
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
	if (relation instanceof One && relation.config) {
		return {
			fields: relation.config.fields,
			references: relation.config.references,
		};
	}

	const referencedTableTsName = tableNamesMap[relation.referencedTable[Table.Symbol.Name]];
	if (!referencedTableTsName) {
		throw new Error(`Table "${relation.referencedTable[Table.Symbol.Name]}" not found in schema`);
	}

	const referencedTableFields = schema[referencedTableTsName];
	if (!referencedTableFields) {
		throw new Error(`Table "${referencedTableTsName}" not found in schema`);
	}

	const sourceTable = relation.sourceTable;
	const sourceTableTsName = tableNamesMap[sourceTable[Table.Symbol.Name]];
	if (!sourceTableTsName) {
		throw new Error(`Table "${sourceTable[Table.Symbol.Name]}" not found in schema`);
	}

	const reverseRelations: Relation[] = [];
	for (const referencedTableRelation of Object.values(referencedTableFields.relations)) {
		if (
			(relation.relationName && referencedTableRelation.relationName === relation.relationName)
			|| (!relation.relationName && referencedTableRelation.referencedTable === relation.sourceTable)
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

	if (reverseRelations[0] && reverseRelations[0] instanceof One && reverseRelations[0].config) {
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

export interface BuildRelationalQueryResult {
	tableTsKey: string;
	selection: {
		dbKey: string;
		tsKey: string;
		field: AnyColumn | SQL | SQL.Aliased | undefined;
		tableTsKey: string | undefined;
		isJson: boolean;
		selection: BuildRelationalQueryResult['selection'];
	}[];
	sql: SQL;
}

export function mapRelationalRow(
	tablesConfig: TablesRelationalConfig,
	tableConfig: TableRelationalConfig,
	row: unknown[],
	buildQueryResultSelection: BuildRelationalQueryResult['selection'],
): Record<string, unknown> {
	const result: Record<string, unknown> = {};

	for (const [selectionItemIndex, selectionItem] of buildQueryResultSelection.entries()) {
		if (selectionItem.isJson) {
			const relation = tableConfig.relations[selectionItem.tsKey]!;
			result[selectionItem.tsKey] = relation instanceof One
				? mapRelationalRow(
					tablesConfig,
					tablesConfig[selectionItem.tableTsKey!]!,
					(row[selectionItemIndex] as unknown[][])[0]!,
					selectionItem.selection,
				)
				: (row[selectionItemIndex] as unknown[]).map((subRow) =>
					mapRelationalRow(
						tablesConfig,
						tablesConfig[selectionItem.tableTsKey!]!,
						subRow as unknown[],
						selectionItem.selection,
					)
				);
		} else {
			const value = row[selectionItemIndex];
			const field = selectionItem.field!;
			let decoder;
			if (field instanceof Column) {
				decoder = field;
			} else if (field instanceof SQL) {
				decoder = field.decoder;
			} else {
				decoder = field.sql.decoder;
			}
			result[selectionItem.tsKey] = value === null ? null : decoder.mapFromDriverValue(value);
		}
	}

	return result;
}
