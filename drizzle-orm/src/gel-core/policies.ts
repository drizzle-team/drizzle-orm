import { entityKind } from '~/entity.ts';
import type { SQL } from '~/sql/sql.ts';
import type { GelRole } from './roles.ts';
import type { GelTable } from './table.ts';

export type GelPolicyToOption =
	| 'public'
	| 'current_role'
	| 'current_user'
	| 'session_user'
	| (string & {})
	| GelPolicyToOption[]
	| GelRole;

export interface GelPolicyConfig {
	as?: 'permissive' | 'restrictive';
	for?: 'all' | 'select' | 'insert' | 'update' | 'delete';
	to?: GelPolicyToOption;
	using?: SQL;
	withCheck?: SQL;
}

export class GelPolicy implements GelPolicyConfig {
	static readonly [entityKind]: string = 'GelPolicy';

	readonly as: GelPolicyConfig['as'];
	readonly for: GelPolicyConfig['for'];
	readonly to: GelPolicyConfig['to'];
	readonly using: GelPolicyConfig['using'];
	readonly withCheck: GelPolicyConfig['withCheck'];

	/** @internal */
	_linkedTable?: GelTable;

	constructor(
		readonly name: string,
		config?: GelPolicyConfig,
	) {
		if (config) {
			this.as = config.as;
			this.for = config.for;
			this.to = config.to;
			this.using = config.using;
			this.withCheck = config.withCheck;
		}
	}

	link(table: GelTable): this {
		this._linkedTable = table;
		return this;
	}
}

export function gelPolicy(name: string, config?: GelPolicyConfig) {
	return new GelPolicy(name, config);
}
