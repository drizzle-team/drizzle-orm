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

	declare readonly as?: Required<PgPolicyConfig>['as'];
	declare readonly for?: Required<PgPolicyConfig>['for'];
	declare readonly to?: Required<PgPolicyConfig>['to'];
	declare readonly using?: Required<PgPolicyConfig>['using'];
	declare readonly withCheck?: Required<PgPolicyConfig>['withCheck'];

	/** @internal */
	_linkedTable?: PgTable;

	constructor(
		readonly name: string,
		config?: PgPolicyConfig,
	) {
		if (config) {
			const { as, for: operation, to, using, withCheck } = config;
			if (as !== undefined) {
				this.as = as;
			}
			if (operation !== undefined) {
				this.for = operation;
			}
			if (to !== undefined) {
				this.to = to;
			}
			if (using !== undefined) {
				this.using = using;
			}
			if (withCheck !== undefined) {
				this.withCheck = withCheck;
			}
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
