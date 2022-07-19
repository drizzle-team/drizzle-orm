import { AnyColumn, Column } from './column';
import { SelectFieldsOrdered } from './operations';
import { tableColumns, tableName, tableRowMapper } from './utils';

export type TableExtraConfig = Record<string, unknown>;

export class Table<TName extends string> {
	protected typeKeeper!: {
		name: TName;
	};

	/** @internal */
	[tableName]: TName;

	/** @internal */
	[tableColumns]!: Record<string, AnyColumn<TName>>;

	/** @internal */
	[tableRowMapper] = <TResult extends Record<string, unknown>>(
		columns: SelectFieldsOrdered,
		row: unknown[],
	): TResult => {
		const result = columns.reduce<Record<string, Record<string, unknown>>>(
			(res, { name, column: columnOrRes }, index) => {
				const column = columnOrRes instanceof Column ? columnOrRes : columnOrRes.column;
				const tName = column.table[tableName];
				if (!(tName in res)) {
					res[tName] = {};
				}
				const rawValue = row[index];
				res[tName]![column.name] = rawValue === null ? rawValue : column.mapFromDriverValue(rawValue);
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

export type AnyTable<TName extends string = string> = Table<TName>;
