import { entityKind, is } from '~/entity.ts';

export interface PgRoleConfig {
	canLogin?: boolean;
	createDb?: boolean;
	createRole?: boolean;
	inherit?: boolean;
}

export class PgRole implements PgRoleConfig {
	static readonly [entityKind]: string = 'PgRole';
	static [Symbol.hasInstance](value: unknown): boolean {
		return is(value, this);
	}

	/** @internal */
	_existing?: boolean;

	readonly canLogin: PgRoleConfig['canLogin'];
	readonly createDb: PgRoleConfig['createDb'];
	readonly createRole: PgRoleConfig['createRole'];
	readonly inherit: PgRoleConfig['inherit'];

	constructor(
		readonly name: string,
		config?: PgRoleConfig,
	) {
		if (config) {
			this.canLogin = config.canLogin;
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
