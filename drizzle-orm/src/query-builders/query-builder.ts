import type { SQL, SQLWrapper } from '~/sql';

export abstract class QueryBuilder<TSelection> implements SQLWrapper {
	declare _: {
		selectedFields: TSelection;
	};

	/** @internal */
	getSelectedFields(): TSelection {
		return this._.selectedFields;
	}

	abstract getSQL(): SQL;
}
