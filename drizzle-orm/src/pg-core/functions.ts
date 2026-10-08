import { entityKind } from '~/entity.ts';
import type { SQL, SQLWrapper } from '~/sql/sql.ts';
import { sql } from '~/sql/sql.ts';
import type { InferSelectModel } from '~/table.ts';
import type { AnyPgColumnBuilder, ResolvePgColumnConfig } from './columns/common.ts';
import type { PgTable } from './table.ts';

/* Types */
export type PgFunctionLanguage =
	| 'plpgsql'
	| 'sql'
	| (string & {});
export type PgFunctionVolatility = 'volatile' | 'stable' | 'immutable';
export type PgFunctionSecurity = 'definer' | 'invoker';
export type PgFunctionNullInput = 'called' | 'strict';
export type PgFunctionParallel = 'unsafe' | 'restricted' | 'safe';

type PgFunctionArgumentType = AnyPgColumnBuilder;

export type PgFunctionArgsDefinition = Record<string, PgFunctionArgumentType>;

export type PgFunctionScalarReturn =
	| AnyPgColumnBuilder
	| PgTable;

export interface PgFunctionTableReturn<
	TColumns extends Record<string, AnyPgColumnBuilder> = Record<string, AnyPgColumnBuilder>,
> {
	kind: 'table';
	columns: TColumns;
}

export interface PgFunctionSetOfReturn<
	TType extends PgFunctionScalarReturn = PgFunctionScalarReturn,
> {
	kind: 'setof';
	type: TType;
}

export type PgFunctionSpecialReturnType =
	| 'void'
	| 'record'
	| 'trigger';

export interface PgFunctionSpecialReturn<
	TType extends PgFunctionSpecialReturnType = PgFunctionSpecialReturnType,
> {
	kind: 'special';
	type: TType;
}

export type PgFunctionReturnType =
	| PgFunctionScalarReturn
	| PgFunctionTableReturn
	| PgFunctionSetOfReturn
	| PgFunctionSpecialReturn
	| SQL;

export interface PgFunctionBuilderRuntimeConfig<
	TName extends string = string,
	TSchema extends string | undefined = string | undefined,
	TArgs extends PgFunctionArgsDefinition = PgFunctionArgsDefinition,
	TReturns extends PgFunctionReturnType = PgFunctionReturnType,
> {
	name: TName;
	schema: TSchema;
	args: TArgs;
	returns: TReturns;

	language: PgFunctionLanguage;
	volatility: PgFunctionVolatility;
	security: PgFunctionSecurity;
	nullInput: PgFunctionNullInput;
	parallel: PgFunctionParallel;
	searchPath?: string[];
	configuration: Map<string, unknown>;
}

export interface PgFunctionConfig<
	TName extends string = string,
	TSchema extends string | undefined = string | undefined,
	TArgs extends PgFunctionArgsDefinition = PgFunctionArgsDefinition,
	TReturns extends PgFunctionReturnType = PgFunctionReturnType,
> extends PgFunctionBuilderRuntimeConfig<TName, TSchema, TArgs, TReturns> {
	body: SQL;
}

export interface PgFunctionDefinition<
	TArgs extends PgFunctionArgsDefinition = PgFunctionArgsDefinition,
	TReturns extends PgFunctionReturnType = PgFunctionReturnType,
> {
	args: TArgs;
	returns: TReturns;
}

export type PgFunctionArgumentReferences<
	TArgs extends PgFunctionArgsDefinition,
> = {
	[K in keyof TArgs]: PgFunctionArgument<TArgs[K]>;
};

export interface PgFunctionBodyContext<
	TName extends string,
	TArgs extends PgFunctionArgsDefinition,
> {
	readonly name: TName;
	readonly args: PgFunctionArgumentReferences<TArgs>;
}

type PgFunctionBody<
	TName extends string,
	TArgs extends PgFunctionArgsDefinition,
> =
	| SQL
	| ((fn: PgFunctionBodyContext<TName, TArgs>) => SQL);

export interface PgFunctionFn<
	TSchema extends string | undefined = undefined,
> {
	<
		TName extends string,
		TArgs extends PgFunctionArgsDefinition,
		TReturns extends PgFunctionReturnType,
	>(
		name: TName,
		config: PgFunctionDefinition<TArgs, TReturns>,
	): PgFunctionBuilder<
		TName,
		TSchema,
		TArgs,
		TReturns
	>;
}

