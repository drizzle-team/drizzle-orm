import { getTableUniqueName, IsAlias, OriginalName, Table, TableColumns, TableSchema } from '~/table.ts';
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

export type FilteredSchemaEntry = Table<any> | View<string, boolean, FieldSelection>;

export type SchemaEntry = Table<any> | View<string, boolean, any>;

export type RelSchema = Record<string, SchemaEntry>;

export type GetTableViewColumns<T extends SchemaEntry> = T extends View<string, boolean, any> ? T['_']['selectedFields']
	: T extends Table<any> ? T['_']['columns']
	: never;

export type GetTableViewFieldSelection<T extends SchemaEntry> = T extends View<string, boolean, FieldSelection>
	? T['_']['selectedFields']
	: T extends Table<any> ? T['_']['columns']
	: never;

export type FieldValue =
	| Column<any>
	| SQLWrapper
	| SQL.Aliased
	| SQL;

export type FieldSelection = Record<string, FieldValue>;

export class Relations<
	TSchema extends Record<string, unknown> = Record<string, any>,
	TTables extends RelSchema = RelSchema,
	TConfig extends AnyRelationsBuilderConfig = AnyRelationsBuilderConfig,
> {
	static readonly [entityKind]: string = 'RelationsV2';
	declare readonly $brand: 'RelationsV2';
	/** table DB name -> schema table key */
	readonly tableNamesMap: Record<string, string> = {};
	readonly tablesConfig: TablesRelationalConfig = {};
	readonly tables: TTables = {} as any;

	constructor(
		readonly schema: TSchema,
		readonly config: TConfig,
	) {
		for (const [tsName, table] of Object.entries(schema)) {
			const isTable = is(table, Table);
			const isView = is(table, View);

			if (!(isTable || isView)) continue;

			(this.tables as any as RelSchema)[tsName] = table;

			this.tableNamesMap[getTableUniqueName(table)] = tsName as any;

			this.tablesConfig[tsName] = {
				table,
				name: tsName,
				relations: (config[tsName] || {}) as Record<string, RelationsBuilderEntry>,
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

				const relationPrintName = `relations -> ${tableConfig.name}: { ${relationFieldName}: r.${
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
							if ((this.tables as any as Record<string, Table>)[column._.tableName] !== relation.throughTable) {
								throw new Error(
									`${relationPrintName}: ".through(column)" must be used on the same table by all columns of the relation`,
								);
							}
						}

						for (const column of relation.through.target) {
							if ((this.tables as any as Record<string, Table>)[column._.tableName] !== relation.throughTable) {
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

export type EmptyRelations = Relations<Record<string, never>, Record<string, never>>;
export type AnyRelations = Relations<Record<string, any>, Record<string, any>>;

export abstract class Relation<
	TSourceTableName extends string = string,
	TTargetTableName extends string = string,
> {
	static readonly [entityKind]: string = 'RelationV2';
	declare readonly $brand: 'RelationV2';
	declare public readonly relationType: 'many' | 'one';

	fieldName!: string;
	sourceColumns!: Column<any>[];
	targetColumns!: Column<any>[];
	alias: string | undefined;
	where: AnyTableFilter | undefined;
	sourceTable!: SchemaEntry;
	targetTable: SchemaEntry;
	through?: {
		source: RelationsBuilderColumnBase[];
		target: RelationsBuilderColumnBase[];
	};
	throughTable?: SchemaEntry;
	isReversed?: boolean;

	declare readonly sourceTableName: TSourceTableName;
	declare readonly targetTableName: TTargetTableName;

	constructor(
		targetTable: SchemaEntry,
	) {
		this.targetTable = targetTable as any as SchemaEntry;
	}
}

export class One<
	TSourceTableName extends string,
	TTargetTableName extends string,
	TOptional extends boolean = boolean,
> extends Relation<TSourceTableName, TTargetTableName> {
	static override readonly [entityKind]: string = 'OneV2';
	declare protected $relationBrand: 'OneV2';

	public override readonly relationType = 'one' as const;

	readonly optional: TOptional;

	constructor(
		tables: RelSchema,
		targetTable: SchemaEntry,
		config: AnyOneConfig | undefined,
	) {
		super(targetTable);
		this.alias = config?.alias;
		this.where = config?.where;
		if (config?.from) {
			this.sourceColumns = ((Array.isArray(config.from)
				? config.from
				: [config.from]) as RelationsBuilderColumnBase[]).map((it: RelationsBuilderColumnBase) => {
					this.throughTable ??= it._.through ? tables[it._.through._.tableName]! as SchemaEntry : undefined;

					return it._.column as AnyColumn<{ tableName: TSourceTableName }>;
				});
		}
		if (config?.to) {
			this.targetColumns = (Array.isArray(config.to)
				? config.to
				: [config.to]).map((it: RelationsBuilderColumnBase) => {
					this.throughTable ??= it._.through ? tables[it._.through._.tableName]! as SchemaEntry : undefined;

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

	public override readonly relationType = 'many' as const;

	constructor(
		tables: RelSchema,
		targetTable: SchemaEntry,
		readonly config: AnyManyConfig | undefined,
	) {
		super(targetTable);
		this.alias = config?.alias;
		this.where = config?.where;
		if (config?.from) {
			this.sourceColumns = ((Array.isArray(config.from)
				? config.from
				: [config.from]) as RelationsBuilderColumnBase[]).map((it: RelationsBuilderColumnBase) => {
					this.throughTable ??= it._.through ? tables[it._.through._.tableName]! as SchemaEntry : undefined;

					return it._.column as AnyColumn<{ tableName: TSourceTableName }>;
				});
		}
		if (config?.to) {
			this.targetColumns = (Array.isArray(config.to)
				? config.to
				: [config.to]).map((it: RelationsBuilderColumnBase) => {
					this.throughTable ??= it._.through ? tables[it._.through._.tableName]! as SchemaEntry : undefined;

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

	protected table: SchemaEntry | undefined;

	onTable(table: SchemaEntry) {
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

export type OrderByOperators = typeof orderByOperators;

export function getOrderByOperators(): OrderByOperators {
	return orderByOperators;
}

export type FindTableInRelationalConfig<
	TSchema extends TablesRelationalConfig,
	TTableName extends string,
> = TSchema[TTableName];

export interface SQLOperator {
	sql: Operators['sql'];
}

export type DBQueryConfigColumns<TColumns extends FieldSelection> = {
	[K in keyof TColumns]?: boolean | undefined;
};

export type DBQueryConfigExtras<TTable extends SchemaEntry> = Record<
	string,
	| SQLWrapper
	| ((
		table: TTable,
		operators: SQLOperator,
	) => SQLWrapper)
>;

export type DBQueryConfigOrderByCallback<TTable extends SchemaEntry> = (
	table: TTable,
	operators: OrderByOperators,
) => ValueOrArray<AnyColumn | SQL>;

export type DBQueryConfigOrderByObject<TColumns extends FieldSelection> = {
	[K in keyof TColumns]?: 'asc' | 'desc' | undefined;
};

export type DBQueryConfigOrderBy<TTable extends SchemaEntry, TColumns extends FieldSelection> =
	| DBQueryConfigOrderByCallback<TTable>
	| DBQueryConfigOrderByObject<TColumns>;

export type DBQueryConfigWith<TSchema extends TablesRelationalConfig, TRelations extends Record<string, Relation>> = {
	[K in keyof TRelations]?:
		| boolean
		| (DBQueryConfig<
			TRelations[K]['relationType'],
			TSchema,
			FindTableInRelationalConfig<
				TSchema,
				TRelations[K]['targetTableName']
			>,
			true
		>)
		| undefined;
};

export type DBQueryConfig<
	TRelationType extends 'one' | 'many' = 'one' | 'many',
	TSchema extends TablesRelationalConfig = TablesRelationalConfig,
	TTableConfig extends TableRelationalConfig = TableRelationalConfig,
	TIsNested extends boolean = false,
> =
	& (TTableConfig['relations'] extends Record<string, never> ? {}
		: {
			with?:
				| DBQueryConfigWith<TSchema, TTableConfig['relations']>
				| undefined;
		})
	& {
		columns?: DBQueryConfigColumns<GetTableViewFieldSelection<TTableConfig['table']>> | undefined;
		where?: RelationsFilter<TTableConfig, TSchema> | undefined;
		extras?:
			| DBQueryConfigExtras<TTableConfig['table']>
			| undefined;
	}
	& (`${TRelationType}_${TIsNested}` extends 'one_true' ? {} : {
		orderBy?:
			| DBQueryConfigOrderBy<TTableConfig['table'], GetTableViewFieldSelection<TTableConfig['table']>>
			| undefined;
		offset?: number | Placeholder | undefined;
	})
	& (TRelationType extends 'many' ? {
			limit?: number | Placeholder | undefined;
		}
		: {});

export type AnyDBQueryConfig = {
	columns?:
		| DBQueryConfigColumns<GetTableViewFieldSelection<TableRelationalConfig['table']>>
		| undefined;
	where?: RelationsFilter<TableRelationalConfig, TablesRelationalConfig> | undefined;
	extras?:
		| DBQueryConfigExtras<TableRelationalConfig['table']>
		| undefined;
	with?:
		| Record<string, AnyDBQueryConfig>
		| undefined;
	orderBy?:
		| DBQueryConfigOrderBy<TableRelationalConfig['table'], GetTableViewFieldSelection<TableRelationalConfig['table']>>
		| undefined;
	offset?: number | Placeholder | undefined;
	limit?: number | Placeholder | undefined;
};

export interface TableRelationalConfig {
	table: SchemaEntry;
	name: string;
	relations: Record<string, RelationsBuilderEntry>;
}

export type TablesRelationalConfig = Record<string, TableRelationalConfig>;

type NonUndefinedRecord<TRecord extends Record<string, any>> = {
	[K in keyof TRecord as K extends undefined ? never : K]: TRecord[K];
};

export type ExtractTablesWithRelations<
	TRelations extends Relations,
	TTables extends RelSchema = TRelations['tables'],
> = {
	[K in keyof TTables & string]: {
		table: TTables[K];
		name: K;
		relations: K extends keyof TRelations['config']
			? TRelations['config'][K] extends Record<string, any> ? NonUndefinedRecord<TRelations['config'][K]>
			: {}
			: {};
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
			FindTableInRelationalConfig<TConfig, TRel['targetTableName']>,
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

export type NonUndefinedKeysOnly<T> = {
	[K in keyof T]: T[K] extends undefined ? never : K;
}[keyof T];

export type TruthyKeysOnly<T> = {
	[K in keyof T]: T[K] extends undefined | false ? never : K;
}[keyof T];

export type InferRelationalQueryTableResult<
	TRawSelection extends Record<string, unknown>,
	TSelectedFields extends Record<string, unknown> | 'Full' = 'Full',
> = TSelectedFields extends 'Full' ? TRawSelection : {
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
};

export type BuildQueryResult<
	TSchema extends TablesRelationalConfig,
	TTableConfig extends TableRelationalConfig,
	TFullSelection extends true | Record<string, unknown>,
	TModel extends Record<string, unknown> = Assume<
		TTableConfig['table'],
		{ $inferSelect: Record<string, unknown> }
	>['$inferSelect'],
> = Equal<TFullSelection, true> extends true ? Simplify<InferRelationalQueryTableResult<TModel>>
	: TFullSelection extends Record<string, unknown> ? Simplify<
			& (InferRelationalQueryTableResult<
				TModel,
				TFullSelection['columns'] extends Record<string, unknown> ? TFullSelection['columns'] : 'Full'
			>)
			& (TFullSelection['extras'] extends Record<string, SQLWrapper | ((...args: any[]) => SQLWrapper)> ? {
					[
						K in NonUndefinedKeysOnly<
							ReturnTypeOrValue<TFullSelection['extras']>
						>
					]: ReturnType<
						Assume<
							ReturnTypeOrValue<TFullSelection['extras'][K & string]>,
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

export interface BuildRelationalQueryResult {
	selection: {
		key: string;
		field: Column<any> | Table | SQL | SQL.Aliased | SQLWrapper | AggregatedField;
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

		row[selectionItem.key] = 'mapFromJsonValue' in decoder
			? (<(value: unknown) => unknown> decoder.mapFromJsonValue)(value)
			: decoder.mapFromDriverValue(value);
	}

	return row;
}

export class RelationsBuilderTable<TTableName extends string = string> {
	static readonly [entityKind]: string = 'RelationsBuilderTable';

	readonly _: {
		readonly name: TTableName;
		readonly table: SchemaEntry;
	};

	constructor(table: SchemaEntry, name: TTableName) {
		this._ = {
			name,
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
	readonly column: FieldValue;
	readonly through?: RelationsBuilderColumnBase;
	readonly key: string;
}

export interface RelationsBuilderColumnBase<
	TTableName extends string = string,
	TData = unknown,
> {
	_: RelationsBuilderColumnConfig<TTableName, TData>;
}

export class RelationsBuilderColumn<
	TTableName extends string = string,
	TData = unknown,
> implements RelationsBuilderColumnBase<TTableName, TData> {
	static readonly [entityKind]: string = 'RelationsBuilderColumn';

	readonly _: {
		readonly tableName: TTableName;
		readonly data: TData;
		readonly column: FieldValue;
		readonly key: string;
	};

	constructor(
		column: FieldValue,
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
		readonly column: FieldValue;
		readonly through: RelationsBuilderColumnBase;
		readonly key: string;
	};

	constructor(
		column: FieldValue,
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
	// Bleeds into filters - discuss removal
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

export type RelationsFilterColumns<
	TColumns extends Record<string, unknown>,
> = {
	[K in keyof TColumns]?:
		| (TColumns[K] extends { _: { data: infer Data } } ? RelationsFieldFilter<Data>
			: RelationsFieldFilter<unknown>)
		| undefined;
};

export type RelationsFilterRelations<
	TTable extends TableRelationalConfig,
	TSchema extends TablesRelationalConfig,
	TRelations extends Record<string, Relation> = TTable['relations'],
> = {
	[K in keyof TRelations]?:
		| boolean
		| RelationsFilter<FindTableInRelationalConfig<TSchema, TRelations[K]['targetTableName']>, TSchema>
		| undefined;
};

export type RelationsFilter<
	TTable extends TableRelationalConfig,
	TSchema extends TablesRelationalConfig,
	TColumns extends FieldSelection = GetTableViewFieldSelection<TTable['table']>,
> = TTable['relations'] extends Record<string, never> ? TableFilter<TTable['table']>
	:
		& RelationsFilterColumns<TColumns>
		& RelationsFilterRelations<TTable, TSchema>
		& RelationsFilterCommons<TTable, TSchema>;

export interface TableFilterCommons<
	TTable extends SchemaEntry = SchemaEntry,
	TColumns extends Record<string, unknown> = GetTableViewColumns<TTable>,
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

export type TableFilterColumns<
	TColumns extends Record<string, unknown>,
> = {
	[K in keyof TColumns]?:
		| (TColumns[K] extends { _: { data: infer Data } } ? RelationsFieldFilter<Data>
			: RelationsFieldFilter<unknown>)
		| undefined;
};

export type TableFilter<
	TTable extends SchemaEntry = SchemaEntry,
	TColumns extends Record<string, unknown> = GetTableViewColumns<TTable>,
> =
	& TableFilterColumns<TColumns>
	& TableFilterCommons<TTable, TColumns>;

export type AnyRelationsFilter = RelationsFilter<
	TableRelationalConfig,
	TablesRelationalConfig,
	FieldSelection
>;

export type AnyTableFilter = TableFilter<
	SchemaEntry,
	FieldSelection
>;

export interface OneConfig<
	TSchema extends RelSchema,
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
	RelSchema,
	Readonly<[RelationsBuilderColumnBase, ...RelationsBuilderColumnBase[]] | RelationsBuilderColumnBase<string, unknown>>,
	string,
	boolean
>;

export interface ManyConfig<
	TSchema extends RelSchema,
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
	RelSchema,
	Readonly<[RelationsBuilderColumnBase, ...RelationsBuilderColumnBase[]]> | Readonly<RelationsBuilderColumnBase>,
	string
>;

export interface OneFn<
	TTables extends RelSchema,
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
	TTables extends RelSchema,
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

export class RelationsHelperStatic<TTables extends RelSchema> {
	static readonly [entityKind]: string = 'RelationsHelperStatic';
	// declare readonly $brand: 'RelationsHelperStatic';

	private readonly _: {
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
				return new One(tables as RelSchema, table as SchemaEntry, config as AnyOneConfig);
			};

			many[tableName] = (config) => {
				return new Many(tables as RelSchema, table as SchemaEntry, config as AnyManyConfig);
			};
		}

		this.one = one as any as this['one'];
		this.many = many as any as this['many'];
	}

	one: {
		[K in keyof TTables]: TTables[K] extends FilteredSchemaEntry ? OneFn<TTables, K & string>
			: DrizzleTypeError<'Views with nested selections are not supported by the relational query builder'>;
	};

	many: {
		[K in keyof TTables]: TTables[K] extends FilteredSchemaEntry ? ManyFn<TTables, K & string>
			: DrizzleTypeError<'Views with nested selections are not supported by the relational query builder'>;
	};

	/** @internal - to be reworked */
	aggs = {
		count(): Count {
			return new Count();
		},
	};
}

export type RelationsBuilderColumns<TTable extends SchemaEntry, TTableName extends string> = {
	[
		TColumnName in keyof GetTableViewColumns<TTable>
	]: RelationsBuilderColumn<
		TTableName,
		GetTableViewColumns<TTable>[TColumnName] extends
			{ _: { data: infer Data } } | SQLWrapper<infer Data> | SQL<infer Data> | SQL.Aliased<infer Data> ? Data
			: never
	>;
};

export type RelationsBuilderTables<TSchema extends RelSchema> = {
	[TTableName in keyof TSchema & string]: TSchema[TTableName] extends FilteredSchemaEntry ? (
			& RelationsBuilderColumns<TSchema[TTableName], TTableName>
			& RelationsBuilderTable<TTableName>
		)
		: DrizzleTypeError<'Views with nested selections are not supported by the relational query builder'>;
};

export type RelationsBuilder<TSchema extends RelSchema> = Simplify<
	& RelationsBuilderTables<TSchema>
	& RelationsHelperStatic<TSchema>
>;

export type RelationsBuilderConfig<TTables extends Record<string, unknown>> = {
	[TTableName in keyof TTables & string]?: Record<string, unknown>;
};

export type AnyRelationsBuilderConfig = Record<string, Record<string, unknown> | undefined>;

export type RelationsBuilderEntry<
	TTables extends Record<string, unknown> = Record<string, unknown>,
	TSourceTableName extends string = string,
> = Relation<TSourceTableName, keyof TTables & string>;

export type ExtractTablesFromSchema<TSchema extends Record<string, unknown>> = {
	[K in keyof TSchema & string as TSchema[K] extends SchemaEntry ? K : never]: TSchema[K] extends SchemaEntry
		? TSchema[K]
		: never;
};

// This one is 79k heavier on it's own, but ~0.5k less instantiations when relations are defined
// 	{
// 		[K in keyof TSchema as TSchema[K] extends SchemaEntry ? K : never]: TSchema[K];
// 	},
// 	Schema
// >;

export function createRelationsHelper<
	TSchema extends RelSchema,
>(schema: TSchema): RelationsBuilder<TSchema> {
	const schemaTables = Object.fromEntries(
		Object.entries(schema).filter((e): e is [typeof e[0], SchemaEntry] => is(e[1], Table) || is(e[1], View)),
	);
	const helperStatic = new RelationsHelperStatic(schemaTables);
	const tables = Object.entries(schema).reduce<Record<string, RelationsBuilderTable>>((acc, [tKey, value]) => {
		if (is(value, Table) || is(value, View)) {
			const rTable = new RelationsBuilderTable(value, tKey);
			const columns = Object.entries(value[TableColumns]).reduce<
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

	return Object.assign(helperStatic, tables) as any;
}

export function defineRelations<
	TSchema extends Record<string, unknown>,
	TConfig extends RelationsBuilderConfig<TTables>,
	TTables extends RelSchema = ExtractTablesFromSchema<TSchema>,
>(
	schema: TSchema,
	relations?: (helpers: RelationsBuilder<TTables>) => TConfig,
): Relations<TSchema, TTables, TConfig> {
	return new Relations(
		schema,
		relations
			? relations(
				createRelationsHelper(schema as unknown as TTables) as RelationsBuilder<TTables>,
			)
			: {},
	) as Relations<TSchema, TTables, TConfig>;
}

export interface WithContainer {
	with?: Record<string, boolean | AnyDBQueryConfig | undefined>;
}

export interface ColumnWithTSName {
	column: Column<any> | SQL | SQLWrapper | SQL.Aliased;
	tsName: string;
}

export type RelationsOrder<TColumns extends FieldSelection> = {
	[K in keyof TColumns]?: 'asc' | 'desc';
};

export type OrderBy = Exclude<AnyDBQueryConfig['orderBy'], undefined>;

export type Extras = Exclude<AnyDBQueryConfig['extras'], undefined>;

/** @internal */
export function fieldSelectionToSQL(table: SchemaEntry, target: string) {
	const field = table[TableColumns][target];

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
	table: SchemaEntry,
	filter: AnyRelationsFilter | AnyTableFilter,
): SQL | undefined;
export function relationsFilterToSQL(
	table: SchemaEntry,
	filter: AnyRelationsFilter | AnyTableFilter,
	tableRelations: Record<string, Relation>,
	tablesRelations: TablesRelationalConfig,
	tableNamesMap: Record<string, string>,
	casing: CasingCache,
	depth?: number,
): SQL | undefined;
export function relationsFilterToSQL(
	table: SchemaEntry,
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
				if (table[TableColumns][target]) {
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
	table: SchemaEntry,
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
	table: SchemaEntry,
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
	sourceTable: SchemaEntry,
	targetTable: SchemaEntry,
	throughTable?: SchemaEntry,
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

export function getTableAsAliasSQL(table: SchemaEntry) {
	return sql`${
		table[IsAlias]
			? sql`${sql`${sql.identifier(table[TableSchema] ?? '')}.`.if(table[TableSchema])}${
				sql.identifier(table[OriginalName])
			} as ${table}`
			: table
	}`;
}
