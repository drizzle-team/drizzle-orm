import type { Dialect } from './column-builder.ts';
import type { PreparedQuery } from './session.ts';

export interface RunnableQuery<T, TDialect extends Dialect> {
	readonly _: {
		readonly dialect: TDialect;
		readonly result: T;
	};

	/** @internal */
	_prepare(): PreparedQuery;
}
