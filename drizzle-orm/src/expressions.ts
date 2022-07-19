import { AnyColumn, Column, InferColumnType } from './column';
import { AnySQL, BoundParamValue, SQL, sql, SQLResponse } from './sql';
import { TableName } from './utils';

function bindIfParam(value: unknown, column: AnyColumn) {
	if (value instanceof Column) {
		return value;
	} else {
		return new BoundParamValue(value, column);
	}
}

export function eq<TColumn extends AnyColumn>(
	column: TColumn,
	value: InferColumnType<TColumn> extends AnyColumn ? never : InferColumnType<TColumn>,
): SQL<
	TableName<TColumn>
>;
export function eq<
	TLeftTableName extends string,
	TRightTableName extends string,
>(
	left: AnyColumn<TLeftTableName>,
	right: AnyColumn<TRightTableName>,
): SQL<TLeftTableName | TRightTableName>;
export function eq(left: AnyColumn, right: AnyColumn | unknown) {
	return sql`${left} = ${bindIfParam(right, left)}`;
}

export function ne<TColumn extends AnyColumn>(
	column: TColumn,
	value: InferColumnType<TColumn> extends AnyColumn ? never : InferColumnType<TColumn>,
): SQL<
	TableName<TColumn>
>;
export function ne<
	TLeftTableName extends string,
	TRightTableName extends string,
>(
	left: AnyColumn<TLeftTableName>,
	right: AnyColumn<TRightTableName>,
): SQL<TLeftTableName | TRightTableName>;
export function ne(left: AnyColumn, right: AnyColumn | unknown) {
	return sql`${left} <> ${bindIfParam(right, left)}`;
}

export function and<TTableName extends string>(
	...conditions: SQL<TTableName>[]
): SQL<TTableName> {
	const chunks: SQL<TTableName>[] = [sql.raw('(')];
	conditions.forEach((condition, index) => {
		if (index === 0) {
			chunks.push(condition);
		} else {
			chunks.push(sql` and `, condition);
		}
	});
	chunks.push(sql`)`);

	return sql.fromList(chunks);
}

export function or<TTableName extends string>(
	...conditions: SQL<TTableName>[]
): SQL<TTableName> {
	const chunks: SQL<TTableName>[] = [sql.raw('(')];
	conditions.forEach((condition, index) => {
		if (index === 0) {
			chunks.push(condition);
		} else {
			chunks.push(sql` or `, condition);
		}
	});
	chunks.push(sql`)`);

	return sql.fromList(chunks);
}

export function not<TTableName extends string>(
	condition: SQL<TTableName>,
): SQL<TTableName> {
	return sql`not ${condition}`;
}

export function gt<TColumn extends AnyColumn>(
	column: TColumn,
	value: InferColumnType<TColumn> extends AnyColumn ? never : InferColumnType<TColumn>,
): SQL<TableName<TColumn>>;
export function gt<
	TLeftTableName extends string,
	TRightTableName extends string,
>(
	left: AnyColumn<TLeftTableName>,
	right: AnyColumn<TRightTableName>,
): SQL<TLeftTableName | TRightTableName>;
export function gt(left: AnyColumn, right: AnyColumn | unknown) {
	return sql`${left} > ${bindIfParam(right, left)}`;
}

export function gte<TColumn extends AnyColumn>(
	column: TColumn,
	value: InferColumnType<TColumn> extends AnyColumn ? never : InferColumnType<TColumn>,
): SQL<TableName<TColumn>>;
export function gte<
	TLeftTableName extends string,
	TRightTableName extends string,
>(
	left: AnyColumn<TLeftTableName>,
	right: AnyColumn<TRightTableName>,
): SQL<TLeftTableName | TRightTableName>;
export function gte(left: AnyColumn, right: AnyColumn | unknown) {
	return sql`${left} >= ${bindIfParam(right, left)}`;
}

