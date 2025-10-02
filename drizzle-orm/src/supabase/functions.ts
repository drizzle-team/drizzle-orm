import type { SQL } from '~/sql/sql.ts';
import { entityKind } from '~/entity.ts';

export type FunctionReturns =
  | 'void'
  | 'record'
  | 'trigger'
  | 'integer'
  | 'bool'
  | 'bytea'
  | 'date'
  | 'double precision'
  | 'float4'
  | 'float8'
  | 'int2'
  | 'int4'
  | 'int8'
  | 'json'
  | 'jsonb'
  | 'numeric'
  | 'text'
  | 'time'
  | 'timestamp'
  | 'timestamptz'
  | 'timetz'
  | 'uuid'
  | 'varchar'
  | 'vector';

export type FunctionLanguage = 'plpgsql' | 'sql';
export type FunctionBehavior = 'immutable' | 'stable' | 'volatile';
export type FunctionSecurity = 'definer' | 'invoker';

export interface PgFunctionConfig {
  returns?: FunctionReturns;
  language?: FunctionLanguage;
  behavior?: FunctionBehavior;
  security?: FunctionSecurity;
  searchPath?: string;
  body?: SQL;
}

export class PgFunction implements PgFunctionConfig {
  static readonly [entityKind]: string = 'PgFunction';

  readonly returns: PgFunctionConfig['returns'];
  readonly language: PgFunctionConfig['language'];
  readonly behavior: PgFunctionConfig['behavior'];
  readonly security: PgFunctionConfig['security'];
  readonly searchPath: PgFunctionConfig['searchPath'];
  readonly body: PgFunctionConfig['body'];

  constructor(
    readonly name: string,
    config?: PgFunctionConfig
  ) {
    if (config) {
      this.returns = config.returns;
      this.language = config.language;
      this.behavior = config.behavior;
      this.security = config.security;
      this.searchPath = config.searchPath;
      this.body = config.body;
    }
  }
}

export function pgFunction(name: string, config?: PgFunctionConfig) {
  return new PgFunction(name, config);
}
