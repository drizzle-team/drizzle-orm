import { entityKind } from '~/entity.ts';
import type { SQL } from '~/sql/sql.ts';
import type { PgColumnBuilderBase } from './columns/common.ts';
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

type PgFunctionArgumentType = PgColumnBuilderBase;

export type PgFunctionArgsDefinition =
	Record<string, PgFunctionArgumentType>;

    export type PgFunctionScalarReturn =
	| PgColumnBuilderBase
	| PgTable;

export interface PgFunctionTableReturn<
	TColumns extends Record<string, PgColumnBuilderBase> =
		Record<string, PgColumnBuilderBase>,
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

export interface PgFunctionSpecialReturn {
	kind: 'special';
	type: 'void' | 'record' | 'trigger';
}

export type PgFunctionReturnType =
	| PgFunctionScalarReturn
	| PgFunctionTableReturn
	| PgFunctionSetOfReturn
	| PgFunctionSpecialReturn
	| SQL;

export interface PgFunctionBuilderRuntimeConfig {
    name: string;
    args: PgFunctionArgsDefinition;
    returns: PgFunctionReturnType;

    language: PgFunctionLanguage;
    volatility: PgFunctionVolatility;
    security: PgFunctionSecurity;
    nullInput: PgFunctionNullInput;
    parallel: PgFunctionParallel;
    searchPath?: string[];
    configuration: Map<string, unknown>;
}

export interface PgFunctionConfig
	extends PgFunctionBuilderRuntimeConfig {
	body: SQL;
}

/* Class */
export class PgFunctionBuilder {
    static readonly [entityKind]: string = 'PgFunctionBuilder';

    protected config: PgFunctionBuilderRuntimeConfig

    constructor(
        name: string,
        args: PgFunctionArgsDefinition,
        returns: PgFunctionReturnType,
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
        value: unknown
    ): this {
        this.config.configuration.set(name, value);
        return this;
    }

    /* Build */
    as(body: SQL): PgFunction {
        return new PgFunction({
            ...this.config,
            configuration: new Map(this.config.configuration),
            ...(this.config.searchPath
                ? { searchPath: [...this.config.searchPath] }
                : {}),
            body,
        });
    }
}

export class PgFunction {
    static readonly [entityKind]: string = 'PgFunction';

    readonly config: PgFunctionConfig

    constructor(config: PgFunctionConfig) {
        this.config = config;
    }
}

/* Factory */
export function pgFunction(name: string, config: { args: PgFunctionArgsDefinition, returns: PgFunctionReturnType }): PgFunctionBuilder {
    return new PgFunctionBuilder(name, config.args, config.returns);
}