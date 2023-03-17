import type { GetColumnConfig, GetColumnData, UpdateColConfig } from '~/column';
import type {
	SelectFields as SelectFieldsBase,
	SelectFieldsFlat as SelectFieldsFlatBase,
	SelectFieldsOrdered as SelectFieldsOrderedBase,
} from '~/operations';
import type { AnyPgColumn } from '~/pg-core/columns';
import type { ChangeColumnTableName, PgColumn } from '~/pg-core/columns/common';
import type { AnyPgTable, GetTableConfig, PgTableWithColumns, TableConfig, UpdateTableConfig } from '~/pg-core/table';
import type { PgMaterializedViewWithSelection, PgViewBase, PgViewWithSelection } from '~/pg-core/view';
import type { Placeholder, SQL } from '~/sql';
import type { GetSubquerySelection, Subquery } from '~/subquery';
import type { Assume, DrizzleTypeError, Equal, IfThenElse, Or, Simplify } from '~/utils';
import type { PgSelect, PgSelectQueryBuilder } from './select';

export type JoinType = 'inner' | 'left' | 'right' | 'full';

export type SelectMode = 'partial' | 'single' | 'multiple';

export interface JoinsValue {
	on: SQL | undefined;
	table: AnyPgTable | Subquery;
	joinType: JoinType;
}

export type JoinNullability = 'nullable' | 'not-null';

export type ApplyNullability<T, TNullability extends JoinNullability> = TNullability extends 'nullable' ? T | null
	: TNullability extends 'null' ? null
	: T;

export type ApplyNullabilityToColumn<TColumn extends AnyPgColumn, TNullability extends JoinNullability> =
	TNullability extends 'not-null' ? TColumn
		: TColumn extends PgColumn<infer TConfig> ? PgColumn<
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
			? TField extends AnyPgTable ? GetTableConfig<TField, 'name'> extends keyof TNullability ? ApplyNullability<
						SelectResultFields<GetTableConfig<TField, 'columns'>>,
						TNullability[GetTableConfig<TField, 'name'>]
					>
				: never
			: TField extends AnyPgColumn
				? GetColumnConfig<TField, 'tableName'> extends infer TTableName extends keyof TNullability
					? ApplyNullability<SelectResultField<TField>, TNullability[TTableName]>
				: never
			: TField extends SQL | SQL.Aliased ? SelectResultField<TField>
			: TField extends Record<string, any>
				? TField[keyof TField] extends AnyPgColumn<{ tableName: infer TTableName extends string }> | SQL | SQL.Aliased
					? Not<IsUnion<TTableName>> extends true
						? ApplyNullability<SelectResultFields<TField>, TNullability[TTableName]>
					: SelectPartialResult<TField, TNullability>
				: never
			: never
			: never;
	}
	: never;

export type AnyPgSelect = PgSelect<any, any, any, any>;

export type BuildAliasTable<TTable extends AnyPgTable, TAlias extends string> = GetTableConfig<TTable> extends
	infer TConfig extends TableConfig ? PgTableWithColumns<
		UpdateTableConfig<TConfig, {
			name: TAlias;
			columns: Simplify<MapColumnsToTableAlias<TConfig['columns'], TAlias>>;
		}>
	>
	: never;

export type MapColumnsToTableAlias<
	TColumns extends Record<string, AnyPgColumn | SQL | SQL.Aliased>,
	TAlias extends string,
> = Simplify<
	{
		[Key in keyof TColumns]: TColumns[Key] extends AnyPgColumn ? ChangeColumnTableName<TColumns[Key], TAlias>
			: TColumns[Key];
	}
>;

export type AddAliasToSelection<TSelection, TAlias extends string> = Equal<TSelection, any> extends true ? any
	: Simplify<
		{
			[Key in keyof TSelection]: TSelection[Key] extends AnyPgColumn ? ChangeColumnTableName<TSelection[Key], TAlias>
				: TSelection[Key] extends SQL | SQL.Aliased ? TSelection[Key]
				: TSelection[Key] extends Record<string, AnyPgColumn | SQL | SQL.Aliased>
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
			: TSelection[Key] extends AnyPgColumn
				? ApplyNullabilityToColumn<TSelection[Key], TNullability[GetColumnConfig<TSelection[Key], 'tableName'>]>
			: TSelection[Key] extends Record<string, AnyPgColumn | SQL | SQL.Aliased>
				? BuildSubquerySelection<TSelection[Key], TNullability>
			: never;
	}
>;

export type AppendToResult<
	TTableName extends string,
	TResult,
	TJoinedName extends string,
	TSelectedFields extends SelectFields,
	TOldSelectMode extends SelectMode,
> = TOldSelectMode extends 'partial' ? TResult
	: TOldSelectMode extends 'single' ? Record<TTableName, TResult> & Record<TJoinedName, TSelectedFields>
	: TResult & Record<TJoinedName, TSelectedFields>;

type SetJoinsNullability<TNullabilityMap extends Record<string, JoinNullability>, TValue extends JoinNullability> = {
	[Key in keyof TNullabilityMap]: TValue;
};

export type AppendToNullabilityMap<
	TJoinsNotNull extends Record<string, JoinNullability>,
	TJoinedName extends string,
	TJoinType extends JoinType,
