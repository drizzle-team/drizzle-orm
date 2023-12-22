import { entityKind } from '~/entity.ts';
import { SQL, type SQLWrapper } from '~/sql/sql.ts';

export const PolicyName = Symbol.for('drizzle:PolicyName');

export class Policy<
	TName extends string,
> implements SQLWrapper {
	static readonly [entityKind]: string = 'Policy';

	[PolicyName]: TName;

	declare readonly _: {
		readonly name: TName;
	};

	constructor(readonly name: TName) {
		this[PolicyName] = name;
	}

	getSQL(): SQL {
		return new SQL([this]);
	}
}
