import { InferColumnType } from 'drizzle-orm';
import { BuildColumns } from 'drizzle-orm/column-builder';
import { OptionalKeyOnly, RequiredKeyOnly } from 'drizzle-orm/operations';
import { Table } from 'drizzle-orm/table';
import { tableColumns, TableName } from 'drizzle-orm/utils';
import { Simplify } from 'type-fest';

import { AnyPgColumn, AnyPgColumnBuilder } from './columns/common';
import { AnyConstraintBuilder, BuildConstraint, Constraint, ConstraintBuilder } from './constraints';
import { ForeignKey, ForeignKeyBuilder } from './foreign-keys';
import { AnyIndexBuilder, BuildIndex, Index, IndexBuilder } from './indexes';
import { tableConflictConstraints, tableConstraints, tableForeignKeys, tableIndexes } from './utils';

export type PgTableExtraConfig<TTableName extends string, TTable extends AnyPgTable<TTableName>> = Record<
	string,
	| AnyIndexBuilder<TTableName, TTable>
	| ConstraintBuilder<TTableName>
	| ForeignKeyBuilder<TTableName, string>
>;

export type AnyConflictConstraintBuilder<TTable extends AnyPgTable> =
	| AnyIndexBuilder<TableName<TTable>>
	| AnyConstraintBuilder<TableName<TTable>>;

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
	| Constraint<TableName<TTable>>;

export class PgTable<
	TName extends string,
	TConflictConstraints extends Record<string, ConflictConstraint<AnyPgTable>>,
> extends Table<TName> {
	protected override typeKeeper!: Table<TName>['typeKeeper'] & {
		conflictConstraints: TConflictConstraints;
	};

	/** @internal */
	[tableIndexes]: Record<string, Index<AnyPgTable<TName>, boolean>> = {};

	/** @internal */
	[tableForeignKeys]: Record<string, ForeignKey<TName, string>> = {};

	/** @internal */
	[tableConstraints]: Record<string, Constraint<TName>> = {};

	/** @internal */
	[tableConflictConstraints] = {} as TConflictConstraints;
}

export type PgTableWithColumns<
	TName extends string,
	TColumns extends Record<string, AnyPgColumn>,
	TConflictConstraints extends Record<string, ConflictConstraint<AnyPgTable>>,
> = PgTable<TName, TConflictConstraints> & TColumns;

export type TableColumns<TTable extends AnyPgTable> = TTable extends PgTableWithColumns<
	string,
	infer TColumns,
	any
> ? TColumns
	: never;

export type TableConflictConstraints<TTable extends AnyPgTable> = TTable extends PgTable<
	any,
	infer TConflictConstraints
> ? TConflictConstraints
	: never;

export type InferType<
	TTable extends AnyPgTable,
	TInferMode extends 'select' | 'insert' = 'select',
> = TInferMode extends 'insert' ? Simplify<
		& {
			[
				Key in keyof TableColumns<TTable> & string as RequiredKeyOnly<
					Key,
					TableColumns<TTable>[Key]
				>
			]: InferColumnType<TableColumns<TTable>[Key], 'query'>;
		}
		& {
			[
				Key in keyof TableColumns<TTable> & string as OptionalKeyOnly<
					Key,
					TableColumns<TTable>[Key]
				>
			]?: InferColumnType<TableColumns<TTable>[Key], 'query'>;
		}
	>
	: {
		[Key in keyof TableColumns<TTable>]: InferColumnType<
			TableColumns<TTable>[Key],
			'query'
		>;
	};

export type AnyPgTable<TName extends string = string> = PgTable<TName, any>;

export function pgTable<
	TTableName extends string,
	TColumnsMap extends Record<string, AnyPgColumnBuilder>,
>(
	name: TTableName,
	columns: TColumnsMap,
): PgTableWithColumns<TTableName, BuildColumns<TTableName, TColumnsMap>, {}>;
export function pgTable<
	TTableName extends string,
	TColumnsMap extends Record<string, AnyPgColumnBuilder>,
	TExtraConfig extends PgTableExtraConfig<TTableName, any>,
>(
	name: TTableName,
	columns: TColumnsMap,
	extraConfig: (self: BuildColumns<TTableName, TColumnsMap>) => TExtraConfig,
): PgTableWithColumns<
	TTableName,
	BuildColumns<TTableName, TColumnsMap>,
	BuildConflictConstraints<TExtraConfig>
>;
export function pgTable<
	TTableName extends string,
	TColumnsMap extends Record<string, AnyPgColumnBuilder>,
	TExtraConfig extends PgTableExtraConfig<TTableName, any>,
>(
	name: TTableName,
	columns: TColumnsMap,
	extraConfig?: (self: BuildColumns<TTableName, TColumnsMap>) => TExtraConfig,
): PgTableWithColumns<
	TTableName,
	BuildColumns<TTableName, TColumnsMap>,
	BuildConflictConstraints<TExtraConfig>
> {
	const rawTable = new PgTable<TTableName, BuildConflictConstraints<TExtraConfig>>(name);

	const builtColumns = Object.fromEntries(
		Object.entries(columns).map(([name, colConfig]) => [name, colConfig.build(rawTable)]),
	) as BuildColumns<TTableName, TColumnsMap>;

	rawTable[tableColumns] = builtColumns;

	const table = Object.assign(rawTable, builtColumns);

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
