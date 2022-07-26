import { ColumnData, ColumnNotNull, TableName, Unwrap } from '../../branded-types';
import { AnyColumn, Column, GetColumnData } from '../../column';
import { GetTableName } from '../../utils';
import { AnySQL, BoundParamValue, isSQLWrapper, SQL, sql, SQLWrapper } from '..';

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
	subquery: SQLWrapper,
): SQL<GetTableName<TColumn>>;
export function inArray(column: AnyColumn, values: SQLWrapper | Unwrap<ColumnData>[]): AnySQL {
	if (isSQLWrapper(values)) {
		return sql`${column} in (${values})`;
	}
	if (values.length === 0) {
		throw new Error('inArray requires at least one value');
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
	subquery: SQLWrapper,
): SQL<TTableName>;
export function notInArray(column: AnyColumn, values: SQLWrapper | Unwrap<ColumnData>[]): AnySQL {
	if (isSQLWrapper(values)) {
		return sql`${column} not in (${values})`;
	}
	if (values.length === 0) {
		throw new Error('notInArray requires at least one value');
	}
	return sql`${column} not in ${values.map((v) => new BoundParamValue(v as ColumnData, column))}`;
}

export function isNull<TColumn extends AnyColumn<any, any, any, ColumnNotNull<false>>>(
	column: TColumn,
): SQL<GetTableName<TColumn>> {
	return sql<GetTableName<TColumn>>`${column} is null`;
}

export function isNotNull<TTableName extends TableName, TColumn extends AnyColumn<TTableName>>(
	column: TColumn,
): SQL<TTableName> {
	return sql`${column} is not null`;
}

export function exists<TTableName extends TableName>(
	subquery: SQLWrapper,
): SQL<TTableName> {
	return sql<TTableName>`exists (${subquery})`;
}

export function notExists<TTableName extends TableName>(
	subquery: SQLWrapper,
): SQL<TTableName> {
	return sql<TTableName>`exists (${subquery})`;
}

export function between<TTableName extends TableName, TColumn extends AnyColumn<TTableName>>(
	column: TColumn,
	min: GetColumnData<TColumn, 'raw'>,
	max: GetColumnData<TColumn, 'raw'>,
): SQL<TTableName> {
	return sql`${column} between ${min as ColumnData} and ${max as ColumnData}`;
}

export function notBetween<TTableName extends TableName, TColumn extends AnyColumn<TTableName>>(
	column: TColumn,
	min: GetColumnData<TColumn, 'raw'>,
	max: GetColumnData<TColumn, 'raw'>,
): SQL<TTableName> {
	return sql`${column} not between ${min as ColumnData} and ${max as ColumnData}`;
}

export function like<TTableName extends TableName, TColumn extends AnyColumn<TTableName>>(
	column: TColumn,
	value: string,
): SQL<TTableName> {
	return sql`${column} like ${value as ColumnData<string>}`;
}

export function notLike<TTableName extends TableName, TColumn extends AnyColumn<TTableName>>(
	column: TColumn,
	value: string,
): SQL<TTableName> {
	return sql`${column} not like ${value as ColumnData<string>}`;
}

export function ilike<TTableName extends TableName, TColumn extends AnyColumn<TTableName>>(
	column: TColumn,
	value: string,
): SQL<TTableName> {
	return sql`${column} ilike ${value as ColumnData<string>}`;
}

export function notIlike<TTableName extends TableName, TColumn extends AnyColumn<TTableName>>(
	column: TColumn,
	value: string,
): SQL<TTableName> {
	return sql`${column} not ilike ${value as ColumnData<string>}`;
}
