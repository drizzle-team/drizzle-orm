import { BuiltInFunction } from '~/built-in-function.ts';
import { entityKind } from '~/entity.ts';

export class MySqlBuiltInFunction<T = unknown> extends BuiltInFunction<T> {
  static readonly [entityKind]: string = 'MySqlBuiltInFunction';

  declare readonly _: {
		readonly type: T;
		readonly dialect: 'mysql';
	};
}
