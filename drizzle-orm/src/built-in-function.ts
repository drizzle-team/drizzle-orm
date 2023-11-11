import { entityKind } from './entity.ts';
import type { Dialect } from './column-builder.ts';
import type { SQLWrapper, SQL, DriverValueDecoder, GetDecoderResult } from './sql/sql.ts';

/** @internal */
export const BuiltInFunctionSQL = Symbol.for('drizzle:BuiltInFunctionSQL');

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export interface BuiltInFunction<T = unknown> extends SQLWrapper {
  // SQLWrapper runtime implementation is defined in 'sql/sql.ts'
}
export abstract class BuiltInFunction<T = unknown> implements SQLWrapper {
  static readonly [entityKind]: string = 'BuiltInFunction';

  declare readonly _: {
		readonly type: T;
		readonly dialect: Dialect;
	};

  /** @internal */
	static readonly Symbol = {
		SQL: BuiltInFunctionSQL as typeof BuiltInFunctionSQL,
	};

  /** @internal */
	get [BuiltInFunctionSQL](): SQL<T> {
    return this.sql;
  }
  
  protected sql: SQL<T>;

  constructor(sql: SQL<T>) {
    this.sql = sql;
  }

  as(alias: string): SQL.Aliased<T>;
	/**
	 * @deprecated
	 * Use ``sql<DataType>`query`.as(alias)`` instead.
	 */
	as<TData>(): SQL<TData>;
	/**
	 * @deprecated
	 * Use ``sql<DataType>`query`.as(alias)`` instead.
	 */
	as<TData>(alias: string): SQL.Aliased<TData>;
	as(alias?: string): SQL<T> | SQL.Aliased<T> {
		// TODO: remove with deprecated overloads
		if (alias === undefined) {
			return this.sql;
		}

		return this.sql.as(alias);
	}

	mapWith<
		TDecoder extends
			| DriverValueDecoder<any, any>
			| DriverValueDecoder<any, any>['mapFromDriverValue'],
	>(decoder: TDecoder): SQL<GetDecoderResult<TDecoder>> {
		return this.sql.mapWith(decoder);
	}
}
