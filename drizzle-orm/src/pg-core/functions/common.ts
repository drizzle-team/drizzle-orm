import { BuiltInFunction } from '~/built-in-function.ts';
import { entityKind } from '~/entity.ts';

export class PgBuiltInFunction<T = unknown> extends BuiltInFunction<T> {
  static readonly [entityKind]: string = 'PgBuiltInFunction';

  declare readonly _: {
		readonly type: T;
		readonly dialect: 'pg';
	};
}
