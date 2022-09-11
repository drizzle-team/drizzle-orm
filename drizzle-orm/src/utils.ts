import { ColumnData, ColumnDriverParam, TableName } from './branded-types';
import { AnyColumn, Column } from './column';
import { SelectFieldsOrdered } from './operations';
import { noopDecoder, SQL } from './sql';
import { AnyTable, Table } from './table';

/** @internal */
export const tableName = Symbol('tableName');

/** @internal */
export const tableColumns = Symbol('tableColumns');

export function getTableName<TTableName extends TableName>(table: AnyTable<TTableName>): TTableName {
	return table[tableName];
}

export function mapResultRow<TResult extends Record<string, ColumnData | null>>(
	columns: SelectFieldsOrdered,
	row: ColumnDriverParam[],
	joinsNotNullable?: Record<string, boolean>,
): TResult {
	const result = columns.reduce<Record<string, Record<string, ColumnData | null>>>(
		(res, { name, resultTableName, column: columnOrResponse }, index) => {
			let decoder;
			if (columnOrResponse instanceof Column) {
				decoder = columnOrResponse;
			} else if (columnOrResponse instanceof SQL) {
				decoder = noopDecoder;
			} else {
				decoder = columnOrResponse.decoder;
			}
			if (!(resultTableName in res)) {
				res[resultTableName] = {};
			}
			const rawValue = row[index]!;
			res[resultTableName]![name] = rawValue === null ? null : decoder.mapFromDriverValue(rawValue);
			return res;
		},
		{},
	);

	if (Object.keys(result).length === 1) {
		return Object.values(result)[0] as TResult;
	}

	if (!joinsNotNullable) {
		return result as TResult;
	}

	return Object.fromEntries(
		Object.entries(result).map(([tableName, tableResult]) => {
			if (!joinsNotNullable[tableName]) {
				const hasNotNull = Object.values(tableResult).some((value) => value !== null);
				if (!hasNotNull) {
					return [tableName, null];
				}
			}
			return [tableName, tableResult];
		}),
	) as TResult;
}

export type GetTableName<T extends AnyTable | AnyColumn> = T extends AnyTable<infer TName> ? TName
	: T extends AnyColumn<infer TName> ? TName
	: never;
