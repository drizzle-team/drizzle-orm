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

	declare readonly createDb?: Required<PgRoleConfig>['createDb'];
	declare readonly createRole?: Required<PgRoleConfig>['createRole'];
	declare readonly inherit?: Required<PgRoleConfig>['inherit'];

	constructor(
		readonly name: string,
		config?: PgRoleConfig,
	) {
		if (config) {
			const { createDb, createRole, inherit } = config;
			if (createDb !== undefined) {
				this.createDb = createDb;
			}
			if (createRole !== undefined) {
				this.createRole = createRole;
			}
			if (inherit !== undefined) {
				this.inherit = inherit;
			}
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
