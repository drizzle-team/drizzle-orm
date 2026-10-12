import { type AnyColumn, Column } from '~/column.ts';
import { is } from '~/entity.ts';
import { type SQL, sql, type SQLWrapper } from '../sql.ts';

export type WindowOrderable = SQLWrapper;
export type WindowBoundary =
	| { readonly kind: 'unbounded preceding' }
	| { readonly kind: 'preceding'; readonly value: number }
	| { readonly kind: 'current row' }
	| { readonly kind: 'following'; readonly value: number }
	| { readonly kind: 'unbounded following' };

export interface WindowFrame {
	readonly mode: 'rows' | 'range';
	readonly from: WindowBoundary;
	readonly to: WindowBoundary;
}

export interface WindowSpec {
	partitionBy?: WindowOrderable | readonly WindowOrderable[];
	orderBy?: WindowOrderable | readonly WindowOrderable[];
	frame?: WindowFrame;
}

export interface WindowFunctionBuilder<T> {
	over(spec?: WindowSpec | string): SQL<T>;
}

export const unboundedPreceding: WindowBoundary = { kind: 'unbounded preceding' };
export const currentRow: WindowBoundary = { kind: 'current row' };
export const unboundedFollowing: WindowBoundary = { kind: 'unbounded following' };

function validateOffset(name: string, value: number): void {
	if (!Number.isInteger(value) || value < 0) {
		throw new Error(`${name} requires a non-negative integer; received ${String(value)}`);
	}
}

export function preceding(value: number): WindowBoundary {
	if (!Number.isInteger(value) || value < 0) {
		throw new Error(`preceding requires a non-negative integer; received ${String(value)}`);
	}
	return { kind: 'preceding', value };
}

export function following(value: number): WindowBoundary {
	if (!Number.isInteger(value) || value < 0) {
		throw new Error(`following requires a non-negative integer; received ${String(value)}`);
	}
	return { kind: 'following', value };
}

function boundaryRank(boundary: WindowBoundary): readonly [number, number] {
	switch (boundary.kind) {
		case 'unbounded preceding': return [0, 0];
		case 'preceding': return [1, -boundary.value];
		case 'current row': return [2, 0];
		case 'following': return [3, boundary.value];
		case 'unbounded following': return [4, 0];
	}
}

export function rows(bounds: { from: WindowBoundary; to: WindowBoundary }): WindowFrame {
	return makeFrame('rows', bounds.from, bounds.to);
}

export function range(bounds: { from: WindowBoundary; to: WindowBoundary }): WindowFrame {
	return makeFrame('range', bounds.from, bounds.to);
}

function makeFrame(mode: 'rows' | 'range', from: WindowBoundary, to: WindowBoundary): WindowFrame {
	const start = boundaryRank(from);
	const end = boundaryRank(to);
	if (start[0] > end[0] || (start[0] === end[0] && start[1] > end[1])) {
		throw new Error(`Window frame from boundary must not be after to boundary`);
	}
	return { mode, from, to };
}

export function validateWindowName(name: string): void {
	if (name.length === 0) throw new Error('Window name must be non-empty');
	if (name.trim().length === 0) throw new Error('Window name must not be whitespace');
}

function renderBoundary(boundary: WindowBoundary): SQL {
	switch (boundary.kind) {
		case 'preceding': return sql`${sql.raw(String(boundary.value))} preceding`;
		case 'following': return sql`${sql.raw(String(boundary.value))} following`;
		default: return sql.raw(boundary.kind);
	}
}

export function buildWindowSpec(spec: WindowSpec): SQL {
	const partitionBy = spec.partitionBy === undefined
		? undefined
		: Array.isArray(spec.partitionBy) ? spec.partitionBy : [spec.partitionBy];
	const orderBy = spec.orderBy === undefined
		? undefined
		: Array.isArray(spec.orderBy) ? spec.orderBy : [spec.orderBy];
	const parts: SQL[] = [];
	if (partitionBy?.length) parts.push(sql`partition by ${sql.join(partitionBy, sql`, `)}`);
	if (orderBy?.length) parts.push(sql`order by ${sql.join(orderBy, sql`, `)}`);
	if (spec.frame) {
		parts.push(sql`${sql.raw(spec.frame.mode)} between ${renderBoundary(spec.frame.from)} and ${renderBoundary(spec.frame.to)}`);
	}
	return sql.join(parts, sql` `);
}

export function buildWindowClause(windows: readonly { name: string; spec: WindowSpec }[] | undefined): SQL | undefined {
	if (!windows?.length) return undefined;
	return sql` window ${sql.join(windows.map(({ name, spec }) => {
		validateWindowName(name);
		return sql`${sql.identifier(name)} as (${buildWindowSpec(spec)})`;
	}), sql`, `)}`;
}

class WindowBuilder<T> implements WindowFunctionBuilder<T> {
	constructor(private readonly expression: SQL<T>) {}

	over(spec?: WindowSpec | string): SQL<T> {
		if (typeof spec === 'string') {
			validateWindowName(spec);
			return sql`${this.expression} over ${sql.identifier(spec)}`;
		}
		return sql`${this.expression} over (${spec ? buildWindowSpec(spec) : sql.empty()})`;
	}
}

