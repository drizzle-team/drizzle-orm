import { GetColumnData } from 'drizzle-orm';
import { TableName } from 'drizzle-orm/branded-types';
import { OptionalKeyOnly, RequiredKeyOnly } from 'drizzle-orm/operations';
import { Table } from 'drizzle-orm/table';
import { GetTableName, tableColumns } from 'drizzle-orm/utils';
import { Simplify } from 'type-fest';

import { AnyPgColumn, AnyPgColumnBuilder, BuildPgColumns } from './columns/common';
import { AnyConstraintBuilder, BuildConstraint, Constraint, ConstraintBuilder } from './constraints';
import { ForeignKey, ForeignKeyBuilder } from './foreign-keys';
import { AnyIndexBuilder, BuildIndex, Index, IndexBuilder } from './indexes';
import { tableConflictConstraints, tableConstraints, tableForeignKeys, tableIndexes } from './utils';

export type PgTableExtraConfig<TTableName extends TableName, TTable extends AnyPgTable<TTableName>> = Record<
	string,
	| AnyIndexBuilder<TTableName, TTable>
	| ConstraintBuilder<TTableName>
	| ForeignKeyBuilder<TTableName, TableName>
>;

export type AnyConflictConstraintBuilder<TTable extends AnyPgTable> =
	| AnyIndexBuilder<GetTableName<TTable>>
	| AnyConstraintBuilder<GetTableName<TTable>>;

export type BuildConflictConstraint<T> = T extends AnyIndexBuilder ? BuildIndex<T>
	: T extends AnyConstraintBuilder ? BuildConstraint<T>
	: never;

export type ConflictConstraintKeyOnly<Key, TType> = TType extends AnyConstraintBuilder ? Key
	: TType extends IndexBuilder<any, infer TUnique> ? TUnique extends true ? Key
		: never
	: never;

export type BuildConflictConstraints<TConfig extends PgTableExtraConfig<any, any>> = Simplify<
	{
		[Key in keyof TConfig as ConflictConstraintKeyOnly<Key, TConfig[Key]>]: BuildConflictConstraint<
			TConfig[Key]
		>;
	}
>;

export type ConflictConstraint<TTable extends AnyPgTable> =
	| Index<TTable, true>
	| Constraint<GetTableName<TTable>>;

export class PgTable<
	TName extends TableName,
	TConflictConstraints extends Record<string, ConflictConstraint<AnyPgTable>>,
> extends Table<TName> {
	protected override typeKeeper!: Table<TName>['typeKeeper'] & {
		conflictConstraints: TConflictConstraints;
	};

	/** @internal */
	[tableColumns]!: Record<string, AnyPgColumn<TName>>;

	/** @internal */
	[tableIndexes]: Record<string, Index<AnyPgTable<TName>, boolean>> = {};

	/** @internal */
	[tableForeignKeys]: Record<string, ForeignKey<TName, TableName>> = {};

	/** @internal */
	[tableConstraints]: Record<string, Constraint<TName>> = {};

	/** @internal */
	[tableConflictConstraints] = {} as TConflictConstraints;
}

export type PgTableWithColumns<
	TName extends TableName,
	TColumns extends Record<string, AnyPgColumn<TName>>,
	TConflictConstraints extends Record<string, ConflictConstraint<AnyPgTable>>,
> = PgTable<TName, TConflictConstraints> & TColumns;

export type GetTableColumns<TTable extends AnyPgTable> = TTable extends PgTableWithColumns<
	any,
	infer TColumns,
	any
> ? TColumns
	: never;

export type GetTableConflictConstraints<TTable extends AnyPgTable> = TTable extends PgTable<
	any,
	infer TConflictConstraints
> ? TConflictConstraints
	: never;

export type InferModel<
	TTable extends AnyPgTable,
	TInferMode extends 'select' | 'insert' = 'select',
> = TInferMode extends 'insert' ? Simplify<
		& {
			[
				Key in keyof GetTableColumns<TTable> & string as RequiredKeyOnly<
					Key,
					GetTableColumns<TTable>[Key]
				>
			]: GetColumnData<GetTableColumns<TTable>[Key], 'query'>;
		}
		& {
			[
				Key in keyof GetTableColumns<TTable> & string as OptionalKeyOnly<
					Key,
					GetTableColumns<TTable>[Key]
				>
			]?: GetColumnData<GetTableColumns<TTable>[Key], 'query'>;
		}
	>
	: {
		[Key in keyof GetTableColumns<TTable>]: GetColumnData<
			GetTableColumns<TTable>[Key],
			'query'
		>;
	};

export type AnyPgTable<TName extends TableName = TableName> = PgTable<TName, any>;

export function pgTable<
	TTableName extends string,
	TColumnsMap extends Record<string, AnyPgColumnBuilder>,
>(
	name: TTableName,
	columns: TColumnsMap,
): PgTableWithColumns<TableName<TTableName>, BuildPgColumns<TableName<TTableName>, TColumnsMap>, {}>;
export function pgTable<
	TTableName extends string,
	TColumnsMap extends Record<string, AnyPgColumnBuilder>,
	TExtraConfig extends PgTableExtraConfig<TableName<TTableName>, any>,
>(
	name: TTableName,
	columns: TColumnsMap,
	extraConfig: (self: BuildPgColumns<TableName<TTableName>, TColumnsMap>) => TExtraConfig,
): PgTableWithColumns<
	TableName<TTableName>,
	BuildPgColumns<TableName<TTableName>, TColumnsMap>,
	BuildConflictConstraints<TExtraConfig>
>;
export function pgTable<
	TTableName extends string,
	TColumnsMap extends Record<string, AnyPgColumnBuilder>,
	TExtraConfig extends PgTableExtraConfig<TableName<TTableName>, any>,
>(
	name: TTableName,
	columns: TColumnsMap,
	extraConfig?: (self: BuildPgColumns<TableName<TTableName>, TColumnsMap>) => TExtraConfig,
): PgTableWithColumns<
	TableName<TTableName>,
	BuildPgColumns<TableName<TTableName>, TColumnsMap>,
	BuildConflictConstraints<TExtraConfig>
> {
	const rawTable = new PgTable<TableName<TTableName>, BuildConflictConstraints<TExtraConfig>>(
		name as TableName<TTableName>,
	);

	const builtColumns = Object.fromEntries(
		Object.entries(columns).map(([name, colConfig]) => [name, colConfig.build(rawTable)]),
	) as BuildPgColumns<TableName<TTableName>, TColumnsMap>;

	rawTable[tableColumns] = builtColumns;

	const table = Object.assign(rawTable, builtColumns) as PgTableWithColumns<
		TableName<TTableName>,
		BuildPgColumns<TableName<TTableName>, TColumnsMap>,
		BuildConflictConstraints<TExtraConfig>
	>;

	table[tableColumns] = builtColumns;

	if (extraConfig) {
		const builtConfig = extraConfig(table);
		table[tableConflictConstraints] = builtConfig as unknown as BuildConflictConstraints<TExtraConfig>;

		Object.entries(builtConfig).forEach(([name, builder]) => {
			if (builder instanceof IndexBuilder) {
				table[tableIndexes][name] = builder.build(table);
			} else if (builder instanceof ConstraintBuilder) {
				table[tableConstraints][name] = builder.build(table);
			} else if (builder instanceof ForeignKeyBuilder) {
				table[tableForeignKeys][name] = builder.build(table);
			}
		});
	}

	return table;
}
