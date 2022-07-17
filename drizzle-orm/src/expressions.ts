import { AnyColumn, Column, InferColumnDriverType, InferColumnType } from './column';
import { AnySQL, MappedParamValue, MapSQLSourceParam, SQL, sql } from './sql';
import { TableName } from './utils';

function mapIfParam(value: AnyColumn | unknown, column: AnyColumn) {
	if (value instanceof Column) {
		return value;
	} else {
		return new MappedParamValue(value, column);
	}
}

export function eq<TColumn extends AnyColumn>(
	column: TColumn,
	value: InferColumnType<TColumn> extends AnyColumn ? never : InferColumnType<TColumn>,
): SQL<
	TableName<TColumn>,
	InferColumnDriverType<TColumn>
>;
export function eq<
	TLeftTableName extends string,
	TLeftDriverType,
	TRightTableName extends string,
	TRightDriverType,
>(
	left: Column<TLeftTableName, any, TLeftDriverType, any, any>,
	right: Column<TRightTableName, any, TRightDriverType, any, any>,
): SQL<TLeftTableName | TRightTableName, TLeftDriverType | TRightDriverType>;
export function eq(left: AnyColumn, right: AnyColumn | unknown) {
	return sql`${left} = ${mapIfParam(right, left)}`;
}

export function ne<TColumn extends AnyColumn>(
	column: TColumn,
	value: InferColumnType<TColumn> extends AnyColumn ? never : InferColumnType<TColumn>,
): SQL<
	TableName<TColumn>,
	InferColumnDriverType<TColumn>
>;
export function ne<
	TLeftTableName extends string,
	TLeftDriverType,
	TRightTableName extends string,
	TRightDriverType,
>(
	left: Column<TLeftTableName, any, TLeftDriverType, any, any>,
	right: Column<TRightTableName, any, TRightDriverType, any, any>,
): SQL<TLeftTableName | TRightTableName, TLeftDriverType | TRightDriverType>;
export function ne(left: AnyColumn, right: AnyColumn | unknown) {
	return sql`${left} <> ${mapIfParam(right, left)}`;
}

