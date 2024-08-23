import { entityKind } from '~/entity.ts';
import type { SQL } from '~/sql/sql.ts';

export interface PgPolicyConfig {
	as?: 'permissive' | 'restrictive';
	for?: 'all' | 'select' | 'insert' | 'update' | 'delete';
	to?: 'PUBLIC' | 'CURRENT_ROLE' | 'CURRENT_USER' | 'SESSION_USER' | (string & {});
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
}

export function pgPolicy(name: string, config?: PgPolicyConfig) {
	return new PgPolicy(name, config);
}
