import { type AnyTable, getTableUniqueName, type InferModelFromColumns, Table } from '~/table.ts';
import { Columns, getTableName } from '~/table.ts';
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
import { type Placeholder, SQL, sql, type SQLWrapper } from './sql/sql.ts';
import { type Assume, type Equal, getTableColumns, type Simplify, type ValueOrArray, type Writable } from './utils.ts';

export class Relations<
	TSchema extends Record<string, unknown> = Record<string, unknown>,
	TTables extends Record<string, Table> = Record<string, Table>,
	TConfig extends RelationsBuilderConfig<TTables> = RelationsBuilderConfig<TTables>,
> {
	static readonly [entityKind]: string = 'RelationsV2';
	declare readonly $brand: 'Relations';
	/** table DB name -> schema table key */
	readonly tableNamesMap: Record<string, string> = {};
	readonly tablesConfig: TablesRelationalConfig = {};

	constructor(
		readonly schema: TSchema,
		readonly tables: TTables,
		readonly config: TConfig,
	) {
		for (const [tsName, table] of Object.entries(tables)) {
			this.tableNamesMap[getTableUniqueName(table)] = tsName as any;

			const tableConfig: TableRelationalConfig = this.tablesConfig[tsName] = {
				table,
				tsName,
				dbName: table[Table.Symbol.Name],
				schema: table[Table.Symbol.Schema],
				columns: table[Table.Symbol.Columns],
				relations: config[tsName] || {},
				primaryKey: [],
			};

			for (const column of Object.values(table[Table.Symbol.Columns])) {
				if (column.primary) {
					tableConfig.primaryKey.push(column);
				}
			}

			const extraConfig = table[Table.Symbol.ExtraConfigBuilder]?.(table);
			if (extraConfig) {
				for (const configEntry of Object.values(extraConfig)) {
					if (is(configEntry, PrimaryKeyBuilder)) {
						tableConfig.primaryKey.push(...configEntry.columns);
					}
				}
			}
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
				const relationPrintName = `relations -> ${tableConfig.tsName}.${relationFieldName}`;
				if (!is(relation, Relation)) {
					continue;
				}

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
					if (relation.sourceColumns.length !== relation.targetColumns.length) {
						throw new Error(
							`${relationPrintName}: "from" and "to" arrays must have the same length`,
						);
					}

					continue;
				}

				if (relation.sourceColumns || relation.targetColumns) {
					throw new Error(
						`${relationPrintName}: relation must have either both "from" and "to" defined, or none of them`,
					);
				}

				// if (Object.keys(relation).some((it) => it !== 'alias')) {
				// 	throw new Error(
				// 		`${relationPrintName}: without "from" and "to", the only field that can be used is "alias"`,
				// 	);
				// }

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
						is(it, Relation) && it.alias === relation.alias
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
						is(it, Relation) && it.targetTable === relation.sourceTable && !it.alias
					);
					if (reverseRelations.length > 1) {
						throw new Error(
							`${relationPrintName}: not enough data provided to build the relation - "from"/"to" are not defined, and multiple relations between "${targetTableTsName}" and "${
								getTableUniqueName(relation.sourceTable)
							}" were found.\nHint: you can specify "alias" on both sides of the relation with the same value`,
						);
					}
					reverseRelation = reverseRelations[0];
					if (!reverseRelation) {
						throw new Error(
							`${relationPrintName}: not enough data provided to build the relation - "from"/"to" are not defined, and no reverse relation of table "${targetTableTsName}" with target table "${
								getTableUniqueName(relation.sourceTable)
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
				relation.where = reverseRelation.where;
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
	static readonly [entityKind]: string = 'Relation';
	declare readonly $brand: 'Relation';

	fieldName!: string;
	sourceColumns!: AnyColumn<{ tableName: TSourceTableName }>[];
	targetColumns!: AnyColumn<{ tableName: TTargetTableName }>[];
	alias: string | undefined;
	where: RelationsFilter<Record<string, Column>> | undefined;
	sourceTable!: AnyTable<{ name: TSourceTableName }>;

	constructor(
		readonly targetTable: AnyTable<{ name: TTargetTableName }>,
	) {
	}
}

export class One<
	TSourceTableName extends string,
	TTargetTableName extends string,
	TOptional extends boolean = boolean,
> extends Relation<TSourceTableName, TTargetTableName> {
	static override readonly [entityKind]: string = 'One';
	declare protected $relationBrand: 'One';

	readonly optional: TOptional;

	constructor(
		targetTable: AnyTable<{ name: TTargetTableName }>,
		config: AnyOneConfig | undefined,
	) {
		super(targetTable);
		this.alias = config?.alias;
		this.where = config?.where;
		if (config?.from) {
			this.sourceColumns = Array.isArray(config.from)
				? config.from.map((it) => it._.column as AnyColumn<{ tableName: TSourceTableName }>)
				: [(config.from as RelationsBuilderColumnBase)._.column as AnyColumn<{ tableName: TSourceTableName }>];
		}
		if (config?.to) {
			this.targetColumns = Array.isArray(config.to)
				? config.to.map((it) => it._.column as AnyColumn<{ tableName: TTargetTableName }>)
				: [(config.to as RelationsBuilderColumnBase)._.column as AnyColumn<{ tableName: TTargetTableName }>];
		}
		this.optional = (config?.optional ?? false) as TOptional;
	}
}

export class Many<
	TSourceTableName extends string,
	TTargetTableName extends string,
> extends Relation<TSourceTableName, TTargetTableName> {
	static override readonly [entityKind]: string = 'Many';
	declare protected $relationBrand: 'Many';

	constructor(
		targetTable: AnyTable<{ name: TTargetTableName }>,
		readonly config: AnyManyConfig | undefined,
	) {
		super(targetTable);
		this.alias = config?.alias;
		this.where = config?.where;
		if (config?.from) {
			this.sourceColumns = Array.isArray(config.from)
				? config.from.map((it) => it._.column as AnyColumn<{ tableName: TSourceTableName }>)
				: [(config.from as RelationsBuilderColumnBase)._.column as AnyColumn<{ tableName: TSourceTableName }>];
		}
		if (config?.to) {
			this.targetColumns = Array.isArray(config.to)
				? config.to.map((it) => it._.column as AnyColumn<{ tableName: TTargetTableName }>)
				: [(config.to as RelationsBuilderColumnBase)._.column as AnyColumn<{ tableName: TTargetTableName }>];
		}
	}
}

export abstract class AggregatedField<T = unknown> implements SQLWrapper<T> {
	static readonly [entityKind]: string = 'AggregatedField';

	declare readonly $brand: 'AggregatedField';

	declare readonly _: {
		readonly data: T;
	};

	protected table: Table | undefined;

	onTable(table: Table) {
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

			this.query = sql`select count(*) as ${sql.identifier('r')} from ${this.table}`.mapWith(Number);
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

export type FindTableByDBNameRelationalConfig<
	TSchema extends TablesRelationalConfig,
	TTableName extends string,
> = ExtractObjectValues<
	{
		[
			K in keyof TSchema as TSchema[K]['table']['_']['name'] extends TTableName ? K
				: never
		]: TSchema[K];
	}
>;

export type FindTableByDBNameTablesRecord<
	TSchema extends Record<string, Table>,
	TTableName extends string,
> = ExtractObjectValues<
	{
		[
			K in keyof TSchema as TSchema[K]['_']['name'] extends TTableName ? K
				: never
		]: TSchema[K];
	}
>;

export type FindTableInRelationsConfig<
	TSchema extends TablesRelationalConfig,
	TTargetTable extends Table,
	TTableName extends string = TTargetTable['_']['name'],
	TSchemaName extends string | undefined = TTargetTable['_']['schema'] extends undefined ? undefined
		: TTargetTable['_']['schema'],
> = ExtractObjectValues<
	{
		[
			K in keyof TSchema as TSchema[K]['dbName'] extends TTableName
				? TSchema[K]['schema'] extends undefined ? TSchemaName extends undefined ? K
					: never
				: TSchemaName extends TSchema[K]['schema'] ? K
				: never
				: never
		]: TSchema[K];
	}
>;

export type SQLOperator = {
	sql: Operators['sql'];
};

export type DBQueryConfig<
	TRelationType extends 'one' | 'many' = 'one' | 'many',
	TSchema extends TablesRelationalConfig = TablesRelationalConfig,
	TTableConfig extends TableRelationalConfig = TableRelationalConfig,
> =
	& {
		config?: TTableConfig['relations'];
		columns?:
			| {
				[K in keyof TTableConfig['columns']]?: true;
			}
			| {
				[K in keyof TTableConfig['columns']]?: false;
			};
		with?: {
			[K in keyof TTableConfig['relations']]?:
				| true
				| (TTableConfig['relations'][K] extends Relation ? DBQueryConfig<
						TTableConfig['relations'][K] extends One<string, string> ? 'one' : 'many',
						TSchema,
						FindTableInRelationsConfig<
							TSchema,
							TTableConfig['relations'][K]['targetTable']
						>
					>
					: never);
		};
		extras?:
			| Record<string, SQLWrapper>
			| ((
				fields: Simplify<
					[TTableConfig['columns']] extends [never] ? {}
						: TTableConfig['columns']
				>,
				operators: SQLOperator,
			) => Record<string, SQLWrapper>);
		offset?: number | Placeholder;
		where?: RelationsFilter<TTableConfig['columns']>;
		orderBy?:
			| ValueOrArray<AnyColumn | SQL>
			| ((
				fields: Simplify<
					[TTableConfig['columns']] extends [never] ? {}
						: TTableConfig['columns']
				>,
				operators: OrderByOperators,
			) => ValueOrArray<AnyColumn | SQL>);
	}
	& (TRelationType extends 'many' ? {
			limit?: number | Placeholder;
		}
		: {});

export interface TableRelationalConfig {
	table: Table;
	tsName: string;
	dbName: string;
	columns: Record<string, Column>;
	relations: Record<string, RelationsBuilderEntry>;
	primaryKey: AnyColumn[];
	schema?: string;
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
	TTables extends Record<string, Table> = TRelations['tables'],
> = {
	[K in keyof TTables]: {
		table: TTables[K];
		tsName: K & string;
		dbName: TTables[K]['_']['name'];
		columns: TTables[K]['_']['columns'];
		relations: K extends keyof TRelations['config']
			? TRelations['config'][K] extends Record<string, any> ? NonUndefinedRecord<TRelations['config'][K]>
			: Record<string, never>
			: Record<string, never>;
		primaryKey: AnyColumn[];
		schema: TTables[K]['_']['schema'];
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
			& NonUndefinedKeysOnly<TInclude>
			& keyof TRelations
	]: TRelations[K] extends infer TRel extends Relation ? BuildQueryResult<
			TConfig,
			FindTableInRelationsConfig<TConfig, TRel['targetTable']>,
			Assume<TInclude[K], true | Record<string, unknown>>
		> extends infer TResult ? TRel extends One<string, string> ?
					| TResult
					| (Equal<TRel['optional'], true> extends true ? null : never)
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
						SQL
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
	}[];
	sql: SQL;
}

export function mapRelationalRow(
	row: Record<string, unknown>,
	buildQueryResultSelection: BuildRelationalQueryResult['selection'],
	mapColumnValue: (value: unknown) => unknown = (value) => value,
	/** Needed for SQLite as it returns JSON values as strings */
	parseJson: boolean = false,
): Record<string, unknown> {
	for (
		const selectionItem of buildQueryResultSelection
	) {
		const field = selectionItem.field!;
		if (is(field, Table)) {
			if (row[selectionItem.key] === null) continue;
			if (parseJson) row[selectionItem.key] = JSON.parse(row[selectionItem.key] as string);

			if (selectionItem.isArray) {
				for (const item of (row[selectionItem.key] as Array<Record<string, unknown>>)) {
					mapRelationalRow(item, selectionItem.selection!, mapColumnValue);
				}

				continue;
			}

			mapRelationalRow(
				row[selectionItem.key] as Record<string, unknown>,
				selectionItem.selection!,
				mapColumnValue,
			);

			continue;
		}

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

export class RelationsBuilderTable<TTableName extends string = string> implements SQLWrapper {
	static readonly [entityKind]: string = 'RelationsBuilderTable';

	readonly _: {
		readonly name: TTableName;
		readonly table: AnyTable<{ name: TTableName }>;
	};

	constructor(table: AnyTable<{ name: TTableName }>) {
		this._ = {
			name: getTableName(table),
			table,
		};
	}

	getSQL(): SQL {
		return this._.table.getSQL();
	}
}

export type RelationsBuilderColumnConfig<TTableName extends string = string, TData = unknown> = {
	readonly tableName: TTableName;
	readonly data: TData;
	readonly column: AnyColumn<{ tableName: TTableName }>;
	through?: RelationsBuilderColumnBase;
};

export type RelationsBuilderColumnBase<TTableName extends string = string, TData = unknown> = {
	_: RelationsBuilderColumnConfig<TTableName, TData>;
} & SQLWrapper;

export class RelationsBuilderColumn<
	TTableName extends string = string,
	TData = unknown,
> implements SQLWrapper, RelationsBuilderColumnBase<TTableName, TData> {
	static readonly [entityKind]: string = 'RelationsBuilderColumn';

	readonly _: {
		readonly tableName: TTableName;
		readonly data: TData;
		readonly column: AnyColumn<{ tableName: TTableName }>;
		through?: RelationsBuilderColumnBase;
	};

	constructor(column: AnyColumn<{ tableName: TTableName }>) {
		this._ = {
			tableName: getTableName(column.table) as TTableName,
			data: undefined as TData,
			column,
		};
	}

	through(column: RelationsBuilderColumnBase<string, TData>): Omit<this, 'through'> {
		this._.through = column;

		return this;
	}

	getSQL(): SQL {
		return this._.column.getSQL();
	}
}

export type RelationFieldsFilterInternals<T> = {
	eq?: T;
	ne?: T;
	gt?: T;
	gte?: T;
	lt?: T;
	lte?: T;
	in?: T[];
	notIn?: T[];
	like?: string;
	ilike?: string;
	notLike?: string;
	notIlike?: string;
	isNull?: true;
	isNotNull?: true;
	$not?: RelationsFieldFilter<T>;
	$or?: RelationsFieldFilter<T>[];
};

export type RelationsFieldFilter<T> = T | RelationFieldsFilterInternals<T>;

export type RelationsFilter<TColumns extends Record<string, Column>> =
	& {
		[K in keyof TColumns]?: RelationsFieldFilter<TColumns[K]['_']['data']>;
	}
	& {
		$or?: RelationsFilter<TColumns>[];
		$not?: RelationsFilter<TColumns>[];
		$raw?: (operators: Operators) => SQL;
	};

export interface OneConfig<
	TSchema extends Record<string, Table>,
	TSourceColumns extends
		| Readonly<[RelationsBuilderColumnBase, ...RelationsBuilderColumnBase[]]>
		| Readonly<RelationsBuilderColumnBase>,
	TTargetTableName extends string,
	TOptional extends boolean,
> {
	from?: TSourceColumns | Writable<TSourceColumns>;
	to?: TSourceColumns extends [RelationsBuilderColumnBase, ...RelationsBuilderColumnBase[]]
		? { [K in keyof TSourceColumns]: RelationsBuilderColumnBase<TTargetTableName> }
		: RelationsBuilderColumnBase<TTargetTableName>;
	where?: TSourceColumns extends [RelationsBuilderColumnBase, ...RelationsBuilderColumnBase[]]
		? RelationsFilter<FindTableByDBNameTablesRecord<TSchema, TSourceColumns[number]['_']['tableName']>['_']['columns']>
		: RelationsFilter<
			FindTableByDBNameTablesRecord<
				TSchema,
				Assume<TSourceColumns, RelationsBuilderColumnBase>['_']['tableName']
			>['_']['columns']
		>;
	optional?: TOptional;
	alias?: string;
}

export type AnyOneConfig = OneConfig<
	Record<string, Table>,
	Readonly<[RelationsBuilderColumnBase, ...RelationsBuilderColumnBase[]] | RelationsBuilderColumnBase<string, unknown>>,
	string,
	boolean
>;

export interface ManyConfig<
	TSchema extends Record<string, Table>,
	TSourceColumns extends
		| Readonly<[RelationsBuilderColumnBase, ...RelationsBuilderColumnBase[]]>
		| Readonly<RelationsBuilderColumnBase>,
	TTargetTableName extends string,
> {
	from?: TSourceColumns;
	to?: TSourceColumns extends [RelationsBuilderColumnBase, ...RelationsBuilderColumnBase[]]
		? { [K in keyof TSourceColumns]: RelationsBuilderColumnBase<TTargetTableName> }
		: RelationsBuilderColumnBase<TTargetTableName>;
	where?: TSourceColumns extends [RelationsBuilderColumnBase, ...RelationsBuilderColumnBase[]]
		? RelationsFilter<FindTableByDBNameTablesRecord<TSchema, TSourceColumns[number]['_']['tableName']>['_']['columns']>
		: RelationsFilter<
			FindTableByDBNameTablesRecord<
				TSchema,
				Assume<TSourceColumns, RelationsBuilderColumnBase>['_']['tableName']
			>['_']['columns']
		>;
	alias?: string;
}

export type AnyManyConfig = ManyConfig<
	Record<string, Table>,
	Readonly<[RelationsBuilderColumnBase, ...RelationsBuilderColumnBase[]]> | Readonly<RelationsBuilderColumnBase>,
	string
>;

export interface OneFn<
	TTables extends Record<string, Table>,
	TTargetTableName extends string,
> {
	<
		// "any" default value is required for cases where config is not provided, to satisfy the source table name constraint
		TSourceColumns extends
			| Readonly<[RelationsBuilderColumnBase, ...RelationsBuilderColumnBase[]]>
			| RelationsBuilderColumnBase = any,
		TOptional extends boolean = false,
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
	TTables extends Record<string, Table>,
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

export class RelationsHelperStatic<TTables extends Record<string, Table>> {
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
				return new One(table, config);
			};

			many[tableName] = (config) => {
				return new Many(table, config);
			};
		}

		this.one = one as this['one'];
		this.many = many as this['many'];
	}

	one: {
		[K in keyof TTables]: OneFn<TTables, TTables[K]['_']['name']>;
	};

	many: {
		[K in keyof TTables]: ManyFn<TTables, TTables[K]['_']['name']>;
	};

	aggs = {
		count(): Count {
			return new Count();
		},
	};
}

export type RelationsBuilder<TSchema extends Record<string, Table>> =
	& {
		[TTableName in keyof TSchema & string]:
			& {
				[TColumnName in keyof TSchema[TTableName]['_']['columns']]: RelationsBuilderColumn<
					TSchema[TTableName]['_']['name'],
					TSchema[TTableName]['_']['columns'][TColumnName]['_']['data']
				>;
			}
			& RelationsBuilderTable<TTableName>;
	}
	& RelationsHelperStatic<TSchema>;

export type RelationsBuilderConfig<TTables extends Record<string, Table>> = {
	[TTableName in keyof TTables & string]?: Record<string, RelationsBuilderEntry<TTables, TTableName>>;
};

export type RelationsBuilderEntry<
	TTables extends Record<string, Table> = Record<string, Table>,
	TSourceTableName extends string = string,
> =
	| Relation<TTables[TSourceTableName]['_']['name'], TTables[keyof TTables & string]['_']['name']>
	| AggregatedField<any>;

export type ExtractTablesFromSchema<TSchema extends Record<string, unknown>> = {
	[K in keyof TSchema as TSchema[K] extends Table ? K : never]: TSchema[K] extends Table ? TSchema[K] : never;
};

export function createRelationsHelper<
	TSchema extends Record<string, unknown>,
	TTables extends Record<string, Table>,
>(schema: TSchema): RelationsBuilder<TTables> {
	const schemaTables = Object.fromEntries(
		Object.entries(schema).filter((e): e is [typeof e[0], Table] => is(e[1], Table)),
	);
	const helperStatic = new RelationsHelperStatic(schemaTables);
	const tables = Object.entries(schema).reduce<Record<string, RelationsBuilderTable>>((acc, [key, value]) => {
		if (is(value, Table)) {
			const rTable = new RelationsBuilderTable(value);
			const columns = Object.entries(getTableColumns(value)).reduce<Record<string, RelationsBuilderColumnBase>>(
				(acc, [key, column]) => {
					const rbColumn = new RelationsBuilderColumn(column);
					acc[key] = rbColumn;
					return acc;
				},
				{},
			);
			acc[key] = Object.assign(rTable, columns);
		}
		return acc;
	}, {});

	return Object.assign(helperStatic, tables) as RelationsBuilder<TTables>;
}

export function defineRelations<
	TSchema extends Record<string, unknown>,
	TConfig extends RelationsBuilderConfig<TTables>,
	TTables extends Record<string, Table> = ExtractTablesFromSchema<TSchema>,
>(
	schema: TSchema,
	relations: (helpers: RelationsBuilder<TTables>) => TConfig,
): Relations<TSchema, TTables, TConfig> {
	return new Relations(
		schema,
		schema as unknown as TTables,
		relations(createRelationsHelper(schema as unknown as TTables)),
	);
}

export type WithContainer<TRelatedTables extends Record<string, Table>> = {
	with?: {
		[K in keyof TRelatedTables]?: boolean | DBQueryConfig;
	};
};

export type ColumnWithTSName = {
	column: Column;
	tsName: string;
};

export type RelationsOrder<TColumns extends Record<string, Column>> = {
	[K in keyof TColumns]?: 'asc' | 'desc';
};

export type OrderBy =
	| ValueOrArray<AnyColumn | SQL>
	| ((
		fields: Record<string, Column>,
		operators: OrderByOperators,
	) => ValueOrArray<AnyColumn | SQL>);

export type Extras =
	| Record<string, SQL>
	| ((
		fields: Record<string, Column>,
		operators: SQLOperator,
	) => Record<string, SQL>);

function relationsFieldFilterToSQL(column: Column, filter: RelationsFieldFilter<unknown>): SQL | undefined {
	if (typeof filter !== 'object') return eq(column, filter);

	const entries = Object.entries(filter as RelationFieldsFilterInternals<unknown>);
	if (!entries.length) return undefined;

	const parts: (SQL)[] = [];
	for (const [target, value] of entries) {
		if (value === undefined) continue;

		switch (target) {
			case '$not': {
				const res = relationsFieldFilterToSQL(column, value as RelationsFieldFilter<unknown>);
				if (!res) continue;

				parts.push(not(res));

				continue;
			}
			case '$or': {
				if (!(value as RelationsFieldFilter<unknown>[]).length) continue;

				parts.push(
					or(
						...(value as RelationsFilter<any>[]).map((subFilter) => relationsFieldFilterToSQL(column, subFilter)),
					)!,
				);

				continue;
			}

			default: {
				parts.push(
					(operators[target as keyof typeof operators] as ((col: Column, data: any) => SQL | undefined))(
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

export function relationFilterToSQL(
	table: Table,
	filter: RelationsFilter<Record<string, Column>>,
): SQL | undefined {
	const entries = Object.entries(filter);
	if (!entries.length) return undefined;

	const parts: SQL[] = [];
	for (const [target, value] of entries) {
		if (value === undefined) continue;

		switch (target) {
			case '$raw': {
				if (value) parts.push((value as (operators: Operators) => SQL)(operators));

				continue;
			}
			case '$or': {
				if (!(value as RelationsFilter<Record<string, Column>>[] | undefined)?.length) continue;

				parts.push(
					or(
						...(value as RelationsFilter<Record<string, Column>>[]).map((subFilter) =>
							relationFilterToSQL(table, subFilter)
						),
					)!,
				);

				continue;
			}
			case '$not': {
				if (!(value as RelationsFilter<Record<string, Column>>[] | undefined)?.length) continue;

				parts.push(
					not(
						and(
							...(value as RelationsFilter<Record<string, Column>>[]).map((subFilter) =>
								relationFilterToSQL(table, subFilter)
							),
						)!,
					),
				);

				continue;
			}
			default: {
				const colFilter = relationsFieldFilterToSQL(
					table[target as keyof Table] as Column,
					value as RelationsFieldFilter<unknown>,
				);
				if (colFilter) parts.push(colFilter);

				continue;
			}
		}
	}

	return and(...parts)!;
}

export function relationsOrderToSQL(
	table: Table,
	orders:
		| ValueOrArray<AnyColumn | SQL>
		| ((
			fields: Record<string, Column>,
			operators: OrderByOperators,
		) => ValueOrArray<AnyColumn | SQL>),
): SQL | undefined {
	const data = typeof orders === 'function'
		? orders(table[Columns], orderByOperators)
		: orders;

	return is(data, SQL)
		? data
		: Array.isArray(data)
		? data.length
			? sql.join(data.map((o) => is(o, SQL) ? o : asc(o)), sql`, `)
			: undefined
		: asc(data);
}

export function relationExtrasToSQL(
	table: Table,
	extras:
		| Record<string, SQLWrapper>
		| ((columns: Record<string, Column>, operators: SQLOperator) => Record<string, SQLWrapper>),
) {
	const subqueries: SQL[] = [];
	const selection: BuildRelationalQueryResult['selection'] = [];

	for (
		const [key, extra] of Object.entries(
			typeof extras === 'function' ? extras(table[Columns], { sql: operators.sql }) : extras,
		)
	) {
		if (!extra) continue;

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

export function relationToSQL(relation: Relation): SQL | undefined {
	const table = relation.sourceTable;

	const columnWhere = relation.sourceColumns.map((s, i) => {
		const t = relation.targetColumns[i]!;

		return eq(s, t);
	});

	const targetWhere = relation.where
		? and(...columnWhere, relationFilterToSQL(table, relation.where))
		: and(...columnWhere);

	return targetWhere;
}