export function lt<TColumn extends AnyColumn>(
	column: TColumn,
	value: InferColumnType<TColumn> extends AnyColumn ? never : InferColumnType<TColumn>,
): SQL<TableName<TColumn>>;
export function lt<
	TLeftTableName extends string,
	TRightTableName extends string,
>(
	left: AnyColumn<TLeftTableName>,
	right: AnyColumn<TRightTableName>,
): SQL<TLeftTableName | TRightTableName>;
export function lt(left: AnyColumn, right: AnyColumn | unknown) {
	return sql`${left} < ${bindIfParam(right, left)}`;
}

export function lte<TColumn extends AnyColumn>(
	column: TColumn,
	value: InferColumnType<TColumn> extends AnyColumn ? never : InferColumnType<TColumn>,
): SQL<TableName<TColumn>>;
export function lte<
	TLeftTableName extends string,
	TRightTableName extends string,
>(
	left: AnyColumn<TLeftTableName>,
	right: AnyColumn<TRightTableName>,
): SQL<TLeftTableName | TRightTableName>;
export function lte(left: AnyColumn, right: AnyColumn | unknown) {
	return sql`${left} <= ${bindIfParam(right, left)}`;
}

export function inArray<TTableName extends string, TType>(
	column: Column<any, TType, any, any, any>,
	values: TType[],
): SQL<TTableName>;
export function inArray<
	TTableName extends string,
	TColumn extends AnyColumn<TTableName>,
>(
	column: TColumn,
	subquery: AnySQL,
): SQL<TTableName>;
export function inArray(column: AnyColumn, values: AnySQL | unknown[]): AnySQL {
	if (values instanceof SQL) {
		return sql`${column} in ${values}`;
	}
	return sql`${column} in ${values.map((v) => new BoundParamValue(v, column))}`;
}

export function notInArray<TTableName extends string, TType>(
	column: Column<any, TType, any, any, any>,
	values: TType[],
): SQL<TTableName>;
export function notInArray<
	TTableName extends string,
	TColumn extends AnyColumn<TTableName>,
>(
	column: TColumn,
	subquery: AnySQL,
): SQL<TTableName>;
export function notInArray(column: AnyColumn, values: AnySQL | unknown[]): AnySQL {
	if (values instanceof SQL) {
		return sql`${column} not in ${values}`;
	}
	return sql`${column} not in ${values.map((v) => new BoundParamValue(v, column))}`;
}

export function isNull<TColumn extends AnyColumn>(column: TColumn): SQL<TableName<TColumn>> {
	return sql<TableName<TColumn>>`${column} is null`;
}

export function isNotNull<TColumn extends AnyColumn>(column: TColumn): SQL<TableName<TColumn>> {
	return sql<TableName<TColumn>>`${column} is not null`;
}

export function min<TColumn extends AnyColumn>(
	column: TColumn,
): SQLResponse<TableName<TColumn>, InferColumnType<TColumn>> {
	return sql.response<InferColumnType<TColumn>>(column)<TableName<TColumn>>`min(${column})`;
}

export function max<TColumn extends AnyColumn>(
	column: TColumn,
): SQLResponse<TableName<TColumn>, InferColumnType<TColumn>> {
	return sql.response<InferColumnType<TColumn>>(column)<TableName<TColumn>>`max(${column})`;
}

export function inc<TColumn extends AnyColumn>(column: TColumn, value: number): SQL<TableName<TColumn>> {
	return sql`${column} + ${value}`;
}

export function dec<TColumn extends AnyColumn>(column: TColumn, value: number): SQL<TableName<TColumn>> {
	return sql`${column} - ${value}`;
}

export function asc<TColumn extends AnyColumn>(column: TColumn): SQL<TableName<TColumn>> {
	return sql<TableName<TColumn>>`${column} asc`;
}

export function desc<TColumn extends AnyColumn>(column: TColumn): SQL<TableName<TColumn>> {
	return sql<TableName<TColumn>>`${column} desc`;
}
