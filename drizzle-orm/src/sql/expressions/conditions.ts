import { AnyColumn, Column, GetColumnData } from '../../column';
import { isSQLWrapper, Param, SQL, sql, SQLWrapper } from '..';

function bindIfParam(value: unknown, column: AnyColumn) {
	if (value instanceof Column) {
		return value;
	} else {
		return new Param(value, column);
	}
}

export function eq<TColumn extends AnyColumn>(column: TColumn, value: GetColumnData<TColumn, 'raw'>): SQL;
export function eq(left: AnyColumn, right: AnyColumn): SQL;
export function eq(left: AnyColumn, right: unknown) {
	return sql`${left} = ${bindIfParam(right, left)}`;
}

export function ne<TColumn extends AnyColumn>(column: TColumn, value: GetColumnData<TColumn>): SQL;
export function ne(left: AnyColumn, right: AnyColumn): SQL;
export function ne(left: AnyColumn, right: unknown) {
	return sql`${left} <> ${bindIfParam(right, left)}`;
}

export function and(...conditions: (SQL | undefined)[]): SQL | undefined {
	if (conditions.length === 0) {
		return undefined;
	}

	const chunks: SQL[] = [sql.raw('(')];
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

export function or(...conditions: (SQL | undefined)[]): SQL | undefined {
	if (conditions.length === 0) {
		return undefined;
	}

	const chunks: SQL[] = [sql.raw('(')];
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

export function not(condition: SQL): SQL {
	return sql`not ${condition}`;
}

export function gt<TColumn extends AnyColumn>(column: TColumn, value: GetColumnData<TColumn>): SQL;
export function gt(left: AnyColumn, right: AnyColumn): SQL;
export function gt(left: AnyColumn, right: unknown) {
	return sql`${left} > ${bindIfParam(right, left)}`;
}

export function gte<TColumn extends AnyColumn>(column: TColumn, value: GetColumnData<TColumn>): SQL;
export function gte(left: AnyColumn, right: AnyColumn): SQL;
export function gte(left: AnyColumn, right: unknown) {
	return sql`${left} >= ${bindIfParam(right, left)}`;
}

export function lt<TColumn extends AnyColumn>(column: TColumn, value: GetColumnData<TColumn>): SQL;
export function lt(left: AnyColumn, right: AnyColumn): SQL;
export function lt(left: AnyColumn, right: unknown) {
	return sql`${left} < ${bindIfParam(right, left)}`;
}

export function lte<TColumn extends AnyColumn>(column: TColumn, value: GetColumnData<TColumn>): SQL;
export function lte(left: AnyColumn, right: AnyColumn): SQL;
export function lte(left: AnyColumn, right: unknown) {
	return sql`${left} <= ${bindIfParam(right, left)}`;
}

export function inArray<TColumn extends AnyColumn>(column: TColumn, values: GetColumnData<TColumn>[]): SQL;
export function inArray(column: AnyColumn, subquery: SQLWrapper): SQL;
export function inArray(column: AnyColumn, values: SQLWrapper | unknown[]): SQL {
	if (isSQLWrapper(values)) {
		return sql`${column} in (${values})`;
	}
	if (values.length === 0) {
		throw new Error('inArray requires at least one value');
	}
	return sql`${column} in ${values.map((v) => new Param(v, column))}`;
}

export function notInArray<TColumn extends AnyColumn>(
	column: TColumn,
	values: GetColumnData<TColumn>[],
): SQL;
export function notInArray(column: AnyColumn, subquery: SQLWrapper): SQL;
export function notInArray(column: AnyColumn, values: SQLWrapper | unknown[]): SQL {
	if (isSQLWrapper(values)) {
		return sql`${column} not in (${values})`;
	}
	if (values.length === 0) {
		throw new Error('notInArray requires at least one value');
	}
	return sql`${column} not in ${values.map((v) => new Param(v, column))}`;
}

export function isNull(column: AnyColumn<{ notNull: false }>): SQL {
	return sql`${column} is null`;
}

export function isNotNull(column: AnyColumn): SQL {
	return sql`${column} is not null`;
}

export function exists(subquery: SQLWrapper): SQL {
	return sql`exists (${subquery})`;
}

export function notExists(subquery: SQLWrapper): SQL {
	return sql`exists (${subquery})`;
}

export function between<TColumn extends AnyColumn>(
	column: TColumn,
	min: GetColumnData<TColumn, 'raw'>,
	max: GetColumnData<TColumn, 'raw'>,
): SQL {
	return sql`${column} between ${min} and ${max}`;
}

export function notBetween<TColumn extends AnyColumn>(
	column: TColumn,
	min: GetColumnData<TColumn, 'raw'>,
	max: GetColumnData<TColumn, 'raw'>,
): SQL {
	return sql`${column} not between ${min} and ${max}`;
}

export function like(column: AnyColumn, value: string): SQL {
	return sql`${column} like ${value}`;
}

export function notLike(column: AnyColumn, value: string): SQL {
	return sql`${column} not like ${value}`;
}

export function ilike(column: AnyColumn, value: string): SQL {
	return sql`${column} ilike ${value}`;
}

export function notIlike(column: AnyColumn, value: string): SQL {
	return sql`${column} not ilike ${value}`;
}
