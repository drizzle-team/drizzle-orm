import { Table } from 'drizzle-orm';
import { Param, SQL, SQLResponse } from 'drizzle-orm/sql';
import { AnyPgColumn, PgColumn } from '~/columns';
import { SelectFields, SelectFieldsOrdered } from '~/operations';
import { PgUpdateSet } from '~/query-builders';
import { AnyPgTable, GetTableConfig, PgTable } from '~/table';
import { Check, CheckBuilder } from './checks';
import { ForeignKey, ForeignKeyBuilder } from './foreign-keys';
import { Index, IndexBuilder } from './indexes';

export function getTableConfig<TTable extends AnyPgTable>(table: TTable) {
	const columns = getTableColumns(table);
	const indexes: Index[] = [];
	const checks: Check[] = [];
	const foreignKeys: ForeignKey[] = getTableForeignKeys(table);

	const extraConfig = table[PgTable.Symbol.ExtraConfig];

	if (typeof extraConfig === 'undefined') {
		return {
			columns,
			indexes,
			foreignKeys,
			checks,
		};
	}

	const builtConfig = extraConfig(table[PgTable.Symbol.Columns]);
	Object.entries(builtConfig).forEach(([_, builder]) => {
		if (builder instanceof IndexBuilder) {
			indexes.push(builder.build(table));
		} else if (builder instanceof CheckBuilder) {
			checks.push(builder.build(table));
		} else if (builder instanceof ForeignKeyBuilder) {
			foreignKeys.push(builder.build(table));
		}
	});

	return {
		columns: getTableColumns(table),
		indexes,
		foreignKeys,
		checks,
	};
}

export interface GetTableColumnsConfig<TFormat extends 'object' | 'array' = 'object' | 'array'> {
	format: TFormat;
}

export function getTableColumns<TTable extends AnyPgTable>(
	table: TTable,
	config: GetTableColumnsConfig<'object'>,
): Record<string, AnyPgColumn<{ tableName: GetTableConfig<TTable, 'name'> }>>;
export function getTableColumns<TTable extends AnyPgTable>(
	table: TTable,
	config?: GetTableColumnsConfig<'array'>,
): AnyPgColumn<{ tableName: GetTableConfig<TTable, 'name'> }>[];
export function getTableColumns<TTable extends AnyPgTable>(
	table: TTable,
	config?: GetTableColumnsConfig,
): Record<string, AnyPgColumn> | AnyPgColumn[] {
	const columns = table[PgTable.Symbol.Columns];
	if (config?.format === 'object') {
		return columns;
	}
	const keys = Reflect.ownKeys(columns);
	return keys.map((key) => columns[key]!);
}

export function getTableIndexes<TTable extends AnyPgTable>(table: TTable) {
	const indexes = table[PgTable.Symbol.Indexes];
	const keys = Reflect.ownKeys(indexes);
	return keys.map((key) => indexes[key]!);
}

export function getTableForeignKeys<TTable extends AnyPgTable>(table: TTable) {
	const foreignKeys = table[PgTable.Symbol.ForeignKeys];
	const keys = Reflect.ownKeys(foreignKeys);
	return keys.map((key) => foreignKeys[key]!);
}

export function getTableChecks<TTable extends AnyPgTable>(table: TTable) {
	const checks = table[PgTable.Symbol.Checks];
	const keys = Reflect.ownKeys(checks);
	return keys.map((key) => checks[key]!);
}

/** @internal */
export function mapUpdateSet(table: AnyPgTable, values: Record<string, unknown>): PgUpdateSet {
	return Object.fromEntries<PgUpdateSet[string]>(
		Object.entries(values).map(([key, value]) => {
			if (value instanceof SQL || value === null || value === undefined) {
				return [key, value];
			} else {
				return [key, new Param(value, table[PgTable.Symbol.Columns][key])];
			}
		}),
	);
}

export type Assume<T, U> = T extends U ? T : U;

export function orderSelectedFields(fields: SelectFields, pathPrefix?: string[]): SelectFieldsOrdered {
	return Object.entries(fields).reduce<SelectFieldsOrdered>((result, [name, field]) => {
		if (typeof name !== 'string') {
			return result;
		}

		const newPath = pathPrefix ? [...pathPrefix, name] : [name];
		if (
			field instanceof PgColumn
			|| field instanceof SQL
			|| field instanceof SQLResponse
		) {
			result.push({ path: newPath, field });
		} else if (field instanceof PgTable) {
			result.push(
				...orderSelectedFields(field[Table.Symbol.Columns], newPath),
			);
		} else {
			result.push(
				...orderSelectedFields(field, newPath),
			);
		}
		return result;
	}, []);
}
