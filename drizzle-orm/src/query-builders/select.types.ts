import type { AnyColumn, ColumnKind, GetColumnData, UpdateColConfig } from '~/column';
import type { ChangeColumnTableName } from '~/column-builder';
import type { SelectedFields } from '~/operations';
import type { SQL } from '~/sql';
import type { Subquery } from '~/subquery';
import type { AnyTable, Table } from '~/table';
import type { Assume, DrizzleTypeError, Equal, SimplifyShallow } from '~/utils';
import type { ColumnsSelection, View } from '~/view';

export type JoinType = 'inner' | 'left' | 'right' | 'full';

export type JoinNullability = 'nullable' | 'not-null';

export type ApplyNullability<T, TNullability extends JoinNullability> = TNullability extends 'nullable' ? T | null
	: TNullability extends 'null' ? null
	: T;

export type ApplyNullabilityToColumn<TColumn extends AnyColumn, TNullability extends JoinNullability> =
	TNullability extends 'not-null' ? TColumn
		: ColumnKind<
			TColumn['_']['hkt'],
			UpdateColConfig<TColumn['_']['config'], {
				notNull: TNullability extends 'nullable' ? false : TColumn['_']['notNull'];
			}>
		>;

export type ApplyNotNullMapToJoins<TResult, TNullabilityMap extends Record<string, JoinNullability>> = SimplifyShallow<
	{
		[TTableName in keyof TResult & keyof TNullabilityMap & string]: ApplyNullability<
			TResult[TTableName],
			TNullabilityMap[TTableName]
		>;
	}
>;

export type SelectMode = 'partial' | 'single' | 'multiple';

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
			? TField extends AnyTable ? TField['_']['name'] extends keyof TNullability ? ApplyNullability<
						SelectResultFields<TField['_']['columns']>,
						TNullability[TField['_']['name']]
					>
				: never
			: TField extends AnyColumn
				? TField['_']['tableName'] extends keyof TNullability
					? ApplyNullability<SelectResultField<TField>, TNullability[TField['_']['tableName']]>
				: never
			: TField extends SQL | SQL.Aliased ? SelectResultField<TField>
			: TField extends Record<string, any>
				? TField[keyof TField] extends AnyColumn<{ tableName: infer TTableName extends string }> | SQL | SQL.Aliased
					? Not<IsUnion<TTableName>> extends true
						? ApplyNullability<SelectResultFields<TField>, TNullability[TTableName]>
					: SelectPartialResult<TField, TNullability>
				: never
			: never
			: never;
	}
	: never;

export type MapColumnsToTableAlias<
	TColumns extends ColumnsSelection,
	TAlias extends string,
> = SimplifyShallow<
	{
		[Key in keyof TColumns]: TColumns[Key] extends AnyColumn
			? ChangeColumnTableName<Assume<TColumns[Key], AnyColumn>, TAlias>
			: TColumns[Key];
	}
>;

export type AddAliasToSelection<
	TSelection extends ColumnsSelection,
	TAlias extends string,
> = SimplifyShallow<
	Equal<TSelection, any> extends true ? any
		: {
			[Key in keyof TSelection]: TSelection[Key] extends AnyColumn ? ChangeColumnTableName<TSelection[Key], TAlias>
				: TSelection[Key] extends SQL | SQL.Aliased ? TSelection[Key]
				: TSelection[Key] extends ColumnsSelection ? MapColumnsToTableAlias<TSelection[Key], TAlias>
				: never;
		}
>;

export type AppendToResult<
	TTableName extends string | undefined,
	TResult,
	TJoinedName extends string | undefined,
	TSelectedFields extends SelectedFields<AnyColumn, Table>,
	TOldSelectMode extends SelectMode,
> = TOldSelectMode extends 'partial' ? TResult
	: TOldSelectMode extends 'single' ? 
			& (TTableName extends string ? Record<TTableName, TResult> : TResult)
			& (TJoinedName extends string ? Record<TJoinedName, TSelectedFields> : TSelectedFields)
	: TResult & (TJoinedName extends string ? Record<TJoinedName, TSelectedFields> : TSelectedFields);

export type BuildSubquerySelection<
	TSelection extends ColumnsSelection,
	TNullability extends Record<string, JoinNullability>,
> = TSelection extends never ? any : SimplifyShallow<
	{
		[Key in keyof TSelection]: TSelection[Key] extends SQL
			? DrizzleTypeError<'You cannot reference this field without assigning it an alias first - use `.as(<alias>)`'>
			: TSelection[Key] extends SQL.Aliased ? TSelection[Key]
			: TSelection[Key] extends AnyColumn
				? ApplyNullabilityToColumn<TSelection[Key], TNullability[TSelection[Key]['_']['tableName']]>
			: TSelection[Key] extends ColumnsSelection ? BuildSubquerySelection<TSelection[Key], TNullability>
			: never;
	}
>;

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

export type GetSelectTableName<TTable extends AnyTable | Subquery | View | SQL> = TTable extends AnyTable
	? TTable['_']['name']
	: TTable extends Subquery ? TTable['_']['alias']
	: TTable extends View ? TTable['_']['name']
	: TTable extends SQL ? undefined
	: never;

export type GetSelectTableSelection<TTable extends AnyTable | Subquery | View | SQL> = TTable extends AnyTable
	? TTable['_']['columns']
	: TTable extends Subquery | View ? Assume<TTable['_']['selectedFields'], ColumnsSelection>
	: TTable extends SQL ? {}
	: never;

export type SelectResultField<T, TDeep extends boolean = true> = T extends DrizzleTypeError<any> ? T
	: T extends AnyTable ? Equal<TDeep, true> extends true ? SelectResultField<T['_']['columns'], false> : never
	: T extends AnyColumn ? GetColumnData<T>
	: T extends SQL | SQL.Aliased ? T['_']['type']
	: T extends Record<string, any> ? SelectResultFields<T, true>
	: never;

export type SelectResultFields<TSelectedFields, TDeep extends boolean = true> = SimplifyShallow<
	{
		[Key in keyof TSelectedFields & string]: SelectResultField<TSelectedFields[Key], TDeep>;
	}
>;
