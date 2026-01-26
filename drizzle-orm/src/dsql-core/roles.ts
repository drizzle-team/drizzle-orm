import { entityKind } from '~/entity.ts';

export interface DsqlRoleConfig {
	createRole?: boolean;
	inherit?: boolean;
}

export class DsqlRole implements DsqlRoleConfig {
	static readonly [entityKind]: string = 'DsqlRole';

	/** @internal */
	_existing?: boolean;

	/** @internal */
	readonly createRole: DsqlRoleConfig['createRole'];
	/** @internal */
	readonly inherit: DsqlRoleConfig['inherit'];

	constructor(
		readonly name: string,
		config?: DsqlRoleConfig,
	) {
		if (config) {
			this.createRole = config.createRole;
			this.inherit = config.inherit;
		}
	}

	existing(): this {
		this._existing = true;
		return this;
	}
}

export function dsqlRole(name: string, config?: DsqlRoleConfig): DsqlRole {
	return new DsqlRole(name, config);
}
