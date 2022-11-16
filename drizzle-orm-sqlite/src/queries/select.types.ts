import { AnyColumn } from 'drizzle-orm';
import { Placeholder, SQL } from 'drizzle-orm/sql';
import { Simplify } from 'drizzle-orm/utils';

import { AnySQLiteColumn } from '~/columns';
import { ChangeColumnTableName } from '~/columns/common';
import { SelectResultFields, SQLiteSelectFields, SQLiteSelectFieldsOrdered } from '~/operations';
import { AnySQLiteTable, GetTableConfig, SQLiteTableWithColumns, TableConfig, UpdateTableConfig } from '~/table';

import { SQLiteAsyncSelect, SQLiteSelect, SQLiteSyncSelect } from './select';

export type JoinType = 'inner' | 'left' | 'right' | 'full';

export interface JoinsValue {
	on: SQL;
	table: AnySQLiteTable;
	joinType: JoinType;
}

export type JoinNullability = 'nullable' | 'null' | 'not-null';

export type ApplyNotNullMapToJoins<
	TResult extends Record<string, Record<string, unknown>>,
	TJoinsNotNullable extends Record<string, JoinNullability>,
> = TJoinsNotNullable extends TJoinsNotNullable ? {
		[TTableName in keyof TResult & keyof TJoinsNotNullable & string]: TJoinsNotNullable[TTableName] extends 'nullable'
			? TResult[TTableName] | null
			: TJoinsNotNullable[TTableName] extends 'null' ? null
			: TJoinsNotNullable[TTableName] extends 'not-null' ? TResult[TTableName]
			: never;
	}
	: never;

export type SelectResult<
	TTable extends AnySQLiteTable,
	TReturn,
	TInitialSelectResultFields extends Record<string, unknown>,
	TJoinsNotNullable extends Record<string, JoinNullability>,
> = TReturn extends undefined ? TInitialSelectResultFields[]
	: RemoveDuplicates<
		Simplify<
			ApplyNotNullMapToJoins<
				& TReturn
				& { [Key in GetTableConfig<TTable, 'name'>]: TInitialSelectResultFields },
				TJoinsNotNullable
			>
		>
	>[];

export type AnySQLiteSelect = SQLiteSelect<any, any, any, any>;

export type BuildAliasTable<TTable extends AnySQLiteTable, TAlias extends string> = GetTableConfig<TTable> extends
	infer TConfig extends TableConfig ? SQLiteTableWithColumns<
		UpdateTableConfig<TConfig, {
			name: TAlias;
			columns: Simplify<MapColumnsToTableAlias<TConfig['columns'], TAlias>>;
		}>
	>
	: never;

export type MapColumnsToTableAlias<TColumns extends Record<string, AnySQLiteColumn>, TAlias extends string> = {
	[Key in keyof TColumns]: ChangeColumnTableName<TColumns[Key], TAlias>;
};

export type AppendToResult<
	TReturn,
	TJoinedName extends string,
	TSelectedFields extends SQLiteSelectFields<string>,
> = TReturn extends undefined ? { [Key in TJoinedName]: SelectResultFields<TSelectedFields> }
	: Simplify<TReturn & { [Key in TJoinedName]: SelectResultFields<TSelectedFields> }>;

export type AppendToAliases<
	TJoins extends { [k: string]: AnySQLiteTable | Record<string, AnyColumn> },
	TJoinedTable extends AnySQLiteTable,
	TJoinedName extends string,
	TDBName extends string = TJoinedName,
> = Simplify<
	& TJoins
	& { [Alias in TJoinedName]: BuildAliasTable<TJoinedTable, TDBName> },
	{ deep: true }
>;

export type JoinOn<
	TTableNamesMap extends Record<string, string>,
	TJoinedDBTableNames extends string,
	TAliases extends { [tableName: string]: any },
	TJoinedTable extends AnySQLiteTable<{ name: keyof TTableNamesMap & string }>,
	TJoinedName extends string,
	TDBName extends string = TJoinedName,
> =
	| ((
		aliases: AppendToAliases<TAliases, TJoinedTable, TJoinedName, TDBName>,
	) => SQL)
	| SQL;

export type JoinSelect<
	TJoinedTable extends AnySQLiteTable,
	TSelectedFields extends SQLiteSelectFields<string>,
> =
	| ((table: TJoinedTable) => TSelectedFields)
	| TSelectedFields;

type SetJoinsNotNull<TJoinsNotNull extends Record<string, JoinNullability>, TValue extends JoinNullability> = {
	[Key in keyof TJoinsNotNull]: TValue;
};

// https://stackoverflow.com/a/70061272/9929789
type UnionToParm<U> = U extends any ? (k: U) => void : never;
type UnionToSect<U> = UnionToParm<U> extends ((k: infer I) => void) ? I : never;
type ExtractParm<F> = F extends { (a: infer A): void } ? A : never;
type SpliceOne<Union> = Exclude<Union, ExtractOne<Union>>;
type ExtractOne<Union> = ExtractParm<UnionToSect<UnionToParm<Union>>>;
type ToTupleRec<Union, Result extends any[] = []> = SpliceOne<Union> extends never ? [ExtractOne<Union>, ...Result]
	: ToTupleRec<SpliceOne<Union>, [ExtractOne<Union>, ...Result]>;
