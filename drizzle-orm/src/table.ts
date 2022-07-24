import { ColumnData, ColumnDriverParam, TableName } from './branded-types';
import { AnyColumn, Column } from './column';
import { SelectFieldsOrdered } from './operations';
import { tableColumns, tableName, tableRowMapper } from './utils';

export type TableExtraConfig = Record<string, unknown>;

export class Table<TName extends TableName> {
	protected typeKeeper!: {
		brand: 'Table';
		name: TName;
	};

	/** @internal */
	[tableName]: TName;

	/** @internal */
	[tableColumns]!: Record<string, AnyColumn<TName>>;

	/** @internal */
	[tableRowMapper] = <TResult extends Record<string, ColumnData>>(
		columns: SelectFieldsOrdered,
		row: ColumnDriverParam[],
	): TResult => {
		const result = columns.reduce<Record<string, Record<string, ColumnData | null>>>(
			(res, { name, resultTableName, column: columnOrResponse }, index) => {
				let decoder;
				if (columnOrResponse instanceof Column) {
					decoder = columnOrResponse.mapFromDriverValue;
				} else {
					decoder = columnOrResponse.decoder;
				}
				if (!(resultTableName in res)) {
					res[resultTableName] = {};
				}
				const rawValue = row[index]!;
				res[resultTableName]![name] = rawValue === null ? null : decoder(rawValue) as ColumnData;
				return res;
			},
			{},
		);

		if (Object.keys(result).length === 1) {
			return Object.values(result)[0] as TResult;
		}

		return result as TResult;
	};

	constructor(name: TName) {
		this[tableName] = name;
	}
}

export type AnyTable<TName extends TableName = TableName> = Table<TName>;
