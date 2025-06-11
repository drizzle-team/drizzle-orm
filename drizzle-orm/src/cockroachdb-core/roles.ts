import { entityKind } from '~/entity.ts';

export interface CockroachDbRoleConfig {
	createDb?: boolean;
	createRole?: boolean;
}

export class CockroachDbRole implements CockroachDbRoleConfig {
	static readonly [entityKind]: string = 'CockroachDbRole';

	/** @internal */
	_existing?: boolean;

	/** @internal */
	readonly createDb: CockroachDbRoleConfig['createDb'];
	/** @internal */
	readonly createRole: CockroachDbRoleConfig['createRole'];

	constructor(
		readonly name: string,
		config?: CockroachDbRoleConfig,
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

export function cockroachdbRole(name: string, config?: CockroachDbRoleConfig) {
	return new CockroachDbRole(name, config);
}
