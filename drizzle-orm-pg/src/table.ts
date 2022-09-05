import { GetColumnData } from 'drizzle-orm';
import { TableName } from 'drizzle-orm/branded-types';
import { OptionalKeyOnly, RequiredKeyOnly } from 'drizzle-orm/operations';
import { Table } from 'drizzle-orm/table';
import { GetTableName, tableColumns } from 'drizzle-orm/utils';
import { Simplify } from 'type-fest';

import { AnyCheckBuilder, BuildCheck, Check, CheckBuilder } from './checks';
import { AnyPgColumn, AnyPgColumnBuilder, BuildPgColumns } from './columns/common';
import { ForeignKey, ForeignKeyBuilder } from './foreign-keys';
import { AnyIndexBuilder, BuildIndex, Index, IndexBuilder } from './indexes';
import { tableChecks, tableConflictConstraints, tableForeignKeys, tableIndexes } from './utils';

export type PgTableExtraConfig<TTableName extends TableName> = Record<
	string,
	| AnyIndexBuilder<TTableName>
	| CheckBuilder<TTableName>
	| ForeignKeyBuilder<TTableName, TableName>
>;

export type AnyConflictConstraintBuilder<TTableName extends TableName> =
	| AnyIndexBuilder<TTableName>
	| AnyCheckBuilder<TTableName>;

export type BuildConflictConstraint<TConstraint, TTableColumns extends Record<string, AnyPgColumn>> =
	TConstraint extends IndexBuilder<any, true> ? BuildIndex<TConstraint, TTableColumns>
		: TConstraint extends AnyCheckBuilder ? BuildCheck<TConstraint>
		: never;

export type ConflictConstraintKeyOnly<Key, TType> = TType extends AnyCheckBuilder ? Key
	: TType extends IndexBuilder<any, infer TUnique> ? TUnique extends true ? Key
		: never
	: never;

export type BuildConflictConstraints<
	TConfig extends PgTableExtraConfig<any>,
	TTableColumns extends Record<string, AnyPgColumn>,
> = Simplify<
	{
		[Key in keyof TConfig as ConflictConstraintKeyOnly<Key, TConfig[Key]>]: BuildConflictConstraint<
			TConfig[Key],
			TTableColumns
		>;
	}
>;

export type ConflictConstraint<TTableName extends TableName> =
	| Index<TTableName, any, true>
	| Check<TTableName>;

export class PgTable<
	TName extends TableName,
	TConflictConstraints extends Record<string | symbol, ConflictConstraint<TableName>>,
> extends Table<TName> {
	declare protected typeKeeper: Table<TName>['typeKeeper'] & {
		conflictConstraints: TConflictConstraints;
	};

	/** @internal */
	[tableColumns]!: Record<string | symbol, AnyPgColumn<TName>>;

	/** @internal */
	[tableIndexes]: Record<string | symbol, Index<TName, any, boolean>> = {};

	/** @internal */
	[tableForeignKeys]: Record<string | symbol, ForeignKey<TName, TableName>> = {};

	/** @internal */
	[tableChecks]: Record<string | symbol, Check<TName>> = {};

	/** @internal */
	[tableConflictConstraints] = {} as TConflictConstraints;
}

export type PgTableWithColumns<
	TName extends TableName,
	TColumns extends Record<string, AnyPgColumn<TName>>,
	TConflictConstraints extends Record<string, ConflictConstraint<TableName>>,
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
	TExtraConfigCallback extends (
		self: BuildPgColumns<TableName<TTableName>, TColumnsMap>,
	) => PgTableExtraConfig<TableName<TTableName>> = (self: BuildPgColumns<TableName<TTableName>, TColumnsMap>) => {},
>(
	name: TTableName,
	columns: TColumnsMap,
	extraConfig?: TExtraConfigCallback,
): PgTableWithColumns<
	TableName<TTableName>,
	BuildPgColumns<TableName<TTableName>, TColumnsMap>,
	BuildConflictConstraints<ReturnType<TExtraConfigCallback>, BuildPgColumns<TableName<TTableName>, TColumnsMap>>
>;
export function pgTable<
	TTableName extends string,
	TColumnsMap extends Record<string, AnyPgColumnBuilder>,
	TExtraConfig extends PgTableExtraConfig<TableName<TTableName>>,
>(
	name: TTableName,
	columns: TColumnsMap,
	extraConfig?: (self: BuildPgColumns<TableName<TTableName>, TColumnsMap>) => TExtraConfig,
): PgTableWithColumns<
	TableName<TTableName>,
	BuildPgColumns<TableName<TTableName>, TColumnsMap>,
	BuildConflictConstraints<TExtraConfig, BuildPgColumns<TableName<TTableName>, TColumnsMap>>
> {
	const rawTable = new PgTable<
		TableName<TTableName>,
		BuildConflictConstraints<TExtraConfig, BuildPgColumns<TableName<TTableName>, TColumnsMap>>
	>(
		name as TableName<TTableName>,
	);

	const builtColumns = Object.fromEntries(
		Object.entries(columns).map(([name, colBuilder]) => {
			const column = colBuilder.build(rawTable);
			colBuilder.buildForeignKeys(column, rawTable).forEach((fk, fkIndex) => {
				rawTable[tableForeignKeys][Symbol(`${name}_${fkIndex}`)] = fk;
			});
			return [name, column];
		}),
	) as BuildPgColumns<TableName<TTableName>, TColumnsMap>;

	rawTable[tableColumns] = builtColumns;

	const table = Object.assign(rawTable, builtColumns) as PgTableWithColumns<
		TableName<TTableName>,
		BuildPgColumns<TableName<TTableName>, TColumnsMap>,
		BuildConflictConstraints<TExtraConfig, BuildPgColumns<TableName<TTableName>, TColumnsMap>>
	>;

	table[tableColumns] = builtColumns;

	if (extraConfig) {
		const builtConfig = extraConfig(table);
		table[tableConflictConstraints] = builtConfig as unknown as BuildConflictConstraints<
			TExtraConfig,
			BuildPgColumns<TableName<TTableName>, TColumnsMap>
		>;

		Object.entries(builtConfig).forEach(([name, builder]) => {
			if (builder instanceof IndexBuilder) {
				table[tableIndexes][name] = builder.build(table);
			} else if (builder instanceof CheckBuilder) {
				table[tableChecks][name] = builder.build(table);
			} else if (builder instanceof ForeignKeyBuilder) {
				table[tableForeignKeys][name] = builder.build(table);
			}
		});
	}

	return table;
}
