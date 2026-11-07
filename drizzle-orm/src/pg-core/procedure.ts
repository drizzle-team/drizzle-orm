import { entityKind, is } from '~/entity.ts';
import { type SQL, sql, type SQLWrapper } from '~/sql/sql.ts';
import type { Table } from '~/table.ts';
import type { numeric } from './columns/numeric.ts';
import type { text } from './columns/text.ts';
import type { PgCondition } from './procedure-conditions.ts';

export type { PgCondition } from './procedure-conditions.ts';

/**
 * Procedures are written in a strict TypeScript subset and compiled to PL/pgSQL by drizzle-kit
 * (`generate`, `push`). The body NEVER runs in JavaScript: everything on `ctx` below is a
 * compile-time surface, resolved by the compiler against imports from `drizzle-orm/pg-core`.
 *
 * Annotation types are plain aliases (number-mode, Drizzle-style): `int`, `numeric`, `bigint_`
 * are all TS `number`, so the compiler recovers the intended SQL type from the annotation itself —
 * a bare `number` annotation is a compile error. `numeric` and `text` share their names with the
 * column builders, so one `import { numeric } from 'drizzle-orm/pg-core'` serves both uses.
 */
export type int = number;
/** SQL bigint, number-mode. (`bigint` is a reserved TS type name, hence the underscore.) */
export type bigint_ = number;
/** SQL bigint, explicit bigint-mode: TS-side `bigint`, `0n` literals. Same SQL type as `bigint_`. */
export type bigint64 = bigint;

/** Parameter type names: `procedure('transfer', { from: 'bigint', amount: 'numeric' }, ...)`. */
export type PgProcedureTypeName = 'int' | 'bigint' | 'bigint64' | 'numeric' | 'text' | 'boolean';

/** TS-side value type for each parameter type name. */
export interface PgProcedureTypeNameToTs {
	int: int;
	bigint: bigint_;
	bigint64: bigint64;
	numeric: numeric;
	text: text;
	boolean: boolean;
}

/**
 * A parameter with a default: `{ limit: { type: 'int', default: 20 } }` → `p_limit integer DEFAULT 20`.
 * The default must be a literal of the parameter's type; `default: null` makes the argument nullable.
 * Defaulted parameters must come last, and become optional for callers.
 */
export type PgProcedureParamWithDefault = {
	[T in PgProcedureTypeName]: { readonly type: T; readonly default: PgProcedureTypeNameToTs[T] | null };
}[PgProcedureTypeName];

export type PgProcedureParam = PgProcedureTypeName | PgProcedureParamWithDefault;
export type PgProcedureParams = Record<string, PgProcedureParam>;

/** The value type a parameter has inside the body. */
export type PgProcedureParamValue<S extends PgProcedureParam> = S extends PgProcedureTypeName
	? PgProcedureTypeNameToTs[S]
	: S extends { type: infer T extends PgProcedureTypeName; default: infer D }
		? null extends D ? PgProcedureTypeNameToTs[T] | null : PgProcedureTypeNameToTs[T]
	: never;

/** Arguments as seen inside the body: every parameter present. */
export type PgProcedureArgs<P extends PgProcedureParams> = { readonly [K in keyof P]: PgProcedureParamValue<P[K]> };

/** Arguments as passed to `db.call()`: defaulted parameters are optional. */
export type PgProcedureCallArgs<P extends PgProcedureParams> =
	& { [K in keyof P as P[K] extends PgProcedureTypeName ? K : never]: PgProcedureParamValue<P[K]> }
	& { [K in keyof P as P[K] extends PgProcedureTypeName ? never : K]?: PgProcedureParamValue<P[K]> };

export type PgProcedureValue = number | bigint | string | boolean | null;
export type PgProcedureRow = Record<string, PgProcedureValue>;

/**
 * What a body may return: nothing, or a flat record of scalars. A returned record compiles to
 * `INOUT "<key>" <type> DEFAULT NULL` parameters, so `CALL` yields one row with exactly these keys.
 */
export type PgProcedureReturn = PgProcedureRow | void;

/**
 * Result of a `sql` statement. `count`/`found` compile to `GET DIAGNOSTICS ... = ROW_COUNT`
 * captured immediately after the statement.
 */
