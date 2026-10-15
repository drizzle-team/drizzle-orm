import { IsAlias, OriginalName, Table, TableColumns, TableSchema } from '~/table.ts';
import { View, type ViewConfig } from '~/view.ts';
import { aliasedTable } from './alias.ts';
import type { CodecsCollection, NormalizeArrayCodec, NormalizeCodec } from './codecs.ts';
import type { AnyColumn, Column } from './column.ts';
import { entityKind, is } from './entity.ts';
import { DrizzleError } from './errors.ts';
import type { SelectResultFields } from './query-builders/select.types.ts';
import { commonStringChunks, type StringChunk } from './sql/common-chunks.ts';
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
import {
	type CommentInput,
	type DriverValueDecoder,
	isSQLWrapper,
	type Name,
	noopDecoder,
	Placeholder,
	SQL,
	sql,
	type SQLChunk,
	type SQLGenerator,
	type SQLWrapper,
} from './sql/sql.ts';
import { chunkKindOf, chunkKinds, isChunk } from './sql/sql.ts';
import { Subquery } from './subquery.ts';
import {
	type Assume,
	type DrizzleTypeError,
	type Equal,
	FnConstructor,
	getColumnFromDecoder,
	type Simplify,
	type ValueOrArray,
} from './utils.ts';

export type FilteredSchemaEntry =
	| Table<any>
	| View<ViewConfig<FieldSelection>>
	| Subquery<string, FieldSelection>;

export type SchemaEntry = Table<any> | View<ViewConfig<any>> | Subquery<string, any>;

export type Schema = Record<string, SchemaEntry>;

export type GetTableViewColumns<T extends SchemaEntry> = T extends View<ViewConfig<any>> | Subquery<string, any>
	? T['_']['selectedFields']
	: T extends Table<any> ? T['_']['columns']
	: never;

export type GetTableViewFieldSelection<T extends SchemaEntry> = T extends
	View<ViewConfig<FieldSelection>> | Subquery<string, FieldSelection> ? T['_']['selectedFields']
	: T extends Table<any> ? T['_']['columns']
	: never;

export type FieldValue =
	| Column<any>
	| SQLWrapper
	| SQL.Aliased
	| SQL;

export type FieldSelection = Record<string, FieldValue>;

