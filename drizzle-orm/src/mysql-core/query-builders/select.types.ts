import type { GetColumnConfig, GetColumnData, UpdateColConfig } from '~/column';
import type { AnyMySqlColumn } from '~/mysql-core/columns';
import type { ChangeColumnTableName, MySqlColumn } from '~/mysql-core/columns/common';
import type {
	AnyMySqlTable,
	GetTableConfig,
	MySqlTableWithColumns,
	TableConfig,
	UpdateTableConfig,
} from '~/mysql-core/table';
import type { MySqlViewBase, MySqlViewWithSelection } from '~/mysql-core/view';
import type {
	SelectFields as SelectFieldsBase,
	SelectFieldsFlat as SelectFieldsFlatBase,
	SelectFieldsOrdered as SelectFieldsOrderedBase,
} from '~/operations';
import type { Placeholder, SQL } from '~/sql';
import type { GetSubquerySelection, Subquery } from '~/subquery';
import type { Assume, DrizzleTypeError, Equal, Simplify } from '~/utils';
import type { MySqlSelect, MySqlSelectQueryBuilder } from './select';

export type JoinType = 'inner' | 'left' | 'right' | 'full';

export type SelectMode = 'partial' | 'single' | 'multiple';

export interface JoinsValue {
	on: SQL | undefined;
	table: AnyMySqlTable | Subquery | SQL;
	alias: string | undefined;
	joinType: JoinType;
}

export type JoinNullability = 'nullable' | 'not-null';

export type ApplyNullability<T, TNullability extends JoinNullability> = TNullability extends 'nullable' ? T | null
	: TNullability extends 'null' ? null
	: T;

export type ApplyNullabilityToColumn<TColumn extends AnyMySqlColumn, TNullability extends JoinNullability> =
	TNullability extends 'not-null' ? TColumn
		: TColumn extends MySqlColumn<infer TConfig> ? MySqlColumn<
				UpdateColConfig<TConfig, {
					notNull: TNullability extends 'nullable' ? false : TConfig['notNull'];
				}>
			>
		: never;

export type ApplyNotNullMapToJoins<TResult, TNullabilityMap extends Record<string, JoinNullability>> = Simplify<
	{
		[TTableName in keyof TResult & keyof TNullabilityMap & string]: ApplyNullability<
			TResult[TTableName],
			TNullabilityMap[TTableName]
		>;
	}
>;

export type SelectResult<
	TResult,
	TSelectMode extends SelectMode,
	TNullabilityMap extends Record<string, JoinNullability>,
> = TSelectMode extends 'partial' ? SelectPartialResult<TResult, TNullabilityMap>
	: TSelectMode extends 'single' ? SelectResultFields<TResult>
	: ApplyNotNullMapToJoins<SelectResultFields<TResult>, TNullabilityMap>;

type IsUnion<T, U extends T = T> = (T extends any ? (U extends T ? false : true) : never) extends false ? false : true;

type Not<T extends boolean> = T extends true ? false : true;

type SelectPartialResult<TFields, TNullability extends Record<string, JoinNullability>> = TNullability extends
	TNullability ? {
		[Key in keyof TFields]: TFields[Key] extends infer TField
			? TField extends AnyMySqlTable ? GetTableConfig<TField, 'name'> extends keyof TNullability ? ApplyNullability<
						SelectResultFields<GetTableConfig<TField, 'columns'>>,
						TNullability[GetTableConfig<TField, 'name'>]
					>
				: never
			: TField extends AnyMySqlColumn
				? GetColumnConfig<TField, 'tableName'> extends infer TTableName extends keyof TNullability
					? ApplyNullability<SelectResultField<TField>, TNullability[TTableName]>
				: never
			: TField extends SQL | SQL.Aliased ? SelectResultField<TField>
			: TField extends Record<string, any>
				? TField[keyof TField] extends
					AnyMySqlColumn<{ tableName: infer TTableName extends string }> | SQL | SQL.Aliased
					? Not<IsUnion<TTableName>> extends true
						? ApplyNullability<SelectResultFields<TField>, TNullability[TTableName]>
					: SelectPartialResult<TField, TNullability>
				: never
			: never
			: never;
	}
	: never;

export type AnyMySqlSelect = MySqlSelect<any, any, any, any>;

