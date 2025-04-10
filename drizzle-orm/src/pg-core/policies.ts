import { entityKind } from '~/entity.ts';
import type { SQL } from '~/sql/sql.ts';
import type { PgRole } from './roles.ts';
import type { PgTable } from './table.ts';

export type PgPolicyToOption =
	| 'public'
	| 'current_role'
	| 'current_user'
	| 'session_user'
	| (string & {})
	| PgPolicyToOption[]
	| PgRole;

export interface PgPolicyConfig {
	as?: 'permissive' | 'restrictive';
	for?: 'all' | 'select' | 'insert' | 'update' | 'delete';
	to?: PgPolicyToOption;
	using?: SQL;
	withCheck?: SQL;
}

export class PgPolicy implements PgPolicyConfig {
	static readonly [entityKind]: string = 'PgPolicy';

	readonly as: PgPolicyConfig['as'];
	readonly for: PgPolicyConfig['for'];
	readonly to: PgPolicyConfig['to'];
	readonly using: PgPolicyConfig['using'];
	readonly withCheck: PgPolicyConfig['withCheck'];

	/** @internal */
	_linkedTable?: PgTable;

	constructor(
		readonly name: string,
		config?: PgPolicyConfig,
	) {
		if (config) {
			this.as = config.as;
			this.for = config.for;
			this.to = config.to;
			this.using = config.using;
			this.withCheck = config.withCheck;
		}
	}

	link(table: PgTable): this {
		this._linkedTable = table;
		return this;
	}
}

export function pgPolicy(name: string, config?: PgPolicyConfig) {
	return new PgPolicy(name, config);
}
