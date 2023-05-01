import type { BuildColumns } from '~/column-builder';
import { type Many, type One, type Relation, type Relations } from '~/relations';
import { Table, type TableConfig as TableConfigBase, TableExtraConfig, type UpdateTableConfig } from '~/table';
import { type Writable } from '~/utils';
import type { CheckBuilder } from './checks';
import type { AnyPgColumn, AnyPgColumnBuilder } from './columns/common';
import type { ForeignKey, ForeignKeyBuilder } from './foreign-keys';
import type { AnyIndexBuilder } from './indexes';
import type { PrimaryKeyBuilder } from './primary-keys';
import { type RelationConfig } from './relations';
import { type ColumnsWithTable } from './utils';

export class PgTableExtraConfig<TTableName extends string, TBuilder extends PgTableExtraConfigBuilder>
	extends TableExtraConfig<TTableName, TBuilder>
{
	declare protected $pgBrand: 'PgTableConfig';
}

export type PgTableExtraConfigBuilderItem =
	| AnyIndexBuilder
	| CheckBuilder
	| ForeignKeyBuilder
	| PrimaryKeyBuilder
	| Relations<any>;

export type PgTableExtraConfigBuilder = PgTableExtraConfigBuilderItem[];

export type TableConfig = TableConfigBase<AnyPgColumn>;

/** @internal */
export const InlineForeignKeys = Symbol('InlineForeignKeys');

export class PgTable<T extends TableConfig> extends Table<T> {
	/** @internal */
	static override readonly Symbol = Object.assign({}, Table.Symbol, {
		InlineForeignKeys: InlineForeignKeys as typeof InlineForeignKeys,
	});

	/**@internal */
	[InlineForeignKeys]: ForeignKey[] = [];
}

export type AnyPgTable<TPartial extends Partial<TableConfig> = {}> = PgTable<UpdateTableConfig<TableConfig, TPartial>>;

export type PgTableWithColumns<T extends TableConfig> =
	& PgTable<T>
	& {
		[Key in keyof T['columns']]: T['columns'][Key];
	};

/** @internal */
export function pgTableWithSchema<
	TTableName extends string,
	TSchemaName extends string | undefined,
	TColumnsMap extends Record<string, AnyPgColumnBuilder>,
>(
	name: TTableName,
	columns: TColumnsMap,
	schema: TSchemaName,
	baseName = name,
): PgTableWithColumns<{
	name: TTableName;
	schema: TSchemaName;
	columns: BuildColumns<TTableName, TColumnsMap>;
}> {
	const rawTable = new PgTable<{
		name: TTableName;
		schema: TSchemaName;
		columns: BuildColumns<TTableName, TColumnsMap>;
	}>(name, schema, baseName);

	const builtColumns = Object.fromEntries(
		Object.entries(columns).map(([name, colBuilder]) => {
			const column = colBuilder.build(rawTable);
			rawTable[InlineForeignKeys].push(...colBuilder.buildForeignKeys(column, rawTable));
			return [name, column];
		}),
	) as unknown as BuildColumns<TTableName, TColumnsMap>;

	const table = Object.assign(rawTable, builtColumns);

	table[Table.Symbol.Columns] = builtColumns;

	return table;
}

export interface PgTableFn<TSchema extends string | undefined = undefined> {
	<
		TTableName extends string,
		TColumnsMap extends Record<string, AnyPgColumnBuilder>,
	>(
		name: TTableName,
		columns: TColumnsMap,
	): PgTableWithColumns<{
		name: TTableName;
		schema: TSchema;
		columns: BuildColumns<TTableName, TColumnsMap>;
	}>;
}

export const pgTable: PgTableFn = (name, columns) => {
	return pgTableWithSchema(name, columns, undefined);
};

export function pgTableCreator(customizeTableName: (name: string) => string): PgTableFn {
	return (name, columns) => {
		return pgTableWithSchema(customizeTableName(name) as typeof name, columns, undefined, name);
	};
}

export interface TableExtraConfigHelpers<TTableName extends string> {
	relations<TRelations extends Record<string, Relation<any>>>(
		relations: TRelations,
	): Relations<TRelations>;

	one<
		TForeignTableName extends string,
		TColumns extends AnyPgColumn<{ tableName: TTableName }>[],
	>(
		table: AnyPgTable<{ name: TForeignTableName }>,
		config?: RelationConfig<TTableName, TForeignTableName, TColumns>,
	): One<
		TForeignTableName
	>;

	many<TForeignTableName extends string>(
		table: AnyPgTable<{ name: TForeignTableName }>,
		config?: { relationName: string },
	): Many<TForeignTableName>;

	foreignKey<
		TTableName extends string,
		TForeignTableName extends string,
		TColumns extends [AnyPgColumn<{ tableName: TTableName }>, ...AnyPgColumn<{ tableName: TTableName }>[]],
	>(
		config: {
			/** @deprecated Use `fields` instead */
			columns: TColumns;
			/* @deprecated Use `references` instead */
			foreignColumns: ColumnsWithTable<Table['_']['name'], TForeignTableName, TColumns>;
		} | {
			fields: TColumns;
			references: ColumnsWithTable<Table['_']['name'], TForeignTableName, TColumns>;
		},
	): ForeignKeyBuilder;
}

export function pgTableConfig<
	TTableName extends string,
	TConfigItem extends PgTableExtraConfigBuilderItem,
	TConfig extends Readonly<[TConfigItem, ...TConfigItem[]]>,
>(
	table: AnyPgTable<{ name: TTableName }>,
	config: (helpers: TableExtraConfigHelpers<TTableName>) => TConfig | Writable<TConfig>,
): PgTableExtraConfig<TTableName, Writable<TConfig>> {
	return new PgTableExtraConfig<TTableName, Writable<TConfig>>(table, config);
}
