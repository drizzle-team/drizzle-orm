import { entityKind } from '~/entity.ts';
import type { InferModelFromColumns } from '~/table.ts';
import { Table, type TableConfig as TableConfigBase, type UpdateTableConfig } from '~/table.ts';
import type { CheckBuilder } from './checks.ts';
import { getPgColumnBuilders, type PgColumnsBuilders } from './columns/all.ts';
import type {
	AnyPgColumnBuilder,
	ExtraConfigColumn,
	PgBuildColumns,
	PgBuildExtraConfigColumns,
	PgColumn,
	PgColumnBuilder,
	PgColumns,
} from './columns/common.ts';
import type { ForeignKey, ForeignKeyBuilder } from './foreign-keys.ts';
import type { AnyIndexBuilder } from './indexes.ts';
import type { PgPolicy } from './policies.ts';
import type { PrimaryKeyBuilder } from './primary-keys.ts';
import type { UniqueConstraintBuilder } from './unique-constraint.ts';

export type PgTableExtraConfigValue =
	| AnyIndexBuilder
	| CheckBuilder
	| ForeignKeyBuilder
	| PrimaryKeyBuilder
	| UniqueConstraintBuilder
	| PgPolicy;

export type PgTableExtraConfig = Record<string, PgTableExtraConfigValue>;

export type TableConfig = TableConfigBase<PgColumns>;

/** @internal */
export const InlineForeignKeys = Symbol.for('drizzle:PgInlineForeignKeys');
/** @internal */
export const EnableRLS = Symbol.for('drizzle:EnableRLS');

export class PgTable<out T extends TableConfig = TableConfig> extends Table<T> {
	static override readonly [entityKind]: string = 'PgTable';

	/** @internal */
	static override readonly Symbol = Object.assign({}, Table.Symbol, {
		InlineForeignKeys: InlineForeignKeys as typeof InlineForeignKeys,
		EnableRLS: EnableRLS as typeof EnableRLS,
	});

	/**@internal */
	[InlineForeignKeys]: ForeignKey[] = [];

	/** @internal */
	[EnableRLS]: boolean = false;

	/** @internal */
	override [Table.Symbol.ExtraConfigBuilder]: ((self: Record<string, PgColumn>) => PgTableExtraConfig) | undefined =
		undefined;

	/** @internal */
	override [Table.Symbol.ExtraConfigColumns]: Record<string, ExtraConfigColumn> = {};
}

export type AnyPgTable<TPartial extends Partial<TableConfig> = {}> = PgTable<UpdateTableConfig<TableConfig, TPartial>>;

// type InferInsertColumns<TColumns extends PgColumns> = Simplify<
// 	& {
// 		// Required keys: insertType does not include undefined or null
// 		[
// 			Key in keyof TColumns & string as TColumns[Key]['_']['insertType'] extends never ? never
// 				// Check doesn't work properly with `"strictNullChecks": false`, to be reworked
// 				: undefined extends TColumns[Key]['_']['insertType'] ? never
// 				: Key
// 		]: TColumns[Key]['_']['insertType'];
// 	}
// 	& {
// 		// Optional keys: insertType includes undefined
// 		[
// 			Key in keyof TColumns & string as TColumns[Key]['_']['insertType'] extends never ? never
// 				// Check doesn't work properly with `"strictNullChecks": false`, to be reworked
// 				: undefined extends TColumns[Key]['_']['insertType'] ? Key
// 				: never
// 		]?: TColumns[Key]['_']['insertType'];
// 	}
// >;

export type PgTableWithColumns<T extends TableConfig> =
	& PgTable<T>
	& T['columns']
	& {
		readonly $inferSelect: InferModelFromColumns<T['columns'], 'select'>;
		readonly $inferInsert: InferModelFromColumns<T['columns'], 'insert'>;
	}
	& {
		/** @deprecated use `pgTable.withRLS()` instead*/
		enableRLS: () => Omit<
			PgTableWithColumns<T>,
			'enableRLS'
		>;
	};

/** @internal */
export function pgTableWithSchema<
	TTableName extends string,
	TSchemaName extends string | undefined,
	TColumnsMap extends Record<string, AnyPgColumnBuilder>,
>(
	name: TTableName,
	columns: TColumnsMap | ((columnTypes: PgColumnsBuilders) => TColumnsMap),
	extraConfig:
		| ((self: PgBuildExtraConfigColumns<TColumnsMap>) => PgTableExtraConfig | PgTableExtraConfigValue[])
		| undefined,
	schema: TSchemaName,
	baseName = name,
): PgTableWithColumns<{
	name: TTableName;
	schema: TSchemaName;
	columns: PgBuildColumns<TTableName, TColumnsMap>;
	dialect: 'pg';
}> {
	const rawTable = new PgTable<{
		name: TTableName;
		schema: TSchemaName;
		columns: PgBuildColumns<TTableName, TColumnsMap>;
		dialect: 'pg';
	}>(name, schema, baseName);

	const parsedColumns: TColumnsMap = typeof columns === 'function' ? columns(getPgColumnBuilders()) : columns;

	const builtColumns = Object.fromEntries(
		Object.entries(parsedColumns).map(([name, colBuilderBase]) => {
			const colBuilder = colBuilderBase as PgColumnBuilder;
			colBuilder.setName(name);
			const column = colBuilder.build(rawTable);
			rawTable[InlineForeignKeys].push(...colBuilder.buildForeignKeys(column, rawTable));
			return [name, column];
		}),
	) as unknown as PgBuildColumns<TTableName, TColumnsMap>;

	const builtColumnsForExtraConfig = Object.fromEntries(
		Object.entries(parsedColumns).map(([name, colBuilderBase]) => {
			const colBuilder = colBuilderBase as PgColumnBuilder;
			colBuilder.setName(name);
			const column = colBuilder.buildExtraConfigColumn(rawTable);
			return [name, column];
		}),
	) as unknown as PgBuildExtraConfigColumns<TColumnsMap>;

	const table = Object.assign(rawTable, builtColumns);

	table[Table.Symbol.Columns] = builtColumns;
	table[Table.Symbol.ExtraConfigColumns] = builtColumnsForExtraConfig;

	if (extraConfig) {
		table[PgTable.Symbol.ExtraConfigBuilder] = extraConfig as any;
	}

	return Object.assign(table, {
		enableRLS: () => {
			table[PgTable.Symbol.EnableRLS] = true;
			return table as PgTableWithColumns<{
				name: TTableName;
				schema: TSchemaName;
				columns: PgBuildColumns<TTableName, TColumnsMap>;
				dialect: 'pg';
			}>;
		},
	}) as any;
}

