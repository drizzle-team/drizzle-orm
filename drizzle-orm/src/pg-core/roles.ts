import { entityKind } from '~/entity.ts';

export interface PgRoleConfig {
	createDb?: boolean;
	createRole?: boolean;
	inherit?: boolean;
}

export class PgRole implements PgRoleConfig {
	static readonly [entityKind]: string = 'PgRole';

	/** @internal */
	_existing?: boolean;

	/** @internal */
	readonly createDb: PgRoleConfig['createDb'];
	/** @internal */
	readonly createRole: PgRoleConfig['createRole'];
	/** @internal */
	readonly inherit: PgRoleConfig['inherit'];

	constructor(
		readonly name: string,
		config?: PgRoleConfig,
	) {
		if (config) {
			this.createDb = config.createDb;
			this.createRole = config.createRole;
			this.inherit = config.inherit;
		}
	}

	existing(): this {
		this._existing = true;
		return this;
	}
}

export function pgRole(name: string, config?: PgRoleConfig) {
	return new PgRole(name, config);
}