/* Class */
export class PgFunctionBuilder<
	TName extends string = string,
	TSchema extends string | undefined = string | undefined,
	TArgs extends PgFunctionArgsDefinition = PgFunctionArgsDefinition,
	TReturns extends PgFunctionReturnType = PgFunctionReturnType,
> {
	static readonly [entityKind]: string = 'PgFunctionBuilder';

	protected config: PgFunctionBuilderRuntimeConfig<TName, TSchema, TArgs, TReturns>;

	constructor(
		name: TName,
		schema: TSchema,
		args: TArgs,
		returns: TReturns,
	) {
		this.config = {
			name: name,
			schema: schema,
			args: args,
			returns: returns,

			language: 'plpgsql',
			volatility: 'volatile',
			security: 'invoker',
			nullInput: 'called',
			parallel: 'unsafe',
			// searchPath: undefined,
			configuration: new Map(),
		};
	}

	/* Language */
	language(language: PgFunctionLanguage): this {
		this.config.language = language;
		return this;
	}

	/* Volatility */
	volatile(): this {
		this.config.volatility = 'volatile';
		return this;
	}

	stable(): this {
		this.config.volatility = 'stable';
		return this;
	}

	immutable(): this {
		this.config.volatility = 'immutable';
		return this;
	}

	/* Security */
	securityDefiner(): this {
		this.config.security = 'definer';
		return this;
	}

	securityInvoker(): this {
		this.config.security = 'invoker';
		return this;
	}

	/* Null input */
	calledOnNullInput(): this {
		this.config.nullInput = 'called';
		return this;
	}

	strict(): this {
		this.config.nullInput = 'strict';
		return this;
	}

	/* Parallel */
	parallelUnsafe(): this {
		this.config.parallel = 'unsafe';
		return this;
	}

	parallelRestricted(): this {
		this.config.parallel = 'restricted';
		return this;
	}

	parallelSafe(): this {
		this.config.parallel = 'safe';
		return this;
	}

	/* Search path */
	searchPath(...searchPath: string[]): this {
		this.config.searchPath = searchPath;
		return this;
	}

	/* Configuration */
	setConfig(
		name: string,
		value: unknown,
	): this {
		this.config.configuration.set(name, value);
		return this;
	}

	/* Build */
	as(
		body: PgFunctionBody<TName, TArgs>,
	): PgFunction<TName, TSchema, TArgs, TReturns> {
		const resolvedBody = typeof body === 'function'
			? body({
				name: this.config.name,
				args: buildFunctionArgumentReferences(this.config.args),
			})
			: body;

		return new PgFunction<TName, TSchema, TArgs, TReturns>({
			...this.config,
			configuration: new Map(this.config.configuration),
			...(this.config.searchPath
				? { searchPath: [...this.config.searchPath] }
				: {}),
			body: resolvedBody,
		});
	}
}

export class PgFunctionArgument<
	TBuilder extends AnyPgColumnBuilder = AnyPgColumnBuilder,
> implements SQLWrapper<InferPgFunctionColumnBuilder<TBuilder>> {
	static readonly [entityKind]: string = 'PgFunctionArgument';

	constructor(
		readonly name: string,
		readonly sqlName: string,
	) {}

	getSQL(): SQL<InferPgFunctionColumnBuilder<TBuilder>> {
		return sql<InferPgFunctionColumnBuilder<TBuilder>>`${sql.identifier(this.sqlName)}`;
	}
}

export class PgFunction<
	TName extends string = string,
	TSchema extends string | undefined = string | undefined,
	TArgs extends PgFunctionArgsDefinition = PgFunctionArgsDefinition,
	TReturns extends PgFunctionReturnType = PgFunctionReturnType,
> {
	static readonly [entityKind]: string = 'PgFunction';

	readonly config: PgFunctionConfig<TName, TSchema, TArgs, TReturns>;

	constructor(config: PgFunctionConfig<TName, TSchema, TArgs, TReturns>) {
		this.config = config;
	}
}

/* Infer Helpers */
type InferPgFunctionColumnBuilder<
	TBuilder extends AnyPgColumnBuilder,
> = ResolvePgColumnConfig<TBuilder['_'], ''>['data'];

