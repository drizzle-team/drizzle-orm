import { ColumnData, TableName, Unwrap } from './branded-types';
import { AnyColumn, Column, GetColumnData } from './column';
import { AnySQL, BoundParamValue, SQL, sql, SQLResponse } from './sql';
import { GetTableName } from './utils';

function bindIfParam(value: AnyColumn | ColumnData, column: AnyColumn) {
	if (value instanceof Column) {
		return value;
	} else {
		return new BoundParamValue(value, column);
	}
}

export function eq<TColumn extends AnyColumn>(
	column: TColumn,
	value: GetColumnData<TColumn, 'raw'>,
): SQL<
	GetTableName<TColumn>
>;
export function eq<
	TLeftTableName extends TableName,
	TRightTableName extends TableName,
>(
	left: AnyColumn<TLeftTableName>,
	right: AnyColumn<TRightTableName>,
): SQL<TLeftTableName | TRightTableName>;
export function eq(left: AnyColumn, right: AnyColumn | Unwrap<ColumnData>) {
	return sql`${left} = ${bindIfParam(right as AnyColumn | ColumnData, left)}`;
}

export function ne<TColumn extends AnyColumn>(
	column: TColumn,
	value: GetColumnData<TColumn>,
): SQL<
	GetTableName<TColumn>
>;
export function ne<
	TLeftTableName extends TableName,
	TRightTableName extends TableName,
>(
	left: AnyColumn<TLeftTableName>,
	right: AnyColumn<TRightTableName>,
): SQL<TLeftTableName | TRightTableName>;
export function ne(left: AnyColumn, right: AnyColumn | Unwrap<ColumnData>) {
	return sql`${left} <> ${bindIfParam(right as AnyColumn | ColumnData, left)}`;
}

export function and<TTableName extends TableName>(
	...conditions: (SQL<TTableName> | undefined)[]
): SQL<TTableName> | undefined {
	if (conditions.length === 0) {
		return undefined;
	}

	const chunks: SQL<TTableName>[] = [sql.raw('(')];
	conditions
		.filter((c): c is Exclude<typeof c, undefined> => typeof c !== 'undefined')
		.forEach((condition, index) => {
			if (index === 0) {
				chunks.push(condition);
			} else {
				chunks.push(sql` and `, condition);
			}
		});
	chunks.push(sql`)`);

	return sql.fromList(chunks);
}

export function or<TTableName extends TableName>(
	...conditions: (SQL<TTableName> | undefined)[]
): SQL<TTableName> | undefined {
	if (conditions.length === 0) {
		return undefined;
	}

	const chunks: SQL<TTableName>[] = [sql.raw('(')];
	conditions
		.filter((c): c is Exclude<typeof c, undefined> => typeof c !== 'undefined')
		.forEach((condition, index) => {
			if (index === 0) {
				chunks.push(condition);
			} else {
				chunks.push(sql` or `, condition);
			}
		});
	chunks.push(sql`)`);

	return sql.fromList(chunks);
}

export function not<TTableName extends TableName>(
	condition: SQL<TTableName>,
): SQL<TTableName> {
	return sql`not ${condition}`;
}

export function gt<TColumn extends AnyColumn>(
	column: TColumn,
	value: GetColumnData<TColumn>,
): SQL<GetTableName<TColumn>>;
export function gt<
	TLeftTableName extends TableName,
	TRightTableName extends TableName,
>(
	left: AnyColumn<TLeftTableName>,
	right: AnyColumn<TRightTableName>,
): SQL<TLeftTableName | TRightTableName>;
export function gt(left: AnyColumn, right: AnyColumn | Unwrap<ColumnData>) {
	return sql`${left} > ${bindIfParam(right as AnyColumn | ColumnData, left)}`;
}

export function gte<TColumn extends AnyColumn>(
	column: TColumn,
	value: GetColumnData<TColumn> extends AnyColumn ? never : GetColumnData<TColumn>,
): SQL<GetTableName<TColumn>>;
export function gte<
	TLeftTableName extends TableName,
	TRightTableName extends TableName,
>(
	left: AnyColumn<TLeftTableName>,
	right: AnyColumn<TRightTableName>,
): SQL<TLeftTableName | TRightTableName>;
export function gte(left: AnyColumn, right: AnyColumn | Unwrap<ColumnData>) {
	return sql`${left} >= ${bindIfParam(right as AnyColumn | ColumnData, left)}`;
}

export function lt<TColumn extends AnyColumn>(
	column: TColumn,
	value: GetColumnData<TColumn> extends AnyColumn ? never : GetColumnData<TColumn>,
): SQL<GetTableName<TColumn>>;
export function lt<
	TLeftTableName extends TableName,
	TRightTableName extends TableName,
