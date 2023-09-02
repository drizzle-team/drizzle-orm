import { entityKind } from '~/entity.ts';
import type { SQL, SQLWrapper } from '~/index.ts';
import { QueryPromise } from '~/query-promise.ts';

type SQLiteRawAction = 'all' | 'get' | 'values' | 'run';
export interface SQLiteRawConfig {
	action: SQLiteRawAction;
}

export class SQLiteRaw<TRunResult> extends QueryPromise<TRunResult> implements SQLWrapper {
	static readonly [entityKind]: string = 'SQLiteRaw';

	/** @internal */
	config: SQLiteRawConfig;

	constructor(
		private cb: () => Promise<TRunResult>,
		private getSQLCb: () => SQL,
		action: SQLiteRawAction,
	) {
		super();
		this.config = { action };
	}

	/** @internal */
	getSQL(): SQL {
		return this.getSQLCb();
	}

	override async execute(): Promise<TRunResult> {
		return this.cb();
	}
}