export type BuildAliasTable<TTable extends AnyMySqlTable, TAlias extends string> = GetTableConfig<TTable> extends
	infer TConfig extends TableConfig ? MySqlTableWithColumns<
		UpdateTableConfig<TConfig, {
			name: TAlias;
			columns: Simplify<MapColumnsToTableAlias<TConfig['columns'], TAlias>>;
		}>
	>
	: never;

export type MapColumnsToTableAlias<
	TColumns extends Record<string, AnyMySqlColumn | SQL | SQL.Aliased>,
	TAlias extends string,
> = Simplify<
	{
		[Key in keyof TColumns]: TColumns[Key] extends AnyMySqlColumn ? ChangeColumnTableName<TColumns[Key], TAlias>
			: TColumns[Key];
	}
>;

export type AddAliasToSelection<TSelection, TAlias extends string> = Equal<TSelection, any> extends true ? any
	: Simplify<
		{
			[Key in keyof TSelection]: TSelection[Key] extends AnyMySqlColumn ? ChangeColumnTableName<TSelection[Key], TAlias>
				: TSelection[Key] extends SQL | SQL.Aliased ? TSelection[Key]
				: TSelection[Key] extends Record<string, AnyMySqlColumn | SQL | SQL.Aliased>
					? MapColumnsToTableAlias<TSelection[Key], TAlias>
				: never;
		}
	>;

export type BuildSubquerySelection<
	TSelection,
	TNullability extends Record<string, JoinNullability>,
> = TSelection extends never ? any : Simplify<
	{
		[Key in keyof TSelection]: TSelection[Key] extends SQL
			? DrizzleTypeError<'You cannot reference this field without assigning it an alias first - use `.as(<alias>)`'>
			: TSelection[Key] extends SQL.Aliased ? TSelection[Key]
			: TSelection[Key] extends AnyMySqlColumn
				? ApplyNullabilityToColumn<TSelection[Key], TNullability[GetColumnConfig<TSelection[Key], 'tableName'>]>
			: TSelection[Key] extends Record<string, AnyMySqlColumn | SQL | SQL.Aliased>
				? BuildSubquerySelection<TSelection[Key], TNullability>
			: never;
	}
>;

export type AppendToResult<
	TTableName extends string | undefined,
	TResult,
	TJoinedName extends string | undefined,
	TSelectedFields extends SelectFields,
	TOldSelectMode extends SelectMode,
> = TOldSelectMode extends 'partial' ? TResult
	: TOldSelectMode extends 'single' ? 
			& (TTableName extends string ? Record<TTableName, TResult> : TResult)
			& (TJoinedName extends string ? Record<TJoinedName, TSelectedFields> : TSelectedFields)
	: TResult & (TJoinedName extends string ? Record<TJoinedName, TSelectedFields> : TSelectedFields);

type SetJoinsNullability<TNullabilityMap extends Record<string, JoinNullability>, TValue extends JoinNullability> = {
	[Key in keyof TNullabilityMap]: TValue;
};

export type AppendToNullabilityMap<
	TJoinsNotNull extends Record<string, JoinNullability>,
	TJoinedName extends string | undefined,
	TJoinType extends JoinType,
> = TJoinedName extends string ? 'left' extends TJoinType ? TJoinsNotNull & { [name in TJoinedName]: 'nullable' }
	: 'right' extends TJoinType ? SetJoinsNullability<TJoinsNotNull, 'nullable'> & { [name in TJoinedName]: 'not-null' }
	: 'inner' extends TJoinType ? TJoinsNotNull & { [name in TJoinedName]: 'not-null' }
	: 'full' extends TJoinType ? SetJoinsNullability<TJoinsNotNull, 'nullable'> & { [name in TJoinedName]: 'nullable' }
	: never
	: TJoinsNotNull;

export interface MySqlSelectConfig {
	withList: Subquery[];
	fields: SelectFields;
	fieldsList: SelectFieldsOrdered;
	where?: SQL;
	having?: SQL;
	table: AnyMySqlTable | Subquery | MySqlViewBase | SQL;
	limit?: number | Placeholder;
	offset?: number | Placeholder;
	joins: JoinsValue[];
	orderBy: (AnyMySqlColumn | SQL | SQL.Aliased)[];
	groupBy: (AnyMySqlColumn | SQL | SQL.Aliased)[];
	lockingClause?: {
		strength: LockStrength;
		config: LockConfig;
	};
}