export interface PgProcedureSqlResult {
	readonly count: bigint_;
	readonly found: boolean;
	/** Exactly one row: `SELECT/RETURNING ... INTO STRICT <record>`. */
	one<T extends PgProcedureRow>(): T;
	/** Zero or one row; `.row` fields are only readable inside `if (res.found) { ... }`. */
	maybeOne<T extends PgProcedureRow>(): PgProcedureMaybeOneResult<T>;
	/**
	 * Cursor over many rows → `FOR rec IN <query> LOOP`. Iterate inline or bind first; a binding is
	 * single-pass and must be iterated exactly once. Only SELECT/WITH/VALUES can be iterated.
	 */
	many<T extends PgProcedureRow = never>(): Iterable<T>;
}

export interface PgProcedureMaybeOneResult<T extends PgProcedureRow> {
	readonly count: bigint_;
	readonly found: boolean;
	readonly row: T;
}

/** What `ctx.try()` caught — GET STACKED DIAGNOSTICS fields (`''` when absent). */
export interface PgProcedureCaughtError<C extends string> {
	/** The matching entry of the condition list. */
	readonly code: C;
	/** The actual SQLSTATE (a condition name can cover several). */
	readonly sqlstate: text;
	readonly message: text;
	readonly detail: text;
	readonly hint: text;
	readonly constraint: text;
	readonly table: text;
	readonly column: text;
}

/** Narrow with `err === null` / `err !== null`. */
export type PgProcedureTryResult<R, C extends string> = { res: R; err: null } | {
	res: null;
	err: PgProcedureCaughtError<C>;
};

/**
 * The procedure context — the single handler parameter. Destructure freely
 * (`({ args, sql }) => ...`) or read members directly (`ctx.sql\`...\``).
 */
export interface PgProcedureCtx<P extends PgProcedureParams> {
	/** The procedure's arguments, typed from the params object. Read-only. */
	readonly args: PgProcedureArgs<P>;
	/**
	 * A single SQL statement. Interpolations lower to bare (renamed) identifiers, never string
	 * concatenation: in-scope values, `args` members, and drizzle tables/columns (emitted quoted).
	 */
	readonly sql: (
		strings: TemplateStringsArray,
		...values: (PgProcedureValue | Table | SQLWrapper)[]
	) => PgProcedureSqlResult;
	/** Deadlock-safe locking: `PERFORM 1 FROM <table> WHERE id IN (...) ORDER BY id FOR UPDATE`. */
	readonly lockRowsOrdered: (table: string, ids: readonly (int | bigint_)[]) => void;
	/** `RAISE NOTICE`; template literal holes become format arguments. */
	readonly notice: (message: PgProcedureValue) => void;
	/** `RAISE WARNING`; same message forms as `notice()`. */
	readonly warning: (message: PgProcedureValue) => void;
	/** `COMMIT;` — the procedure must be CALLed outside an explicit transaction block. */
	readonly commit: () => void;
	/** `ROLLBACK;` — discards the current transaction's work; a new one starts. */
	readonly rollback: () => void;
	/**
	 * Run `body` in an exception block: `BEGIN ... EXCEPTION WHEN <conditions> THEN ... END`.
	 * On a caught error every change made in `body` is rolled back. The condition list is required.
	 */
	readonly try: <R extends PgProcedureRow | void, const C extends PgCondition | (string & {})>(
		body: () => R,
		conditions: readonly [C, ...C[]],
	) => PgProcedureTryResult<R, C>;
	/** `x IS NULL` — the only legal way to test nullable values. */
	readonly isNull: (value: PgProcedureValue) => boolean;
	/** `coalesce(a, b, ...)`. */
	readonly coalesce: <T extends PgProcedureValue>(...values: (T | null)[]) => T;
}

export type PgProcedureBody<P extends PgProcedureParams, R extends PgProcedureReturn> = (ctx: PgProcedureCtx<P>) => R;

/**
 * `throw new PgError('P0001', 'insufficient funds')` inside a procedure body →
 * `RAISE EXCEPTION 'insufficient funds' USING ERRCODE = 'P0001'`.
 *
 * Compile-time only: at runtime the database error surfaces through your driver
 * (wrapped in `DrizzleQueryError`), never as a `PgError`.
 */
export class PgError extends Error {
	static readonly [entityKind]: string = 'PgError';

	static override [Symbol.hasInstance](value: unknown): boolean {
		return is(value, this);
	}

	constructor(readonly code: string, message: string, readonly options?: { detail?: string; hint?: string }) {
		super(message);
	}
}

/**
 * Values as drivers return them for a `CALL`. Result columns carry no drizzle column, so no codec
 * runs: `numeric`/`bigint` typically arrive as strings, `int` as numbers.
 */
export type PgProcedureRawValue<T> = T extends number | bigint ? number | bigint | string
	: T extends boolean ? boolean
	: T;

