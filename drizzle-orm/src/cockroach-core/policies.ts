import { entityKind } from '~/entity.ts';
import type { SQL } from '~/sql/sql.ts';
import type { CockroachRole } from './roles.ts';
import type { CockroachTable } from './table.ts';

export type CockroachPolicyToOption =
	| 'public'
	| 'current_user'
	| 'session_user'
	| (string & {})
	| CockroachPolicyToOption[]
	| CockroachRole;

export interface CockroachPolicyConfig {
	as?: 'permissive' | 'restrictive';
	for?: 'all' | 'select' | 'insert' | 'update' | 'delete';
	to?: CockroachPolicyToOption;
	using?: SQL;
	withCheck?: SQL;
}

export class CockroachPolicy implements CockroachPolicyConfig {
	static readonly [entityKind]: string = 'CockroachPolicy';

	readonly as: CockroachPolicyConfig['as'];
	readonly for: CockroachPolicyConfig['for'];
	readonly to: CockroachPolicyConfig['to'];
	readonly using: CockroachPolicyConfig['using'];
	readonly withCheck: CockroachPolicyConfig['withCheck'];

	/** @internal */
	_linkedTable?: CockroachTable;

	constructor(
		readonly name: string,
		config?: CockroachPolicyConfig,
	) {
		if (config) {
			this.as = config.as;
			this.for = config.for;
			this.to = config.to;
			this.using = config.using;
			this.withCheck = config.withCheck;
		}
	}

	link(table: CockroachTable): this {
		this._linkedTable = table;
		return this;
	}
}

export function cockroachPolicy(name: string, config?: CockroachPolicyConfig) {
	return new CockroachPolicy(name, config);
}
