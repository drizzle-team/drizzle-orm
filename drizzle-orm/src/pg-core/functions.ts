import { entityKind } from '~/entity.ts';
import type { SQL } from '~/sql/sql.ts';
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
	TArgs extends PgFunctionArgsDefinition = PgFunctionArgsDefinition,
	TReturns extends PgFunctionReturnType = PgFunctionReturnType,
> {
	name: TName;
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
	TArgs extends PgFunctionArgsDefinition = PgFunctionArgsDefinition,
	TReturns extends PgFunctionReturnType = PgFunctionReturnType,
> extends PgFunctionBuilderRuntimeConfig<TName, TArgs, TReturns> {
	body: SQL;
}

export interface PgFunctionDefinition<
	TArgs extends PgFunctionArgsDefinition = PgFunctionArgsDefinition,
	TReturns extends PgFunctionReturnType = PgFunctionReturnType,
> {
	args: TArgs;
	returns: TReturns;
}

/* Class */
export class PgFunctionBuilder<
	TName extends string = string,
	TArgs extends PgFunctionArgsDefinition = PgFunctionArgsDefinition,
	TReturns extends PgFunctionReturnType = PgFunctionReturnType,
> {
	static readonly [entityKind]: string = 'PgFunctionBuilder';

	protected config: PgFunctionBuilderRuntimeConfig<TName, TArgs, TReturns>;

	constructor(
		name: TName,
		args: TArgs,
		returns: TReturns,
	) {
		this.config = {
			name: name,
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
	as(body: SQL): PgFunction<TName, TArgs, TReturns> {
		return new PgFunction<TName, TArgs, TReturns>({
			...this.config,
			configuration: new Map(this.config.configuration),
			...(this.config.searchPath
				? { searchPath: [...this.config.searchPath] }
				: {}),
			body,
		});
	}
}

export class PgFunction<
	TName extends string = string,
	TArgs extends PgFunctionArgsDefinition = PgFunctionArgsDefinition,
	TReturns extends PgFunctionReturnType = PgFunctionReturnType,
> {
	static readonly [entityKind]: string = 'PgFunction';

	readonly config: PgFunctionConfig<TName, TArgs, TReturns>;

	constructor(config: PgFunctionConfig<TName, TArgs, TReturns>) {
		this.config = config;
	}
}

/* Infer Helpers */
type InferPgFunctionColumnBuilder<
	TBuilder extends AnyPgColumnBuilder,
> = ResolvePgColumnConfig<TBuilder['_'], ''>['data'];

export type InferFunctionArgs<
	TFunction extends PgFunction,
> = TFunction extends PgFunction<any, infer TArgs, any> ? {
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
> = TFunction extends PgFunction<any, any, infer TReturns> ? InferPgFunctionReturn<TReturns>
	: never;

/* Factory */
export function pgFunction<
	TName extends string = string,
	TArgs extends PgFunctionArgsDefinition = PgFunctionArgsDefinition,
	TReturns extends PgFunctionReturnType = PgFunctionReturnType,
>(
	name: TName,
	config: PgFunctionDefinition<TArgs, TReturns>,
): PgFunctionBuilder<TName, TArgs, TReturns> {
	return new PgFunctionBuilder<TName, TArgs, TReturns>(name, config.args, config.returns);
}

/** Helpers */
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
