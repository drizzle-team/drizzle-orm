import { type InferModelFromColumns, type Table, type TableExtraConfig } from '~/table';
import { type AnyColumn } from './column';
import { type and, type asc, type desc, type eq, type or, type Placeholder, type SQL, type sql } from './sql';
import { type Assume, type Equal, type Simplify } from './utils';

export class Relation<TTableName extends string> {
	declare readonly _: {
		readonly brand: 'Relation';
		readonly tableName: TTableName;
	};
}

export class Relations<TRelations extends Record<string, Relation<any>>> {
	declare readonly _: {
		readonly brand: 'Relations';
		readonly relations: TRelations;
	};

	constructor(relations: TRelations) {
		this._ = { relations } as this['_'];
	}
}

export class One<TTableName extends string> extends Relation<TTableName> {
	declare protected $brand: 'One';
}
export class Many<TTableName extends string> extends Relation<TTableName> {
	declare protected $brand: 'Many';
}

export type TableExtraConfigKeysOnly<
	TSchema extends Record<string, unknown>,
	TTableName extends string,
	K extends keyof TSchema,
> = TSchema[K] extends TableExtraConfig<TTableName, any> ? K : never;

export type ExtractTableExtraConfigFromSchema<TSchema extends Record<string, unknown>, TTableName extends string> =
	ExtractObjectValues<
		{
			[K in keyof TSchema as TableExtraConfigKeysOnly<TSchema, TTableName, K>]: TSchema[K] extends
				TableExtraConfig<TTableName, infer TConfig> ? TConfig : never;
		}
	>;

export type ExtractObjectValues<T> = T[keyof T];

export type ExtractRelationsFromTableExtraConfigSchema<TConfig extends unknown[]> = ExtractObjectValues<
	{
		[K in keyof TConfig as TConfig[K] extends Relations<any> ? K : never]: TConfig[K] extends
			Relations<infer TRelationConfig> ? TRelationConfig : never;
	}
>;

export interface Operators {
	sql: typeof sql;
	eq: typeof eq;
	and: typeof and;
	or: typeof or;
}

export interface OrderByOperators {
	sql: typeof sql;
	asc: typeof asc;
	desc: typeof desc;
}

export type BuildSelectionForTable<
	TSchema extends TablesWithRelations,
	TFields extends TableWithRelations,
> =
	& {
		where?: (
			fields: Simplify<ColumnsOnly<TFields>>,
			operators: Operators,
		) => SQL | undefined;
		orderBy?: (
			fields: Simplify<ColumnsOnly<TFields>>,
			operators: OrderByOperators,
		) => SQL | SQL[];
		limit?: number | Placeholder;
		offset?: number | Placeholder;
	}
	& {
		select?: {
			[K in keyof TFields]?: TFields[K] extends AnyColumn ? boolean
				: TFields[K] extends Relation<infer TRefName> ? 
						| true
						| BuildSelectionForTable<
							TSchema,
							TSchema[TRefName]
						>
				: never;
		};
		include?: {
			[K in RelationKeysOnly<TFields>]?: TFields[K] extends Relation<infer TRefName> ? 
					| true
					| BuildSelectionForTable<
						TSchema,
						TSchema[TRefName]
					>
				: never;
		};
		includeCustom?: (
			fields: Simplify<ColumnsOnly<TFields>>,
			operators: { sql: Operators['sql'] },
		) => Record<string, SQL | SQL.Aliased>;
	};
export type TableWithRelations = Record<string, AnyColumn | Relation<any>>;

export type TablesWithRelations = Record<string, TableWithRelations>;

export type ExtractTablesWithRelations<TSchema extends Record<string, unknown>> = {
	[K in keyof TSchema as TSchema[K] extends Table ? K : never]: TSchema[K] extends Table ? 
			& TSchema[K]['_']['columns']
			& ExtractRelationsFromTableExtraConfigSchema<ExtractTableExtraConfigFromSchema<TSchema, TSchema[K]['_']['name']>>
		: never;
};

type ColumnsOnly<T extends TableWithRelations> = {
	[K in keyof T as T[K] extends AnyColumn ? K : never]: T[K] extends AnyColumn ? T[K] : never;
};

export type ColumnKeysOnly<T extends TableWithRelations> = {
	[K in keyof T]: T[K] extends AnyColumn ? K : never;
}[keyof T];

export type RelationKeysOnly<T extends TableWithRelations> = {
	[K in keyof T]: T[K] extends Relation<any> ? K : never;
}[keyof T];

export interface RelationSelectionBase {
	select?: Record<string, boolean | Record<string, unknown> | undefined>;
	include?: Record<string, boolean | Record<string, unknown> | undefined>;
	includeCustom?: (...args: any[]) => Record<string, SQL | SQL.Aliased>;
}

export type BuildQueryResult<
	TSchema extends TablesWithRelations,
	TFields extends TableWithRelations,
	TFullSelection extends RelationSelectionBase,
> = (TFullSelection['select'] extends Record<string, unknown> ? ['select', TFullSelection['select']]
	: TFullSelection['include'] extends Record<string, unknown> ? ['include', TFullSelection['include']]
	: never) extends [
	infer TSelectionMode,
	infer TSelection,
] ? 
		& InferModelFromColumns<
			TSelectionMode extends 'select' ? {
					[
						K
							in (Equal<TSelection[keyof TSelection & ColumnKeysOnly<TFields>], false> extends true
								? Exclude<ColumnKeysOnly<TFields>, keyof TSelection>
								: keyof TSelection & ColumnKeysOnly<TFields>)
					]: Assume<TFields[K], AnyColumn>;
				}
				: ColumnsOnly<TFields>
		>
		& (TFullSelection['includeCustom'] extends (...args: any[]) => Record<string, SQL | SQL.Aliased> ? {
				[K in keyof ReturnType<TFullSelection['includeCustom']>]: ReturnType<
					TFullSelection['includeCustom']
				>[K]['_']['type'];
			}
			: {})
		& (TSelectionMode extends 'include' | 'select' ? {
				[K in keyof TSelection & RelationKeysOnly<TFields>]: TFields[K] extends infer TRel extends Relation<any>
					? BuildQueryResult<
						TSchema,
						TSchema[TRel['_']['tableName']],
						TSelection[K] extends true ? Record<string, undefined> : Assume<TSelection[K], RelationSelectionBase>
					> extends infer TResult ? TRel extends One<any> ? TResult : TResult[] : never
					: never;
			}
			: {})
	: InferModelFromColumns<ColumnsOnly<TFields>>;
