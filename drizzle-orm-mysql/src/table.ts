import { GetColumnData } from 'drizzle-orm';
import { TableName } from 'drizzle-orm/branded-types';
import { OptionalKeyOnly, RequiredKeyOnly } from 'drizzle-orm/operations';
import { Table } from 'drizzle-orm/table';
import { tableColumns } from 'drizzle-orm/utils';
import { Simplify } from 'type-fest';

import { Check, CheckBuilder } from './checks';
import { AnyMySqlColumn, AnyMySqlColumnBuilder, BuildMySqlColumns } from './columns/common';
import { ForeignKey, ForeignKeyBuilder } from './foreign-keys';
import { AnyIndexBuilder, Index, IndexBuilder } from './indexes';
import { tableChecks, tableForeignKeys, tableIndexes } from './utils';

export type MySqlTableExtraConfig<TTableName extends string> = Record<
	string,
	| AnyIndexBuilder<TTableName>
	| CheckBuilder<TTableName>
	| ForeignKeyBuilder<TTableName, TableName>
>;

export class MySqlTable<TName extends string> extends Table<TName> {
	/** @internal */
	[tableColumns]!: Record<string | symbol, AnyMySqlColumn<TName>>;

	/** @internal */
	[tableIndexes]: Record<string | symbol, Index<TName>> = {};

	/** @internal */
	[tableForeignKeys]: Record<string | symbol, ForeignKey<TName, TableName>> = {};

	/** @internal */
	[tableChecks]: Record<string | symbol, Check<TName>> = {};
}

export type MySqlTableWithColumns<
	TName extends string,
	TColumns extends Record<string, AnyMySqlColumn<TName>>,
> =
	& MySqlTable<TName>
	& TColumns;

export type GetTableColumns<TTable extends AnyMySqlTable> = TTable extends MySqlTableWithColumns<
	any,
	infer TColumns
> ? TColumns
	: never;

export type InferModel<
	TTable extends AnyMySqlTable,
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

export type AnyMySqlTable<TName extends string = TableName> = MySqlTable<TName>;

export function mysqlTable<
	TTableName extends string,
	TColumnsMap extends Record<string, AnyMySqlColumnBuilder>,
	TExtraConfigCallback extends (
		self: BuildMySqlColumns<TableName<TTableName>, TColumnsMap>,
	) => MySqlTableExtraConfig<TableName<TTableName>> = (
		self: BuildMySqlColumns<TableName<TTableName>, TColumnsMap>,
	) => {},
>(
	name: TTableName,
	columns: TColumnsMap,
	extraConfig?: TExtraConfigCallback,
): MySqlTableWithColumns<
	TableName<TTableName>,
	BuildMySqlColumns<TableName<TTableName>, TColumnsMap>
>;
export function mysqlTable<
	TTableName extends string,
	TColumnsMap extends Record<string, AnyMySqlColumnBuilder>,
	TExtraConfig extends MySqlTableExtraConfig<TableName<TTableName>>,
>(
	name: TTableName,
	columns: TColumnsMap,
	extraConfig?: (self: BuildMySqlColumns<TableName<TTableName>, TColumnsMap>) => TExtraConfig,
): MySqlTableWithColumns<
	TableName<TTableName>,
	BuildMySqlColumns<TableName<TTableName>, TColumnsMap>
> {
	const rawTable = new MySqlTable<TableName<TTableName>>(
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
	) as BuildMySqlColumns<TableName<TTableName>, TColumnsMap>;

	rawTable[tableColumns] = builtColumns;

	const table = Object.assign(rawTable, builtColumns) as MySqlTableWithColumns<
		TableName<TTableName>,
		BuildMySqlColumns<TableName<TTableName>, TColumnsMap>
	>;

	table[tableColumns] = builtColumns;

	if (extraConfig) {
		const builtConfig = extraConfig(table);
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
