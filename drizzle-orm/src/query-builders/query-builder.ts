import type { SQL, SQLWrapper } from '~/sql';

export abstract class QueryBuilder<TSelection, TResult = unknown> implements SQLWrapper {
	declare _: {
		selectedFields: TSelection;
		result: TResult;
	};

	/** @internal */
	getSelectedFields(): TSelection {
		return this._.selectedFields;
	}

	abstract getSQL(): SQL;
}
