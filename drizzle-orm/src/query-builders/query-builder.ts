import { entityKind } from '~/entity';
import type { SQL, SQLWrapper } from '~/sql';

export abstract class TypedQueryBuilder<TSelection, TResult = unknown> implements SQLWrapper {
	static readonly [entityKind]: string = 'TypedQueryBuilder';

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
