import { type AnyTable, getTableUniqueName, IsAlias, OriginalName, Schema, Table } from '~/table.ts';
import { Columns } from '~/table.ts';
import { aliasedTable } from './alias.ts';
import type { CasingCache } from './casing.ts';
import { type AnyColumn, Column } from './column.ts';
import { entityKind, is } from './entity.ts';
import { DrizzleError } from './errors.ts';
import {
	and,
	arrayContained,
	arrayContains,
	arrayOverlaps,
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
import { Placeholder, SQL, sql, type SQLWrapper, View } from './sql/sql.ts';
import type { Assume, DrizzleTypeError, Equal, Simplify, ValueOrArray } from './utils.ts';

export type FieldValue =
	| Column
	| SQLWrapper
	| SQL.Aliased
	| SQL;

export type FieldSelection = Record<string, FieldValue>;

export class Relations<
	TSchema extends Record<string, unknown> = Record<string, unknown>,
	TTables extends Record<string, Table | View> = Record<string, Table | View>,
	TConfig extends RelationsBuilderConfig<TTables> = RelationsBuilderConfig<TTables>,
> {
	static readonly [entityKind]: string = 'RelationsV2';
	declare readonly $brand: 'RelationsV2';
	/** table DB name -> schema table key */
	readonly tableNamesMap: Record<string, string> = {};
	readonly tablesConfig: TablesRelationalConfig = {};

	constructor(
		readonly schema: TSchema,
		readonly tables: TTables,
		readonly config: TConfig,
	) {
		for (const [tsName, table] of Object.entries(tables)) {
			const isTable = is(table, Table);
			const isView = is(table, View);

			if (!(isTable || isView)) continue;

			this.tableNamesMap[getTableUniqueName(table)] = tsName as any;

			this.tablesConfig[tsName] = {
				table,
				tsName,
				dbName: table[Table.Symbol.Name],
				schema: table[Table.Symbol.Schema],
				columns: table[Table.Symbol.Columns] as FieldSelection,
				relations: (config[tsName] || {}) as Record<string, RelationsBuilderEntry<TTables, string>>,
			};
		}

		for (const tableConfig of Object.values(this.tablesConfig)) {
			for (const [relationFieldName, relation] of Object.entries(tableConfig.relations)) {
				if (!is(relation, Relation)) {
					continue;
				}

				relation.sourceTable = tableConfig.table;
				relation.fieldName = relationFieldName;
			}
		}

		for (const tableConfig of Object.values(this.tablesConfig)) {
			for (const [relationFieldName, relation] of Object.entries(tableConfig.relations)) {
				if (!is(relation, Relation)) {
					continue;
				}

				const relationPrintName = `relations -> ${tableConfig.tsName}: { ${relationFieldName}: r.${
					is(relation, One) ? 'one' : 'many'
				}.${this.tableNamesMap[getTableUniqueName(relation.targetTable)]}(...) }`;

				if (typeof relation.alias === 'string' && !relation.alias) {
					throw new Error(`${relationPrintName}: "alias" cannot be an empty string - omit it if you don't need it`);
				}

				if (relation.sourceColumns?.length === 0) {
					throw new Error(`${relationPrintName}: "from" cannot be an empty array`);
				}

				if (relation.targetColumns?.length === 0) {
					throw new Error(`${relationPrintName}: "to" cannot be an empty array`);
				}

				if (relation.sourceColumns && relation.targetColumns) {
					if (relation.sourceColumns.length !== relation.targetColumns.length && !relation.throughTable) {
						throw new Error(
							`${relationPrintName}: "from" and "to" fields without "through" must have the same length`,
						);
					}

					if (relation.through) {
						if (
							relation.through.source.length !== relation.sourceColumns.length
							|| relation.through.target.length !== relation.targetColumns.length
						) {
							throw new Error(
								`${relationPrintName}: ".through(column)" must be used either on all columns in "from" and "to" or not defined on any of them`,
							);
						}

						for (const column of relation.through.source) {
							if (tables[column._.tableName] !== relation.throughTable) {
								throw new Error(
									`${relationPrintName}: ".through(column)" must be used on the same table by all columns of the relation`,
								);
							}
						}

						for (const column of relation.through.target) {
							if (tables[column._.tableName] !== relation.throughTable) {
								throw new Error(
									`${relationPrintName}: ".through(column)" must be used on the same table by all columns of the relation`,
								);
							}
						}
					}

					continue;
				}

				if (relation.sourceColumns || relation.targetColumns) {
					throw new Error(
						`${relationPrintName}: relation must have either both "from" and "to" defined, or none of them`,
					);
				}

				let reverseRelation: Relation | undefined;
				const targetTableTsName = this.tableNamesMap[getTableUniqueName(relation.targetTable)];
				if (!targetTableTsName) {
					throw new Error(
						`Table "${getTableUniqueName(relation.targetTable)}" not found in provided TS schema`,
					);
				}
				const reverseTableConfig = this.tablesConfig[targetTableTsName];
				if (!reverseTableConfig) {
					throw new Error(
						`${relationPrintName}: not enough data provided to build the relation - "from"/"to" are not defined, and no reverse relations of table "${targetTableTsName}" were found"`,
					);
				}
				if (relation.alias) {
					const reverseRelations = Object.values(reverseTableConfig.relations).filter((it): it is Relation =>
						is(it, Relation) && it.alias === relation.alias && it !== relation
					);
					if (reverseRelations.length > 1) {
						throw new Error(
							`${relationPrintName}: not enough data provided to build the relation - "from"/"to" are not defined, and multiple relations with alias "${relation.alias}" found in table "${targetTableTsName}": ${
								reverseRelations.map((it) => `"${it.fieldName}"`).join(', ')
							}`,
						);
					}
					reverseRelation = reverseRelations[0];
					if (!reverseRelation) {
						throw new Error(
							`${relationPrintName}: not enough data provided to build the relation - "from"/"to" are not defined, and there is no reverse relation of table "${targetTableTsName}" with alias "${relation.alias}"`,
						);
					}
				} else {
					const reverseRelations = Object.values(reverseTableConfig.relations).filter((it): it is Relation =>
						is(it, Relation) && it.targetTable === relation.sourceTable && !it.alias && it !== relation
					);
					if (reverseRelations.length > 1) {
						throw new Error(
							`${relationPrintName}: not enough data provided to build the relation - "from"/"to" are not defined, and multiple relations between "${targetTableTsName}" and "${
								this.tableNamesMap[getTableUniqueName(relation.sourceTable)] ?? getTableUniqueName(relation.sourceTable)
							}" were found.\nHint: you can specify "alias" on both sides of the relation with the same value`,
						);
					}
					reverseRelation = reverseRelations[0];
					if (!reverseRelation) {
						throw new Error(
							`${relationPrintName}: not enough data provided to build the relation - "from"/"to" are not defined, and no reverse relation of table "${targetTableTsName}" with target table "${
								this.tableNamesMap[getTableUniqueName(relation.sourceTable)] ?? getTableUniqueName(relation.sourceTable)
							}" was found`,
						);
					}
				}
				if (!reverseRelation.sourceColumns || !reverseRelation.targetColumns) {
					throw new Error(
						`${relationPrintName}: not enough data provided to build the relation - "from"/"to" are not defined, and reverse relation "${targetTableTsName}.${reverseRelation.fieldName}" does not have "from"/"to" defined`,
					);
				}

				relation.sourceColumns = reverseRelation.targetColumns;
				relation.targetColumns = reverseRelation.sourceColumns;
				relation.through = reverseRelation.through
					? {
						source: reverseRelation.through.target,
						target: reverseRelation.through.source,
					}
					: undefined;
				relation.throughTable = reverseRelation.throughTable;
				relation.isReversed = !relation.where;
				relation.where = relation.where ?? reverseRelation.where;
			}
		}
	}
}

export type EmptyRelations = Relations<Record<string, never>, Record<string, never>, Record<string, never>>;
export type AnyRelations = Relations<Record<string, any>, Record<string, any>, Record<string, any>>;

export abstract class Relation<
	TSourceTableName extends string = string,
	TTargetTableName extends string = string,
> {
	static readonly [entityKind]: string = 'RelationV2';
	declare readonly $brand: 'RelationV2';

	fieldName!: string;
	sourceColumns!: AnyColumn<{ tableName: TSourceTableName }>[];
	targetColumns!: AnyColumn<{ tableName: TTargetTableName }>[];
	alias: string | undefined;
	where: AnyTableFilter | undefined;
	sourceTable!: AnyTable<{ name: TSourceTableName }> | View<TSourceTableName>;
	through?: {
		source: RelationsBuilderColumnBase[];
		target: RelationsBuilderColumnBase[];
	};
	throughTable?: Table | View;
	isReversed?: boolean;

	constructor(
		readonly targetTable: AnyTable<{ name: TTargetTableName }> | View<TTargetTableName>,
	) {
	}
}

export class One<
	TSourceTableName extends string,
	TTargetTableName extends string,
	TOptional extends boolean = boolean,
> extends Relation<TSourceTableName, TTargetTableName> {
	static override readonly [entityKind]: string = 'OneV2';
	declare protected $relationBrand: 'OneV2';

	readonly optional: TOptional;

	constructor(
		tables: Record<string, Table | View>,
		targetTable: AnyTable<{ name: TTargetTableName }> | View<TTargetTableName>,
		config: AnyOneConfig | undefined,
	) {
		super(targetTable);
		this.alias = config?.alias;
		this.where = config?.where;
		if (config?.from) {
			this.sourceColumns = ((Array.isArray(config.from)
				? config.from
				: [config.from]) as RelationsBuilderColumnBase[]).map((it: RelationsBuilderColumnBase) => {
					this.throughTable ??= it._.through ? tables[it._.through._.tableName]! : undefined;

					return it._.column as AnyColumn<{ tableName: TSourceTableName }>;
				});
		}
		if (config?.to) {
			this.targetColumns = (Array.isArray(config.to)
				? config.to
				: [config.to]).map((it: RelationsBuilderColumnBase) => {
					this.throughTable ??= it._.through ? tables[it._.through._.tableName]! : undefined;

					return it._.column as AnyColumn<{ tableName: TTargetTableName }>;
				});
		}

		if (this.throughTable) {
			this.through = {
				source: (Array.isArray(config?.from) ? config.from : [config!.from]).map((
					c,
				) => c._.through!),
				target: (Array.isArray(config?.to) ? config.to : [config!.to]).map((c) => c._.through!),
			};
		}
		this.optional = (config?.optional ?? true) as TOptional;
	}
}

export class Many<
	TSourceTableName extends string,
	TTargetTableName extends string,
> extends Relation<TSourceTableName, TTargetTableName> {
	static override readonly [entityKind]: string = 'ManyV2';
	declare protected $relationBrand: 'ManyV2';

	constructor(
		tables: Record<string, Table | View>,
		targetTable: AnyTable<{ name: TTargetTableName }> | View<TTargetTableName>,
		readonly config: AnyManyConfig | undefined,
	) {
		super(targetTable);
		this.alias = config?.alias;
		this.where = config?.where;
		if (config?.from) {
			this.sourceColumns = ((Array.isArray(config.from)
				? config.from
				: [config.from]) as RelationsBuilderColumnBase[]).map((it: RelationsBuilderColumnBase) => {
					this.throughTable ??= it._.through ? tables[it._.through._.tableName]! : undefined;

					return it._.column as AnyColumn<{ tableName: TSourceTableName }>;
				});
		}
		if (config?.to) {
			this.targetColumns = (Array.isArray(config.to)
				? config.to
				: [config.to]).map((it: RelationsBuilderColumnBase) => {
					this.throughTable ??= it._.through ? tables[it._.through._.tableName]! : undefined;

					return it._.column as AnyColumn<{ tableName: TTargetTableName }>;
				});
		}
		if (this.throughTable) {
			this.through = {
				source: (Array.isArray(config?.from) ? config.from : [config!.from]).map((
					c,
				) => c._.through!),
				target: (Array.isArray(config?.to) ? config.to : [config!.to]).map((c) => c._.through!),
			};
		}
	}
}

export abstract class AggregatedField<T = unknown> implements SQLWrapper<T> {
	static readonly [entityKind]: string = 'AggregatedField';

	declare readonly $brand: 'AggregatedField';

	declare readonly _: {
		readonly data: T;
	};

	protected table: Table | View | undefined;

	onTable(table: Table | View) {
		this.table = table;

		return this;
	}

	abstract getSQL(): SQL<T>;
}

export class Count extends AggregatedField<number> {
	static override readonly [entityKind]: string = 'AggregatedFieldCount';

	declare protected $aggregatedFieldBrand: 'Count';

	private query: SQL<number> | undefined;

	getSQL(): SQL<number> {
		if (!this.query) {
			if (!this.table) throw new Error('Table must be set before building aggregate field');
			this.query = sql`select count(*) as ${sql.identifier('r')} from ${getTableAsAliasSQL(this.table)}`
				.mapWith(Number);
		}

		return this.query;
	}
}

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

export const operators = {
	and,
	between,
	eq,
	exists,
	gt,
	gte,
	ilike,
	inArray,
	arrayContains,
	arrayContained,
	arrayOverlaps,
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

export type Operators = typeof operators;

export const orderByOperators = {
	sql,
	asc,
	desc,
};

export function getOrderByOperators() {
	return orderByOperators;
}

export type OrderByOperators = ReturnType<typeof getOrderByOperators>;

export type FindTableInRelationalConfig<
	TSchema extends TablesRelationalConfig,
	TTargetTable extends Table | View,
	TTableName extends string = TTargetTable['_']['name'],
> = ExtractObjectValues<
	{
		[
			K in keyof TSchema as TSchema[K]['tsName'] extends TTableName ? K : never
		]: TSchema[K];
	}
>;

export interface SQLOperator {
	sql: Operators['sql'];
}

export type DBQueryConfig<
	TRelationType extends 'one' | 'many' = 'one' | 'many',
	TSchema extends TablesRelationalConfig = TablesRelationalConfig,
	TTableConfig extends TableRelationalConfig = TableRelationalConfig,
	TIsNested extends boolean = false,
> =
	& (TTableConfig['relations'] extends Record<string, never> ? {}
		: {
			with?:
				| {
					[K in keyof TTableConfig['relations']]?:
						| boolean
						| (TTableConfig['relations'][K] extends Relation ? DBQueryConfig<
								TTableConfig['relations'][K] extends One<string, string> ? 'one' : 'many',
								TSchema,
								FindTableInRelationalConfig<
									TSchema,
									TTableConfig['relations'][K]['targetTable']
								>,
								true
							>
							: never)
						| undefined;
				}
				| undefined;
		})
	& {
		columns?:
			| {
				[K in keyof TTableConfig['columns']]?: boolean | undefined;
			}
			| undefined;
		where?: RelationsFilter<TTableConfig, TSchema> | undefined;
		extras?:
			| Record<
				string,
				| SQLWrapper
				| ((
					table: TTableConfig['table'],
					operators: SQLOperator,
				) => SQLWrapper)
			>
			| undefined;
	}
	& (`${TRelationType}_${TIsNested}` extends 'one_true' ? {} : {
		orderBy?:
			| {
				[K in keyof TTableConfig['columns']]?: 'asc' | 'desc' | undefined;
			}
			| ((
				table: TTableConfig['table'],
				operators: OrderByOperators,
			) => ValueOrArray<AnyColumn | SQL>)
			| undefined;
		offset?: number | Placeholder | undefined;
	})
	& (TRelationType extends 'many' ? {
			limit?: number | Placeholder | undefined;
		}
		: {});

export type AnyDBQueryConfig = {
	columns?:
		| {
			[K in keyof TableRelationalConfig['columns']]?: boolean | undefined;
		}
		| undefined;
	where?: RelationsFilter<TableRelationalConfig, TablesRelationalConfig> | undefined;
	extras?:
		| Record<
			string,
			| SQLWrapper
			| ((
				table: TableRelationalConfig['table'],
				operators: SQLOperator,
			) => SQLWrapper)
		>
		| undefined;

	with?:
		| {
			[K in keyof TableRelationalConfig['relations']]?:
				| boolean
				| (TableRelationalConfig['relations'][K] extends Relation ? DBQueryConfig<
						TableRelationalConfig['relations'][K] extends One<string, string> ? 'one' : 'many',
						TablesRelationalConfig,
						FindTableInRelationalConfig<
							TablesRelationalConfig,
							TableRelationalConfig['relations'][K]['targetTable']
						>
					>
					: never)
				| undefined;
		}
		| undefined;
	orderBy?:
		| {
			[K in keyof TableRelationalConfig['columns']]?: 'asc' | 'desc' | undefined;
		}
		| ((
			table: TableRelationalConfig['table'],
			operators: OrderByOperators,
		) => ValueOrArray<AnyColumn | SQL>)
		| undefined;
	offset?: number | Placeholder | undefined;
	limit?: number | Placeholder | undefined;
};

export interface TableRelationalConfig {
	table: Table | View;
	tsName: string;
	dbName: string;
	schema: string | undefined;
	columns: FieldSelection;
	relations: Record<string, RelationsBuilderEntry>;
}

export type TablesRelationalConfig = Record<string, TableRelationalConfig>;

export interface RelationalSchemaConfig<
	TTablesConfig extends TablesRelationalConfig,
> {
	tables: Record<string, Table>;
	tablesConfig: TTablesConfig;
	tableNamesMap: Record<string, string>;
}

type NonUndefinedRecord<TRecord extends Record<string, any>> = {
	[K in keyof TRecord as K extends undefined ? never : K]: TRecord[K];
};

export type ExtractTablesWithRelations<
	TRelations extends Relations,
	TTables extends Record<string, Table | View> = TRelations['tables'],
> = {
	[K in keyof TTables]: {
		table: TTables[K];
		tsName: K & string;
		dbName: TTables[K]['_']['name'];
		columns: TTables[K] extends Table ? TTables[K]['_']['columns'] : Assume<TTables[K], View>['_']['selectedFields'];
		relations: K extends keyof TRelations['config']
			? TRelations['config'][K] extends Record<string, any> ? NonUndefinedRecord<TRelations['config'][K]>
			: Record<string, never>
			: Record<string, never>;
		// Views don't have schema on type-level, TBD
		schema: TTables[K] extends Table ? TTables[K]['_']['schema'] : string | undefined;
	};
};

export type ReturnTypeOrValue<T> = T extends (...args: any[]) => infer R ? R
	: T;

export type BuildRelationResult<
	TConfig extends TablesRelationalConfig,
	TInclude,
	TRelations extends Record<string, RelationsBuilderEntry>,
> = {
	[
		K in
			& TruthyKeysOnly<TInclude>
			& keyof TRelations
	]: TRelations[K] extends infer TRel extends Relation ? BuildQueryResult<
			TConfig,
			FindTableInRelationalConfig<TConfig, TRel['targetTable']>,
			Assume<TInclude[K], true | Record<string, unknown>>
		> extends infer TResult ? TRel extends One<string, string> ?
					| TResult
					| (Equal<TRel['optional'], true> extends true ? null
						: TInclude[K] extends Record<string, unknown> ? TInclude[K]['where'] extends Record<string, any> ? null
							: never
						: never)
			: TResult[]
		: never
		: TRelations[K] extends AggregatedField<infer TData> ? TData
		: never;
};

export type NonUndefinedKeysOnly<T> =
	& ExtractObjectValues<
		{
			[K in keyof T as T[K] extends undefined ? never : K]: K;
		}
	>
	& keyof T;

export type TruthyKeysOnly<T> =
	& ExtractObjectValues<
		{
			[K in keyof T as T[K] extends undefined | false ? never : K]: K;
		}
	>
	& keyof T;

export type InferRelationalQueryTableResult<
	TTable extends Table | View,
	TRawSelection extends Record<string, unknown>,
	TSelectedFields extends Record<string, unknown> | 'Full' = 'Full',
	TFilteredSelection extends Record<string, unknown> = TSelectedFields extends 'Full' ? TRawSelection : {
		[
			K in Equal<
				Exclude<
					TSelectedFields[
						& keyof TSelectedFields
						& keyof TRawSelection
					],
					undefined
				>,
				false
			> extends true ? Exclude<
					keyof TRawSelection,
					NonUndefinedKeysOnly<TSelectedFields>
				>
				:
					& {
						[K in keyof TSelectedFields]: Equal<
							TSelectedFields[K],
							true
						> extends true ? K
							: never;
					}[keyof TSelectedFields]
					& keyof TRawSelection
		]: TRawSelection[K];
	},
> = {
	[K in keyof TFilteredSelection]: TTable['$inferSelect'][Assume<K, keyof TTable['$inferSelect']>];
};

export type BuildQueryResult<
	TSchema extends TablesRelationalConfig,
	TTableConfig extends TableRelationalConfig,
	TFullSelection extends true | Record<string, unknown>,
> = Equal<TFullSelection, true> extends true
	? Simplify<InferRelationalQueryTableResult<TTableConfig['table'], TTableConfig['columns']>>
	: TFullSelection extends Record<string, unknown> ? Simplify<
			& (InferRelationalQueryTableResult<
				TTableConfig['table'],
				TTableConfig['columns'],
				TFullSelection['columns'] extends Record<string, unknown> ? TFullSelection['columns'] : 'Full'
			>)
			& (TFullSelection['extras'] extends Record<string, SQLWrapper | ((...args: any[]) => SQLWrapper)> ? {
					[
						K in NonUndefinedKeysOnly<
							ReturnTypeOrValue<TFullSelection['extras']>
						>
					]: ReturnType<
						Assume<
							ReturnTypeOrValue<TFullSelection['extras'][K]>,
							SQLWrapper
						>['getSQL']
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

export interface NormalizedRelation {
	fields: AnyColumn[];
	references: AnyColumn[];
}

export interface BuildRelationalQueryResult {
	selection: {
		key: string;
		field: Column | Table | SQL | SQL.Aliased | SQLWrapper | AggregatedField;
		isArray?: boolean;
		selection?: BuildRelationalQueryResult['selection'];
		isOptional?: boolean;
	}[];
	sql: SQL;
}

export function mapRelationalRow(
	row: Record<string, unknown>,
	buildQueryResultSelection: BuildRelationalQueryResult['selection'],
	mapColumnValue: (value: unknown) => unknown = (value) => value,
	/** Needed for SQLite as it returns JSON values as strings */
	parseJson: boolean = false,
	path?: string,
): Record<string, unknown> {
	for (
		const selectionItem of buildQueryResultSelection
	) {
		if (selectionItem.selection) {
			const currentPath = `${path ? `${path}.` : ''}${selectionItem.key}`;

			if (row[selectionItem.key] === null) continue;

			if (parseJson) row[selectionItem.key] = JSON.parse(row[selectionItem.key] as string);

			if (selectionItem.isArray) {
				for (const item of (row[selectionItem.key] as Array<Record<string, unknown>>)) {
					mapRelationalRow(
						item,
						selectionItem.selection!,
						mapColumnValue,
						false,
						currentPath,
					);
				}

				continue;
			}

			mapRelationalRow(
				row[selectionItem.key] as Record<string, unknown>,
				selectionItem.selection!,
				mapColumnValue,
				false,
				currentPath,
			);

			continue;
		}

		const field = selectionItem.field!;
		const value = mapColumnValue(row[selectionItem.key]);
		if (value === null) continue;

		let decoder;
		if (is(field, Column)) {
			decoder = field;
		} else if (is(field, SQL)) {
			decoder = field.decoder;
		} else if (is(field, SQL.Aliased)) {
			decoder = field.sql.decoder;
		} else {
			decoder = field.getSQL().decoder;
		}
		row[selectionItem.key] = decoder.mapFromDriverValue(value);
	}

	return row;
}

export class RelationsBuilderTable<TTableName extends string = string> {
	static readonly [entityKind]: string = 'RelationsBuilderTable';

	readonly _: {
		readonly name: TTableName;
		readonly table: AnyTable<{ name: TTableName }> | View<TTableName>;
	};

	constructor(table: AnyTable<{ name: TTableName }> | View<TTableName>, key: string) {
		this._ = {
			name: key as TTableName,
			table,
		};
	}
}

export interface RelationsBuilderColumnConfig<
	TTableName extends string = string,
	TData = unknown,
> {
	readonly tableName: TTableName;
	readonly data: TData;
	readonly column: AnyColumn<{ tableName: TTableName }> | SQL<TData> | SQLWrapper<TData> | SQL.Aliased<TData>;
	readonly through?: RelationsBuilderColumnBase;
	readonly key: string;
}

export type RelationsBuilderColumnBase<
	TTableName extends string = string,
	TData = unknown,
> = {
	_: RelationsBuilderColumnConfig<TTableName, TData>;
};

export class RelationsBuilderColumn<
	TTableName extends string = string,
	TData = unknown,
> implements RelationsBuilderColumnBase<TTableName, TData> {
	static readonly [entityKind]: string = 'RelationsBuilderColumn';

	readonly _: {
		readonly tableName: TTableName;
		readonly data: TData;
		readonly column: AnyColumn<{ tableName: TTableName }> | SQL<TData> | SQLWrapper<TData> | SQL.Aliased<TData>;
		readonly key: string;
	};

	constructor(
		column: AnyColumn<{ tableName: TTableName }> | SQL<TData> | SQLWrapper<TData> | SQL.Aliased<TData>,
		tableName: TTableName,
		key: string,
	) {
		this._ = {
			tableName: tableName,
			data: undefined as TData,
			column,
			key,
		};
	}

	through(column: RelationsBuilderColumn): RelationsBuilderJunctionColumn<TTableName, TData> {
		return new RelationsBuilderJunctionColumn(
			this._.column,
			this._.tableName,
			this._.key,
			column,
		);
	}
}

export class RelationsBuilderJunctionColumn<
	TTableName extends string = string,
	TData = unknown,
> implements RelationsBuilderColumnBase<TTableName, TData> {
	static readonly [entityKind]: string = 'RelationsBuilderColumn';

	readonly _: {
		readonly tableName: TTableName;
		readonly data: TData;
		readonly column: AnyColumn<{ tableName: TTableName }> | SQL<TData> | SQLWrapper<TData> | SQL.Aliased<TData>;
		readonly through: RelationsBuilderColumnBase;
		readonly key: string;
	};

	constructor(
		column: AnyColumn<{ tableName: TTableName }> | SQL<TData> | SQLWrapper<TData> | SQL.Aliased<TData>,
		tableName: TTableName,
		key: string,
		through: RelationsBuilderColumnBase,
	) {
		this._ = {
			tableName: tableName,
			data: undefined as TData,
			column,
			through,
			key,
		};
	}
}

export interface RelationFieldsFilterInternals<T> {
	eq?: T | Placeholder | undefined;
	ne?: T | Placeholder | undefined;
	gt?: T | Placeholder | undefined;
	gte?: T | Placeholder | undefined;
	lt?: T | Placeholder | undefined;
	lte?: T | Placeholder | undefined;
	in?: (T | Placeholder)[] | Placeholder | undefined;
	notIn?: (T | Placeholder)[] | Placeholder | undefined;
	arrayContains?: (T extends Array<infer E> ? (E | Placeholder)[] : T) | Placeholder | undefined;
	arrayContained?: (T extends Array<infer E> ? (E | Placeholder)[] : T) | Placeholder | undefined;
	arrayOverlaps?: (T extends Array<infer E> ? (E | Placeholder)[] : T) | Placeholder | undefined;
	like?: string | Placeholder | undefined;
	ilike?: string | Placeholder | undefined;
	notLike?: string | Placeholder | undefined;
	notIlike?: string | Placeholder | undefined;
	isNull?: true | undefined;
	isNotNull?: true | undefined;
	NOT?: RelationsFieldFilter<T> | undefined;
	OR?: RelationsFieldFilter<T>[] | undefined;
	AND?: RelationsFieldFilter<T>[] | undefined;
}

export type RelationsFieldFilter<T = unknown> =
	| RelationFieldsFilterInternals<T>
	| (
		unknown extends T ? never : T extends object ? never : T
	)
	| Placeholder;

export interface RelationsFilterCommons<
	TTable extends TableRelationalConfig = TableRelationalConfig,
	TSchema extends TablesRelationalConfig = TablesRelationalConfig,
> {
	OR?: RelationsFilter<TTable, TSchema>[] | undefined;
	NOT?: RelationsFilter<TTable, TSchema> | undefined;
	AND?: RelationsFilter<TTable, TSchema>[] | undefined;
	RAW?:
		| SQLWrapper
		| ((
			table: TTable['table'],
			operators: Operators,
		) => SQL)
		| undefined;
}

export type RelationsFilter<
	TTable extends TableRelationalConfig,
	TSchema extends TablesRelationalConfig,
	TRelations extends Record<string, Relation> = TTable['relations'],
	TColumns extends FieldSelection = TTable['columns'],
> = TTable['relations'] extends Record<string, never> ? TableFilter<TTable['table']>
	:
		& {
			[K in keyof TColumns]?:
				| (TColumns[K] extends Column ? RelationsFieldFilter<TColumns[K]['_']['data']>
					: RelationsFieldFilter<unknown>)
				| undefined;
		}
		& {
			[K in keyof TRelations]?:
				| boolean
				| RelationsFilter<FindTableInRelationalConfig<TSchema, TRelations[K]['targetTable']>, TSchema>
				| undefined;
		}
		& RelationsFilterCommons<TTable, TSchema>;

export interface TableFilterCommons<
	TTable extends Table | View = Table | View,
	TColumns extends FieldSelection = TTable extends View ? Assume<TTable['_']['selectedFields'], FieldSelection>
		: Assume<TTable, Table>['_']['columns'],
> {
	OR?: TableFilter<TTable, TColumns>[] | undefined;
	NOT?: TableFilter<TTable, TColumns> | undefined;
	AND?: TableFilter<TTable, TColumns>[] | undefined;
	RAW?:
		| SQLWrapper
		| ((
			table: TTable,
			operators: Operators,
		) => SQL)
		| undefined;
}

export type TableFilter<
	TTable extends Table | View = Table | View,
	TColumns extends FieldSelection = TTable extends View ? Assume<TTable['_']['selectedFields'], FieldSelection>
		: Assume<TTable, Table>['_']['columns'],
> =
	& {
		[K in keyof TColumns as K extends keyof TableFilterCommons ? never : K]?:
			| (TColumns[K] extends Column ? RelationsFieldFilter<TColumns[K]['_']['data']>
				: RelationsFieldFilter<unknown>)
			| undefined;
	}
	& TableFilterCommons<TTable, TColumns>;

export type AnyRelationsFilter = RelationsFilter<
	TableRelationalConfig,
	TablesRelationalConfig,
	Record<string, Relation>,
	FieldSelection
>;

export type AnyTableFilter = TableFilter<
	Table | View,
	FieldSelection
>;

export interface OneConfig<
	TSchema extends Record<string, Table | View>,
	TSourceColumns extends
		| Readonly<[RelationsBuilderColumnBase, ...RelationsBuilderColumnBase[]]>
		| Readonly<RelationsBuilderColumnBase>,
	TTargetTableName extends string,
	TOptional extends boolean,
> {
	from?: TSourceColumns;
	to?: TSourceColumns extends
		RelationsBuilderJunctionColumn | [RelationsBuilderJunctionColumn, ...RelationsBuilderJunctionColumn[]]
		? RelationsBuilderJunctionColumn<TTargetTableName> | [
			RelationsBuilderJunctionColumn<TTargetTableName>,
			...RelationsBuilderJunctionColumn<TTargetTableName>[],
		]
		: TSourceColumns extends [RelationsBuilderColumn]
			? RelationsBuilderColumn<TTargetTableName> | [RelationsBuilderColumn<TTargetTableName>]
		: TSourceColumns extends [RelationsBuilderColumn, ...RelationsBuilderColumn[]]
			? { [K in keyof TSourceColumns]: RelationsBuilderColumn<TTargetTableName> }
		: RelationsBuilderColumn<TTargetTableName>;
	where?: TableFilter<TSchema[TTargetTableName]>;
	optional?: TOptional;
	alias?: string;
}

export type AnyOneConfig = OneConfig<
	Record<string, Table | View>,
	Readonly<[RelationsBuilderColumnBase, ...RelationsBuilderColumnBase[]] | RelationsBuilderColumnBase<string, unknown>>,
	string,
	boolean
>;

export interface ManyConfig<
	TSchema extends Record<string, Table | View>,
	TSourceColumns extends
		| Readonly<[RelationsBuilderColumnBase, ...RelationsBuilderColumnBase[]]>
		| Readonly<RelationsBuilderColumnBase>,
	TTargetTableName extends string,
> {
	from?: TSourceColumns;
	to?: TSourceColumns extends
		RelationsBuilderJunctionColumn | [RelationsBuilderJunctionColumn, ...RelationsBuilderJunctionColumn[]]
		? RelationsBuilderJunctionColumn<TTargetTableName> | [
			RelationsBuilderJunctionColumn<TTargetTableName>,
			...RelationsBuilderJunctionColumn<TTargetTableName>[],
		]
		: TSourceColumns extends [RelationsBuilderColumn]
			? RelationsBuilderColumn<TTargetTableName> | [RelationsBuilderColumn<TTargetTableName>]
		: TSourceColumns extends [RelationsBuilderColumn, ...RelationsBuilderColumn[]]
			? { [K in keyof TSourceColumns]: RelationsBuilderColumn<TTargetTableName> }
		: RelationsBuilderColumn<TTargetTableName>;
	where?: TableFilter<TSchema[TTargetTableName]>;
	alias?: string;
}

export type AnyManyConfig = ManyConfig<
	Record<string, Table | View>,
	Readonly<[RelationsBuilderColumnBase, ...RelationsBuilderColumnBase[]]> | Readonly<RelationsBuilderColumnBase>,
	string
>;

export interface OneFn<
	TTables extends Record<string, Table | View>,
	TTargetTableName extends string,
> {
	<
		// "any" default value is required for cases where config is not provided, to satisfy the source table name constraint
		TSourceColumns extends
			| Readonly<[RelationsBuilderColumnBase, ...RelationsBuilderColumnBase[]]>
			| RelationsBuilderColumnBase = any,
		TOptional extends boolean = true,
	>(
		config?: OneConfig<TTables, TSourceColumns, TTargetTableName, TOptional>,
	): One<
		TSourceColumns extends [RelationsBuilderColumnBase, ...RelationsBuilderColumnBase[]]
			? TSourceColumns[number]['_']['tableName']
			: Assume<TSourceColumns, RelationsBuilderColumnBase>['_']['tableName'],
		TTargetTableName,
		TOptional
	>;
}

export interface ManyFn<
	TTables extends Record<string, Table | View>,
	TTargetTableName extends string,
> {
	<
		// "any" default value is required for cases where config is not provided, to satisfy the source table name constraint
		TSourceColumns extends
			| Readonly<[RelationsBuilderColumnBase, ...RelationsBuilderColumnBase[]]>
			| RelationsBuilderColumnBase = any,
	>(
		config?: ManyConfig<TTables, TSourceColumns, TTargetTableName>,
	): Many<
		TSourceColumns extends [RelationsBuilderColumnBase, ...RelationsBuilderColumnBase[]]
			? TSourceColumns[number]['_']['tableName']
			: Assume<TSourceColumns, RelationsBuilderColumnBase>['_']['tableName'],
		TTargetTableName
	>;
}

export class RelationsHelperStatic<TTables extends Record<string, Table | View>> {
	static readonly [entityKind]: string = 'RelationsHelperStatic';
	declare readonly $brand: 'RelationsHelperStatic';

	readonly _: {
		readonly tables: TTables;
	};

	constructor(tables: TTables) {
		this._ = {
			tables,
		};

		const one: Record<string, OneFn<TTables, string>> = {};
		const many: Record<string, ManyFn<TTables, string>> = {};

		for (const [tableName, table] of Object.entries(tables)) {
			one[tableName] = (config) => {
				return new One(tables, table, config as AnyOneConfig);
			};

			many[tableName] = (config) => {
				return new Many(tables, table, config as AnyManyConfig);
			};
		}

		this.one = one as this['one'];
		this.many = many as this['many'];
	}

	one: {
		[K in keyof TTables]: TTables[K] extends Table | View<string, boolean, FieldSelection> ? OneFn<TTables, K & string>
			: DrizzleTypeError<'Views with nested selections are not supported by the relational query builder'>;
	};

	many: {
		[K in keyof TTables]: TTables[K] extends Table | View<string, boolean, FieldSelection> ? ManyFn<TTables, K & string>
			: DrizzleTypeError<'Views with nested selections are not supported by the relational query builder'>;
	};

	/** @internal - to be reworked */
	aggs = {
		count(): Count {
			return new Count();
		},
	};
}

export type RelationsBuilder<TSchema extends Record<string, Table | View>> =
	& {
		[TTableName in keyof TSchema & string]: TSchema[TTableName] extends Table | View<string, boolean, FieldSelection>
			? (
				& {
					[
						TColumnName in keyof (TSchema[TTableName] extends Table ? TSchema[TTableName]['_']['columns']
							: Assume<TSchema[TTableName], View>['_']['selectedFields'])
					]: RelationsBuilderColumn<
						TTableName,
						(TSchema[TTableName] extends Table ? TSchema[TTableName]['_']['columns']
							: Assume<Assume<TSchema[TTableName], View>['_']['selectedFields'], FieldSelection>)[TColumnName] extends
							infer Field ? Field extends Column ? Field['_']['data']
							: Field extends SQLWrapper<infer Data> | SQL<infer Data> | SQL.Aliased<infer Data> ? Data
							: never
							: never
					>;
				}
				& RelationsBuilderTable<TTableName>
			)
			: DrizzleTypeError<'Views with nested selections are not supported by the relational query builder'>;
	}
	& RelationsHelperStatic<TSchema>;

export type RelationsBuilderConfig<TTables extends Record<string, Table | View>> = {
	[TTableName in keyof TTables & string]?: Record<string, RelationsBuilderEntry<TTables, TTableName>>;
};

export type RelationsBuilderEntry<
	TTables extends Record<string, Table | View> = Record<string, Table | View>,
	TSourceTableName extends string = string,
> = Relation<TSourceTableName, keyof TTables & string>;

export type ExtractTablesFromSchema<TSchema extends Record<string, unknown>> = {
	[K in keyof TSchema as TSchema[K] extends Table | View ? K : never]: TSchema[K] extends Table | View ? TSchema[K]
		: never;
};

export function createRelationsHelper<
	TSchema extends Record<string, unknown>,
	TTables extends Record<string, Table | View>,
>(schema: TSchema): RelationsBuilder<TTables> {
	const schemaTables = Object.fromEntries(
		Object.entries(schema).filter((e): e is [typeof e[0], Table | View] => is(e[1], Table) || is(e[1], View)),
	);
	const helperStatic = new RelationsHelperStatic(schemaTables);
	const tables = Object.entries(schema).reduce<Record<string, RelationsBuilderTable>>((acc, [tKey, value]) => {
		if (is(value, Table) || is(value, View)) {
			const rTable = new RelationsBuilderTable(value, tKey);
			const columns = Object.entries(value[Columns]).reduce<
				Record<string, RelationsBuilderColumnBase>
			>(
				(acc, [cKey, column]) => {
					const rbColumn = new RelationsBuilderColumn(column as Column, tKey, cKey);
					acc[cKey] = rbColumn;
					return acc;
				},
				{},
			);
			acc[tKey] = Object.assign(rTable, columns);
		}
		return acc;
	}, {});

	return Object.assign(helperStatic, tables) as RelationsBuilder<TTables>;
}

export function defineRelations<
	TSchema extends Record<string, unknown>,
	TConfig extends RelationsBuilderConfig<TTables>,
	TTables extends Record<string, Table | View> = ExtractTablesFromSchema<TSchema>,
>(
	schema: TSchema,
	relations?: (helpers: RelationsBuilder<TTables>) => TConfig,
): Relations<TSchema, TTables, TConfig> {
	return new Relations(
		schema,
		schema as unknown as TTables,
		relations ? relations(createRelationsHelper(schema as unknown as TTables)) : {},
	) as Relations<TSchema, TTables, TConfig>;
}

export interface WithContainer<TRelatedTables extends Record<string, Table> = Record<string, Table>> {
	with?: {
		[K in keyof TRelatedTables]?: boolean | AnyDBQueryConfig;
	};
}

export interface ColumnWithTSName {
	column: Column | SQL | SQLWrapper | SQL.Aliased;
	tsName: string;
}

export type RelationsOrder<TColumns extends FieldSelection> = {
	[K in keyof TColumns]?: 'asc' | 'desc';
};

export type OrderBy = Exclude<AnyDBQueryConfig['orderBy'], undefined>;

export type Extras = Exclude<AnyDBQueryConfig['extras'], undefined>;

/** @internal */
export function fieldSelectionToSQL(table: Table | View, target: string) {
	const field = table[Columns][target];

	return field
		? is(field, Column)
			? field
			: is(field, SQL.Aliased)
			? sql`${table}.${sql.identifier(field.fieldAlias)}`
			: sql`${table}.${sql.identifier(target)}`
		: sql`${table}.${sql.identifier(target)}`;
}

function relationsFieldFilterToSQL(column: SQLWrapper, filter: RelationsFieldFilter<unknown>): SQL | undefined {
	if (typeof filter !== 'object' || is(filter, Placeholder)) return eq(column, filter);

	const entries = Object.entries(filter as RelationFieldsFilterInternals<unknown>);
	if (!entries.length) return undefined;

	const parts: (SQL)[] = [];
	for (const [target, value] of entries) {
		if (value === undefined) continue;

		switch (target as keyof RelationFieldsFilterInternals<unknown>) {
			case 'NOT': {
				const res = relationsFieldFilterToSQL(column, value as RelationsFieldFilter<unknown>);
				if (!res) continue;

				parts.push(not(res));

				continue;
			}

			case 'OR': {
				if (!(value as RelationsFieldFilter<unknown>[]).length) continue;

				parts.push(
					or(
						...(value as AnyRelationsFilter[]).map((subFilter) => relationsFieldFilterToSQL(column, subFilter)),
					)!,
				);

				continue;
			}

			case 'AND': {
				if (!(value as RelationsFieldFilter<unknown>[]).length) continue;

				parts.push(
					and(
						...(value as AnyRelationsFilter[]).map((subFilter) => relationsFieldFilterToSQL(column, subFilter)),
					)!,
				);

				continue;
			}

			case 'isNotNull':
			case 'isNull': {
				if (!value) continue;

				parts.push(operators[target as 'isNull' | 'isNotNull'](column));

				continue;
			}

			case 'in': {
				parts.push(operators.inArray(column, value as any[] | Placeholder));

				continue;
			}

			case 'notIn': {
				parts.push(operators.notInArray(column, value as any[] | Placeholder));

				continue;
			}

			default: {
				parts.push(
					(operators[target as keyof typeof operators] as ((col: SQLWrapper, data: any) => SQL | undefined))(
						column,
						value,
					)!,
				);

				continue;
			}
		}
	}

	if (!parts.length) return undefined;

	return and(...parts);
}

export function relationsFilterToSQL(
	table: Table | View,
	filter: AnyRelationsFilter | AnyTableFilter,
): SQL | undefined;
export function relationsFilterToSQL(
	table: Table | View,
	filter: AnyRelationsFilter | AnyTableFilter,
	tableRelations: Record<string, Relation>,
	tablesRelations: TablesRelationalConfig,
	tableNamesMap: Record<string, string>,
	casing: CasingCache,
	depth?: number,
): SQL | undefined;
export function relationsFilterToSQL(
	table: Table | View,
	filter: AnyRelationsFilter | AnyTableFilter,
	tableRelations: Record<string, Relation> = {},
	tablesRelations: TablesRelationalConfig = {},
	tableNamesMap: Record<string, string> = {},
	casing?: CasingCache,
	depth: number = 0,
): SQL | undefined {
	const entries = Object.entries(filter);
	if (!entries.length) return undefined;

	const parts: SQL[] = [];
	for (const [target, value] of entries) {
		if (value === undefined) continue;

		switch (target) {
			case 'RAW': {
				const processed = typeof value === 'function'
					? (value as unknown as (table: FieldSelection, operators: Operators) => SQL)(table as any, operators)
					: (value as SQLWrapper).getSQL();

				parts.push(processed);

				continue;
			}
			case 'OR': {
				if (!(value as AnyRelationsFilter[] | undefined)?.length) continue;

				parts.push(
					or(
						...(value as AnyRelationsFilter[]).map((subFilter) =>
							relationsFilterToSQL(table, subFilter, tableRelations, tablesRelations, tableNamesMap, casing!, depth)
						),
					)!,
				);

				continue;
			}
			case 'AND': {
				if (!(value as AnyRelationsFilter[] | undefined)?.length) continue;

				parts.push(
					and(
						...(value as AnyRelationsFilter[]).map((subFilter) =>
							relationsFilterToSQL(table, subFilter, tableRelations, tablesRelations, tableNamesMap, casing!, depth)
						),
					)!,
				);

				continue;
			}
			case 'NOT': {
				if (value === undefined) continue;

				const built = relationsFilterToSQL(
					table,
					value as AnyRelationsFilter,
					tableRelations,
					tablesRelations,
					tableNamesMap,
					casing!,
					depth,
				);
				if (!built) continue;

				parts.push(not(built));

				continue;
			}
			default: {
				if (table[Columns][target]) {
					const column = fieldSelectionToSQL(table, target);

					const colFilter = relationsFieldFilterToSQL(
						column,
						value as RelationsFieldFilter,
					);
					if (colFilter) parts.push(colFilter);

					continue;
				}

				const relation = tableRelations[target];
				if (!relation) {
					// Should never trigger unless the types've been violated
					throw new DrizzleError({
						message: `Unknown relational filter field: "${target}"`,
					});
				}

				const targetTable = aliasedTable(relation.targetTable, `f${depth}`);
				const throughTable = relation.throughTable ? aliasedTable(relation.throughTable, `ft${depth}`) : undefined;
				const targetConfig = tablesRelations[tableNamesMap[getTableUniqueName(relation.targetTable)]!]!;

				const {
					filter: relationFilter,
					joinCondition,
				} = relationToSQL(casing!, relation, table, targetTable, throughTable);
				const subfilter = typeof value === 'boolean' ? undefined : relationsFilterToSQL(
					targetTable,
					value as AnyRelationsFilter,
					targetConfig.relations,
					tablesRelations,
					tableNamesMap,
					casing!,
					depth + 1,
				);
				const filter = and(
					relationFilter,
					subfilter,
				);

				const subquery = throughTable
					? sql`(select * from ${getTableAsAliasSQL(targetTable)} inner join ${
						getTableAsAliasSQL(throughTable)
					} on ${joinCondition}${sql` where ${filter}`.if(filter)} limit 1)`
					: sql`(select * from ${getTableAsAliasSQL(targetTable)}${sql` where ${filter}`.if(filter)} limit 1)`;
				if (filter) parts.push((value ? exists : notExists)(subquery));
			}
		}
	}

	return and(...parts)!;
}

export function relationsOrderToSQL(
	table: Table | View,
	orders: OrderBy,
): SQL | undefined {
	if (typeof orders === 'function') {
		const data = orders(table as any, orderByOperators);

		return is(data, SQL)
			? data
			: Array.isArray(data)
			? data.length
				? sql.join(data.map((o) => is(o, SQL) ? o : asc(o)), sql`, `)
				: undefined
			: is(data, Column)
			? asc(data)
			: undefined;
	}

	const entries = Object.entries(orders).filter(([_, value]) => value);
	if (!entries.length) return undefined;

	return sql.join(
		entries.map(([target, value]) => (value === 'asc' ? asc : desc)(fieldSelectionToSQL(table, target))),
		sql`, `,
	);
}

export function relationExtrasToSQL(
	table: Table | View,
	extras: Extras,
) {
	const subqueries: SQL[] = [];
	const selection: BuildRelationalQueryResult['selection'] = [];

	for (
		const [key, field] of Object.entries(extras)
	) {
		if (!field) continue;
		const extra = typeof field === 'function' ? field(table as any, { sql: operators.sql }) : field;

		const query = sql`(${extra.getSQL()}) as ${sql.identifier(key)}`;

		query.decoder = extra.getSQL().decoder;

		subqueries.push(query);
		selection.push({
			key,
			field: query,
		});
	}

	return {
		sql: subqueries.length ? sql.join(subqueries, sql`, `) : undefined,
		selection,
	};
}

export interface BuiltRelationFilters {
	filter?: SQL;
	joinCondition?: SQL;
}

export function relationToSQL(
	casing: CasingCache,
	relation: Relation,
	sourceTable: Table | View,
	targetTable: Table | View,
	throughTable?: Table | View,
): BuiltRelationFilters {
	if (relation.through) {
		const outerColumnWhere = relation.sourceColumns.map((s, i) => {
			const t = relation.through!.source[i]!;

			return eq(
				sql`${sourceTable}.${sql.identifier(casing.getColumnCasing(s))}`,
				sql`${throughTable!}.${sql.identifier(is(t._.column, Column) ? casing.getColumnCasing(t._.column) : t._.key)}`,
			);
		});

		const innerColumnWhere = relation.targetColumns.map((s, i) => {
			const t = relation.through!.target[i]!;

			return eq(
				sql`${throughTable!}.${sql.identifier(is(t._.column, Column) ? casing.getColumnCasing(t._.column) : t._.key)}`,
				sql`${targetTable}.${sql.identifier(casing.getColumnCasing(s))}`,
			);
		});

		return {
			filter: and(
				relation.where
					? relationsFilterToSQL(relation.isReversed ? sourceTable : targetTable, relation.where)
					: undefined,
				...outerColumnWhere,
			),
			joinCondition: and(...innerColumnWhere),
		};
	}

	const columnWhere = relation.sourceColumns.map((s, i) => {
		const t = relation.targetColumns[i]!;

		return eq(
			sql`${sourceTable}.${sql.identifier(casing.getColumnCasing(s))}`,
			sql`${targetTable}.${sql.identifier(casing.getColumnCasing(t))}`,
		);
	});

	const fullWhere = and(
		...columnWhere,
		relation.where
			? relationsFilterToSQL(relation.isReversed ? sourceTable : targetTable, relation.where)
			: undefined,
	)!;

	return { filter: fullWhere };
}

export function getTableAsAliasSQL(table: Table | View) {
	return sql`${
		table[IsAlias]
			? sql`${sql`${sql.identifier(table[Schema] ?? '')}.`.if(table[Schema])}${
				sql.identifier(table[OriginalName])
			} as ${table}`
			: table
	}`;
}
