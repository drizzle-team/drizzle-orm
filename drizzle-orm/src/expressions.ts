import { AnyColumn, Column, InferColumnTable, InferColumnType } from '~/column';
import { expr, MappedParamValue, ParamValue, raw, SQL, sql, SQLSourceParam } from '~/sql';
import { TableName } from '~/utils';

function mapIfParam<TTableName extends string, TType extends ParamValue>(
	value: TType | Column<TTableName>,
	column: Column<string, TType>,
): MappedParamValue<TType> | Column<TTableName> {
	if (value instanceof Column) {
		return value;
	} else {
		return new MappedParamValue(value, column);
	}
}

export function eq<
	TTableName extends string,
	TType extends ParamValue,
	TRightTableName extends string = TTableName,
	TRightColumn extends Column<TRightTableName> = Column<TRightTableName>,
>(column: Column<TTableName, TType>, value: TType | TRightColumn) {
	return sql<TTableName | TRightTableName>`${column} = ${mapIfParam(value, column)}`;
}

export function ne<
	TTableName extends string,
	TColumn extends Column<TTableName>,
	TRightTableName extends string = TTableName,
	TRightColumn extends Column<TRightTableName> = Column<TRightTableName>,
>(column: TColumn, value: InferColumnType<TColumn, 'raw'> | TRightColumn) {
	return sql<TTableName | TRightTableName>`${column} <> ${mapIfParam(value, column)}`;
}

export function and<TTableName extends string>(...conditions: SQL<TTableName>[]) {
	const chunks: SQLSourceParam<TTableName>[] = [raw('(')];
	conditions.forEach((condition, index) => {
		if (index === 0) {
			chunks.push(condition);
		} else {
			chunks.push(raw(' and '), condition);
		}
	});
	chunks.push(raw(')'));

	return sql.fromList(chunks);
}

export function or<TTableName extends string>(...conditions: SQL<TTableName>[]) {
	const chunks: SQLSourceParam<TTableName>[] = [raw('(')];
	conditions.forEach((condition, index) => {
		if (index === 0) {
			chunks.push(condition);
		} else {
			chunks.push(raw(' or '), condition);
		}
	});
	chunks.push(raw(')'));

	return sql.fromList(chunks);
}

export function not<TTableName extends string>(condition: SQL<TTableName>) {
	return sql`not ${condition}`;
}

export function gt<
	TColumn extends AnyColumn,
	TRightColumn extends Column<InferColumnTable<TColumn>, InferColumnType<TColumn, 'raw'>>,
>(column: TColumn, value: InferColumnType<TColumn, 'raw'> | TRightColumn) {
	return sql`${column} > ${mapIfParam(value, column)}` as SQL<
		TableName<TColumn> | TableName<TRightColumn>
	>;
}

export function gte<
	TTableName extends string,
	TColumn extends Column<TTableName>,
	TRightTableName extends string = TTableName,
	TRightColumn extends Column<TRightTableName> = Column<TRightTableName>,
>(column: TColumn, value: InferColumnType<TColumn, 'raw'> | TRightColumn) {
	return sql<TTableName | TRightTableName>`${column} >= ${mapIfParam(value, column)}`;
}

export function lt<
	TTableName extends string,
	TColumn extends Column<TTableName>,
	TRightTableName extends string = TTableName,
	TRightColumn extends Column<TRightTableName> = Column<TRightTableName>,
>(column: TColumn, value: InferColumnType<TColumn, 'raw'> | TRightColumn) {
	return sql<TTableName | TRightTableName>`${column} < ${mapIfParam(value, column)}`;
}

export function lte<
	TTableName extends string,
	TColumn extends Column<TTableName>,
	TRightTableName extends string = TTableName,
	TRightColumn extends Column<TRightTableName> = Column<TRightTableName>,
>(column: TColumn, value: InferColumnType<TColumn, 'raw'> | TRightColumn) {
	return sql<TTableName | TRightTableName>`${column} <= ${mapIfParam(value, column)}`;
}

export function inArray<TTableName extends string, TColumn extends Column<TTableName>>(
	column: TColumn,
	values: InferColumnType<TColumn, 'raw'>[],
) {
	return sql`${column} in ${values.map((v) => new MappedParamValue(v, column))}`;
}

export function notInArray<TColumn extends AnyColumn>(
	column: TColumn,
	values: InferColumnType<TColumn, 'raw'>[],
) {
	return sql<TableName<TColumn>>`${column} not in ${values.map(
		(v) => new MappedParamValue(v, column),
	)}`;
}

export function isNull<TColumn extends AnyColumn>(column: TColumn) {
	return sql<TableName<TColumn>>`${column} is null`;
}

export function isNotNull<TColumn extends AnyColumn>(column: TColumn) {
	return sql<TableName<TColumn>>`${column} is not null`;
}

export function min<TColumn extends AnyColumn>(column: TColumn) {
	return expr<InferColumnType<TColumn, 'raw'>>()<TableName<TColumn>>`min(${column})`;
}

export function max<TColumn extends AnyColumn>(column: TColumn) {
	return expr<InferColumnType<TColumn, 'raw'>>()<TableName<TColumn>>`max(${column})`;
}

export function inc<TColumn extends AnyColumn>(column: TColumn, value: number) {
	return sql<TableName<TColumn>>`${column} + ${value}`;
}

export function dec<TColumn extends AnyColumn>(column: TColumn, value: number) {
	return sql<TableName<TColumn>>`${column} - ${value}`;
}
