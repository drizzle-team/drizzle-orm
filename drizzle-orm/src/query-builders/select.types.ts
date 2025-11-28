import type { ChangeColumnTableName, ColumnType, Dialect } from '~/column-builder.ts';
import type { AnyColumn, Column, ColumnBaseConfig, GetColumnData, UpdateColConfig } from '~/column.ts';
import type { SelectedFields } from '~/operations.ts';
import type { ColumnsSelection, SQL, View } from '~/sql/sql.ts';
import type { Subquery } from '~/subquery.ts';
import type { Table } from '~/table.ts';
import type { Assume, DrizzleTypeError, Equal, FromSingleKeyObject, IsAny, IsUnion, Not, Simplify } from '~/utils.ts';

export type JoinType = 'inner' | 'left' | 'right' | 'full' | 'cross';

export type JoinNullability = 'nullable' | 'not-null';

export type ApplyNullability<T, TNullability extends JoinNullability> = TNullability extends 'nullable' ? T | null
	: TNullability extends 'null' ? null
	: T;

export type ApplyNullabilityToColumn<TColumn extends Column, TNullability extends JoinNullability> =
	TNullability extends 'not-null' ? TColumn
		: Column<
			Assume<
				UpdateColConfig<TColumn['_'], {
					notNull: TNullability extends 'nullable' ? false : TColumn['_']['notNull'];
				}>,
				ColumnBaseConfig<ColumnType>
			>
		>;

export type ApplyNotNullMapToJoins<TResult, TNullabilityMap extends Record<string, JoinNullability>> =
	& {
		[TTableName in keyof TResult & keyof TNullabilityMap & string]: ApplyNullability<
			TResult[TTableName],
			TNullabilityMap[TTableName]
		>;
	}
	& {};

export type SelectMode = 'partial' | 'single' | 'multiple';

export type SelectResult<
	TResult,
	TSelectMode extends SelectMode,
	TNullabilityMap extends Record<string, JoinNullability>,
> = TSelectMode extends 'partial' ? SelectPartialResult<TResult, TNullabilityMap>
	: TSelectMode extends 'single' ? SelectResultFields<TResult>
	: ApplyNotNullMapToJoins<SelectResultFields<TResult>, TNullabilityMap>;

type SelectPartialResult<TFields, TNullability extends Record<string, JoinNullability>> = TNullability extends
	TNullability ? {
		[Key in keyof TFields]: TFields[Key] extends infer TField
			? TField extends Table ? TField['_']['name'] extends keyof TNullability ? ApplyNullability<
						SelectResultFields<TField['_']['columns']>,
						TNullability[TField['_']['name']]
					>
				: never
			: TField extends Column
				? TField['_']['tableName'] extends keyof TNullability
					? ApplyNullability<SelectResultField<TField>, TNullability[TField['_']['tableName']]>
				: never
			: TField extends SQL | SQL.Aliased ? SelectResultField<TField>
			: TField extends Subquery ? FromSingleKeyObject<
					TField['_']['selectedFields'],
					TField['_']['selectedFields'] extends { [key: string]: infer TValue } ? SelectResultField<TValue> : never,
					'You can only select one column in the subquery'
				>
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
	TDialect extends Dialect,
> =
	& {
		[Key in keyof TColumns]: TColumns[Key] extends Column
			? ChangeColumnTableName<Assume<TColumns[Key], Column>, TAlias, TDialect>
			: TColumns[Key];
	}
	& {};

export type AddAliasToSelection<
	TSelection extends ColumnsSelection,
	TAlias extends string,
	TDialect extends Dialect,
> = Simplify<
	IsAny<TSelection> extends true ? any
		: {
			[Key in keyof TSelection]: TSelection[Key] extends Column
				? ChangeColumnTableName<TSelection[Key], TAlias, TDialect>
				: TSelection[Key] extends Table ? AddAliasToSelection<TSelection[Key]['_']['columns'], TAlias, TDialect>
				: TSelection[Key] extends SQL | SQL.Aliased ? TSelection[Key]
				: TSelection[Key] extends ColumnsSelection ? MapColumnsToTableAlias<TSelection[Key], TAlias, TDialect>
				: never;
		}
>;

export type AppendToResult<
	TTableName extends string | undefined,
	TResult,
	TJoinedName extends string | undefined,
	TSelectedFields extends SelectedFields<Column, Table>,
	TOldSelectMode extends SelectMode,
> = TOldSelectMode extends 'partial' ? TResult
	: TOldSelectMode extends 'single' ?
			& (TTableName extends string ? Record<TTableName, TResult> : TResult)
			& (TJoinedName extends string ? Record<TJoinedName, TSelectedFields> : TSelectedFields)
	: TResult & (TJoinedName extends string ? Record<TJoinedName, TSelectedFields> : TSelectedFields);

export type BuildSubquerySelection<
	TSelection extends ColumnsSelection,
	TNullability extends Record<string, JoinNullability>,
> = TSelection extends never ? any
	:
		& {
			[Key in keyof TSelection]: TSelection[Key] extends SQL
				? DrizzleTypeError<'You cannot reference this field without assigning it an alias first - use `.as(<alias>)`'>
				: TSelection[Key] extends SQL.Aliased ? TSelection[Key]
				: TSelection[Key] extends Table ? BuildSubquerySelection<TSelection[Key]['_']['columns'], TNullability>
				: TSelection[Key] extends Column
					? ApplyNullabilityToColumn<TSelection[Key], TNullability[TSelection[Key]['_']['tableName']]>
				: TSelection[Key] extends ColumnsSelection ? BuildSubquerySelection<TSelection[Key], TNullability>
				: never;
		}
		& {};

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
	: 'cross' extends TJoinType ? TJoinsNotNull & { [name in TJoinedName]: 'not-null' }
	: 'full' extends TJoinType ? SetJoinsNullability<TJoinsNotNull, 'nullable'> & { [name in TJoinedName]: 'nullable' }
	: never
	: TJoinsNotNull;

export type TableLike = Table | Subquery | View | SQL;

export type GetSelectTableName<TTable extends TableLike> = TTable extends Table ? TTable['_']['name']
	: TTable extends Subquery ? TTable['_']['alias']
	: TTable extends View ? TTable['_']['name']
	: TTable extends SQL ? undefined
	: never;

export type GetSelectTableSelection<TTable extends TableLike> = TTable extends Table ? TTable['_']['columns']
	: TTable extends Subquery | View ? Assume<TTable['_']['selectedFields'], ColumnsSelection>
	: TTable extends SQL ? {}
	: never;

export type SelectResultField<T, TDeep extends boolean = true> = T extends DrizzleTypeError<any> ? T
	: T extends Table ? Equal<TDeep, true> extends true ? SelectResultField<T['_']['columns'], false> : never
	: T extends Column<any> ? GetColumnData<T>
	: T extends SQL | SQL.Aliased ? T['_']['type']
	: T extends Record<string, any> ? SelectResultFields<T, true>
	: never;

export type SelectResultFields<TSelectedFields, TDeep extends boolean = true> = Simplify<
	{
		[Key in keyof TSelectedFields]: SelectResultField<TSelectedFields[Key], TDeep>;
	}
>;

export type SetOperator = 'union' | 'intersect' | 'except';
