import { entityKind } from '~/entity.ts';

export interface GelRoleConfig {
	createDb?: boolean;
	createRole?: boolean;
	inherit?: boolean;
}

export class GelRole implements GelRoleConfig {
	static readonly [entityKind]: string = 'GelRole';

	/** @internal */
	_existing?: boolean;

	/** @internal */
	readonly createDb: GelRoleConfig['createDb'];
	/** @internal */
	readonly createRole: GelRoleConfig['createRole'];
	/** @internal */
	readonly inherit: GelRoleConfig['inherit'];

	constructor(
		readonly name: string,
		config?: GelRoleConfig,
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

export function gelRole(name: string, config?: GelRoleConfig) {
	return new GelRole(name, config);
}
