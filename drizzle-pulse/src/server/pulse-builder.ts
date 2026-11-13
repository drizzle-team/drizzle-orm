import type { InferModelFromColumns, InferSelectModel } from 'drizzle-orm';
import type { PgColumn, PgTable } from 'drizzle-orm/pg-core';
import type { StandardSchemaV1 } from '../shared/standard-schema.js';
import type { WhereClause } from '../types.js';
import type { ColumnsSelection, PulseQueryConfig, PulseQueryContext } from './pulse-types.js';

function columnsToSelectedColumns(
	selection: Record<string, boolean>,
	columns: Record<string, PgColumn>,
): Record<string, PgColumn> {
	const keys = Object.keys(selection);
	if (keys.length === 0) return columns;
	const columnEntries = Object.entries(columns);

	const hasInclude = keys.some((key) => selection[key] === true);
	if (hasInclude) {
		const includedColumnEntries = columnEntries.filter(([name]) => selection[name] === true);

		return Object.fromEntries(includedColumnEntries);
	}

	const remainingColumnEntries = columnEntries.filter(([name]) => selection[name] !== false);

	return Object.fromEntries(remainingColumnEntries);
}

/** Marks the chain calls that a live collection and a CDC event stream do not support. */
export interface PulseBuilderFlags {
	transformed: boolean;
	limited: boolean;
}

export type DefaultPulseBuilderFlags = { transformed: false; limited: false };

export class PulseBuilder<
	TTable extends PgTable,
	TSelection extends Record<string, boolean>,
	TArgsInput,
	TArgsOutput,
	TResult extends Record<string, unknown> = ColumnsSelection<TTable, TSelection>,
	TFlags extends PulseBuilderFlags = DefaultPulseBuilderFlags,
> {
	readonly _!: {
		result: TResult;
		argsInput: TArgsInput;
		argsOutput: TArgsOutput;
		flags: TFlags;
	};

	/** @internal */
	readonly config: PulseQueryConfig<TTable, TSelection, TArgsOutput, TResult>;

	/** @internal */
	constructor(config: PulseQueryConfig<TTable, TSelection, TArgsOutput, TResult>) {
		this.config = config;
	}

	columns<TNewSelection extends Record<string, boolean>>(
		selection: TNewSelection,
	): PulseBuilder<TTable, TNewSelection, TArgsInput, TArgsOutput, ColumnsSelection<TTable, TNewSelection>, TFlags> {
		// A previously-chained .transform() was typed against the old TResult that .columns()
		// re-parameterizes; fail loudly rather than silently carry or drop it.
		if (this.config.transformFn !== null) {
			throw new Error(
				'.columns() cannot follow .transform(); call .columns() before .transform() instead',
			);
		}

		const selectedColumns = columnsToSelectedColumns(selection, this.config.columns);

		return new PulseBuilder({
			...this.config,
			selectedColumns,
			transformFn: null,
		} as PulseQueryConfig<TTable, TNewSelection, TArgsOutput, ColumnsSelection<TTable, TNewSelection>>);
	}

	/**
	 * Sets the schema for the query arguments. The schema can come from any library that
	 * implements Standard Schema (https://standardschema.dev), and its validation must be
	 * synchronous. Callers pass the schema's input type, and the where-function reads its output
	 * type as `ctx.args`.
	 */
	args<TSchema extends StandardSchemaV1>(
		schema: TSchema,
	): PulseBuilder<
		TTable,
		TSelection,
		StandardSchemaV1.InferInput<TSchema>,
		StandardSchemaV1.InferOutput<TSchema>,
		TResult,
		TFlags
	> {
		if (this.config.queryFn !== null) {
			throw new Error('.args() must come before .query(fn); the where-function is already set');
		}
		return new PulseBuilder({
			...this.config,
			argsSchema: schema,
		} as unknown as PulseQueryConfig<TTable, TSelection, StandardSchemaV1.InferOutput<TSchema>, TResult>);
	}

	transform<TTransformed extends Record<string, unknown>>(
		// Plain function type, not PulseTransformFn: the Bivariant wrapper blocks TTransformed
		// inference at the call site.
		fn: (
			rows: InferModelFromColumns<TTable['_']['columns']>[],
		) => Promise<TTransformed[]> | TTransformed[],
	): PulseBuilder<
		TTable,
		TSelection,
		TArgsInput,
		TArgsOutput,
		TTransformed,
		{ transformed: true; limited: TFlags['limited'] }
	> {
		return new PulseBuilder({
			...this.config,
			transformFn: fn,
		} as unknown as PulseQueryConfig<TTable, TSelection, TArgsOutput, TTransformed>);
	}

	order(direction: 'asc' | 'desc'): PulseBuilder<TTable, TSelection, TArgsInput, TArgsOutput, TResult, TFlags> {
		return new PulseBuilder({
			...this.config,
			order: direction,
		});
	}

	limit(
		n: number,
	): PulseBuilder<
		TTable,
		TSelection,
		TArgsInput,
		TArgsOutput,
		TResult,
		{ transformed: TFlags['transformed']; limited: true }
	> {
		return new PulseBuilder({ ...this.config, limit: n });
	}

	query(
		fn: (ctx: PulseQueryContext<TArgsOutput, InferSelectModel<TTable>>) => WhereClause | null,
	): PulseBuilder<TTable, TSelection, TArgsInput, TArgsOutput, TResult, TFlags> {
		if (this.config.queryFn !== null) {
			throw new Error(
				'.query() may only be called once per chain; the where-function is already set',
			);
		}
		return new PulseBuilder({ ...this.config, queryFn: fn });
	}
}