function builder<T>(expression: SQL<T>): WindowFunctionBuilder<T> {
	return new WindowBuilder(expression);
}

export function rowNumber(): WindowFunctionBuilder<number> { return builder(sql`row_number()`.mapWith(Number)); }
export function rank(): WindowFunctionBuilder<number> { return builder(sql`rank()`.mapWith(Number)); }
export function denseRank(): WindowFunctionBuilder<number> { return builder(sql`dense_rank()`.mapWith(Number)); }
export function percentRank(): WindowFunctionBuilder<number> { return builder(sql`percent_rank()`.mapWith(Number)); }
export function cumeDist(): WindowFunctionBuilder<number> { return builder(sql`cume_dist()`.mapWith(Number)); }

export function ntile(n: number): WindowFunctionBuilder<number> {
	if (!Number.isInteger(n) || n <= 0) throw new Error(`ntile requires a positive integer; received ${String(n)}`);
	return builder(sql`ntile(${sql.raw(String(n))})`.mapWith(Number));
}

type ExpressionValue<T> = T extends AnyColumn ? T['_']['data'] : T extends SQL<infer V> ? V : unknown;
type NullableExpression<T> = ExpressionValue<T> | null;

function valueFunction<T extends SQLWrapper>(name: string, expression: T, rest: SQLWrapper[] = []): WindowFunctionBuilder<NullableExpression<T>> {
	return builder(sql`${sql.raw(name)}(${sql.join([expression, ...rest], sql`, `)})` as SQL<NullableExpression<T>>);
}

export function lag<T extends SQLWrapper>(expression: T): WindowFunctionBuilder<NullableExpression<T>>;
export function lag<T extends SQLWrapper>(expression: T, offset: number): WindowFunctionBuilder<NullableExpression<T>>;
export function lag<T extends SQLWrapper, D extends SQLWrapper>(expression: T, offset: number | undefined, defaultValue: D): WindowFunctionBuilder<ExpressionValue<T> | ExpressionValue<D>>;
export function lag<T extends SQLWrapper, D extends SQLWrapper>(expression: T, offset?: number, defaultValue?: D): WindowFunctionBuilder<any> {
	if (offset !== undefined) validateOffset('lag', offset);
	const args: SQLWrapper[] = [expression];
	if (offset !== undefined || defaultValue !== undefined) args.push(sql.raw(String(offset ?? 1)));
	if (defaultValue !== undefined) args.push(defaultValue);
	return builder(sql`lag(${sql.join(args, sql`, `)})`);
}

export function lead<T extends SQLWrapper>(expression: T): WindowFunctionBuilder<NullableExpression<T>>;
export function lead<T extends SQLWrapper>(expression: T, offset: number): WindowFunctionBuilder<NullableExpression<T>>;
export function lead<T extends SQLWrapper, D extends SQLWrapper>(expression: T, offset: number | undefined, defaultValue: D): WindowFunctionBuilder<ExpressionValue<T> | ExpressionValue<D>>;
export function lead<T extends SQLWrapper, D extends SQLWrapper>(expression: T, offset?: number, defaultValue?: D): WindowFunctionBuilder<any> {
	if (offset !== undefined) validateOffset('lead', offset);
	const args: SQLWrapper[] = [expression];
	if (offset !== undefined || defaultValue !== undefined) args.push(sql.raw(String(offset ?? 1)));
	if (defaultValue !== undefined) args.push(defaultValue);
	return builder(sql`lead(${sql.join(args, sql`, `)})`);
}

export function firstValue<T extends SQLWrapper>(expression: T): WindowFunctionBuilder<NullableExpression<T>> { return valueFunction('first_value', expression); }
export function lastValue<T extends SQLWrapper>(expression: T): WindowFunctionBuilder<NullableExpression<T>> { return valueFunction('last_value', expression); }
export function nthValue<T extends SQLWrapper>(expression: T, n: number): WindowFunctionBuilder<NullableExpression<T>> {
	if (!Number.isInteger(n) || n <= 0) throw new Error(`nthValue requires a positive integer; received ${String(n)}`);
	return valueFunction('nth_value', expression, [sql.raw(String(n))]);
}

export function windowSum(expression: SQLWrapper): WindowFunctionBuilder<string | null> { return builder(sql`sum(${expression})`.mapWith(String)); }
export function windowAvg(expression: SQLWrapper): WindowFunctionBuilder<string | null> { return builder(sql`avg(${expression})`.mapWith(String)); }
export function windowMin<T extends SQLWrapper>(expression: T): WindowFunctionBuilder<(T extends AnyColumn ? T['_']['data'] : string) | null> {
	return builder(sql`min(${expression})`.mapWith(is(expression, Column) ? expression : String) as any);
}
export function windowMax<T extends SQLWrapper>(expression: T): WindowFunctionBuilder<(T extends AnyColumn ? T['_']['data'] : string) | null> {
	return builder(sql`max(${expression})`.mapWith(is(expression, Column) ? expression : String) as any);
}
export function windowCount(expression?: SQLWrapper): WindowFunctionBuilder<number> { return builder(sql`count(${expression || sql.raw('*')})`.mapWith(Number)); }
