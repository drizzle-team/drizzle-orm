import type { InferSelectModel, Simplify } from 'drizzle-orm';
import type { PgColumn, PgTable } from 'drizzle-orm/pg-core';
import type { z } from 'zod';
import type { PulseAuthContext, QueryDescriptor, WhereClause, WhereCondition } from '../types.js';
import type { AnyPulseBuilder } from './pulse-registry.js';

export type ApplyColumns<
	TRow extends Record<string, unknown>,
	TSelection extends Record<string, boolean>,
> = [keyof TSelection] extends [never] ? TRow
	: true extends TSelection[keyof TSelection] ? {
			[
				K in keyof TRow as K extends string ? TSelection[K] extends true ? K
					: never
					: never
			]: TRow[K];
		}
	: {
		[
			K in keyof TRow as K extends string ? TSelection[K] extends false ? never
				: K
				: never
		]: TRow[K];
	};

export type InferColumnSelection<TSelection extends Record<string, boolean>> = {
	[K in keyof TSelection]: TSelection[K] extends true ? K : never;
}[keyof TSelection];

export type ColumnsSelection<
	TTable extends PgTable,
	TSelection extends Record<string, boolean>,
> = ApplyColumns<InferSelectModel<TTable>, TSelection>;

export interface PulseQueryContext<TArgs, TRow extends Record<string, unknown>> {
	query: (where: WhereCondition<TRow>) => WhereClause;
	args: TArgs;
	/**
	 * Only the HTTP server fills it. In embedded mode `userId` is always `null`. It is not part
	 * of the stability promise and can change before v1.
	 */
	auth: PulseAuthContext;
}

// Builder callbacks are stored on widened config/registry types and later reassigned across
// generic builder states. A plain function type becomes too contravariant there, which breaks
// `query()`/`transform()` assignability and downstream registry/client typing.
type Bivariant<T extends (...args: never) => unknown> = {
	bivariant(...args: Parameters<T>): ReturnType<T>;
}['bivariant'];

export type QueryFn<TArgs, TRow extends Record<string, unknown>> = Bivariant<
	(ctx: PulseQueryContext<TArgs, TRow>) => WhereClause | null
>;

export type PulseTransformFn<
	TInput extends Record<string, unknown>,
	TOutput extends Record<string, unknown> = TInput,
> = Bivariant<(rows: TInput[]) => Promise<TOutput[]> | TOutput[]>;

export type WithPk<TRow extends Record<string, unknown>> = { $pk: unknown } & TRow;

export type PulseBuilderTable<TTable extends PgTable> = {
	readonly source: TTable;
};

export type PulseQueryConfig<
	TTable extends PgTable,
	TColumns extends Record<string, boolean>,
	TArgs,
	TResult extends Record<string, unknown> = ColumnsSelection<TTable, TColumns>,
> = {
	readonly table: PulseBuilderTable<TTable>;
	readonly pkColumn: PgColumn;
	readonly columns: Record<string, PgColumn>;
	readonly selectedColumns: Record<string, PgColumn>;
	readonly argsSchema: z.ZodType<TArgs> | null;
	readonly queryFn: QueryFn<TArgs, InferSelectModel<TTable>> | null;
	readonly transformFn: PulseTransformFn<Record<string, unknown>, TResult> | null;
	readonly order: 'asc' | 'desc' | null;
	readonly limit: number | null;
};

export type PulseClientContract<TShapes extends Record<string, unknown>> = Simplify<
	{
		[K in keyof TShapes]: TShapes[K] extends AnyPulseBuilder
			? [keyof TShapes[K]['_']['argsInput']] extends [never]
				? () => QueryDescriptor<Simplify<WithPk<TShapes[K]['_']['result']>>>
			: (args: TShapes[K]['_']['argsInput']) => QueryDescriptor<Simplify<WithPk<TShapes[K]['_']['result']>>>
			: never;
	}
>;

// Relocated to shared/column-filter.ts (value-pure, no drizzle-orm/pg-core value imports) so
// the embedded client entrypoint can value-import them without dragging in server/ modules.
// Re-exported here so existing server import paths (pulse-sql.ts, sdk.ts, index.ts) keep
// resolving unchanged.
export { applyColumnFilter, getQueryColumnKey } from '../shared/column-filter.js';