export type RemoveDuplicates<T> = ToTupleRec<T> extends any[] ? ToTupleRec<T>[number] : never;

export type AppendToJoinsNotNull<
	TJoinsNotNull extends Record<string, JoinNullability>,
	TJoinedName extends string,
	TJoinType extends JoinType,
> = Simplify<
	'left' extends TJoinType ? TJoinsNotNull & { [name in TJoinedName]: 'nullable' }
		: 'right' extends TJoinType ? SetJoinsNotNull<TJoinsNotNull, 'nullable'> & { [name in TJoinedName]: 'not-null' }
		: 'inner' extends TJoinType ? SetJoinsNotNull<TJoinsNotNull, 'not-null'> & { [name in TJoinedName]: 'not-null' }
		: 'full' extends TJoinType ? 
				| (TJoinsNotNull & { [name in TJoinedName]: 'null' })
				| (SetJoinsNotNull<TJoinsNotNull, 'null'> & { [name in TJoinedName]: 'not-null' })
				| (TJoinsNotNull & { [name in TJoinedName]: 'not-null' })
		: never
>;

export interface SQLiteSelectConfig {
	fields: SQLiteSelectFieldsOrdered;
	where?: SQL | undefined;
	table: AnySQLiteTable;
	limit?: number | Placeholder;
	offset?: number | Placeholder;
	joins: Record<string, JoinsValue>;
	orderBy: SQL[];
}

export type JoinFn<
	TTable extends AnySQLiteTable,
	TInitialSelectResultFields extends SelectResultFields<SQLiteSelectFields<GetTableConfig<TTable, 'name'>>>,
	TStatement,
	TJoinType extends JoinType,
	TResult = undefined,
	TJoinsNotNullable extends Record<string, JoinNullability> = Record<GetTableConfig<TTable, 'name'>, 'not-null'>,
> = <
	TJoinedTable extends AnySQLiteTable,
	TSelect extends SQLiteSelectFields<string> = GetTableConfig<TJoinedTable, 'columns'>,
	TJoinedName extends GetTableConfig<TJoinedTable, 'name'> = GetTableConfig<TJoinedTable, 'name'>,
>(table: TJoinedTable, on: SQL, select?: TSelect) => SQLiteSelect<
	TTable,
	TInitialSelectResultFields,
	TStatement,
	AppendToResult<TResult, TJoinedName, TSelect>,
	AppendToJoinsNotNull<TJoinsNotNullable, TJoinedName, TJoinType>
>;

export type AsyncJoinFn<
	TTable extends AnySQLiteTable,
	TInitialSelectResultFields extends SelectResultFields<SQLiteSelectFields<GetTableConfig<TTable, 'name'>>>,
	TStatement,
	TRunResult,
	TJoinType extends JoinType,
	TResult = undefined,
	TJoinsNotNullable extends Record<string, JoinNullability> = Record<GetTableConfig<TTable, 'name'>, 'not-null'>,
> = <
	TJoinedTable extends AnySQLiteTable,
	TSelect extends SQLiteSelectFields<string> = GetTableConfig<TJoinedTable, 'columns'>,
	TJoinedName extends GetTableConfig<TJoinedTable, 'name'> = GetTableConfig<TJoinedTable, 'name'>,
>(table: TJoinedTable, on: SQL, select?: TSelect) => SQLiteAsyncSelect<
	TTable,
	TInitialSelectResultFields,
	TStatement,
	TRunResult,
	AppendToResult<TResult, TJoinedName, TSelect>,
	AppendToJoinsNotNull<TJoinsNotNullable, TJoinedName, TJoinType>
>;

export type SyncJoinFn<
	TTable extends AnySQLiteTable,
	TInitialSelectResultFields extends SelectResultFields<SQLiteSelectFields<GetTableConfig<TTable, 'name'>>>,
	TStatement,
	TRunResult,
	TJoinType extends JoinType,
	TResult = undefined,
	TJoinsNotNullable extends Record<string, JoinNullability> = Record<GetTableConfig<TTable, 'name'>, 'not-null'>,
> = <
	TJoinedTable extends AnySQLiteTable,
	TSelect extends SQLiteSelectFields<string> = GetTableConfig<TJoinedTable, 'columns'>,
	TJoinedName extends GetTableConfig<TJoinedTable, 'name'> = GetTableConfig<TJoinedTable, 'name'>,
>(table: TJoinedTable, on: SQL, select?: TSelect) => SQLiteSyncSelect<
	TTable,
	TInitialSelectResultFields,
	TStatement,
	TRunResult,
	AppendToResult<TResult, TJoinedName, TSelect>,
	AppendToJoinsNotNull<TJoinsNotNullable, TJoinedName, TJoinType>
>;