export interface PgTableFnInternal<TSchema extends string | undefined = undefined> {
	<
		TTableName extends string,
		TColumnsMap extends Record<string, AnyPgColumnBuilder>,
	>(
		name: TTableName,
		columns: TColumnsMap,
		extraConfig?: (
			self: PgBuildExtraConfigColumns<TColumnsMap>,
		) => PgTableExtraConfigValue[],
	): PgTableWithColumns<{
		name: TTableName;
		schema: TSchema;
		columns: PgBuildColumns<TTableName, TColumnsMap>;
		dialect: 'pg';
	}>;

	<
		TTableName extends string,
		TColumnsMap extends Record<string, AnyPgColumnBuilder>,
	>(
		name: TTableName,
		columns: (columnTypes: PgColumnsBuilders) => TColumnsMap,
		extraConfig?: (self: PgBuildExtraConfigColumns<TColumnsMap>) => PgTableExtraConfigValue[],
	): PgTableWithColumns<{
		name: TTableName;
		schema: TSchema;
		columns: PgBuildColumns<TTableName, TColumnsMap>;
		dialect: 'pg';
	}>;
	/**
	 * @deprecated The third parameter of pgTable is changing and will only accept an array instead of an object
	 *
	 * @example
	 * Deprecated version:
	 * ```ts
	 * export const users = pgTable("users", {
	 * 	id: integer(),
	 * }, (t) => ({
	 * 	idx: index('custom_name').on(t.id)
	 * }));
	 * ```
	 *
	 * New API:
	 * ```ts
	 * export const users = pgTable("users", {
	 * 	id: integer(),
	 * }, (t) => [
	 * 	index('custom_name').on(t.id)
	 * ]);
	 * ```
	 */
	<
		TTableName extends string,
		TColumnsMap extends Record<string, AnyPgColumnBuilder>,
	>(
		name: TTableName,
		columns: TColumnsMap,
		extraConfig: (
			self: PgBuildExtraConfigColumns<TColumnsMap>,
		) => PgTableExtraConfig,
	): PgTableWithColumns<{
		name: TTableName;
		schema: TSchema;
		columns: PgBuildColumns<TTableName, TColumnsMap>;
		dialect: 'pg';
	}>;

	/**
	 * @deprecated The third parameter of pgTable is changing and will only accept an array instead of an object
	 *
	 * @example
	 * Deprecated version:
	 * ```ts
	 * export const users = pgTable("users", {
	 * 	id: integer(),
	 * }, (t) => ({
	 * 	idx: index('custom_name').on(t.id)
	 * }));
	 * ```
	 *
	 * New API:
	 * ```ts
	 * export const users = pgTable("users", {
	 * 	id: integer(),
	 * }, (t) => [
	 * 	index('custom_name').on(t.id)
	 * ]);
	 * ```
	 */
	<
		TTableName extends string,
		TColumnsMap extends Record<string, AnyPgColumnBuilder>,
	>(
		name: TTableName,
		columns: (columnTypes: PgColumnsBuilders) => TColumnsMap,
		extraConfig: (self: PgBuildExtraConfigColumns<TColumnsMap>) => PgTableExtraConfig,
	): PgTableWithColumns<{
		name: TTableName;
		schema: TSchema;
		columns: PgBuildColumns<TTableName, TColumnsMap>;
		dialect: 'pg';
	}>;
}

export interface PgTableFn<TSchema extends string | undefined = undefined> extends PgTableFnInternal<TSchema> {
	withRLS: PgTableFnInternal<TSchema>;
}

const pgTableInternal: PgTableFnInternal = (name, columns, extraConfig) => {
	return pgTableWithSchema(name, columns, extraConfig, undefined);
};

const pgTableWithRLS: PgTableFn['withRLS'] = (name, columns, extraConfig) => {
	const table = pgTableWithSchema(name, columns, extraConfig, undefined);
	table[EnableRLS] = true;

	return table;
};

export const pgTable: PgTableFn = Object.assign(pgTableInternal, { withRLS: pgTableWithRLS });

export function pgTableCreator(customizeTableName: (name: string) => string): PgTableFn {
	const fn: PgTableFnInternal = (name, columns, extraConfig) => {
		return pgTableWithSchema(customizeTableName(name) as typeof name, columns, extraConfig, undefined, name);
	};

	return Object.assign(fn, {
		withRLS: ((name, columns, extraConfig) => {
			const table = pgTableWithSchema(customizeTableName(name) as typeof name, columns, extraConfig, undefined, name);
			table[EnableRLS] = true;

			return table;
		}) as PgTableFnInternal,
	});
}