>(
	left: AnyColumn<TLeftTableName>,
	right: AnyColumn<TRightTableName>,
): SQL<TLeftTableName | TRightTableName>;
export function lt(left: AnyColumn, right: AnyColumn | Unwrap<ColumnData>) {
	return sql`${left} < ${bindIfParam(right as AnyColumn | ColumnData, left)}`;
}

export function lte<TColumn extends AnyColumn>(
	column: TColumn,
	value: GetColumnData<TColumn> extends AnyColumn ? never : GetColumnData<TColumn>,
): SQL<GetTableName<TColumn>>;
export function lte<
	TLeftTableName extends TableName,
	TRightTableName extends TableName,
>(
	left: AnyColumn<TLeftTableName>,
	right: AnyColumn<TRightTableName>,
): SQL<TLeftTableName | TRightTableName>;
export function lte(left: AnyColumn, right: AnyColumn | Unwrap<ColumnData>) {
	return sql`${left} <= ${bindIfParam(right as AnyColumn | ColumnData, left)}`;
}

export function inArray<TColumn extends AnyColumn>(
	column: TColumn,
	values: GetColumnData<TColumn>[],
): SQL<GetTableName<TColumn>>;
export function inArray<
	TColumn extends AnyColumn,
>(
	column: TColumn,
	subquery: AnySQL,
): SQL<GetTableName<TColumn>>;
export function inArray(column: AnyColumn, values: AnySQL | Unwrap<ColumnData>[]): AnySQL {
	if (values instanceof SQL) {
		return sql`${column} in ${values}`;
	}
	return sql`${column} in ${values.map((v) => new BoundParamValue(v as ColumnData, column))}`;
}

export function notInArray<TColumn extends AnyColumn>(
	column: TColumn,
	values: GetColumnData<TColumn>[],
): SQL<GetTableName<TColumn>>;
export function notInArray<
	TTableName extends TableName,
	TColumn extends AnyColumn<TTableName>,
>(
	column: TColumn,
	subquery: AnySQL,
): SQL<TTableName>;
export function notInArray(column: AnyColumn, values: AnySQL | Unwrap<ColumnData>[]): AnySQL {
	if (values instanceof SQL) {
		return sql`${column} not in ${values}`;
	}
	return sql`${column} not in ${values.map((v) => new BoundParamValue(v as ColumnData, column))}`;
}

export function isNull<TColumn extends AnyColumn>(column: TColumn): SQL<GetTableName<TColumn>> {
	return sql<GetTableName<TColumn>>`${column} is null`;
}

export function isNotNull<TColumn extends AnyColumn>(column: TColumn): SQL<GetTableName<TColumn>> {
	return sql<GetTableName<TColumn>>`${column} is not null`;
}

export function min<TColumn extends AnyColumn>(
	column: TColumn,
): SQLResponse<GetTableName<TColumn>, ColumnData<GetColumnData<TColumn>>> {
	return sql.response<GetColumnData<TColumn>>(column)<GetTableName<TColumn>>`min(${column})`;
}

export function max<TColumn extends AnyColumn>(
	column: TColumn,
): SQLResponse<GetTableName<TColumn>, ColumnData<GetColumnData<TColumn>>> {
	return sql.response<GetColumnData<TColumn>>(column)<GetTableName<TColumn>>`max(${column})`;
}

export function plus<TColumn extends AnyColumn>(
	column: TColumn,
	value: GetColumnData<TColumn, 'raw'>,
): SQL<GetTableName<TColumn>> {
	const boundValue = new BoundParamValue(value as ColumnData<GetColumnData<TColumn, 'raw'>>, column);
	return sql<GetTableName<TColumn>>`${column} + ${boundValue}`;
}

export function minus<TColumn extends AnyColumn>(
	column: TColumn,
	value: GetColumnData<TColumn, 'raw'>,
): SQL<GetTableName<TColumn>> {
	const boundValue = new BoundParamValue(value as ColumnData<GetColumnData<TColumn, 'raw'>>, column);
	return sql<GetTableName<TColumn>>`${column} - ${boundValue}`;
}

export function asc<TColumn extends AnyColumn>(column: TColumn): SQL<GetTableName<TColumn>> {
	return sql<GetTableName<TColumn>>`${column} asc`;
}

export function desc<TColumn extends AnyColumn>(column: TColumn): SQL<GetTableName<TColumn>> {
	return sql<GetTableName<TColumn>>`${column} desc`;
}
