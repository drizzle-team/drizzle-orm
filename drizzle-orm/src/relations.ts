import {
	type AnyTable,
	getTableUniqueName,
	type InferModelFromColumns,
	IsAlias,
	OriginalName,
	Schema,
	Table,
} from '~/table.ts';
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
			if (!is(table, Table)) continue;

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
							`${relationPrintName}: "from" and "to" fields must have the same length`,
						);
					}

					if (relation.through) {
						if (
							relation.through.source.length !== relation.through.target.length
							|| relation.through.source.length !== relation.sourceColumns.length
							|| relation.through.target.length !== relation.targetColumns.length
						) {
							throw new Error(
								`${relationPrintName}: ".through(column)" must be used either on all columns in "from" and "to" or not defined on any of them`,
							);
						}

						for (const column of relation.through.source) {
							if (column.table !== relation.throughTable) {
								throw new Error(
									`${relationPrintName}: ".through(column)" must be used on the same table by all columns of the relation`,
								);
							}
						}

						for (const column of relation.through.target) {
							if (column.table !== relation.throughTable) {
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
	where: RelationsFilter<Record<string, Column>> | undefined;
	sourceTable!: AnyTable<{ name: TSourceTableName }>;
	through?: {
		source: AnyColumn[];
		target: AnyColumn[];
	};
	throughTable?: Table;
	isReversed?: boolean;

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
	static override readonly [entityKind]: string = 'OneV2';
	declare protected $relationBrand: 'OneV2';

	readonly optional: TOptional;

	constructor(
		targetTable: AnyTable<{ name: TTargetTableName }>,
		config: AnyOneConfig | undefined,
	) {
		super(targetTable);
		this.alias = config?.alias;
		this.where = config?.where;
		if (config?.from) {
			this.sourceColumns = ((Array.isArray(config.from)
				? config.from
				: [config.from]) as RelationsBuilderColumnBase[]).map((it: RelationsBuilderColumnBase) => {
					this.throughTable ??= it._.through?._.column.table;

					return it._.column as AnyColumn<{ tableName: TSourceTableName }>;
				});
		}
		if (config?.to) {
			this.targetColumns = (Array.isArray(config.to)
				? config.to
				: [config.to]).map((it: RelationsBuilderColumnBase) => {
					this.throughTable ??= it._.through?._.column.table;

					return it._.column as AnyColumn<{ tableName: TTargetTableName }>;
				});
		}

		if (this.throughTable) {
			this.through = Array.isArray(config?.from)
				? {
					// eslint-disable-next-line @typescript-eslint/no-non-null-asserted-optional-chain -- in case it's undefined, error will be thrown in Relations constructor
					source: config.from.map((e: RelationsBuilderColumnBase) => e._.through?._.column!),
					target: ((config.to ?? []) as any as RelationsBuilderColumnBase[]).map((e) => e._.column),
				}
				: {
					// eslint-disable-next-line @typescript-eslint/no-non-null-asserted-optional-chain -- in case it's undefined, error will be thrown in Relations constructor
					source: [(config?.from as RelationsBuilderColumnBase | undefined)?._.through?._.column!],
					// eslint-disable-next-line @typescript-eslint/no-non-null-asserted-optional-chain
					target: [config?.to?._.through?._.column!],
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
		targetTable: AnyTable<{ name: TTargetTableName }>,
		readonly config: AnyManyConfig | undefined,
	) {
		super(targetTable);
		this.alias = config?.alias;
		this.where = config?.where;
		if (config?.from) {
			this.sourceColumns = ((Array.isArray(config.from)
				? config.from
				: [config.from]) as RelationsBuilderColumnBase[]).map((it: RelationsBuilderColumnBase) => {
					this.throughTable ??= it._.through?._.column.table;

					return it._.column as AnyColumn<{ tableName: TSourceTableName }>;
				});
		}
		if (config?.to) {
			this.targetColumns = (Array.isArray(config.to)
				? config.to
				: [config.to]).map((it: RelationsBuilderColumnBase) => {
					this.throughTable ??= it._.through?._.column.table;

					return it._.column as AnyColumn<{ tableName: TTargetTableName }>;
				});
		}
		if (this.throughTable) {
			this.through = Array.isArray(config?.from)
				? {
					// eslint-disable-next-line @typescript-eslint/no-non-null-asserted-optional-chain -- in case it's undefined, error will be thrown in Relations constructor
					source: config.from.map((e: RelationsBuilderColumnBase) => e._.through?._.column!),
					target: ((config.to ?? []) as any as RelationsBuilderColumnBase[]).map((e) => e._.column),
				}
				: {
					// eslint-disable-next-line @typescript-eslint/no-non-null-asserted-optional-chain -- in case it's undefined, error will be thrown in Relations constructor
					source: [(config?.from as RelationsBuilderColumnBase | undefined)?._.through?._.column!],
					// eslint-disable-next-line @typescript-eslint/no-non-null-asserted-optional-chain
					target: [config?.to?._.through?._.column!],
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

			const table = this.table;

			this.query = sql`select count(*) as ${sql.identifier('r')} from ${
				table[IsAlias]
					? sql`${sql`${sql.identifier(table[Schema] ?? '')}.`.if(table[Schema])}${
						sql.identifier(table[OriginalName])
					} as ${table}`
					: table
			}`.mapWith(Number);
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

export type FindTableInRelationalConfig<
	TSchema extends TablesRelationalConfig,
	TTargetTable extends Table,
	TTableName extends string = TTargetTable['_']['name'],
> = ExtractObjectValues<
	{
		[
			K in keyof TSchema as TSchema[K]['tsName'] extends TTableName ? K : never
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
		columns?:
			| {
				[K in keyof TTableConfig['columns']]?: boolean | undefined;
			}
			| undefined;
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
							>
						>
						: never)
					| undefined;
			}
			| undefined;
		extras?:
			| Record<string, SQLWrapper>
			| ((
				table: Simplify<
					& AnyTable<TTableConfig>
					& TTableConfig['columns']
				>,
				operators: SQLOperator,
			) => Record<string, SQLWrapper>)
			| undefined;
		offset?: number | Placeholder | undefined;
		where?: RelationsFilter<TTableConfig['columns']> | undefined;
		orderBy?:
			| {
				[K in keyof TTableConfig['columns']]?: 'asc' | 'desc' | undefined;
			}
			| ((
				fields: Simplify<
					AnyTable<TTableConfig> & TTableConfig['columns']
				>,
				operators: OrderByOperators,
			) => ValueOrArray<AnyColumn | SQL>)
			| undefined;
	}
	& (TRelationType extends 'many' ? {
			limit?: number | Placeholder | undefined;
		}
		: {});

export interface TableRelationalConfig {
	table: Table;
	tsName: string;
	dbName: string;
	columns: Record<string, Column>;
	relations: Record<string, RelationsBuilderEntry>;
	primaryKey: AnyColumn[];
	schema: string | undefined;
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
					]: ReturnType<
						Assume<
							ReturnTypeOrValue<TFullSelection['extras']>[K],
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
		const field = selectionItem.field!;

		if (is(field, Table)) {
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

export type RelationsBuilderColumnConfig<
	TTableName extends string = string,
	TData = unknown,
> = {
	readonly tableName: TTableName;
	readonly data: TData;
	readonly column: AnyColumn<{ tableName: TTableName }>;
	readonly through?: RelationsBuilderColumnBase;
};

export type RelationsBuilderColumnBase<
	TTableName extends string = string,
	TData = unknown,
> = {
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
		readonly through?: RelationsBuilderColumnBase;
	};

	constructor(column: AnyColumn<{ tableName: TTableName }>, through?: RelationsBuilderColumn) {
		this._ = {
			tableName: getTableName(column.table) as TTableName,
			data: undefined as TData,
			column,
			through,
		};
	}

	through(column: RelationsBuilderColumn): RelationsBuilderColumnBase<TTableName, TData> {
		return new RelationsBuilderColumn(this._.column, column);
	}

	getSQL(): SQL {
		return this._.column.getSQL();
	}
}

export type RelationFieldsFilterInternals<T> = {
	eq?: T | Placeholder;
	ne?: T | Placeholder;
	gt?: T | Placeholder;
	gte?: T | Placeholder;
	lt?: T | Placeholder;
	lte?: T | Placeholder;
	in?: (T | Placeholder)[] | Placeholder;
	notIn?: (T | Placeholder)[] | Placeholder;
	like?: string | Placeholder;
	ilike?: string | Placeholder;
	notLike?: string | Placeholder;
	notIlike?: string | Placeholder;
	isNull?: true;
	isNotNull?: true;
	NOT?: RelationsFieldFilter<T>;
	OR?: RelationsFieldFilter<T>[];
};

export type RelationsFieldFilter<T> =
	| RelationFieldsFilterInternals<T>
	| (
		T extends Record<string, any> ? never : T
	);

export type RelationsFilter<TColumns extends Record<string, Column>> =
	& {
		[K in keyof TColumns]?: RelationsFieldFilter<TColumns[K]['_']['data']>;
	}
	& {
		OR?: RelationsFilter<TColumns>[];
		NOT?: RelationsFilter<TColumns>;
		RAW?: (
			table: Simplify<
				& AnyTable<{ columns: TColumns }>
				& TColumns
			>,
			operators: Operators,
		) => SQL;
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
		? RelationsFilter<TSchema[TSourceColumns[number]['_']['tableName']]['_']['columns']>
		: RelationsFilter<TSchema[Assume<TSourceColumns, RelationsBuilderColumnBase>['_']['tableName']]['_']['columns']>;
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
		? RelationsFilter<TSchema[TSourceColumns[number]['_']['tableName']]['_']['columns']>
		: RelationsFilter<TSchema[Assume<TSourceColumns, RelationsBuilderColumnBase>['_']['tableName']]['_']['columns']>;
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
				return new One(table, config as DBQueryConfig<'one'>);
			};

			many[tableName] = (config) => {
				return new Many(table, config as DBQueryConfig<'many'>);
			};
		}

		this.one = one as this['one'];
		this.many = many as this['many'];
	}

	one: {
		[K in keyof TTables]: OneFn<TTables, K & string>;
	};

	many: {
		[K in keyof TTables]: ManyFn<TTables, K & string>;
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
					TTableName,
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
	| Relation<TSourceTableName, keyof TTables & string>
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

export type WithContainer<TRelatedTables extends Record<string, Table> = Record<string, Table>> = {
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

export type OrderBy = Exclude<DBQueryConfig['orderBy'], undefined>;

export type Extras = Exclude<DBQueryConfig['extras'], undefined>;

function relationsFieldFilterToSQL(column: Column, filter: RelationsFieldFilter<unknown>): SQL | undefined {
	if (typeof filter !== 'object') return eq(column, filter);

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
						...(value as RelationsFilter<any>[]).map((subFilter) => relationsFieldFilterToSQL(column, subFilter)),
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

export function relationsFilterToSQL(
	table: Table,
	filter: RelationsFilter<Record<string, Column>>,
): SQL | undefined {
	const entries = Object.entries(filter);
	if (!entries.length) return undefined;

	const parts: SQL[] = [];
	for (const [target, value] of entries) {
		if (value === undefined) continue;

		switch (target) {
			case 'RAW': {
				if (value) {
					parts.push(
						(value as (table: Record<string, Column>, operators: Operators) => SQL)(table[Columns], operators),
					);
				}

				continue;
			}
			case 'OR': {
				if (!(value as RelationsFilter<Record<string, Column>>[] | undefined)?.length) continue;

				parts.push(
					or(
						...(value as RelationsFilter<Record<string, Column>>[]).map((subFilter) =>
							relationsFilterToSQL(table, subFilter)
						),
					)!,
				);

				continue;
			}
			case 'NOT': {
				if (value === undefined) continue;

				const built = relationsFilterToSQL(table, value as RelationsFilter<Record<string, Column>>);
				if (!built) continue;

				parts.push(not(built));

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

	return sql.join(entries.map(([column, value]) => (value === 'asc' ? asc : desc)(table[Columns][column]!)), sql`, `);
}

export function relationExtrasToSQL(
	table: Table,
	extras: Extras,
) {
	const subqueries: SQL[] = [];
	const selection: BuildRelationalQueryResult['selection'] = [];

	for (
		const [key, extra] of Object.entries(
			typeof extras === 'function' ? extras(table as any, { sql: operators.sql }) : extras,
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

export type BuiltRelationFilters = {
	filter?: SQL;
	joinCondition?: SQL;
};

export function relationToSQL(
	relation: Relation,
	sourceTable: Table,
	targetTable: Table,
	throughTable?: Table,
): BuiltRelationFilters {
	if (relation.through) {
		const outerColumnWhere = relation.sourceColumns.map((s, i) => {
			const t = relation.through!.source[i]!;

			return eq(
				sql`${sourceTable}.${sql.identifier(s.name)}`,
				sql`${throughTable!}.${sql.identifier(t.name)}`,
			);
		});

		const innerColumnWhere = relation.targetColumns.map((s, i) => {
			const t = relation.through!.target[i]!;

			return eq(
				sql`${throughTable!}.${sql.identifier(t.name)}`,
				sql`${targetTable}.${sql.identifier(s.name)}`,
			);
		});

		return {
			filter: and(
				relation.where
					? (relation.isReversed
						? relationsFilterToSQL(targetTable, relation.where)
						: relationsFilterToSQL(sourceTable, relation.where))
					: undefined,
			),
			joinCondition: and(
				...outerColumnWhere,
				...innerColumnWhere,
			),
		};
	}

	const columnWhere = relation.sourceColumns.map((s, i) => {
		const t = relation.targetColumns[i]!;

		return eq(
			sql`${sourceTable}.${sql.identifier(s.name)}`,
			sql`${targetTable}.${sql.identifier(t.name)}`,
		);
	});

	const fullWhere = and(
		...columnWhere,
		relation.where
			? relation.isReversed
				? relationsFilterToSQL(targetTable, relation.where)
				: relationsFilterToSQL(sourceTable, relation.where)
			: undefined,
	)!;

	return { filter: fullWhere };
}