export type InferFunctionSchema<
	TFunction extends PgFunction,
> = TFunction extends PgFunction<any, infer TSchema, any, any> ? TSchema
	: never;

export type InferFunctionArgs<
	TFunction extends PgFunction,
> = TFunction extends PgFunction<any, any, infer TArgs, any> ? {
		[K in keyof TArgs]: TArgs[K] extends AnyPgColumnBuilder ? InferPgFunctionColumnBuilder<TArgs[K]>
			: never;
	}
	: never;

type InferPgFunctionScalarReturn<T> = T extends AnyPgColumnBuilder ? InferPgFunctionColumnBuilder<T>
	: T extends PgTable ? InferSelectModel<T>
	: never;

type InferPgFunctionTableColumns<
	TColumns extends Record<string, AnyPgColumnBuilder>,
> = {
	[K in keyof TColumns]: InferPgFunctionColumnBuilder<TColumns[K]>;
};

type InferPgFunctionReturn<TReturns> = TReturns extends AnyPgColumnBuilder ? InferPgFunctionColumnBuilder<TReturns>
	: TReturns extends PgTable ? InferSelectModel<TReturns>
	: TReturns extends PgFunctionSetOfReturn<infer TType> ? InferPgFunctionScalarReturn<TType>[]
	: TReturns extends PgFunctionTableReturn<infer TColumns> ? InferPgFunctionTableColumns<TColumns>[]
	: TReturns extends PgFunctionSpecialReturn<'void'> ? void
	: TReturns extends PgFunctionSpecialReturn<'record'> ? unknown
	: TReturns extends PgFunctionSpecialReturn<'trigger'> ? unknown
	: TReturns extends SQL<infer T> ? T
	: never;

export type InferFunctionReturns<
	TFunction extends PgFunction,
> = TFunction extends PgFunction<any, any, any, infer TReturns> ? InferPgFunctionReturn<TReturns>
	: never;

/* Factory */
export function pgFunction<
	TName extends string = string,
	TArgs extends PgFunctionArgsDefinition = PgFunctionArgsDefinition,
	TReturns extends PgFunctionReturnType = PgFunctionReturnType,
>(
	name: TName,
	config: PgFunctionDefinition<TArgs, TReturns>,
): PgFunctionBuilder<TName, undefined, TArgs, TReturns> {
	return pgFunctionWithSchema(
		name,
		config,
		undefined,
	);
}

/** Helpers */
function buildFunctionArgumentReferences<
	TArgs extends PgFunctionArgsDefinition,
>(
	args: TArgs,
): PgFunctionArgumentReferences<TArgs> {
	return Object.fromEntries(
		Object.keys(args).map((name) => [
			name,
			new PgFunctionArgument(name, `a_${name}`),
		]),
	) as PgFunctionArgumentReferences<TArgs>;
}

/** @internal Use `PgSchema.function` or `pgFunction` instead */
export function pgFunctionWithSchema<
	TName extends string,
	TSchema extends string | undefined,
	TArgs extends PgFunctionArgsDefinition,
	TReturns extends PgFunctionReturnType,
>(
	name: TName,
	config: PgFunctionDefinition<TArgs, TReturns>,
	schema: TSchema,
): PgFunctionBuilder<TName, TSchema, TArgs, TReturns> {
	return new PgFunctionBuilder(
		name,
		schema,
		config.args,
		config.returns,
	);
}

export function setOf<
	TType extends PgFunctionScalarReturn,
>(
	type: TType,
): PgFunctionSetOfReturn<TType> {
	return {
		kind: 'setof',
		type,
	};
}

export function tableReturn<
	TColumns extends Record<string, AnyPgColumnBuilder>,
>(
	columns: TColumns,
): PgFunctionTableReturn<TColumns> {
	return {
		kind: 'table',
		columns,
	};
}

export function returnsVoid(): PgFunctionSpecialReturn<'void'> {
	return {
		kind: 'special',
		type: 'void',
	};
}

export function returnsRecord(): PgFunctionSpecialReturn<'record'> {
	return {
		kind: 'special',
		type: 'record',
	};
}

export function returnsTrigger(): PgFunctionSpecialReturn<'trigger'> {
	return {
		kind: 'special',
		type: 'trigger',
	};
}
