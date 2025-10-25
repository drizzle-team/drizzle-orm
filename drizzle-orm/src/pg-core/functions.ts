import { entityKind } from '~/entity.ts';

export interface PgFunctionConfig {
	schema?: string;
	language?: 'sql' | 'plpgsql';
	args?: string;
	returns?: string;
	stability?: 'immutable' | 'volatile' | 'stable';
	security?: 'invoker' | 'definer';
	params?: {
		search_path?: string;
	};
	body?: string;
}

export class PgFunction implements PgFunctionConfig {
	static readonly [entityKind]: string = 'PgFunction';

	readonly schema: PgFunctionConfig['schema'];
	readonly language: PgFunctionConfig['language'];
	readonly args: PgFunctionConfig['args'];
	readonly returns: PgFunctionConfig['returns'];
	readonly stability: PgFunctionConfig['stability'];
	readonly security: PgFunctionConfig['security'];
	readonly params: PgFunctionConfig['params'];
	readonly body: PgFunctionConfig['body'];

	constructor(
		readonly name: string,
		config?: PgFunctionConfig,
	) {
		if (config) {
			this.schema = config.schema;
			this.language = config.language;
			this.args = config.args;
			this.returns = config.returns;
			this.stability = config.stability;
			this.security = config.security;
			this.params = config.params;
			this.body = config.body;
		}
	}
}

export function pgFunction(name: string, config?: PgFunctionConfig) {
	return new PgFunction(name, config);
}