export type JoinFn<
	THKT extends MySqlSelectHKTBase,
	TTableName extends string | undefined,
	TSelectMode extends SelectMode,
	TJoinType extends JoinType,
	TSelection,
	TNullabilityMap extends Record<string, JoinNullability>,
> = <
	TJoinedTable extends AnyMySqlTable | Subquery | SQL,
	TJoinedName extends GetSelectTableName<TJoinedTable> = GetSelectTableName<TJoinedTable>,
>(table: TJoinedTable, on: ((aliases: TSelection) => SQL | undefined) | SQL | undefined) => MySqlSelectKind<
	THKT,
	TTableName,
	AppendToResult<
		TTableName,
		TSelection,
		TJoinedName,
		TJoinedTable extends AnyMySqlTable ? GetTableConfig<TJoinedTable, 'columns'>
			: TJoinedName extends Subquery ? Assume<GetSubquerySelection<TJoinedName>, SelectFields>
			: never,
		TSelectMode
	>,
	TSelectMode extends 'partial' ? TSelectMode : 'multiple',
	AppendToNullabilityMap<TNullabilityMap, TJoinedName, TJoinType>
>;

export type GetSelectTableName<TTable extends AnyMySqlTable | Subquery | MySqlViewBase | SQL> = TTable extends
	AnyMySqlTable ? GetTableConfig<TTable, 'name'>
	: TTable extends Subquery<infer TAlias> ? TAlias
	: TTable extends MySqlViewBase<infer TAlias> ? TAlias
	: TTable extends SQL ? undefined
	: never;

export type GetSelectTableSelection<TTable extends AnyMySqlTable | Subquery | MySqlViewBase | SQL> = TTable extends
	AnyMySqlTable ? GetTableConfig<TTable, 'columns'>
	: TTable extends Subquery<string, infer TSelection> ? TSelection
	: TTable extends MySqlViewWithSelection<any, any, infer TSelection> ? TSelection
	: TTable extends SQL ? {}
	: never;

export type SelectFieldsFlat = SelectFieldsFlatBase<AnyMySqlColumn>;

export type SelectFields = SelectFieldsBase<AnyMySqlColumn, AnyMySqlTable>;

export type SelectFieldsOrdered = SelectFieldsOrderedBase<AnyMySqlColumn>;

export type SelectResultField<T> = T extends DrizzleTypeError<any> ? T
	: T extends AnyMySqlTable ? SelectResultField<GetTableConfig<T, 'columns'>>
	: T extends AnyMySqlColumn ? GetColumnData<T>
	: T extends SQL<infer T> | SQL.Aliased<infer T> ? T
	: T extends Record<string, any> ? SelectResultFields<T>
	: never;

export type SelectResultFields<TSelectedFields> = Simplify<
	{
		[Key in keyof TSelectedFields & string]: SelectResultField<TSelectedFields[Key]>;
	}
>;

export type LockStrength = 'update' | 'share';

export type LockConfig = {
	noWait: true;
	skipLocked?: undefined;
} | {
	noWait?: undefined;
	skipLocked: true;
} | {
	noWait?: undefined;
	skipLocked?: undefined;
};

export interface MySqlSelectHKTBase {
	tableName: string | undefined;
	selection: unknown;
	selectMode: SelectMode;
	nullabilityMap: unknown;
	$type: unknown;
}

export type MySqlSelectKind<
	T extends MySqlSelectHKTBase,
	TTableName extends string | undefined,
	TSelection,
	TSelectMode extends SelectMode,
	TNullabilityMap extends Record<string, JoinNullability>,
> = (T & {
	tableName: TTableName;
	selection: TSelection;
	selectMode: TSelectMode;
	nullabilityMap: TNullabilityMap;
})['$type'];

export interface MySqlSelectQueryBuilderHKT extends MySqlSelectHKTBase {
	$type: MySqlSelectQueryBuilder<
		this,
		this['tableName'],
		this['selection'],
		this['selectMode'],
		Assume<this['nullabilityMap'], Record<string, JoinNullability>>
	>;
}

export interface MySqlSelectHKT extends MySqlSelectHKTBase {
	$type: MySqlSelect<
		this['tableName'],
		this['selection'],
		this['selectMode'],
		Assume<this['nullabilityMap'], Record<string, JoinNullability>>
	>;
}
