import { BuiltInFunction } from '~/built-in-function.ts';
import { entityKind } from '~/entity.ts';

export class SQLiteBuiltInFunction<T = unknown> extends BuiltInFunction<T> {
  static readonly [entityKind]: string = 'SQLiteBuiltInFunction';

  declare readonly _: {
		readonly type: T;
		readonly dialect: 'sqlite';
	};
}
