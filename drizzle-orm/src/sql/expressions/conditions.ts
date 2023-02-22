import { AnyColumn, Column, GetColumnData } from '../../column';
import { isSQLWrapper, Param, Placeholder, SQL, sql, SQLSourceParam, SQLWrapper } from '..';

export function bindIfParam(value: unknown, column: AnyColumn | SQL.Aliased): SQLSourceParam {
	if (value instanceof Column || value instanceof Placeholder || column instanceof SQL.Aliased) {
		return value as (AnyColumn | Placeholder | SQL.Aliased);
	} else {
		return new Param(value, column);
	}
}

export function eq<T>(
	left: SQL.Aliased<T>,
	right: T | Placeholder | SQLWrapper | AnyColumn,
): SQL;
export function eq<TColumn extends AnyColumn>(
	left: TColumn,
	right: GetColumnData<TColumn, 'raw'> | Placeholder | SQLWrapper | AnyColumn,
): SQL;
export function eq(
	left: AnyColumn | SQL.Aliased,
	right: unknown | Placeholder | SQLWrapper | AnyColumn,
): SQL {
	return sql`${left} = ${bindIfParam(right, left)}`;
}

export function ne<T>(
	left: SQL.Aliased<T>,
	right: T | Placeholder | SQLWrapper | AnyColumn,
): SQL;
export function ne<TColumn extends AnyColumn>(
	left: TColumn,
	right: GetColumnData<TColumn, 'raw'> | Placeholder | SQLWrapper | AnyColumn,
): SQL;
export function ne(
	left: AnyColumn | SQL.Aliased,
	right: unknown | Placeholder | SQLWrapper | AnyColumn,
): SQL {
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

export function gt<T>(
	left: SQL.Aliased<T>,
	right: T | Placeholder | SQLWrapper | AnyColumn,
): SQL;
export function gt<TColumn extends AnyColumn>(
	left: TColumn,
	right: GetColumnData<TColumn, 'raw'> | Placeholder | SQLWrapper | AnyColumn,
): SQL;
export function gt(
	left: AnyColumn | SQL.Aliased,
	right: unknown | Placeholder | SQLWrapper | AnyColumn,
): SQL {
	return sql`${left} > ${bindIfParam(right, left)}`;
}

export function gte<T>(
	left: SQL.Aliased<T>,
	right: T | Placeholder | SQLWrapper | AnyColumn,
): SQL;
export function gte<TColumn extends AnyColumn>(
	left: TColumn,
	right: GetColumnData<TColumn, 'raw'> | Placeholder | SQLWrapper | AnyColumn,
): SQL;
export function gte(
	left: AnyColumn | SQL.Aliased,
	right: unknown | Placeholder | SQLWrapper | AnyColumn,
): SQL {
	return sql`${left} >= ${bindIfParam(right, left)}`;
}

export function lt<T>(
	left: SQL.Aliased<T>,
	right: T | Placeholder | SQLWrapper | AnyColumn,
): SQL;
export function lt<TColumn extends AnyColumn>(
	left: TColumn,
	right: GetColumnData<TColumn, 'raw'> | Placeholder | SQLWrapper | AnyColumn,
): SQL;
export function lt(
	left: AnyColumn | SQL.Aliased,
	right: unknown | Placeholder | SQLWrapper | AnyColumn,
): SQL {
	return sql`${left} < ${bindIfParam(right, left)}`;
}

export function lte<T>(
	left: SQL.Aliased<T>,
	right: T | Placeholder | SQLWrapper | AnyColumn,
): SQL;
export function lte<TColumn extends AnyColumn>(
	left: TColumn,
	right: GetColumnData<TColumn, 'raw'> | Placeholder | SQLWrapper | AnyColumn,
): SQL;
export function lte(
	left: AnyColumn | SQL.Aliased,
	right: unknown | Placeholder | SQLWrapper | AnyColumn,
): SQL {
	return sql`${left} <= ${bindIfParam(right, left)}`;
}

export function inArray<T>(
	column: SQL.Aliased<T>,
	values: (T | Placeholder)[] | Placeholder | SQLWrapper,
): SQL;
export function inArray<TColumn extends AnyColumn>(
	column: TColumn,
	values: (GetColumnData<TColumn, 'raw'> | Placeholder)[] | Placeholder | SQLWrapper,
): SQL;
export function inArray(
	column: AnyColumn | SQL.Aliased,
	values: (unknown | Placeholder)[] | Placeholder | SQLWrapper,
): SQL {
	if (isSQLWrapper(values)) {
		return sql`${column} in ${values}`;
	}

	if (Array.isArray(values)) {
		if (values.length === 0) {
			throw new Error('inArray requires at least one value');
		}
		return sql`${column} in ${values.map((v) => bindIfParam(v, column))}`;
	}

	return sql`${column} in ${bindIfParam(values, column)}`;
}

export function notInArray<T>(
	column: SQL.Aliased<T>,
	values: (T | Placeholder)[] | Placeholder | SQLWrapper,
): SQL;
export function notInArray<TColumn extends AnyColumn>(
	column: TColumn,
	values: (GetColumnData<TColumn, 'raw'> | Placeholder)[] | Placeholder | SQLWrapper,
): SQL;
export function notInArray(
	column: AnyColumn | SQL.Aliased,
	values: (unknown | Placeholder)[] | Placeholder | SQLWrapper,
): SQL {
	if (isSQLWrapper(values)) {
		return sql`${column} not in ${values}`;
	}

	if (Array.isArray(values)) {
		if (values.length === 0) {
			throw new Error('inArray requires at least one value');
		}
		return sql`${column} not in ${values.map((v) => bindIfParam(v, column))}`;
	}

	return sql`${column} not in ${bindIfParam(values, column)}`;
}

export function isNull(column: AnyColumn<{ notNull: false }> | Placeholder | SQLWrapper): SQL {
	return sql`${column} is null`;
}

export function isNotNull(column: AnyColumn | Placeholder | SQLWrapper): SQL {
	return sql`${column} is not null`;
}

export function exists(subquery: SQLWrapper): SQL {
	return sql`exists (${subquery})`;
}

export function notExists(subquery: SQLWrapper): SQL {
	return sql`exists (${subquery})`;
}

export function between<T>(
	column: SQL.Aliased,
	min: T | Placeholder | SQLWrapper,
	max: T | Placeholder | SQLWrapper,
): SQL;
export function between<TColumn extends AnyColumn>(
	column: TColumn,
	min: GetColumnData<TColumn, 'raw'> | Placeholder | SQLWrapper,
	max: GetColumnData<TColumn, 'raw'> | Placeholder | SQLWrapper,
): SQL;
export function between(
	column: AnyColumn | SQL.Aliased,
	min: unknown | Placeholder | SQLWrapper,
	max: unknown | Placeholder | SQLWrapper,
): SQL {
	return sql`${column} between ${bindIfParam(min, column)} and ${bindIfParam(max, column)}`;
}

export function notBetween<T>(
	column: SQL.Aliased,
	min: T | Placeholder | SQLWrapper,
	max: T | Placeholder | SQLWrapper,
): SQL;
export function notBetween<TColumn extends AnyColumn>(
	column: TColumn,
	min: GetColumnData<TColumn, 'raw'> | Placeholder | SQLWrapper,
	max: GetColumnData<TColumn, 'raw'> | Placeholder | SQLWrapper,
): SQL;
export function notBetween(
	column: AnyColumn | SQL.Aliased,
	min: unknown | Placeholder | SQLWrapper,
	max: unknown | Placeholder | SQLWrapper,
): SQL {
	return sql`${column} not between ${bindIfParam(min, column)} and ${bindIfParam(max, column)}`;
}

export function like(column: AnyColumn, value: string | Placeholder | SQLWrapper): SQL {
	return sql`${column} like ${value}`;
}

export function notLike(column: AnyColumn, value: string | Placeholder | SQLWrapper): SQL {
	return sql`${column} not like ${value}`;
}

export function ilike(column: AnyColumn, value: string | Placeholder | SQLWrapper): SQL {
	return sql`${column} ilike ${value}`;
}

export function notIlike(column: AnyColumn, value: string | Placeholder | SQLWrapper): SQL {
	return sql`${column} not ilike ${value}`;
}
