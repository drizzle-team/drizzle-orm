import { Simplify } from 'type-fest';
import { Column } from './column';
import { SelectFieldsOrdered } from './operations';
import { noopDecoder, SQL } from './sql';

export function mapResultRow<TResult extends Record<string, unknown>>(
	columns: SelectFieldsOrdered,
	row: unknown[],
	joinsNotNullable?: Record<string, boolean>,
): TResult {
	const result = columns.reduce<Record<string, Record<string, unknown>>>(
		(res, { name, resultTableName, field: columnOrResponse }, index) => {
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

export type OneOrMany<T> = T | T[];

export type Update<T, TUpdate> = Simplify<
	& Omit<T, keyof TUpdate>
	& TUpdate
>;