export function and<TTableName extends string, TDriverParams>(
	...conditions: SQL<TTableName, TDriverParams>[]
) {
	const chunks: SQL<TTableName, TDriverParams>[] = [sql.raw('(')];
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

export function or<TTableName extends string, TDriverParams>(
	...conditions: SQL<TTableName, TDriverParams>[]
) {
	const chunks: SQL<TTableName, TDriverParams>[] = [sql.raw('(')];
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

export function not<TTableName extends string, TDriverParams>(
	condition: SQL<TTableName, TDriverParams>,
): SQL<TTableName, TDriverParams> {
	return sql`not ${condition}`;
}

export function gt<TColumn extends AnyColumn>(
	column: TColumn,
	value: InferColumnType<TColumn> extends AnyColumn ? never : InferColumnType<TColumn>,
): SQL<
	TableName<TColumn>,
	InferColumnDriverType<TColumn>
>;
export function gt<
	TLeftTableName extends string,
	TLeftDriverType,
	TRightTableName extends string,
	TRightDriverType,
>(
	left: Column<TLeftTableName, any, TLeftDriverType, any, any>,
	right: Column<TRightTableName, any, TRightDriverType, any, any>,
): SQL<TLeftTableName | TRightTableName, TLeftDriverType | TRightDriverType>;
export function gt(left: AnyColumn, right: AnyColumn | unknown) {
	return sql`${left} > ${mapIfParam(right, left)}`;
}

export function gte<TColumn extends AnyColumn>(
	column: TColumn,
	value: InferColumnType<TColumn> extends AnyColumn ? never : InferColumnType<TColumn>,
): SQL<
	TableName<TColumn>,
	InferColumnDriverType<TColumn>
>;
export function gte<
	TLeftTableName extends string,
	TLeftDriverType,
	TRightTableName extends string,
	TRightDriverType,
>(
	left: Column<TLeftTableName, any, TLeftDriverType, any, any>,
	right: Column<TRightTableName, any, TRightDriverType, any, any>,
): SQL<TLeftTableName | TRightTableName, TLeftDriverType | TRightDriverType>;
export function gte(left: AnyColumn, right: AnyColumn | unknown) {
	return sql`${left} >= ${mapIfParam(right, left)}`;
}

export function lt<TColumn extends AnyColumn>(
	column: TColumn,
	value: InferColumnType<TColumn> extends AnyColumn ? never : InferColumnType<TColumn>,
): SQL<
	TableName<TColumn>,
	InferColumnDriverType<TColumn>
>;
export function lt<
	TLeftTableName extends string,
	TLeftDriverType,
	TRightTableName extends string,
	TRightDriverType,
>(
	left: Column<TLeftTableName, any, TLeftDriverType, any, any>,
	right: Column<TRightTableName, any, TRightDriverType, any, any>,
): SQL<TLeftTableName | TRightTableName, TLeftDriverType | TRightDriverType>;
export function lt(left: AnyColumn, right: AnyColumn | unknown) {
	return sql`${left} < ${mapIfParam(right, left)}`;
}

export function lte<TColumn extends AnyColumn>(
	column: TColumn,
	value: InferColumnType<TColumn> extends AnyColumn ? never : InferColumnType<TColumn>,
): SQL<
	TableName<TColumn>,
	[InferColumnDriverType<TColumn>]
>;
export function lte<
	TLeftTableName extends string,
	TLeftDriverType,
	TRightTableName extends string,
	TRightDriverType,
>(
	left: Column<TLeftTableName, any, TLeftDriverType, any, any>,
	right: Column<TRightTableName, any, TRightDriverType, any, any>,
): SQL<TLeftTableName | TRightTableName, TLeftDriverType | TRightDriverType>;
export function lte(left: AnyColumn, right: AnyColumn | unknown) {
	return sql`${left} <= ${mapIfParam(right, left)}`;
}

export function inArray<TTableName extends string, TType, TDriverParam>(
	column: Column<any, TType, TDriverParam, any, any>,
	values: TType[],
): SQL<TTableName, TDriverParam>;
export function inArray<
	TTableName extends string,
	TColumn extends AnyColumn<TTableName>,
	TSubquery extends AnySQL,
>(
	column: TColumn,
	subquery: TSubquery,
): SQL<
	TTableName,
	TSubquery extends SQL<any, infer TDriverParam> ? [TDriverParam] : never
>;
export function inArray(column: AnyColumn, values: AnySQL | unknown[]): AnySQL {
	if (values instanceof SQL) {
		return sql<string, unknown[]>`${column} in ${values}`;
	}
	return sql<string, unknown[]>`${column} in ${values.map((v) => new MappedParamValue(v, column))}`;
}

export function notInArray<TTableName extends string, TType, TDriverParam>(
	column: Column<any, TType, TDriverParam, any, any>,
	values: TType[],
): SQL<TTableName, TDriverParam>;
export function notInArray<
	TTableName extends string,
	TColumn extends AnyColumn<TTableName>,
	TSubquery extends AnySQL,
>(
	column: TColumn,
	subquery: TSubquery,
): SQL<
	TTableName,
	TSubquery extends SQL<any, infer TDriverParam> ? TDriverParam : never
>;
export function notInArray(column: AnyColumn, values: AnySQL | unknown[]): AnySQL {
	if (values instanceof SQL) {
		return sql<string, unknown[]>`${column} not in ${values}`;
	}
	return sql<string, unknown[]>`${column} not in ${values.map((v) => new MappedParamValue(v, column))}`;
}

export function isNull<TColumn extends AnyColumn>(column: TColumn) {
	return sql<TableName<TColumn>, [TColumn]>`${column} is null`;
}

export function isNotNull<TColumn extends AnyColumn>(column: TColumn) {
	return sql<TableName<TColumn>, [TColumn]>`${column} is not null`;
}

export function min<TColumn extends AnyColumn>(column: TColumn) {
	return sql.response<InferColumnType<TColumn, 'raw'>>()<TableName<TColumn>>`min(${column})`;
}

export function max<TColumn extends AnyColumn>(column: TColumn) {
	return sql.response<InferColumnType<TColumn, 'raw'>>()<TableName<TColumn>>`max(${column})`;
}

export function inc<TColumn extends AnyColumn>(column: TColumn, value: number) {
	return sql<TableName<TColumn>, [TColumn, number]>`${column} + ${value}`;
}

export function dec<TColumn extends AnyColumn>(column: TColumn, value: number) {
	return sql<TableName<TColumn>, [TColumn, number]>`${column} - ${value}`;
}

export function asc<TColumn extends AnyColumn>(column: TColumn) {
	return sql<TableName<TColumn>, [TColumn]>`${column} asc`;
}

export function desc<TColumn extends AnyColumn>(column: TColumn) {
	return sql<TableName<TColumn>, [TColumn]>`${column} desc`;
}
