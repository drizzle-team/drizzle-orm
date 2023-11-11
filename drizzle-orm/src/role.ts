import { entityKind } from '~/entity.ts';
import { SQL, type SQLWrapper } from '~/sql/sql.ts';

export type AnyRole = Role<string>;

export const RoleName = Symbol.for('drizzle:RoleName');

export class Role<TName extends string> implements SQLWrapper {
	static readonly [entityKind]: string = 'Role';

	declare readonly _: {
		readonly name: TName;
	};

	[RoleName]: TName;

	constructor(readonly name: TName) {
		this[RoleName] = name;
	}

	getSQL(): SQL {
		return new SQL([this]);
	}
}