export type PgProcedureCallResult<R extends PgProcedureReturn> = R extends PgProcedureRow
	? { [K in keyof R]: PgProcedureRawValue<R[K]> }
	: void;

/** `db.call(proc, args)` arguments: `args` may be omitted only when the procedure has no required parameters. */
export type PgProcedureCallParams<TProcedure extends PgProcedure<any, any>> = keyof TProcedure['_']['params'] extends
	never ? [args?: TProcedure['_']['callArgs']]
	: [args: TProcedure['_']['callArgs']];

const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;

export class PgProcedure<
	TParams extends PgProcedureParams = PgProcedureParams,
	TReturn extends PgProcedureReturn = PgProcedureReturn,
> {
	static readonly [entityKind]: string = 'PgProcedure';
	static [Symbol.hasInstance](value: unknown): boolean {
		return is(value, this);
	}

	declare readonly _: {
		readonly params: TParams;
		readonly return: TReturn;
		readonly callArgs: PgProcedureCallArgs<TParams>;
		readonly result: PgProcedureCallResult<TReturn>;
	};

	constructor(
		readonly name: string,
		readonly params: TParams,
		/** Compile-time only: the body is compiled by drizzle-kit and never invoked. */
		readonly body: PgProcedureBody<TParams, TReturn>,
		readonly schema: string | undefined,
	) {}

	/**
	 * `CALL "name"(p_a => $1, p_b => $2)` in named notation: omitted defaulted arguments take their
	 * defaults, and INOUT result parameters (`DEFAULT NULL`) are omitted entirely.
	 */
	getCallSQL(args: Record<string, unknown>): SQL {
		if (!IDENT.test(this.name)) throw new Error(`Invalid procedure name '${this.name}'`);
		const chunks: SQL[] = [];
		for (const key of Object.keys(this.params)) {
			const value = args[key];
			if (value === undefined) continue;
			if (!IDENT.test(key)) throw new Error(`Invalid parameter name '${key}' in procedure '${this.name}'`);
			// IN parameters are emitted unquoted as p_<key>, so they fold to lowercase like this one.
			chunks.push(sql`${sql.raw(`p_${key}`)} => ${value}`);
		}
		// Unquoted procedure names fold to lowercase in the catalog.
		const name = this.schema
			? sql`${sql.identifier(this.schema)}.${sql.identifier(this.name.toLowerCase())}`
			: sql.identifier(this.name.toLowerCase());
		return sql`call ${name}(${sql.join(chunks, sql`, `)})`;
	}
}

/**
 * Declares a PostgreSQL procedure written in a strict TypeScript subset. drizzle-kit compiles the
 * body to PL/pgSQL and manages it in migrations; call it with `db.call(proc, args)`.
 *
 * @example
 * ```ts
 * export const transfer = procedure('transfer', { from: 'bigint', to: 'bigint', amount: 'numeric' }, ({ args, sql }) => {
 *   const debit = sql`update ${accounts} set ${accounts.balance} = ${accounts.balance} - ${args.amount}
 *     where ${accounts.id} = ${args.from} and ${accounts.balance} >= ${args.amount}`;
 *   if (debit.count === 0) {
 *     throw new PgError('P0001', 'insufficient funds');
 *   }
 *   sql`update ${accounts} set ${accounts.balance} = ${accounts.balance} + ${args.amount} where ${accounts.id} = ${args.to}`;
 *   const row = sql`select ${accounts.balance} from ${accounts} where ${accounts.id} = ${args.from}`.one<{ balance: numeric }>();
 *   return { newBalance: row.balance };
 * });
 *
 * const { newBalance } = await db.call(transfer, { from: 1, to: 2, amount: 30 });
 * ```
 */
export function procedure<TParams extends PgProcedureParams, TReturn extends PgProcedureReturn = void>(
	name: string,
	params: TParams,
	body: PgProcedureBody<TParams, TReturn>,
): PgProcedure<TParams, TReturn> {
	return procedureWithSchema(name, params, body, undefined);
}

/** @internal */
export function procedureWithSchema<TParams extends PgProcedureParams, TReturn extends PgProcedureReturn = void>(
	name: string,
	params: TParams,
	body: PgProcedureBody<TParams, TReturn>,
	schema: string | undefined,
): PgProcedure<TParams, TReturn> {
	return new PgProcedure(name, params, body, schema);
}

export function isPgProcedure(obj: unknown): obj is PgProcedure {
	return is(obj, PgProcedure);
}
