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

	declare readonly as?: Required<CockroachPolicyConfig>['as'];
	declare readonly for?: Required<CockroachPolicyConfig>['for'];
	declare readonly to?: Required<CockroachPolicyConfig>['to'];
	declare readonly using?: Required<CockroachPolicyConfig>['using'];
	declare readonly withCheck?: Required<CockroachPolicyConfig>['withCheck'];

	/** @internal */
	_linkedTable?: CockroachTable;

	constructor(
		readonly name: string,
		config?: CockroachPolicyConfig,
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

	link(table: CockroachTable): this {
		this._linkedTable = table;
		return this;
	}
}

export function cockroachPolicy(name: string, config?: CockroachPolicyConfig) {
	return new CockroachPolicy(name, config);
}
