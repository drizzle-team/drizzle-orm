import { InferColumnType } from 'drizzle-orm';
import { BuildColumns } from 'drizzle-orm/column-builder';
import { RequiredKeyOnly, OptionalKeyOnly } from 'drizzle-orm/operations';
import { Table } from 'drizzle-orm/table';
import { tableColumns } from 'drizzle-orm/utils';
import { Simplify } from 'type-fest';

import { serial, text, int } from './columns';
import { AnyPgColumn, PgColumnBuilder } from './columns/common';
import { AnyConstraintBuilder, Constraint, ConstraintBuilder } from './constraints';
import { ForeignKey, ForeignKeyBuilder } from './foreign-keys';
import { AnyIndexBuilder, Index, IndexBuilder } from './indexes';
import { tableConstraints, tableForeignKeys, tableIndexes } from './utils';

export type PgTableExtraConfig<TTableName extends string> = Record<
	string,
	| AnyIndexBuilder<TTableName>
	| ConstraintBuilder<TTableName>
	| ForeignKeyBuilder<TTableName, string>
>;

export type ConflictConstraintKeyOnly<Key, TType> = TType extends AnyConstraintBuilder
	? Key
	: TType extends IndexBuilder<any, infer TUnique>
	? TUnique extends true
		? Key
		: never
	: never;

export type InferConflictConstraints<TConfig extends PgTableExtraConfig<string> | undefined> =
	TConfig extends undefined
		? never
		: Simplify<{
				[Key in keyof TConfig as ConflictConstraintKeyOnly<Key, TConfig[Key]>]: true;
		  }>;

export type ConflictConstraint = true;

export class PgTable<
	TName extends string,
	TConflictConstraints extends Record<string, ConflictConstraint> | undefined,
> extends Table<TName> {
	protected override enforceCovariance!: Table<TName>['enforceCovariance'] & {
		conflictConstraints: TConflictConstraints;
	};

	/** @internal */
	[tableIndexes]: Record<string, Index<TName>> = {};

	/** @internal */
	[tableForeignKeys]: Record<string, ForeignKey<TName, string>> = {};

	/** @internal */
	[tableConstraints]: Record<string, Constraint<TName>> = {};
}

export type PgTableWithColumns<
	TName extends string,
	TColumns extends Record<string, AnyPgColumn>,
	TConflictConstraints extends Record<string, ConflictConstraint> | undefined,
> = PgTable<TName, TConflictConstraints> & TColumns;

export type TableColumns<TTable extends AnyPgTable> = TTable extends PgTableWithColumns<
	string,
	infer TColumns,
	any
>
	? TColumns
	: never;

export type InferType<
	TTable extends AnyPgTable,
	TInferMode extends 'select' | 'insert' = 'select',
> = TInferMode extends 'insert'
	? Simplify<
			{
				[Key in keyof TableColumns<TTable> as RequiredKeyOnly<
					Key,
					TableColumns<TTable>[Key]
				>]: InferColumnType<TableColumns<TTable>[Key], 'query'>;
			} & {
				[Key in keyof TableColumns<TTable> as OptionalKeyOnly<
					Key,
					TableColumns<TTable>[Key]
				>]?: InferColumnType<TableColumns<TTable>[Key], 'query'>;
			}
	  >
	: {
			[Key in keyof TableColumns<TTable>]: InferColumnType<
				TableColumns<TTable>[Key],
				'query'
			>;
	  };

export type AnyPgTable<TName extends string = string> = PgTable<
	TName,
	Record<string, ConflictConstraint> | undefined
>;

export function pgTable<
	TTableName extends string,
	TColumnsMap extends Record<string, PgColumnBuilder>,
>(
	name: TTableName,
	columns: TColumnsMap,
): PgTableWithColumns<TTableName, BuildColumns<TTableName, TColumnsMap>, undefined>;
export function pgTable<
	TTableName extends string,
	TColumnsMap extends Record<string, PgColumnBuilder>,
	TExtraConfig extends PgTableExtraConfig<TTableName>,
>(
	name: TTableName,
	columns: TColumnsMap,
	extraConfig: (self: BuildColumns<TTableName, TColumnsMap>) => TExtraConfig,
): PgTableWithColumns<
	TTableName,
	BuildColumns<TTableName, TColumnsMap>,
	InferConflictConstraints<TExtraConfig>
>;
export function pgTable<
	TTableName extends string,
	TColumnsMap extends Record<string, PgColumnBuilder>,
	TExtraConfig extends PgTableExtraConfig<TTableName>,
>(
	name: TTableName,
	columns: TColumnsMap,
	extraConfig?: (self: BuildColumns<TTableName, TColumnsMap>) => TExtraConfig,
): PgTableWithColumns<
	TTableName,
	BuildColumns<TTableName, TColumnsMap>,
	InferConflictConstraints<TExtraConfig> | undefined
> {
	const rawTable = new PgTable<TTableName, InferConflictConstraints<TExtraConfig>>(name);

	const builtColumns = Object.fromEntries(
		Object.entries(columns).map(([name, colConfig]) => [name, colConfig.build(rawTable)]),
	) as BuildColumns<TTableName, TColumnsMap>;

	rawTable[tableColumns] = builtColumns;

	const table = Object.assign(rawTable, builtColumns);

	table[tableColumns] = builtColumns;

	if (extraConfig) {
		Object.entries(extraConfig(table)).forEach(([name, builder]) => {
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