export function processRelations(tablesConfig: TablesRelationalConfig, tables: Schema) {
	for (const tableConfig of Object.values(tablesConfig)) {
		for (const [relationFieldName, relation] of Object.entries(tableConfig.relations)) {
			if (!is(relation, Relation)) {
				continue;
			}

			relation.sourceTable = tableConfig.table;
			relation.fieldName = relationFieldName;
		}
	}

	for (const [sourceTableName, tableConfig] of Object.entries(tablesConfig)) {
		for (const [relationFieldName, relation] of Object.entries(tableConfig.relations)) {
			if (!is(relation, Relation)) {
				continue;
			}

			let reverseRelation: Relation | undefined;
			const {
				targetTableName,
				alias,
				sourceColumns,
				targetColumns,
				throughTable,
				sourceTable,
				through,
				where,
			} = relation;
			const relationPrintName = `relations -> ${tableConfig.name}: { ${relationFieldName}: r.${
				is(relation, One) ? 'one' : 'many'
			}.${targetTableName}(...) }`;

			if (Object.prototype.hasOwnProperty.call(tableConfig.table[TableColumns], relationFieldName)) {
				throw new Error(
					`${relationPrintName}: relation name collides with column "${relationFieldName}" of table "${tableConfig.name}"`,
				);
			}

			if (typeof alias === 'string' && !alias) {
				throw new Error(`${relationPrintName}: "alias" cannot be an empty string - omit it if you don't need it`);
			}

			if (sourceColumns?.length === 0) {
				throw new Error(`${relationPrintName}: "from" cannot be empty`);
			}

			if (targetColumns?.length === 0) {
				throw new Error(`${relationPrintName}: "to" cannot be empty`);
			}

			if (sourceColumns && targetColumns) {
				if (sourceColumns.length !== targetColumns.length && !throughTable) {
					throw new Error(
						`${relationPrintName}: "from" and "to" fields without "through" must have the same length`,
					);
				}

				for (const { _: { tableName } } of sourceColumns) {
					if (tableName !== sourceTableName) {
						throw new Error(
							`${relationPrintName}: all "from" columns must belong to table "${sourceTableName}", found column of table "${tableName}"`,
						);
					}
				}
				for (const { _: { tableName } } of targetColumns) {
					if (tableName !== targetTableName) {
						throw new Error(
							`${relationPrintName}: all "to" columns must belong to table "${targetTableName}", found column of table "${tableName}"`,
						);
					}
				}

				if (through) {
					if (
						through.source.length !== sourceColumns.length
						|| through.target.length !== targetColumns.length
					) {
						throw new Error(
							`${relationPrintName}: ".through(column)" must be used either on all columns in "from" and "to" or not defined on any of them`,
						);
					}

					for (const column of through.source) {
						if (tables[column._.tableName] !== throughTable) {
							throw new Error(
								`${relationPrintName}: ".through(column)" must be used on the same table by all columns of the relation`,
							);
						}
					}

					for (const column of through.target) {
						if (tables[column._.tableName] !== throughTable) {
							throw new Error(
								`${relationPrintName}: ".through(column)" must be used on the same table by all columns of the relation`,
							);
						}
					}
				}

				continue;
			}

			if (sourceColumns || targetColumns) {
				throw new Error(
					`${relationPrintName}: relation must have either both "from" and "to" defined, or none of them`,
				);
			}

			const reverseTableConfig = tablesConfig[targetTableName];
			if (!reverseTableConfig) {
				throw new Error(
					`${relationPrintName}: not enough data provided to build the relation - "from"/"to" are not defined, and no reverse relations of table "${targetTableName}" were found"`,
				);
			}
			if (alias) {
				const reverseRelations = Object.values(reverseTableConfig.relations).filter((it): it is Relation =>
					is(it, Relation) && it.alias === alias && it !== relation
				);
				if (reverseRelations.length > 1) {
					throw new Error(
						`${relationPrintName}: not enough data provided to build the relation - "from"/"to" are not defined, and multiple relations with alias "${alias}" found in table "${targetTableName}": ${
							reverseRelations.map((it) => `"${it.fieldName}"`).join(', ')
						}`,
					);
				}
				reverseRelation = reverseRelations[0];
				if (!reverseRelation) {
					throw new Error(
						`${relationPrintName}: not enough data provided to build the relation - "from"/"to" are not defined, and there is no reverse relation of table "${targetTableName}" with alias "${alias}"`,
					);
				}
			} else {
				const reverseRelations = Object.values(reverseTableConfig.relations).filter((it): it is Relation =>
					is(it, Relation) && it.targetTable === sourceTable && !it.alias && it !== relation
				);
				if (reverseRelations.length > 1) {
					throw new Error(
						`${relationPrintName}: not enough data provided to build the relation - "from"/"to" are not defined, and multiple relations between "${targetTableName}" and "${sourceTableName}" were found.\nHint: you can specify "alias" on both sides of the relation with the same value`,
					);
				}
				reverseRelation = reverseRelations[0];
				if (!reverseRelation) {
					throw new Error(
						`${relationPrintName}: not enough data provided to build the relation - "from"/"to" are not defined, and no reverse relation of table "${targetTableName}" with target table "${sourceTableName}" was found`,
					);
				}
			}
			if (!reverseRelation.sourceColumns || !reverseRelation.targetColumns) {
				throw new Error(
					`${relationPrintName}: not enough data provided to build the relation - "from"/"to" are not defined, and reverse relation "${targetTableName}.${reverseRelation.fieldName}" does not have "from"/"to" defined`,
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
			relation.isFilterReversed = where === EmptyFilter;
			relation.where = where === EmptyFilter ? reverseRelation.where : where;
		}
	}

	return tablesConfig;
}

/** Builds relational config for every table in schema */
export function buildRelations<TTables extends Schema, TConfig extends AnyRelationsBuilderConfig>(
	tables: TTables,
	config: TConfig,
): ExtractTablesWithRelations<TConfig, TTables> {
	const tablesConfig = {} as TablesRelationalConfig;

	for (const [tsName, table] of Object.entries(tables)) {
		tablesConfig[tsName] = {
			table,
			name: tsName,
			relations: config[tsName] ?? {},
		};
	}

	return processRelations(tablesConfig, tables) as any;
}

/** Builds relational config only for tables present in relational config */
export function buildRelationsParts<TTables extends Schema, TConfig extends AnyRelationsBuilderConfig>(
	tables: TTables,
	config: TConfig,
): ExtractTablesWithRelationsParts<TConfig, TTables> {
	const tablesConfig = {} as TablesRelationalConfig;

	for (const [tsName, relations] of Object.entries(config)) {
		if (!relations || !tables[tsName]) continue;
		tablesConfig[tsName] = {
			table: tables[tsName],
			name: tsName,
			relations,
		};
	}

	return processRelations(tablesConfig, tables) as any;
}

export type RelationsRecord = Record<string, AnyRelation>;
export type EmptyRelations = {};
export type AnyRelations = TablesRelationalConfig;

export abstract class Relation<
	TTargetTableName extends string = string,
> {
	static readonly [entityKind]: string = 'RelationV2';
	static [Symbol.hasInstance](value: unknown): boolean {
		return is(value, this);
	}

	declare readonly $brand: 'RelationV2';
	declare public readonly relationType: 'many' | 'one';

	fieldName!: string;
	sourceColumns!: RelationsBuilderColumnBase[];
	targetColumns!: RelationsBuilderColumnBase[];
	alias: string | undefined;
	where!: AnyTableFilter | EmptyFilter;
	sourceTable!: SchemaEntry;
	targetTable: SchemaEntry;
	through?: {
		source: RelationsBuilderColumnBase[];
		target: RelationsBuilderColumnBase[];
	};
	throughTable?: SchemaEntry;
	isFilterReversed?: boolean;

	constructor(
		targetTable: SchemaEntry,
		readonly targetTableName: TTargetTableName,
	) {
		this.targetTable = targetTable;
	}
}

export type AnyRelation = Relation<string>;

export class One<
	TTargetTableName extends string,
	TOptional extends boolean = boolean,
> extends Relation<TTargetTableName> {
	static override readonly [entityKind]: string = 'OneV2';
	declare protected $relationBrand: 'OneV2';

	public override readonly relationType = 'one' as const;

	readonly optional: TOptional;

	constructor(
		tables: Schema,
		targetTable: SchemaEntry,
		targetTableName: TTargetTableName,
		config: AnyOneConfig | undefined,
	) {
		super(targetTable, targetTableName);
		this.alias = config?.alias;
		if (config && 'where' in config) {
			if (config.where === undefined) {
				throw new Error(
					`Unexpected 'undefined' in filter value. Use 'EmptyFilter' if you want the filter field to be skipped.`,
				);
			}

			this.where = config.where;
		} else {
			this.where = EmptyFilter;
		}

		const from = config?.from
			? (Array.isArray(config.from) ? config.from : [config.from]) as RelationsBuilderColumnBase[]
			: undefined;
		const to = config?.to
			? (Array.isArray(config.to) ? config.to : [config.to]) as RelationsBuilderColumnBase[]
			: undefined;

		if (from) {
			for (const { _: { through } } of from) {
				if (through) this.throughTable ??= tables[through._.tableName]! as SchemaEntry;
			}

			this.sourceColumns = from;
		}
		if (to) {
			for (const { _: { through } } of to) {
				if (through) this.throughTable ??= tables[through._.tableName]! as SchemaEntry;
			}

			this.targetColumns = to;
		}

		if (this.throughTable) {
			this.through = {
				source: from?.flatMap((c) => c._.through ?? []) ?? [],
				target: to?.flatMap((c) => c._.through ?? []) ?? [],
			};
		}
		this.optional = (config?.optional ?? true) as TOptional;
	}
}

export type AnyOne = One<string, boolean>;

export class Many<TTargetTableName extends string> extends Relation<TTargetTableName> {
	static override readonly [entityKind]: string = 'ManyV2';
	declare protected $relationBrand: 'ManyV2';

	public override readonly relationType = 'many' as const;

	constructor(
		tables: Schema,
		targetTable: SchemaEntry,
		targetTableName: TTargetTableName,
		readonly config: AnyManyConfig | undefined,
	) {
		super(targetTable, targetTableName);
		this.alias = config?.alias;
		if (config && 'where' in config) {
			if (config.where === undefined) {
				throw new Error(
					`Unexpected 'undefined' in filter value. Use 'EmptyFilter' if you want the filter field to be skipped.`,
				);
			}

			this.where = config.where;
		} else {
			this.where = EmptyFilter;
		}

		const from = config?.from
			? (Array.isArray(config.from) ? config.from : [config.from]) as RelationsBuilderColumnBase[]
			: undefined;
		const to = config?.to
			? (Array.isArray(config.to) ? config.to : [config.to]) as RelationsBuilderColumnBase[]
			: undefined;

		if (from) {
			for (const { _: { through } } of from) {
				if (through) this.throughTable ??= tables[through._.tableName]! as SchemaEntry;
			}

			this.sourceColumns = from;
		}
		if (to) {
			for (const { _: { through } } of to) {
				if (through) this.throughTable ??= tables[through._.tableName]! as SchemaEntry;
			}

			this.targetColumns = to;
		}
		if (this.throughTable) {
			this.through = {
				source: from?.flatMap((c) => c._.through ?? []) ?? [],
				target: to?.flatMap((c) => c._.through ?? []) ?? [],
			};
		}
	}
}

export type AnyMany = Many<string>;

export abstract class AggregatedField<T = unknown> implements SQLWrapper<T> {
	static readonly [entityKind]: string = 'AggregatedField';
	static [Symbol.hasInstance](value: unknown): boolean {
		return is(value, this);
	}

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
			this.query = new SQL(
				getTableAsAliasSQL(this.table, [
					commonStringChunks['select count(*) as '],
					sql.identifier('r'),
					commonStringChunks[' from '],
				]),
			).mapWith(Number);
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

export type FindTargetTableInRelationalConfig<
	TConfig extends TablesRelationalConfig,
	TRelation extends AnyRelation,
> = TConfig[TRelation['targetTableName']];

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
	) => SQLWrapper | undefined)
>;

export type DBQueryConfigOrderByCallback<TTable extends SchemaEntry> = (
	table: TTable,
	operators: OrderByOperators,
) => ValueOrArray<AnyColumn | SQL> | undefined;

export type DBQueryConfigOrderByObject<TColumns extends FieldSelection> = {
	[K in keyof TColumns]?: 'asc' | 'desc' | undefined;
};

export type DBQueryConfigOrderBy<TTable extends SchemaEntry, TColumns extends FieldSelection> =
	| DBQueryConfigOrderByCallback<TTable>
	| DBQueryConfigOrderByObject<TColumns>;

export type RelationsOrderDirection = 'asc' | 'desc';

/**`first` takes the field of whichever related row the database returns first, the rest aggregate over all of them */
export type RelationsOrderAggregate = 'min' | 'max' | 'count' | 'avg' | 'first';

/** Order of rows by an aggregate over fields of rows of a `many` relation */
export type RelationsAggregatedOrderDirection = `${RelationsOrderDirection}(${RelationsOrderAggregate})`;

/** Order of rows by the number of rows of a `many` relation */
export type RelationsCountOrderDirection = `${RelationsOrderDirection}(count)`;

export type RelationsOrderColumns<
	TColumns extends Record<string, unknown>,
	TAggregated extends boolean = false,
> = {
	[K in keyof TColumns]?:
		| (TAggregated extends true ? RelationsAggregatedOrderDirection : RelationsOrderDirection)
		| undefined;
};

export type RelationsOrderRelations<
	TTable extends TableRelationalConfig,
	TSchema extends TablesRelationalConfig,
	TAggregated extends boolean = false,
	TRelations extends RelationsRecord = TTable['relations'],
> = {
	[K in keyof TRelations]?:
		| RelationsOrderBy<
			FindTargetTableInRelationalConfig<TSchema, TRelations[K]>,
			TSchema,
			// Everything under a `many` relation resolves to multiple rows
			TAggregated extends true ? true : TRelations[K]['relationType'] extends 'one' ? false : true
		>
		| (TRelations[K]['relationType'] extends 'many' ? RelationsCountOrderDirection : never)
		| undefined;
};

export type RelationsOrderBy<
	TTable extends TableRelationalConfig,
	TSchema extends TablesRelationalConfig,
	TAggregated extends boolean = false,
	TColumns extends FieldSelection = GetTableViewFieldSelection<TTable['table']>,
> = TTable['relations'] extends Record<string, never> ? RelationsOrderColumns<TColumns, TAggregated>
	:
		& RelationsOrderColumns<TColumns, TAggregated>
		& RelationsOrderRelations<TTable, TSchema, TAggregated>;

export type AnyRelationsOrder = {
	[K: string]:
		| RelationsOrderDirection
		| RelationsAggregatedOrderDirection
		| RelationsCountOrderDirection
		| AnyRelationsOrder
		| undefined;
};

export type DBQueryConfigRelationsOrderBy<
	TTable extends TableRelationalConfig,
	TSchema extends TablesRelationalConfig,
> =
	| DBQueryConfigOrderByCallback<TTable['table']>
	| RelationsOrderBy<TTable, TSchema>;

export type DBQueryConfigWith<TSchema extends TablesRelationalConfig, TRelations extends RelationsRecord> = {
	[K in keyof TRelations]?:
		| boolean
		| (DBQueryConfig<
			TRelations[K]['relationType'],
			TSchema,
			FindTargetTableInRelationalConfig<TSchema, TRelations[K]>
		>)
		| undefined;
};

export type DBQueryConfig<
	TRelationType extends 'one' | 'many' = 'one' | 'many',
	TSchema extends TablesRelationalConfig = TablesRelationalConfig,
	TTableConfig extends TableRelationalConfig = TableRelationalConfig,
> =
	& (TTableConfig['relations'] extends Record<string, never> ? {}
		: {
			with?:
				| DBQueryConfigWith<TSchema, TTableConfig['relations']>
				| undefined;
		})
	& {
		columns?: DBQueryConfigColumns<GetTableViewFieldSelection<TTableConfig['table']>> | undefined;
		where?: RelationsFilter<TTableConfig, TSchema> | EmptyFilter;
		extras?:
			| DBQueryConfigExtras<TTableConfig['table']>
			| undefined;
		orderBy?:
			| DBQueryConfigRelationsOrderBy<TTableConfig, TSchema>
			| undefined;
		offset?: number | Placeholder | undefined;
	}
	& (TRelationType extends 'many' ? {
			limit?: number | Placeholder | undefined;
		}
		: {});

export type RelationalQueryStrategy = 'basic' | 'optimized';

export type DBQueryConfigWithStrategy<
	TRelationType extends 'one' | 'many' = 'one' | 'many',
	TSchema extends TablesRelationalConfig = TablesRelationalConfig,
	TTableConfig extends TableRelationalConfig = TableRelationalConfig,
> = DBQueryConfig<TRelationType, TSchema, TTableConfig> & {
	/**
	 * Query build strategy
	 *
	 * - `optimized` - applies query optimizations based on presence of pagination, ordering & filters to avoid slow query plans. Conditions vary per dialect.
	 * - `basic` - keeps original query shape regardless of conditions.
	 * Use to opt out of `optimized` if the query refers to relations' subqueries from raw SQL in `where` or `orderBy` or causes performance issues
	 *
	 * @default 'optimized'
	 */
	strategy?: RelationalQueryStrategy | undefined;
};

export type DBQueryConfigWithComment<
	TRelationType extends 'one' | 'many' = 'one' | 'many',
	TSchema extends TablesRelationalConfig = TablesRelationalConfig,
	TTableConfig extends TableRelationalConfig = TableRelationalConfig,
> = DBQueryConfigWithStrategy<TRelationType, TSchema, TTableConfig> & {
	/**
	 * Attach [sqlcommenter](https://google.github.io/sqlcommenter) comment to a query
	 */
	comment?: CommentInput | undefined;
};

export type AnyDBQueryConfig = {
	columns?:
		| DBQueryConfigColumns<GetTableViewFieldSelection<TableRelationalConfig['table']>>
		| undefined;
	where?: RelationsFilter<TableRelationalConfig, TablesRelationalConfig> | EmptyFilter;
	extras?:
		| DBQueryConfigExtras<TableRelationalConfig['table']>
		| undefined;
	with?:
		| Record<string, AnyDBQueryConfig>
		| undefined;
	orderBy?:
		| DBQueryConfigOrderByCallback<TableRelationalConfig['table']>
		| AnyRelationsOrder
		| undefined;
	offset?: number | Placeholder | undefined;
	limit?: number | Placeholder | undefined;
	comment?: CommentInput | undefined;
	strategy?: RelationalQueryStrategy | undefined;
};

export interface TableRelationalConfig {
	table: SchemaEntry;
	name: string;
	relations: RelationsRecord;
}

export type TablesRelationalConfig = Record<string, TableRelationalConfig>;

export type ExtractTablesWithRelations<
	TConfig extends AnyRelationsBuilderConfig,
	TTables extends Schema,
> = {
	[K in keyof TTables]: {
		table: TTables[K];
		name: K & string;
		relations: TConfig extends { [CK in K]: Record<string, any> } ? TConfig[K] : {};
	};
};

export type ExtractTablesWithRelationsParts<
	TConfig extends AnyRelationsBuilderConfig,
	TTables extends Schema,
> = {
	[K in NonUndefinedKeysOnly<TConfig> & keyof TTables]: {
		table: TTables[K & string];
		name: K & string;
		relations: TConfig[K] extends Record<string, any> ? TConfig[K] : {};
	};
};

export type ReturnTypeOrValue<T> = T extends (...args: any[]) => infer R ? R
	: T;

export type RelationResultKind<TResult, TInclude, TRelation extends AnyRelation> = TRelation extends AnyOne ? (
		| TResult
		| (Equal<TRelation['optional'], true> extends true ? null
			: TInclude extends Record<string, unknown> ? TInclude['where'] extends Record<string, any> ? null
				: never
			: never)
	)
	: TResult[];

export type BuildRelationResult<
	TConfig extends TablesRelationalConfig,
	TInclude,
	TRelations extends RelationsRecord,
> = {
	[
		K in
			& TruthyKeysOnly<TInclude>
			& keyof TRelations
	]: TRelations[K] extends infer TRel extends AnyRelation ? RelationResultKind<
			BuildQueryResult<
				TConfig,
				FindTargetTableInRelationalConfig<TConfig, TRel>,
				Assume<TInclude[K], true | Record<string, unknown>>
			>,
			TInclude[K],
			TRel
		>
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

export type InferSchemaEntrySelectModel<TEntry extends SchemaEntry> = TEntry extends Subquery<string, any>
	? SelectResultFields<TEntry['_']['selectedFields']>
	: Assume<
		TEntry,
		{ $inferSelect: Record<string, unknown> }
	>['$inferSelect'];

export type BuildQueryResult<
	TSchema extends TablesRelationalConfig,
	TTableConfig extends TableRelationalConfig,
	TFullSelection extends true | Record<string, unknown>,
	TModel extends Record<string, unknown> = InferSchemaEntrySelectModel<TTableConfig['table']>,
> = TFullSelection extends true | Record<string, never> ? TModel
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

export interface RelationalThroughJoin {
	table: SchemaEntry;
	condition: SQLChunk[];
}

export interface BuildRelationalQueryConfig<TQueryConfig = DBQueryConfigWithComment<'many'>> {
	schema: TablesRelationalConfig;
	table: SchemaEntry;
	tableConfig: TableRelationalConfig;
	queryConfig?: TQueryConfig | true;
	/** Filter of relation the query is built for */
	relationWhere?: SQLChunk[];
	mode: 'first' | 'many';
	errorPath?: string;
	depth?: number;
	through?: RelationalThroughJoin;
	/** Whether query is built for a relation of another query */
	nested?: boolean;
	withSubqueries?: RelationalWithSubqueries;
	strategy?: RelationalQueryStrategy;
}

export interface BuildRelationalQueryResult {
	selection: (
		& {
			key: string;
			codec?: NormalizeCodec | NormalizeArrayCodec;
			/** For array type columns */
			arrayDimensions?: number;
			// Subquery only
			subqueryDecoder?: DriverValueDecoder<any, any>;
			// Nested selection only fields
			/** For array type relations */
			isArray?: boolean;
			selection?: BuildRelationalQueryResult['selection'];
			isOptional?: boolean;
		}
		& ({
			field: Column<any>;
			fieldType: 'Column';
		} | {
			field: SQL;
			fieldType: 'SQL';
		} | {
			field: SQL.Aliased;
			fieldType: 'SQL.Aliased';
		} | {
			field: Subquery;
			fieldType: 'Subquery';
		} | {
			field: SQLWrapper;
			fieldType: 'SQLWrapper';
		} | {
			field: AggregatedField;
			fieldType: 'AggregatedField';
		} | {
			field: SchemaEntry;
			fieldType: 'Nested';
		})
	)[];
	sql: SQL;
}

export function mapRelationalRow(
	rows: Record<string, unknown> | Record<string, unknown>[],
	isOne: boolean,
	buildQueryResultSelection: BuildRelationalQueryResult['selection'],
	/** Needed for SQLite as it returns JSON values as strings */
	parseJson: boolean = false,
	/** Needed for SingleStore as it returns JSON arrays as strings */
	parseJsonIfString: boolean = false,
	/** Root level data of query is usually not nested in JSON */
	useJsonMappers: boolean = true,
): Record<string, unknown> | Record<string, unknown>[] {
	const maxIdx = isOne ? 1 : (rows as Record<string, unknown>[]).length;
	const decoders: (undefined | ((v: any) => any))[] = buildQueryResultSelection.map(
		({ field, fieldType, codec, arrayDimensions, subqueryDecoder }) => {
			let decoder;
			switch (fieldType) {
				case 'Column':
					decoder = field;
					break;
				case 'SQL':
					decoder = field.decoder;
					break;
				case 'SQL.Aliased':
					decoder = field.sql.decoder;
					break;
				case 'Subquery':
					decoder = subqueryDecoder ?? noopDecoder;
					break;
				case 'Nested':
					decoder = noopDecoder;
					break;
				default:
					decoder = field.getSQL().decoder;
			}

			// Support for old custom column JSON field API
			if (useJsonMappers && (<any> field).mapFromJsonValue) {
				return (v) => (<(value: unknown) => unknown> (<any> field).mapFromJsonValue)(v);
			}

			return decoder.mapFromDriverValue.isNoop
				? codec
					? (value) => codec(value, arrayDimensions!)
					: undefined
				: codec
				? (value) => decoder.mapFromDriverValue(codec(value, arrayDimensions!))
				: (value) => decoder.mapFromDriverValue(value);
		},
	);

	for (let i = 0; i < maxIdx; ++i) {
		const row = (isOne ? rows : (rows as Record<string, unknown>[])[i]) as Record<string, unknown>;

		for (let selectionItemIdx = 0; selectionItemIdx < buildQueryResultSelection.length; ++selectionItemIdx) {
			const selectionItem = buildQueryResultSelection[selectionItemIdx]!;

			if (selectionItem.selection) {
				if (row[selectionItem.key] === null) continue;

				if (parseJson) {
					row[selectionItem.key] = JSON.parse(row[selectionItem.key] as string);
					if (row[selectionItem.key] === null) continue;
				} else if (parseJsonIfString && typeof row[selectionItem.key] === 'string') {
					row[selectionItem.key] = JSON.parse(row[selectionItem.key] as string);
				}

				if (selectionItem.isArray) {
					mapRelationalRow(
						row[selectionItem.key] as Array<Record<string, unknown>>,
						false,
						selectionItem.selection!,
						false,
						parseJsonIfString,
					);

					continue;
				}

				mapRelationalRow(
					row[selectionItem.key] as Record<string, unknown>,
					true,
					selectionItem.selection!,
					false,
					parseJsonIfString,
				);

				continue;
			}

			if (row[selectionItem.key] === null) continue;

			const decoder = decoders[selectionItemIdx];
			if (!decoder) continue;

			row[selectionItem.key] = decoder(row[selectionItem.key]);
		}
	}

	return rows;
}

export function mapRelationalRowFromArrays(
	rows: unknown[][] | unknown[],
	isOne: boolean,
	buildQueryResultSelection: BuildRelationalQueryResult['selection'],
	/** Needed for SQLite as it returns JSON values as strings */
	parseJson: boolean = false,
	/** Needed for SingleStore as it returns JSON arrays as strings */
	parseJsonIfString: boolean = false,
): Record<string, unknown> | Record<string, unknown>[] {
	const maxIdx = isOne ? 1 : rows.length;
	const decoders: (undefined | ((v: any) => any))[] = buildQueryResultSelection.map(
		({ field, fieldType, codec, arrayDimensions, subqueryDecoder }) => {
			let decoder;
			switch (fieldType) {
				case 'Column':
					decoder = field;
					break;
				case 'SQL':
					decoder = field.decoder;
					break;
				case 'SQL.Aliased':
					decoder = field.sql.decoder;
					break;
				case 'Subquery':
					decoder = subqueryDecoder ?? noopDecoder;
					break;
				case 'Nested':
					decoder = noopDecoder;
					break;
				default:
					decoder = field.getSQL().decoder;
			}

			return decoder.mapFromDriverValue.isNoop
				? codec
					? (value) => codec(value, arrayDimensions!)
					: undefined
				: codec
				? (value) => decoder.mapFromDriverValue(codec(value, arrayDimensions!))
				: (value) => decoder.mapFromDriverValue(value);
		},
	);

	const results: Record<string, unknown>[] = new Array(maxIdx);

	for (let i = 0; i < maxIdx; ++i) {
		const row = (isOne ? rows : rows[i]!) as unknown[];
		const result: Record<string, unknown> = {};

		for (let selectionItemIdx = 0; selectionItemIdx < buildQueryResultSelection.length; ++selectionItemIdx) {
			const selectionItem = buildQueryResultSelection[selectionItemIdx]!;
			let value = row[selectionItemIdx];

			if (selectionItem.selection) {
				if (value === null) {
					result[selectionItem.key] = null;
					continue;
				}

				if (parseJson) {
					value = JSON.parse(value as string);
					if (value === null) {
						result[selectionItem.key] = null;
						continue;
					}
				} else if (parseJsonIfString && typeof value === 'string') {
					value = JSON.parse(value);
				}

				if (selectionItem.isArray) {
					mapRelationalRow(
						value as Array<Record<string, unknown>>,
						false,
						selectionItem.selection!,
						false,
						parseJsonIfString,
					);
				} else {
					mapRelationalRow(
						value as Record<string, unknown>,
						true,
						selectionItem.selection!,
						false,
						parseJsonIfString,
					);
				}

				result[selectionItem.key] = value;
				continue;
			}

			if (value === null) {
				result[selectionItem.key] = null;
				continue;
			}

			const decoder = decoders[selectionItemIdx];
			result[selectionItem.key] = decoder ? decoder(value) : value;
		}

		results[i] = result;
	}

	return isOne ? results[0]! : results;
}

export interface RelationalRowsMapper<T = any> {
	(rows: unknown[][] | Record<string, unknown>[]): T;
	/** @internal jit mapper's function body for debugging */
	body?: string;
}

export type RelationalRowsMapperGenerator<T = any> = (
	config: RelationalQueryMapperConfig,
) => RelationalRowsMapper<T> | undefined;

export function makeDefaultRqbMapper<T = any>(
	{ selection, isFirst, parseJson, parseJsonIfString, rootJsonMappers, arrayModeRoot }: RelationalQueryMapperConfig,
): RelationalRowsMapper<T> {
	return ((rows) => {
		if (isFirst && !rows[0]) return rows[0];

		return arrayModeRoot
			? mapRelationalRowFromArrays(
				(isFirst ? rows[0]! : rows) as unknown[][] | unknown[],
				isFirst,
				selection,
				parseJson,
				parseJsonIfString,
			)
			: mapRelationalRow(
				(isFirst ? rows[0]! : rows) as Record<string, unknown>[] | Record<string, unknown>,
				isFirst,
				selection,
				parseJson,
				parseJsonIfString,
				rootJsonMappers,
			);
	}) as RelationalRowsMapper<T>;
}

function makeJitRqbMapperInner(
	selection: BuildRelationalQueryResult['selection'],
	rowExpr: string,
	selectionVar: string,
	/** Needed for SQLite as it returns JSON values as strings */
	parseJson: boolean,
	/** Needed for SingleStore as it returns JSON arrays as strings */
	parseJsonIfString: boolean,
	/** Root level data of query is usually not nested in JSON */
	useJsonMappers: boolean,
	preFn: string[],
	counter: { n: number },
	accessByIdx: boolean,
): { bodyStmts: string[]; literal: string; hasWork: boolean } {
	const bodyStmts: string[] = [];
	const literalEntries: string[] = [];
	let hasWork = false;

	const fieldVars: string[] = selection.map(() => `c${counter.n++}`);
	const destructurePieces = selection.map((item, idx) =>
		accessByIdx ? fieldVars[idx]! : `${JSON.stringify(item.key)}: ${fieldVars[idx]}`
	);
	bodyStmts.push(
		accessByIdx
			? `let [ ${destructurePieces.join(', ')} ] = ${rowExpr};`
			: `let { ${destructurePieces.join(', ')} } = ${rowExpr};`,
	);

	for (
		const [
			idx,
			{
				field,
				fieldType,
				key,
				codec,
				isArray,
				selection: innerSelection,
				arrayDimensions,
				subqueryDecoder,
			},
		] of selection
			.entries()
	) {
		const sel = `${selectionVar}[${idx}]`;
		const keyStr = JSON.stringify(key);
		const slot = fieldVars[idx]!;

		if (innerSelection) {
			if (parseJson) {
				bodyStmts.push(`if (${slot} !== null) ${slot} = JSON.parse(${slot});`);
				hasWork = true;
			} else if (parseJsonIfString) {
				bodyStmts.push(`if (typeof ${slot} === 'string') ${slot} = JSON.parse(${slot});`);
				hasWork = true;
			}

			const nestedSelVar = `s${counter.n++}`;
			const savedPreFnLen = preFn.length;
			preFn.push(`const { selection: ${nestedSelVar} } = ${sel};`);

			if (isArray) {
				const j = `j${counter.n++}`;
				const inner = makeJitRqbMapperInner(
					innerSelection,
					`${slot}[${j}]`,
					nestedSelVar,
					false,
					parseJsonIfString,
					true,
					preFn,
					counter,
					false,
				);
				if (inner.hasWork) {
					hasWork = true;
					bodyStmts.push(`if (${slot} !== null) {`);
					bodyStmts.push(`\tfor (let ${j} = 0; ${j} < ${slot}.length; ++${j}) {`);
					for (const s of inner.bodyStmts) bodyStmts.push(`\t\t${s}`);
					bodyStmts.push(`\t\t${slot}[${j}] = ${inner.literal};`);
					bodyStmts.push(`\t}`);
					bodyStmts.push(`}`);
				} else {
					preFn.splice(savedPreFnLen, 1);
				}
			} else {
				const inner = makeJitRqbMapperInner(
					innerSelection,
					slot,
					nestedSelVar,
					false,
					parseJsonIfString,
					true,
					preFn,
					counter,
					false,
				);
				if (inner.hasWork) {
					hasWork = true;
					bodyStmts.push(`if (${slot} !== null) {`);
					for (const s of inner.bodyStmts) bodyStmts.push(`\t${s}`);
					bodyStmts.push(`\t${slot} = ${inner.literal};`);
					bodyStmts.push(`}`);
				} else {
					preFn.splice(savedPreFnLen, 1);
				}
			}

			literalEntries.push(`${keyStr}: ${slot}`);
			continue;
		}

		let decoderExpr = '';
		let destructure = '';
		let bypassCodecs = false;
		switch (fieldType) {
			case 'Column': {
				if (useJsonMappers && (<any> field).mapFromJsonValue) {
					bypassCodecs = true;
					const id = counter.n++;
					destructure = `field: dec${id}`;
					decoderExpr = `dec${id}.mapFromJsonValue`;
				} else if (!field.mapFromDriverValue.isNoop) {
					const id = counter.n++;
					destructure = `field: dec${id}`;
					decoderExpr = `dec${id}.mapFromDriverValue`;
				}
				break;
			}
			case 'SQL': {
				if (useJsonMappers && (<any> field.decoder).mapFromJsonValue) {
					bypassCodecs = true;
					const id = counter.n++;
					destructure = `field: { decoder: dec${id} }`;
					decoderExpr = `dec${id}.mapFromJsonValue`;
				} else if (!field.decoder.mapFromDriverValue.isNoop) {
					const id = counter.n++;
					destructure = `field: { decoder: dec${id} }`;
					decoderExpr = `dec${id}.mapFromDriverValue`;
				}
				break;
			}
			case 'SQL.Aliased': {
				if (useJsonMappers && (<any> field.sql.decoder).mapFromJsonValue) {
					bypassCodecs = true;
					const id = counter.n++;
					destructure = `field: { sql: { decoder: dec${id} } }`;
					decoderExpr = `dec${id}.mapFromJsonValue`;
				} else if (!field.sql.decoder.mapFromDriverValue.isNoop) {
					const id = counter.n++;
					destructure = `field: { sql: { decoder: dec${id} } }`;
					decoderExpr = `dec${id}.mapFromDriverValue`;
				}
				break;
			}
			case 'Subquery': {
				if (useJsonMappers && (<any> subqueryDecoder)?.mapFromJsonValue) {
					bypassCodecs = true;
					const id = counter.n++;
					destructure = `subqueryDecoder: dec${id}`;
					decoderExpr = `dec${id}.mapFromJsonValue`;
				} else if (subqueryDecoder && !subqueryDecoder.mapFromDriverValue.isNoop) {
					const id = counter.n++;
					destructure = `subqueryDecoder: dec${id}`;
					decoderExpr = `dec${id}.mapFromDriverValue`;
				}
				break;
			}
			case 'Nested': {
				// no decoder
				break;
			}
			default: {
				const sqlExpr = field.getSQL();

				if (useJsonMappers && (<any> sqlExpr.decoder).mapFromJsonValue) {
					bypassCodecs = true;
					const id = counter.n++;
					preFn.push(`const dec${id} = ${sel}.field.getSQL().decoder;`);
					decoderExpr = `dec${id}.mapFromJsonValue`;
				} else if (!sqlExpr.decoder.mapFromDriverValue.isNoop) {
					const id = counter.n++;
					preFn.push(`const dec${id} = ${sel}.field.getSQL().decoder;`);
					decoderExpr = `dec${id}.mapFromDriverValue`;
				}
			}
		}

		let codecVar = '';
		if (!bypassCodecs && codec) {
			codecVar = `codec${counter.n++}`;
		}

		if (destructure || codecVar) {
			const parts: string[] = [];
			if (destructure) parts.push(destructure);
			if (codecVar) parts.push(`codec: ${codecVar}`);
			preFn.push(`const { ${parts.join(', ')} } = ${sel};`);
		}

		if (decoderExpr || codecVar) {
			hasWork = true;
			let decoded = slot;
			if (codecVar) decoded = `${codecVar}(${decoded}, ${arrayDimensions})`;
			if (decoderExpr) decoded = `${decoderExpr}(${decoded})`;
			literalEntries.push(`${keyStr}: ${slot} === null ? null : ${decoded}`);
		} else {
			literalEntries.push(`${keyStr}: ${slot}`);
		}
	}

	const literal = `{ ${literalEntries.join(', ')} }`;

	return { bodyStmts, literal, hasWork };
}

export interface RelationalQueryMapperConfig {
	selection: BuildRelationalQueryResult['selection'];
	/** Used for `db.query.table.findFirst(...)` */
	isFirst: boolean;
	/** Used by SQLite & drivers that return JSON-s as strings by default */
	parseJson: boolean;
	/** Used by SingleStore to fix malformed outputs for empty JSON arrays */
	parseJsonIfString: boolean;
	/** Enable for non-reworked dialects & drivers with JSON-ified root level of relational query */
	rootJsonMappers: boolean;
	/** Used when root level of data is in array mode */
	arrayModeRoot?: boolean;
}

export function makeJitRqbMapper<T = unknown>(
	{ selection, isFirst, parseJson, parseJsonIfString, rootJsonMappers, arrayModeRoot }: RelationalQueryMapperConfig,
): RelationalRowsMapper<T> {
	const preFn: string[] = [];
	const counter = { n: 0 };

	const inner = makeJitRqbMapperInner(
		selection,
		'row',
		'selection',
		parseJson,
		parseJsonIfString,
		arrayModeRoot ? false : rootJsonMappers,
		preFn,
		counter,
		!!arrayModeRoot,
	);

	const lines: string[] = [];
	lines.push(`\t"use strict";
	const { selection } = this;`);
	for (const p of preFn) lines.push(`\t${p}`);

	if (arrayModeRoot) {
		if (isFirst) {
			lines.push(`\tconst row = rows[0];`);
			lines.push(`\tif (!row) return undefined;`);
			for (const s of inner.bodyStmts) lines.push(`\t${s}`);
			lines.push(`\treturn ${inner.literal};`);
		} else {
			lines.push(`\tconst { length } = rows;`);
			lines.push(`\tconst mapped = new Array(length);`);
			lines.push(`\tfor (let i = 0; i < length; ++i) {`);
			lines.push(`\t\tconst row = rows[i];`);
			for (const s of inner.bodyStmts) lines.push(`\t\t${s}`);
			lines.push(`\t\tmapped[i] = ${inner.literal};`);
			lines.push(`\t}`);
			lines.push(`\treturn mapped;`);
		}
	} else if (!inner.hasWork) {
		lines.push(isFirst ? `\treturn rows[0];` : `\treturn rows;`);
	} else if (isFirst) {
		lines.push(`\tconst row = rows[0];`);
		lines.push(`\tif (!row) return undefined;`);
		for (const s of inner.bodyStmts) lines.push(`\t${s}`);
		lines.push(`\trows[0] = ${inner.literal};`);
		lines.push(`\treturn rows[0];`);
	} else {
		lines.push(`\tfor (let i = 0; i < rows.length; ++i) {`);
		lines.push(`\t\tconst row = rows[i];`);
		for (const s of inner.bodyStmts) lines.push(`\t\t${s}`);
		lines.push(`\t\trows[i] = ${inner.literal};`);
		lines.push(`\t}`);
		lines.push(`\treturn rows;`);
	}

	lines.push('\t//# sourceURL=drizzle:jit-relational-query-mapper');
	const compiled = lines.join('\n');

	return Object.assign(
		new FnConstructor(
			'rows',
			compiled,
		).bind({
			selection,
		}),
		{ body: `function jitRqbMapper (rows) {\n${compiled}\n}` },
	) as RelationalRowsMapper<T>;
}

export class RelationsBuilderTable<TTableName extends string = string> {
	static readonly [entityKind]: string = 'RelationsBuilderTable';
	static [Symbol.hasInstance](value: unknown): boolean {
		return is(value, this);
	}

	protected readonly _: {
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
> {
	readonly tableName: TTableName;
	readonly column: FieldValue;
	readonly through?: RelationsBuilderColumnBase;
	readonly key: string;
}

export interface RelationsBuilderColumnBase<
	TTableName extends string = string,
> {
	_: RelationsBuilderColumnConfig<TTableName>;
}

export class RelationsBuilderColumn<
	TTableName extends string = string,
> implements RelationsBuilderColumnBase<TTableName> {
	static readonly [entityKind]: string = 'RelationsBuilderColumn';
	static [Symbol.hasInstance](value: unknown): boolean {
		return is(value, this);
	}

	readonly _: {
		readonly tableName: TTableName;
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
			column,
			key,
		};
	}

	through(column: RelationsBuilderColumn): RelationsBuilderJunctionColumn<TTableName> {
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
> implements RelationsBuilderColumnBase<TTableName> {
	static readonly [entityKind]: string = 'RelationsBuilderColumn';
	static [Symbol.hasInstance](value: unknown): boolean {
		return is(value, this);
	}

	readonly _: {
		readonly tableName: TTableName;
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
			column,
			through,
			key,
		};
	}
}

export interface RelationFieldsFilterInternals<T> {
	eq?: T | Placeholder | EmptyFilter;
	ne?: T | Placeholder | EmptyFilter;
	gt?: T | Placeholder | EmptyFilter;
	gte?: T | Placeholder | EmptyFilter;
	lt?: T | Placeholder | EmptyFilter;
	lte?: T | Placeholder | EmptyFilter;
	in?: (T | Placeholder)[] | Placeholder | EmptyFilter;
	notIn?: (T | Placeholder)[] | Placeholder | EmptyFilter;
	arrayContains?: (T extends Array<infer E> ? (E | Placeholder)[] : (T | Placeholder)[]) | Placeholder | EmptyFilter;
	arrayContained?: (T extends Array<infer E> ? (E | Placeholder)[] : (T | Placeholder)[]) | Placeholder | EmptyFilter;
	arrayOverlaps?: (T extends Array<infer E> ? (E | Placeholder)[] : (T | Placeholder)[]) | Placeholder | EmptyFilter;
	like?: string | Placeholder | EmptyFilter;
	ilike?: string | Placeholder | EmptyFilter;
	notLike?: string | Placeholder | EmptyFilter;
	notIlike?: string | Placeholder | EmptyFilter;
	isNull?: true | EmptyFilter;
	isNotNull?: true | EmptyFilter;
	NOT?: RelationsFieldFilter<T> | EmptyFilter;
	OR?: (RelationsFieldFilter<T> | EmptyFilter)[] | EmptyFilter;
	AND?: (RelationsFieldFilter<T> | EmptyFilter)[] | EmptyFilter;
}

export type Primitive = string | number | bigint | boolean | symbol | null | undefined;

export type RelationsFieldFilter<T = unknown> =
	| RelationFieldsFilterInternals<T>
	| (
		unknown extends T ? never : T extends Primitive ? T : never
	)
	| Placeholder;

export interface RelationsFilterCommons<
	TTable extends TableRelationalConfig = TableRelationalConfig,
	TSchema extends TablesRelationalConfig = TablesRelationalConfig,
> {
	OR?: (RelationsFilter<TTable, TSchema> | EmptyFilter)[] | EmptyFilter;
	NOT?: RelationsFilter<TTable, TSchema> | EmptyFilter;
	AND?: (RelationsFilter<TTable, TSchema> | EmptyFilter)[] | EmptyFilter;
	RAW?:
		| SQLWrapper
		| ((
			table: TTable['table'],
			operators: Operators,
		) => SQL | EmptyFilter)
		| EmptyFilter;
}

export type RelationsFilterColumns<
	TColumns extends Record<string, unknown>,
> = {
	[K in keyof TColumns]?:
		| (TColumns[K] extends { _: { data: infer Data } } ? RelationsFieldFilter<Data>
			: RelationsFieldFilter<unknown>)
		| EmptyFilter;
};

export type RelationsFilterRelations<
	TTable extends TableRelationalConfig,
	TSchema extends TablesRelationalConfig,
	TRelations extends RelationsRecord = TTable['relations'],
> = {
	[K in keyof TRelations]?:
		| boolean
		| RelationsFilter<FindTargetTableInRelationalConfig<TSchema, TRelations[K]>, TSchema>
		| EmptyFilter;
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
	OR?: (TableFilter<TTable, TColumns> | EmptyFilter)[] | EmptyFilter;
	NOT?: TableFilter<TTable, TColumns> | EmptyFilter;
	AND?: (TableFilter<TTable, TColumns> | EmptyFilter)[] | EmptyFilter;
	RAW?:
		| SQLWrapper
		| ((
			table: TTable,
			operators: Operators,
		) => SQL | EmptyFilter)
		| EmptyFilter;
}

export type TableFilterColumns<
	TColumns extends Record<string, unknown>,
> = {
	[K in keyof TColumns]?:
		| (TColumns[K] extends { _: { data: infer Data } } ? RelationsFieldFilter<Data>
			: RelationsFieldFilter<unknown>)
		| EmptyFilter;
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

export interface OneConfig<TTargetTable extends SchemaEntry, TOptional extends boolean> {
	from?: RelationsBuilderColumnBase | [RelationsBuilderColumnBase, ...RelationsBuilderColumnBase[]];
	to?: RelationsBuilderColumnBase | [RelationsBuilderColumnBase, ...RelationsBuilderColumnBase[]];
	where?: TableFilter<TTargetTable> | EmptyFilter;
	optional?: TOptional;
	alias?: string;
}

export type AnyOneConfig = OneConfig<
	SchemaEntry,
	boolean
>;

export interface ManyConfig<TTargetTable extends SchemaEntry> {
	from?: RelationsBuilderColumnBase | [RelationsBuilderColumnBase, ...RelationsBuilderColumnBase[]];
	to?: RelationsBuilderColumnBase | [RelationsBuilderColumnBase, ...RelationsBuilderColumnBase[]];
	where?: TableFilter<TTargetTable> | EmptyFilter;
	alias?: string;
}

export type AnyManyConfig = ManyConfig<SchemaEntry>;

export interface OneFn<TTargetTable extends SchemaEntry, TTargetTableName extends string> {
	<TOptional extends boolean = true>(config?: OneConfig<TTargetTable, TOptional>): One<TTargetTableName, TOptional>;
}

export interface ManyFn<TTargetTable extends SchemaEntry, TTargetTableName extends string> {
	(config?: ManyConfig<TTargetTable>): Many<TTargetTableName>;
}

export class RelationsHelperStatic<TTables extends Schema> {
	static readonly [entityKind]: string = 'RelationsHelperStatic';
	static [Symbol.hasInstance](value: unknown): boolean {
		return is(value, this);
	}

	constructor(tables: TTables) {
		const one: Record<string, OneFn<TTables[string], string>> = {};
		const many: Record<string, ManyFn<TTables[string], string>> = {};

		for (const [tableName, table] of Object.entries(tables)) {
			one[tableName] = (config) => {
				return new One(tables, table, tableName, config as unknown as AnyOneConfig);
			};

			many[tableName] = (config) => {
				return new Many(tables, table, tableName, config as AnyManyConfig);
			};
		}

		this.one = one as any as this['one'];
		this.many = many as any as this['many'];
	}

	one: {
		[K in keyof TTables]: TTables[K] extends FilteredSchemaEntry ? OneFn<TTables[K], K & string>
			: DrizzleTypeError<
				'Views and subqueries with nested selections are not supported by the relational query builder'
			>;
	};

	many: {
		[K in keyof TTables]: TTables[K] extends FilteredSchemaEntry ? ManyFn<TTables[K], K & string>
			: DrizzleTypeError<
				'Views and subqueries with nested selections are not supported by the relational query builder'
			>;
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
		TTableName
	>;
};

export type RelationsBuilderTables<TSchema extends Schema> = {
	[TTableName in keyof TSchema]: TSchema[TTableName] extends FilteredSchemaEntry ? (
			& RelationsBuilderColumns<TSchema[TTableName], TTableName & string>
			& RelationsBuilderTable<TTableName & string>
		)
		: DrizzleTypeError<'Views and subqueries with nested selections are not supported by the relational query builder'>;
};

export type RelationsBuilder<TSchema extends Schema> =
	& RelationsBuilderTables<TSchema>
	& RelationsHelperStatic<TSchema>;

export type RelationsBuilderConfigValue =
	| RelationsRecord
	| undefined;

export type RelationsBuilderConfig<TTables extends Schema> = {
	[TTableName in keyof TTables]?: RelationsBuilderConfigValue;
};

export type AnyRelationsBuilderConfig = Record<string, RelationsBuilderConfigValue>;

export type ExtractTablesFromSchema<TSchema extends Record<string, unknown>> = {
	[K in keyof TSchema as TSchema[K] extends SchemaEntry ? K extends string ? K : never : never]: Assume<
		TSchema[K],
		SchemaEntry
	>;
};

export function createRelationsHelper<
	TTables extends Schema,
>(tables: TTables): RelationsBuilder<TTables> {
	const helperStatic = new RelationsHelperStatic(tables);
	const relationsTables = Object.entries(tables).reduce<Record<string, RelationsBuilderTable>>((acc, [tKey, value]) => {
		const rTable = new RelationsBuilderTable(value, tKey);
		const columns = Object.entries(value[TableColumns]).reduce<
			Record<string, RelationsBuilderColumnBase>
		>(
			(acc, [cKey, column]) => {
				const rbColumn = new RelationsBuilderColumn(column as FieldValue, tKey, cKey);
				acc[cKey] = rbColumn;
				return acc;
			},
			{},
		);

		acc[tKey] = Object.assign(rTable, columns);

		return acc;
	}, {});

	return Object.assign(helperStatic, relationsTables) as any;
}

export function extractTablesFromSchema<TSchema extends Record<string, unknown>>(
	schema: TSchema,
): ExtractTablesFromSchema<TSchema> {
	return Object.fromEntries(
		Object.entries(schema).filter(([_, e]) => is(e, Table) || is(e, View) || is(e, Subquery)),
	) as ExtractTablesFromSchema<TSchema>;
}

export type IncludeEveryTable<TTables extends Schema> = { [K in keyof TTables]: {} };

/** Builds relational config for every table in schema */
export function defineRelations<
	TSchema extends Record<string, unknown>,
	TTables extends Schema = ExtractTablesFromSchema<TSchema>,
>(
	schema: TSchema,
): ExtractTablesWithRelations<{}, TTables>;
/** Builds relational config for every table in schema */
export function defineRelations<
	TSchema extends Record<string, unknown>,
	TConfig extends RelationsBuilderConfig<TTables>,
	TTables extends Schema = ExtractTablesFromSchema<TSchema>,
>(
	schema: TSchema,
	relations: (helpers: RelationsBuilder<TTables>) => TConfig,
): ExtractTablesWithRelations<TConfig, TTables>;
export function defineRelations(
	schema: Record<string, unknown>,
	relations?: (helpers: RelationsBuilder<Schema>) => AnyRelationsBuilderConfig,
): TablesRelationalConfig {
	const tables = extractTablesFromSchema(schema);
	const config = relations
		? relations(
			createRelationsHelper(tables) as RelationsBuilder<Schema>,
		)
		: {};

	return buildRelations(tables, config);
}

/** Builds relational config for every table in schema */
export function defineRelationsPart<
	TSchema extends Record<string, unknown>,
	TTables extends Schema = ExtractTablesFromSchema<TSchema>,
>(
	schema: TSchema,
): ExtractTablesWithRelationsParts<IncludeEveryTable<TTables>, TTables>;
/** Builds relational config only for tables present in relational config */
export function defineRelationsPart<
	TSchema extends Record<string, unknown>,
	TConfig extends RelationsBuilderConfig<TTables>,
	TTables extends Schema = ExtractTablesFromSchema<TSchema>,
>(
	schema: TSchema,
	relations: (helpers: RelationsBuilder<TTables>) => TConfig,
): ExtractTablesWithRelationsParts<TConfig, TTables>;
export function defineRelationsPart(
	schema: Record<string, unknown>,
	relations?: (helpers: RelationsBuilder<Schema>) => AnyRelationsBuilderConfig,
): TablesRelationalConfig {
	const tables = extractTablesFromSchema(schema);
	const config = relations
		? relations(
			createRelationsHelper(tables) as RelationsBuilder<Schema>,
		)
		: Object.fromEntries(Object.keys(tables).map((k) => [k, {}])) as AnyRelationsBuilderConfig;

	return buildRelationsParts(tables, config);
}

export interface WithContainer {
	with?: Record<string, boolean | AnyDBQueryConfig | undefined>;
}

export interface ColumnWithTSName {
	column: Table | View | Column<any> | SQL | SQLWrapper | SQL.Aliased;
	tsName: string;
}

export type RelationsOrder<TColumns extends FieldSelection> = {
	[K in keyof TColumns]?: 'asc' | 'desc';
};

export type OrderBy = Exclude<AnyDBQueryConfig['orderBy'], undefined>;

export type Extras = Exclude<AnyDBQueryConfig['extras'], undefined>;

/** @internal */
export function fieldSelectionToSQL(table: SchemaEntry, target: string): Column | SQL {
	const field = table[TableColumns][target];
	const kind = chunkKindOf(field);
	if (isChunk(field, kind, chunkKinds.column)) return field;

	return new SQL([
		table,
		commonStringChunks['.'],
		sql.identifier(isChunk(field, kind, chunkKinds.aliased) ? field.fieldAlias : target),
	]);
}

class ConditionsCollector {
	static readonly [entityKind]: string = 'ConditionsCollector';
	static [Symbol.hasInstance](value: unknown): boolean {
		return is(value, this);
	}

	private readonly start: number;
	private count = 0;
	private mark = 0;
	private conditionStart = 0;

	constructor(private readonly chunks: SQLChunk[], private readonly separator: StringChunk) {
		this.start = chunks.length;
		// Reserved for opening parentheses, filled once there are multiple conditions
		chunks.push(undefined);
	}

	/** Must be called before pushing a condition's chunks */
	open(): void {
		this.mark = this.chunks.length;
		if (this.count) this.chunks.push(this.separator);
		this.conditionStart = this.chunks.length;
	}

	/** Must be called after pushing a condition's chunks, drops the condition if nothing was pushed */
	close(): void {
		if (this.chunks.length === this.conditionStart) {
			this.chunks.length = this.mark;
			return;
		}

		++this.count;
	}

	push(condition: SQLChunk): void {
		if (condition === undefined) return;

		if (this.count) this.chunks.push(this.separator);
		this.chunks.push(condition);
		++this.count;
	}

	pushChunks(condition: SQLChunk[] | undefined): void {
		if (!condition?.length) return;

		if (this.count) this.chunks.push(this.separator);
		for (let i = 0; i < condition.length; ++i) this.chunks.push(condition[i]);
		++this.count;
	}

	/** Returns whether any condition was collected, removes reserved chunk otherwise */
	finish(): boolean {
		if (!this.count) {
			this.chunks.length = this.start;
			return false;
		}

		if (this.count > 1) {
			this.chunks[this.start] = commonStringChunks['(('];
			this.chunks.push(commonStringChunks['))']);
		}

		return true;
	}
}

function relationsFieldFilterToSQL(
	column: SQLWrapper,
	filter: RelationsFieldFilter<unknown> | EmptyFilter | undefined,
	collectTo: SQLChunk[] = [],
): SQLChunk[] | undefined {
	if (filter === EmptyFilter) return undefined;
	if (filter === undefined) {
		throw new Error(
			`Unexpected 'undefined' in filter value. Use 'EmptyFilter' if you want the filter field to be skipped.`,
		);
	}
	if (typeof filter !== 'object' || is(filter, Placeholder)) {
		collectTo.push(eq(column, filter));
		return collectTo;
	}

	const entries = Object.entries(filter as RelationFieldsFilterInternals<unknown>);
	if (!entries.length) return undefined;

	const conditions = new ConditionsCollector(collectTo, commonStringChunks[') and (']);
	for (const [target, value] of entries) {
		if (value === EmptyFilter) continue;
		if (value === undefined) {
			throw new Error(
				`Unexpected 'undefined' in filter value. Use 'EmptyFilter' if you want the filter field to be skipped.`,
			);
		}

		switch (target as keyof RelationFieldsFilterInternals<unknown>) {
			case 'NOT': {
				conditions.open();
				const notStart = collectTo.length;
				collectTo.push(commonStringChunks['not (']);
				relationsFieldFilterToSQL(column, value as RelationsFieldFilter<unknown>, collectTo);
				if (collectTo.length === notStart + 1) collectTo.length = notStart;
				else collectTo.push(commonStringChunks[')']);
				conditions.close();

				continue;
			}

			case 'OR':
			case 'AND': {
				const subFilters = value as RelationsFieldFilter<unknown>[];
				if (!subFilters.length) {
					throw new Error(
						`Unexpected empty array in filters' '${target}' section. Omit field or use 'EmptyFilter' if you want filter to be skipped.`,
					);
				}

				conditions.open();
				const subConditions = new ConditionsCollector(
					collectTo,
					target === 'OR' ? commonStringChunks[') or ('] : commonStringChunks[') and ('],
				);
				for (const subFilter of subFilters) {
					subConditions.open();
					relationsFieldFilterToSQL(column, subFilter, collectTo);
					subConditions.close();
				}
				subConditions.finish();
				conditions.close();

				continue;
			}

			case 'isNotNull':
			case 'isNull': {
				if (!value) continue;

				conditions.push(operators[target as 'isNull' | 'isNotNull'](column));

				continue;
			}

			case 'in': {
				conditions.push(operators.inArray(column, value as any[] | Placeholder));

				continue;
			}

			case 'notIn': {
				conditions.push(operators.notInArray(column, value as any[] | Placeholder));

				continue;
			}

			default: {
				conditions.push(
					(operators[target as keyof typeof operators] as ((col: SQLWrapper, data: any) => SQL | undefined))(
						column,
						value,
					),
				);

				continue;
			}
		}
	}

	return conditions.finish() ? collectTo : undefined;
}

export type BuiltRelationsFilter = {
	/** Chunks collection filter was pushed to, `undefined` if filter is empty */
	sql: SQLChunk[] | undefined;
	hasRelationFilters: boolean;
};

export function relationsFilterToSQL(
	table: SchemaEntry,
	filter: AnyRelationsFilter | AnyTableFilter | undefined | EmptyFilter,
): BuiltRelationsFilter;
export function relationsFilterToSQL(
	table: SchemaEntry,
	filter: AnyRelationsFilter | AnyTableFilter | undefined | EmptyFilter,
	tableRelations: RelationsRecord,
	tablesRelations: TablesRelationalConfig,
	withSubqueries: RelationalWithSubqueries | undefined,
	depth?: number,
	collectTo?: SQLChunk[],
): BuiltRelationsFilter;
export function relationsFilterToSQL(
	table: SchemaEntry,
	filter: AnyRelationsFilter | AnyTableFilter | undefined | EmptyFilter,
	tableRelations: RelationsRecord = {},
	tablesRelations: TablesRelationalConfig = {},
	withSubqueries?: RelationalWithSubqueries,
	depth: number = 0,
	collectTo: SQLChunk[] = [],
): BuiltRelationsFilter {
	if (filter === EmptyFilter) return { sql: undefined, hasRelationFilters: false };
	if (filter === undefined) {
		throw new Error(
			`Unexpected 'undefined' in filter value. Use 'EmptyFilter' if you want the filter field to be skipped.`,
		);
	}
	const entries = Object.entries(filter);
	if (!entries.length) return { sql: undefined, hasRelationFilters: false };

	const conditions = new ConditionsCollector(collectTo, commonStringChunks[') and (']);
	let hasRelationFilters = false;
	const buildNested = (subFilter: AnyRelationsFilter) => {
		const built = relationsFilterToSQL(
			table,
			subFilter,
			tableRelations,
			tablesRelations,
			withSubqueries,
			depth,
			collectTo,
		);
		if (built.hasRelationFilters) hasRelationFilters = true;
	};

	for (const [target, value] of entries) {
		if (value === EmptyFilter) continue;
		if (value === undefined) {
			throw new Error(
				`Unexpected 'undefined' in filter value. Use 'EmptyFilter' if you want the filter field to be skipped.`,
			);
		}

		switch (target) {
			case 'RAW': {
				const processed = typeof value === 'function'
					? (value as unknown as (table: FieldSelection, operators: Operators) => SQL | EmptyFilter)(
						table as any,
						operators,
					)
					: (value as SQLWrapper).getSQL();
				if (processed === EmptyFilter) continue;

				conditions.push(processed);
				hasRelationFilters = true;

				continue;
			}
			case 'OR':
			case 'AND': {
				const subFilters = value as AnyRelationsFilter[];
				if (!subFilters.length) {
					throw new Error(
						`Unexpected empty array in filters' '${target}' section. Omit field or use 'EmptyFilter' if you want filter to be skipped.`,
					);
				}

				conditions.open();
				const subConditions = new ConditionsCollector(
					collectTo,
					target === 'OR' ? commonStringChunks[') or ('] : commonStringChunks[') and ('],
				);
				for (const subFilter of subFilters) {
					subConditions.open();
					buildNested(subFilter);
					subConditions.close();
				}
				subConditions.finish();
				conditions.close();

				continue;
			}
			case 'NOT': {
				conditions.open();
				const notStart = collectTo.length;
				collectTo.push(commonStringChunks['not (']);
				buildNested(value as AnyRelationsFilter);
				if (collectTo.length === notStart + 1) collectTo.length = notStart;
				else collectTo.push(commonStringChunks[')']);
				conditions.close();

				continue;
			}
			default: {
				if (Object.prototype.hasOwnProperty.call(table[TableColumns], target) && table[TableColumns][target]) {
					conditions.open();
					relationsFieldFilterToSQL(
						fieldSelectionToSQL(table, target),
						value as RelationsFieldFilter,
						collectTo,
					);
					conditions.close();

					continue;
				}

				const relation = Object.prototype.hasOwnProperty.call(tableRelations, target)
					? tableRelations[target]
					: undefined;
				if (!relation) {
					// Should never trigger unless the types've been violated
					throw new DrizzleError({
						message: `Unknown relational filter field: "${target}"`,
					});
				}

				if (withSubqueries) {
					collectRelationalSubquery(withSubqueries, relation.targetTable);
					collectRelationalSubquery(withSubqueries, relation.throughTable);
				}

				const targetTable = aliasedTable(relation.targetTable, `f${depth}`);
				const throughTable = relation.throughTable ? aliasedTable(relation.throughTable, `ft${depth}`) : undefined;
				const targetConfig = tablesRelations[relation.targetTableName]!;
				const isExistsOnly = typeof value === 'boolean';

				conditions.open();
				const conditionStart = collectTo.length;
				collectTo.push(
					value ? commonStringChunks['exists (select * from '] : commonStringChunks['not exists (select * from '],
				);
				getTableAsAliasSQL(targetTable, collectTo);
				if (throughTable) {
					collectTo.push(commonStringChunks[' inner join ']);
					getTableAsAliasSQL(throughTable, collectTo);
					collectTo.push(commonStringChunks[' on ']);
				}
				const { filter: relationFilter } = relationToSQL(relation, table, targetTable, throughTable, [], collectTo);

				collectTo.push(commonStringChunks[' where ']);
				const where = new ConditionsCollector(collectTo, commonStringChunks[') and (']);
				where.pushChunks(relationFilter);
				if (!isExistsOnly) {
					where.open();
					const subfilter = relationsFilterToSQL(
						targetTable,
						value as AnyRelationsFilter,
						targetConfig.relations,
						tablesRelations,
						withSubqueries,
						depth + 1,
						collectTo,
					);
					where.close();

					// Relation filter without conditions is skipped
					if (!subfilter.sql) {
						collectTo.length = conditionStart;
						conditions.close();
						continue;
					}
				}
				where.finish();
				collectTo.push(commonStringChunks[')']);
				conditions.close();
				hasRelationFilters = true;
			}
		}
	}

	return { sql: conditions.finish() ? collectTo : undefined, hasRelationFilters };
}

const relationsOrderAggregates: ReadonlySet<string> = new Set<RelationsOrderAggregate>([
	'min',
	'max',
	'count',
	'avg',
	'first',
]);

export function parseRelationsOrderValue(
	value: unknown,
	path: string,
): { direction: RelationsOrderDirection; aggregate?: RelationsOrderAggregate } {
	if (typeof value !== 'string') {
		throw new DrizzleError({
			message: `Invalid order "${path}": expected a string, got ${value === null ? 'null' : typeof value}`,
		});
	}

	const parts = value.split('(');
	const direction = parts[0];
	if (direction !== 'asc' && direction !== 'desc') {
		throw new DrizzleError({
			message: `Invalid order "${path}": unknown direction "${direction}" in "${value}", expected "asc" or "desc"`,
		});
	}
	if (parts.length === 1) return { direction };

	if (parts.length > 2 || !parts[1]!.endsWith(')')) {
		throw new DrizzleError({
			message:
				`Invalid order "${path}": malformed value "${value}", expected "${direction}" or "${direction}(<aggregate>)"`,
		});
	}

	const aggregate = parts[1]!.slice(0, -1);
	if (!relationsOrderAggregates.has(aggregate)) {
		throw new DrizzleError({
			message: `Invalid order "${path}": unknown aggregate "${aggregate}" in "${value}", expected one of: ${
				[...relationsOrderAggregates].join(', ')
			}`,
		});
	}

	return { direction, aggregate: aggregate as RelationsOrderAggregate };
}

export type RelationsOrderSource = {
	/** Relations' tables between the ordered table and the field */
	from: SQLChunk[];
	filters: SQLChunk[][];
	/** Whether there's a `many` relation on the way: fields have to be aggregated */
	isAggregated: boolean;
	depth: number;
	path: string;
};

export function relationsOrderEntriesToSQL(
	table: SchemaEntry,
	orders: AnyRelationsOrder,
	tableRelations: RelationsRecord,
	tablesRelations: TablesRelationalConfig,
	withSubqueries: RelationalWithSubqueries | undefined,
	/** 'top' for MSSQL, 'limit' for rest */
	singleRowLimit: 'limit' | 'top',
	source: RelationsOrderSource | undefined,
	collectTo: SQLChunk[],
	/** Index of `collectTo` order starts at, orders after it are separated by commas */
	start: number = collectTo.length,
): SQLChunk[] {
	for (const [target, value] of Object.entries(orders)) {
		if (!value) continue;

		const path = source ? `${source.path}.${target}` : target;

		if (Object.prototype.hasOwnProperty.call(table[TableColumns], target) && table[TableColumns][target]) {
			const { direction, aggregate } = parseRelationsOrderValue(value, path);
			if (!!aggregate !== !!source?.isAggregated) {
				throw new DrizzleError({
					message: `Invalid order "${path}": expected ${
						source?.isAggregated
							? '"asc(<aggregate>)" or "desc(<aggregate>)", with aggregate being one of: min, max, count, avg, first'
							: '"asc" or "desc"'
					}, got "${value}"`,
				});
			}

			const column = fieldSelectionToSQL(table, target);
			if (collectTo.length > start) collectTo.push(commonStringChunks[', ']);
			if (!source) {
				collectTo.push(column, direction === 'asc' ? commonStringChunks[' asc'] : commonStringChunks[' desc']);
				continue;
			}

			const isSingleRowLimited = !aggregate || aggregate === 'first';
			collectTo.push(commonStringChunks['(select ']);
			if (isSingleRowLimited) {
				if (singleRowLimit === 'top') collectTo.push(commonStringChunks['top(1) ']);
				collectTo.push(column);
			} else {
				collectTo.push(commonStringChunks[`${aggregate!}(`], column, commonStringChunks[')']);
			}
			collectTo.push(commonStringChunks[' from ']);
			for (let i = 0; i < source.from.length; ++i) collectTo.push(source.from[i]);
			const whereStart = collectTo.length;
			collectTo.push(commonStringChunks[' where ']);
			const where = new ConditionsCollector(collectTo, commonStringChunks[') and (']);
			for (let i = 0; i < source.filters.length; ++i) where.pushChunks(source.filters[i]);
			if (!where.finish()) collectTo.length = whereStart;
			if (isSingleRowLimited && singleRowLimit === 'limit') collectTo.push(commonStringChunks[' limit 1']);
			collectTo.push(
				commonStringChunks[')'],
				direction === 'asc' ? commonStringChunks[' asc'] : commonStringChunks[' desc'],
			);

			continue;
		}

		const relation = Object.prototype.hasOwnProperty.call(tableRelations, target)
			? tableRelations[target]
			: undefined;
		if (!relation) {
			// Should never trigger unless the types've been violated
			throw new DrizzleError({ message: `Unknown relational order field: "${path}"` });
		}
		const count = relation.relationType === 'many' && typeof value === 'string'
			? parseRelationsOrderValue(value, path)
			: undefined;
		const countDirection = count?.aggregate === 'count' ? count.direction : undefined;
		if (typeof value !== 'object' && !countDirection) {
			throw new DrizzleError({
				message: `Invalid order "${path}": expected an object with fields of relation to order by${
					relation.relationType === 'many' ? ', "asc(count)" or "desc(count)"' : ''
				}, got "${value}"`,
			});
		}

		if (withSubqueries) {
			collectRelationalSubquery(withSubqueries, relation.targetTable);
			collectRelationalSubquery(withSubqueries, relation.throughTable);
		}

		const depth = source?.depth ?? 0;
		const targetTable = aliasedTable(relation.targetTable, `o${depth}`);
		const throughTable = relation.throughTable ? aliasedTable(relation.throughTable, `ot${depth}`) : undefined;

		const from: SQLChunk[] = source ? [...source.from, commonStringChunks[' cross join ']] : [];
		getTableAsAliasSQL(targetTable, from);
		if (throughTable) {
			from.push(commonStringChunks[' inner join ']);
			getTableAsAliasSQL(throughTable, from);
			from.push(commonStringChunks[' on ']);
		}
		const { filter } = relationToSQL(relation, table, targetTable, throughTable, [], from);
		const filters = source ? [...source.filters, filter] : [filter];

		if (typeof value !== 'object') {
			if (collectTo.length > start) collectTo.push(commonStringChunks[', ']);
			collectTo.push(commonStringChunks['(select count(*) from ']);
			for (let i = 0; i < from.length; ++i) collectTo.push(from[i]);
			const whereStart = collectTo.length;
			collectTo.push(commonStringChunks[' where ']);
			const where = new ConditionsCollector(collectTo, commonStringChunks[') and (']);
			for (let i = 0; i < filters.length; ++i) where.pushChunks(filters[i]);
			if (!where.finish()) collectTo.length = whereStart;
			collectTo.push(
				commonStringChunks[')'],
				countDirection === 'asc' ? commonStringChunks[' asc'] : commonStringChunks[' desc'],
			);

			continue;
		}

		relationsOrderEntriesToSQL(
			targetTable,
			value,
			tablesRelations[relation.targetTableName]?.relations ?? {},
			tablesRelations,
			withSubqueries,
			singleRowLimit,
			{
				from,
				filters,
				isAggregated: !!source?.isAggregated || relation.relationType === 'many',
				depth: depth + 1,
				path,
			},
			collectTo,
			start,
		);
	}

	return collectTo;
}

/** Returns chunks collection order was pushed to, `undefined` if order is empty */
export function relationsOrderToSQL(
	table: SchemaEntry,
	orders: OrderBy,
): SQLChunk[] | undefined;
export function relationsOrderToSQL(
	table: SchemaEntry,
	orders: OrderBy,
	tableRelations: RelationsRecord,
	tablesRelations: TablesRelationalConfig,
	withSubqueries: RelationalWithSubqueries | undefined,
	/** 'top' for MSSQL, 'limit' for rest */
	singleRowLimit?: 'limit' | 'top',
	collectTo?: SQLChunk[],
): SQLChunk[] | undefined;
export function relationsOrderToSQL(
	table: SchemaEntry,
	orders: OrderBy,
	tableRelations: RelationsRecord = {},
	tablesRelations: TablesRelationalConfig = {},
	withSubqueries?: RelationalWithSubqueries,
	/** 'top' for MSSQL, 'limit' for rest */
	singleRowLimit: 'limit' | 'top' = 'limit',
	collectTo: SQLChunk[] = [],
): SQLChunk[] | undefined {
	const start = collectTo.length;

	if (typeof orders === 'function') {
		const data = orders(table as any, orderByOperators);
		if (!data) return undefined;

		const kind = chunkKindOf(data);
		if (isChunk(data, kind, chunkKinds.sql)) {
			collectTo.push(data);
		} else if (Array.isArray(data)) {
			for (let i = 0; i < data.length; ++i) {
				if (i) collectTo.push(commonStringChunks[', ']);

				const item = data[i];
				collectTo.push(item);
				if (chunkKindOf(item) !== chunkKinds.sql) collectTo.push(commonStringChunks[' asc']);
			}
		} else if (isChunk(data, kind, chunkKinds.column)) {
			collectTo.push(data, commonStringChunks[' asc']);
		}

		return collectTo.length > start ? collectTo : undefined;
	}

	relationsOrderEntriesToSQL(
		table,
		orders,
		tableRelations,
		tablesRelations,
		withSubqueries,
		singleRowLimit,
		undefined,
		collectTo,
		start,
	);

	return collectTo.length > start ? collectTo : undefined;
}

export function relationExtrasToSQL(
	table: SchemaEntry,
	extras: Extras,
	codecs?: CodecsCollection,
	inJson?: boolean,
	collectTo: SQLChunk[] = [],
): {
	/** Chunks collection extras were pushed to, `undefined` if there are none */
	sql: SQLChunk[] | undefined;
	selection: BuildRelationalQueryResult['selection'];
} {
	const start = collectTo.length;
	const selection: BuildRelationalQueryResult['selection'] = [];

	for (
		const [key, field] of Object.entries(extras)
	) {
		const extra = typeof field === 'function' ? field(table as any, { sql: operators.sql }) : field;
		if (!extra) continue;

		const subq = extra.getSQL();
		const column = codecs ? getColumnFromDecoder(subq) : undefined;
		// Codec bypass for custom columns with enabled legacy JSON api
		const query = column && (!inJson || !(<any> column).jsonSelectIdentifier)
			? new SQL([
				codecs!.apply(
					column,
					inJson ? 'castInJson' : 'cast',
					new SQL([commonStringChunks['('], subq, commonStringChunks[')']]),
				),
				commonStringChunks[' as '],
				sql.identifier(key),
			])
			: new SQL([commonStringChunks['('], subq, commonStringChunks[') as '], sql.identifier(key)]);
		query.decoder = subq.decoder;

		if (collectTo.length > start) collectTo.push(commonStringChunks[', ']);
		collectTo.push(query);
		selection.push(
			// Codec bypass for custom columns with enabled legacy JSON api
			column && (!inJson || !(<any> column).mapFromJsonValue)
				? {
					key,
					field: query,
					fieldType: 'SQL',
					codec: codecs!.get(column, inJson ? 'normalizeInJson' : 'normalize'),
					arrayDimensions: (<any> column).dimensions,
				}
				: {
					key,
					field: query,
					fieldType: 'SQL',
				},
		);
	}

	return {
		sql: collectTo.length > start ? collectTo : undefined,
		selection,
	};
}

function relationFieldIdentifier({ _: { column, key } }: RelationsBuilderColumnBase): Name {
	const kind = chunkKindOf(column);

	return sql.identifier(
		isChunk(column, kind, chunkKinds.column)
			? column.name
			: isChunk(column, kind, chunkKinds.aliased)
			? column.fieldAlias
			: key,
	);
}

/** Pushes `"left"."field" = "right"."field"` as a condition */
function collectRelationFieldsEquality(
	conditions: ConditionsCollector,
	collectTo: SQLChunk[],
	leftTable: SchemaEntry,
	leftField: RelationsBuilderColumnBase,
	rightTable: SchemaEntry,
	rightField: RelationsBuilderColumnBase,
): void {
	conditions.open();
	collectTo.push(
		leftTable,
		commonStringChunks['.'],
		relationFieldIdentifier(leftField),
		commonStringChunks[' = '],
		rightTable,
		commonStringChunks['.'],
		relationFieldIdentifier(rightField),
	);
	conditions.close();
}

export interface BuiltRelationFilters {
	/** Chunks collection relation's filter was pushed to */
	filter: SQLChunk[];
	/** Chunks collection join condition of relation's junction table was pushed to */
	joinCondition?: SQLChunk[];
}

export function relationToSQL(
	relation: Relation,
	sourceTable: SchemaEntry,
	targetTable: SchemaEntry,
	throughTable?: SchemaEntry,
	filterTo: SQLChunk[] = [],
	joinConditionTo: SQLChunk[] = [],
): BuiltRelationFilters {
	const whereTable = relation.isFilterReversed ? sourceTable : targetTable;
	const filter = new ConditionsCollector(filterTo, commonStringChunks[') and (']);

	if (relation.through) {
		const { sourceColumns, targetColumns, through: { source, target } } = relation as Relation & {
			through: NonNullable<Relation['through']>;
		};

		filter.open();
		relationsFilterToSQL(whereTable, relation.where, {}, {}, undefined, 0, filterTo);
		filter.close();
		for (let i = 0; i < sourceColumns.length; ++i) {
			collectRelationFieldsEquality(filter, filterTo, sourceTable, sourceColumns[i]!, throughTable!, source[i]!);
		}
		filter.finish();

		const joinCondition = new ConditionsCollector(joinConditionTo, commonStringChunks[') and (']);
		for (let i = 0; i < targetColumns.length; ++i) {
			collectRelationFieldsEquality(
				joinCondition,
				joinConditionTo,
				throughTable!,
				target[i]!,
				targetTable,
				targetColumns[i]!,
			);
		}
		joinCondition.finish();

		return { filter: filterTo, joinCondition: joinConditionTo };
	}

	const { sourceColumns, targetColumns } = relation;
	for (let i = 0; i < sourceColumns.length; ++i) {
		collectRelationFieldsEquality(filter, filterTo, sourceTable, sourceColumns[i]!, targetTable, targetColumns[i]!);
	}
	filter.open();
	relationsFilterToSQL(whereTable, relation.where, {}, {}, undefined, 0, filterTo);
	filter.close();
	filter.finish();

	return { filter: filterTo };
}

/**
 * @internal
 * Pushes `where` of relational query: its own filter and filter of relation it's queried through
 */
export function relationalQueryWhereToSQL(
	table: SchemaEntry,
	params: { where?: unknown } | undefined,
	tableRelations: RelationsRecord,
	tablesRelations: TablesRelationalConfig,
	withSubqueries: RelationalWithSubqueries,
	relationWhere: SQLChunk[] | undefined,
	collectTo: SQLChunk[] = [],
): BuiltRelationsFilter {
	const conditions = new ConditionsCollector(collectTo, commonStringChunks[') and (']);
	let hasRelationFilters = false;
	if (params && 'where' in params) {
		conditions.open();
		hasRelationFilters = relationsFilterToSQL(
			table,
			params.where as AnyRelationsFilter,
			tableRelations,
			tablesRelations,
			withSubqueries,
			0,
			collectTo,
		).hasRelationFilters;
		conditions.close();
	}
	conditions.pushChunks(relationWhere);

	return { sql: conditions.finish() ? collectTo : undefined, hasRelationFilters };
}

/** Legacy JSON api of custom columns */
interface RqbCustomColumn {
	readonly mapFromJsonValue?: (value: unknown) => unknown;
	readonly jsonSelectIdentifier?: (identifier: SQL, sql: SQLGenerator, arrayDimensions?: number) => SQL;
	readonly dimensions?: number;
}

function collectRqbFieldSelection(
	collectTo: SQLChunk[],
	table: SchemaEntry,
	name: string,
	key: string,
	codecs: CodecsCollection,
	decoderColumn: Column | undefined,
	inJson: boolean,
): void {
	if (decoderColumn) {
		collectTo.push(
			codecs.apply(
				decoderColumn,
				inJson ? 'castInJson' : 'cast',
				new SQL([table, commonStringChunks['.'], sql.identifier(name)]),
			),
		);
	} else {
		collectTo.push(table, commonStringChunks['.'], sql.identifier(name));
	}

	collectTo.push(commonStringChunks[' as '], sql.identifier(key));
}

/** Pushes field of table selected by relational query, adds it to `selection` */
export function buildRqbColumn(
	table: SchemaEntry,
	field: unknown,
	key: string,
	inJson: boolean,
	selection: BuildRelationalQueryResult['selection'],
	tableTsName: string,
	codecs: CodecsCollection,
	collectTo: SQLChunk[],
): void {
	let decoderColumn: Column | undefined;
	let subqueryDecoder: DriverValueDecoder<any, any> | undefined;
	let fieldType: BuildRelationalQueryResult['selection'][number]['fieldType'];

	const kind = chunkKindOf(field);
	if (isChunk(field, kind, chunkKinds.column)) {
		decoderColumn = field;
		fieldType = 'Column';

		const { jsonSelectIdentifier, dimensions } = field as Column & RqbCustomColumn;
		const cast = inJson && jsonSelectIdentifier
			? undefined
			: codecs.codecsOf(field)[inJson ? 'castInJson' : 'cast'];
		if (cast || (inJson && jsonSelectIdentifier)) {
			const name = new SQL([table, commonStringChunks['.'], sql.identifier(field.name)]);
			const casted = cast
				? cast(name, dimensions!)
				: jsonSelectIdentifier!.call(field, name, sql, dimensions);
			collectTo.push(casted, commonStringChunks[' as '], sql.identifier(key));
		} else {
			collectTo.push(
				table,
				commonStringChunks['.'],
				sql.identifier(field.name),
				commonStringChunks[' as '],
				sql.identifier(key),
			);
		}
	} else if (isChunk(field, kind, chunkKinds.sql)) {
		decoderColumn = getColumnFromDecoder(field);
		fieldType = 'SQL';

		collectRqbFieldSelection(collectTo, table, key, key, codecs, decoderColumn, inJson);
	} else if (isChunk(field, kind, chunkKinds.aliased)) {
		decoderColumn = getColumnFromDecoder(field);
		fieldType = 'SQL.Aliased';

		collectRqbFieldSelection(collectTo, table, field.fieldAlias, key, codecs, decoderColumn, inJson);
	} else if (isChunk(field, kind, chunkKinds.subquery)) {
		const innerField = Object.values(field._.selectedFields)[0];
		const innerKind = chunkKindOf(innerField);

		if (isChunk(innerField, innerKind, chunkKinds.column)) {
			decoderColumn = innerField;
			subqueryDecoder = innerField;
		} else if (isChunk(innerField, innerKind, chunkKinds.aliased)) {
			decoderColumn = getColumnFromDecoder(innerField);
			subqueryDecoder = innerField.sql.decoder;
		} else if (isChunk(innerField, innerKind, chunkKinds.sql)) {
			decoderColumn = getColumnFromDecoder(innerField);
			subqueryDecoder = innerField.decoder;
		}
		fieldType = 'Subquery';

		collectRqbFieldSelection(collectTo, table, field._.alias, key, codecs, decoderColumn, inJson);
	} else if (isSQLWrapper(field)) {
		decoderColumn = getColumnFromDecoder(field);
		fieldType = 'SQLWrapper';

		collectRqbFieldSelection(collectTo, table, key, key, codecs, decoderColumn, inJson);
	} else {
		throw new DrizzleError({
			message: field === undefined
				? `Unknown column: "${tableTsName}"."${key}"`
				: `Views and subqueries with nested selections are not supported by the relational query builder`,
		});
	}

	selection.push(
		(decoderColumn
			? {
				key,
				field,
				fieldType,
				subqueryDecoder,
				codec: !inJson || !(<RqbCustomColumn> decoderColumn).mapFromJsonValue
					? codecs.get(decoderColumn, inJson ? 'normalizeInJson' : 'normalize')
					: undefined,
				arrayDimensions: (<RqbCustomColumn> decoderColumn).dimensions,
			}
			: {
				key,
				field,
				fieldType,
				subqueryDecoder,
			}) as BuildRelationalQueryResult['selection'][number],
	);
}

/** Pushes table's columns selected by relational query separated by commas, returns whether any were selected */
export function buildRqbColumns(
	table: SchemaEntry,
	columns: Record<string, unknown>,
	selection: BuildRelationalQueryResult['selection'],
	inJson: boolean,
	tableTsName: string,
	codecs: CodecsCollection,
	collectTo: SQLChunk[],
	columnsConfig?: Record<string, boolean | undefined>,
): boolean {
	const start = collectTo.length;
	if (!columnsConfig) {
		for (const k of Object.keys(columns)) {
			if (collectTo.length > start) collectTo.push(commonStringChunks[', ']);
			buildRqbColumn(table, columns[k], k, inJson, selection, tableTsName, codecs, collectTo);
		}

		return true;
	}

	let colSelectionMode: boolean | undefined;
	for (const k of Object.keys(columnsConfig)) {
		const v = columnsConfig[k];
		if (v === undefined) continue;
		colSelectionMode = colSelectionMode || v;

		if (v) {
			if (collectTo.length > start) collectTo.push(commonStringChunks[', ']);
			buildRqbColumn(table, columns[k], k, inJson, selection, tableTsName, codecs, collectTo);
		}
	}

	if (colSelectionMode === false) {
		for (const k of Object.keys(columns)) {
			if (columnsConfig[k] === false) continue;

			if (collectTo.length > start) collectTo.push(commonStringChunks[', ']);
			buildRqbColumn(table, columns[k], k, inJson, selection, tableTsName, codecs, collectTo);
		}
	}

	return collectTo.length > start;
}

// `Subquery` instances used in relational queries are collected into `WITH` on query's root level
export type RelationalWithSubqueries = Map<string, Subquery>;
export function collectRelationalSubquery(
	collector: RelationalWithSubqueries,
	entity: SchemaEntry | undefined,
): void {
	if (!isChunk(entity, chunkKindOf(entity), chunkKinds.subquery)) return;

	const name = entity._.alias;
	const existing = collector.get(name);

	if (existing && existing._.sql !== entity._.sql) {
		throw new DrizzleError({
			message:
				`Different subqueries with the same alias "${name}" are used in a single relational query - make sure every subquery in schema has a unique alias`,
		});
	}

	collector.set(name, entity);
}

export function getTableAsAliasSQL(table: SchemaEntry, collectTo: SQLChunk[] = []): SQLChunk[] {
	if (!table[IsAlias]) {
		collectTo.push(table);
		return collectTo;
	}

	const schema = table[TableSchema];
	if (schema) collectTo.push(sql.identifier(schema), commonStringChunks['.']);
	collectTo.push(sql.identifier(table[OriginalName]), commonStringChunks[' as '], table);

	return collectTo;
}

export const EmptyFilter = Symbol.for('drizzle:EmptyFilter');
export type EmptyFilter = typeof EmptyFilter;
