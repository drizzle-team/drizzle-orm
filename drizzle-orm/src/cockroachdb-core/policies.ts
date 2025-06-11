import { entityKind } from '~/entity.ts';
import type { SQL } from '~/sql/sql.ts';
import type { CockroachDbRole } from './roles.ts';
import type { CockroachDbTable } from './table.ts';

export type CockroachDbPolicyToOption =
	| 'public'
	| 'current_user'
	| 'session_user'
	| (string & {})
	| CockroachDbPolicyToOption[]
	| CockroachDbRole;

export interface CockroachDbPolicyConfig {
	as?: 'permissive' | 'restrictive';
	for?: 'all' | 'select' | 'insert' | 'update' | 'delete';
	to?: CockroachDbPolicyToOption;
	using?: SQL;
	withCheck?: SQL;
}

export class CockroachDbPolicy implements CockroachDbPolicyConfig {
	static readonly [entityKind]: string = 'CockroachDbPolicy';

	readonly as: CockroachDbPolicyConfig['as'];
	readonly for: CockroachDbPolicyConfig['for'];
	readonly to: CockroachDbPolicyConfig['to'];
	readonly using: CockroachDbPolicyConfig['using'];
	readonly withCheck: CockroachDbPolicyConfig['withCheck'];

	/** @internal */
	_linkedTable?: CockroachDbTable;

	constructor(
		readonly name: string,
		config?: CockroachDbPolicyConfig,
	) {
		if (config) {
			this.as = config.as;
			this.for = config.for;
			this.to = config.to;
			this.using = config.using;
			this.withCheck = config.withCheck;
		}
	}

	link(table: CockroachDbTable): this {
		this._linkedTable = table;
		return this;
	}
}

export function cockroachdbPolicy(name: string, config?: CockroachDbPolicyConfig) {
	return new CockroachDbPolicy(name, config);
}