> = 'left' extends TJoinType ? TJoinsNotNull & { [name in TJoinedName]: 'nullable' }
	: 'right' extends TJoinType ? SetJoinsNullability<TJoinsNotNull, 'nullable'> & { [name in TJoinedName]: 'not-null' }
	: 'inner' extends TJoinType ? TJoinsNotNull & { [name in TJoinedName]: 'not-null' }
	: 'full' extends TJoinType ? SetJoinsNullability<TJoinsNotNull, 'nullable'> & { [name in TJoinedName]: 'nullable' }
	: never;

export interface PgSelectConfig {
	withList: Subquery[];
	fields: SelectFields;
	fieldsList: SelectFieldsOrdered;
	where?: SQL;
	having?: SQL;
	table: AnyPgTable | Subquery | PgViewBase;
	limit?: number | Placeholder;
	offset?: number | Placeholder;
	joins: Record<string, JoinsValue>;
	orderBy: (AnyPgColumn | SQL | SQL.Aliased)[];
	groupBy: (AnyPgColumn | SQL | SQL.Aliased)[];
	lockingClauses: {
		strength: LockStrength;
		config: LockConfig;
	}[];
}

export type JoinFn<
	THKT extends PgSelectHKTBase,
	TTableName extends string,
	TSelectMode extends SelectMode,
	TJoinType extends JoinType,
	TSelection,
	TNullabilityMap extends Record<string, JoinNullability>,
> = <
	TJoinedTable extends AnyPgTable | Subquery,
	TJoinedName extends GetSelectTableName<TJoinedTable> = GetSelectTableName<TJoinedTable>,
>(table: TJoinedTable, on: SQL | undefined) => PgSelectKind<
	THKT,
	TTableName,
	AppendToResult<
		TTableName,
		TSelection,
		TJoinedName,
		TJoinedTable extends AnyPgTable ? GetTableConfig<TJoinedTable, 'columns'>
			: TJoinedName extends Subquery ? Assume<GetSubquerySelection<TJoinedName>, SelectFields>
			: never,
		TSelectMode
	>,
	TSelectMode extends 'partial' ? TSelectMode : 'multiple',
	AppendToNullabilityMap<TNullabilityMap, TJoinedName, TJoinType>
>;

export type GetSelectTableName<TTable extends AnyPgTable | Subquery | PgViewBase> = TTable extends AnyPgTable
	? GetTableConfig<TTable, 'name'>
	: TTable extends Subquery<infer TAlias> ? TAlias
	: TTable extends PgViewBase<infer TAlias> ? TAlias
	: never;

export type GetSelectTableSelection<TTable extends AnyPgTable | Subquery | PgViewBase> = TTable extends AnyPgTable
	? GetTableConfig<TTable, 'columns'>
	: TTable extends Subquery<string, infer TSelection> ? TSelection
	: TTable extends
		PgViewWithSelection<any, any, infer TSelection> | PgMaterializedViewWithSelection<any, any, infer TSelection>
		? TSelection
	: never;

export type SelectFieldsFlat = SelectFieldsFlatBase<AnyPgColumn>;

export type SelectFields = SelectFieldsBase<AnyPgColumn, AnyPgTable>;

export type SelectFieldsOrdered = SelectFieldsOrderedBase<AnyPgColumn>;

export type SelectResultField<T> = T extends DrizzleTypeError<any> ? T
	: T extends AnyPgTable ? SelectResultField<GetTableConfig<T, 'columns'>>
	: T extends AnyPgColumn ? GetColumnData<T>
	: T extends SQL<infer T> | SQL.Aliased<infer T> ? T
	: T extends Record<string, any> ? SelectResultFields<T>
	: never;

export type SelectResultFields<TSelectedFields> = Simplify<
	{
		[Key in keyof TSelectedFields & string]: SelectResultField<TSelectedFields[Key]>;
	}
>;

export type LockStrength = 'update' | 'no key update' | 'share' | 'key share';

export type LockConfig =
	& {
		of?: AnyPgTable;
	}
	& ({
		noWait: true;
		skipLocked?: undefined;
	} | {
		noWait?: undefined;
		skipLocked: true;
	} | {
		noWait?: undefined;
		skipLocked?: undefined;
	});

export interface PgSelectHKTBase {
	tableName: string;
	selection: unknown;
	selectMode: SelectMode;
	nullabilityMap: unknown;
	$type: unknown;
}

export type PgSelectKind<
	T extends PgSelectHKTBase,
	TTableName extends string,
	TSelection,
	TSelectMode extends SelectMode,
	TNullabilityMap extends Record<string, JoinNullability>,
> = (T & {
	tableName: TTableName;
	selection: TSelection;
	selectMode: TSelectMode;
	nullabilityMap: TNullabilityMap;
})['$type'];

export interface PgSelectQueryBuilderHKT extends PgSelectHKTBase {
	$type: PgSelectQueryBuilder<
		this,
		this['tableName'],
		this['selection'],
		this['selectMode'],
		Assume<this['nullabilityMap'], Record<string, JoinNullability>>
	>;
}

export interface PgSelectHKT extends PgSelectHKTBase {
	$type: PgSelect<
		this['tableName'],
		this['selection'],
		this['selectMode'],
		Assume<this['nullabilityMap'], Record<string, JoinNullability>>
	>;
}
