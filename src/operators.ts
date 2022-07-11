import { Table, Column, InferColumnType, AnyTable, TableName } from './core';
import { SQL, sql, raw } from './sql';

export function eq<
	TTableName extends string,
	TColumn extends Column<TTableName>,
>(column: TColumn, value: InferColumnType<TColumn, 'raw'>): SQL<TTableName> {
	return sql`${column} = ${value}`;
}

export function and<TTableName extends string>(
	...conditions: SQL<TTableName>[]
): SQL<TTableName> {
	const chunks: (string | SQL<TTableName>)[] = ['('];
	conditions.forEach((condition, index) => {
		if (index === 0) {
			chunks.push(condition);
		} else {
			chunks.push(raw(' and '), condition);
		}
	});
	chunks.push(')');

	return sql.fromList(chunks);
}

export function or<TTableName extends string>(
	...conditions: SQL<TTableName>[]
): SQL<TTableName> {
	const chunks: (string | SQL<TTableName>)[] = ['('];
	conditions.forEach((condition, index) => {
		if (index === 0) {
			chunks.push(condition);
		} else {
			chunks.push(raw(' or '), condition);
		}
	});
	chunks.push(')');

	return sql.fromList(chunks);
}

export function gt<
	TTableName extends string,
	TColumn extends Column<TTableName>,
>(
	column: Column<TTableName>,
	value: InferColumnType<TColumn, 'raw'>,
): SQL<TTableName> {
	return sql`${column} > ${value}`;
}

export function max<
	TTableName extends string,
	TColumn extends Column<TTableName>,
>(column: TColumn): SQL<TTableName> {
	return sql`max(${column})`;
}
