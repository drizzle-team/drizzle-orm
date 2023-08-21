import { entityKind } from '~/entity';
import { QueryPromise } from '~/query-promise';
import { type SQLWrapper, type SQL } from '~/sql';

export class SQLiteRaw<TRunResult> extends QueryPromise<TRunResult> implements SQLWrapper {
	static readonly [entityKind]: string = 'SQLiteRaw';

	constructor(
		private cb: () => Promise<TRunResult>,
		private getSQLCb: () => SQL,
	) {
		super();
	}

    /** @internal */
	getSQL(): SQL {
		return this.getSQLCb();
	}

	override async execute(): Promise<TRunResult> {
		return this.cb();
	}
}
