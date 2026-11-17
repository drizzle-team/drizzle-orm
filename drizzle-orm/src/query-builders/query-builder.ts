import { entityKind, is } from '~/entity.ts';
import type { SQL, SQLWrapper } from '~/sql/index.ts';

export abstract class TypedQueryBuilder<TSelection, TResult = unknown, TConfig = unknown> implements SQLWrapper {
	static readonly [entityKind]: string = 'TypedQueryBuilder';
	static [Symbol.hasInstance](value: unknown): boolean {
		return is(value, this);
	}

	declare _: {
		selectedFields: TSelection;
		result: TResult;
		config?: TConfig;
	};

	/** @internal */
	getSelectedFields(): TSelection {
		return this._.selectedFields;
	}

	abstract getSQL(): SQL;
}
