import { entityKind } from '~/entity.ts';

export interface CockroachRoleConfig {
	createDb?: boolean;
	createRole?: boolean;
}

export class CockroachRole implements CockroachRoleConfig {
	static readonly [entityKind]: string = 'CockroachRole';

	/** @internal */
	_existing?: boolean;

	/** @internal */
	readonly createDb: CockroachRoleConfig['createDb'];
	/** @internal */
	readonly createRole: CockroachRoleConfig['createRole'];

	constructor(
		readonly name: string,
		config?: CockroachRoleConfig,
	) {
		if (config) {
			this.createDb = config.createDb;
			this.createRole = config.createRole;
		}
	}

	existing(): this {
		this._existing = true;
		return this;
	}
}

export function cockroachRole(name: string, config?: CockroachRoleConfig) {
	return new CockroachRole(name, config);
}
