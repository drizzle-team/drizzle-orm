import { entityKind } from '~/entity.ts';

export interface PgRoleConfig {
	superuser?: boolean;
	createDb?: boolean;
	createRole?: boolean;
	inherit?: boolean;
	canLogin?: boolean;
	replication?: boolean;
	bypassRls?: boolean;
	connLimit?: number;
	password?: string;
	validUntil?: Date | string;
}

export class PgRole implements PgRoleConfig {
	static readonly [entityKind]: string = 'PgRole';

	/** @internal */
	_existing?: boolean;

	/** @internal */
	readonly superuser: PgRoleConfig['superuser'];
	/** @internal */
	readonly createDb: PgRoleConfig['createDb'];
	/** @internal */
	readonly createRole: PgRoleConfig['createRole'];
	/** @internal */
	readonly inherit: PgRoleConfig['inherit'];
	/** @internal */
	readonly canLogin: PgRoleConfig['canLogin'];
	/** @internal */
	readonly replication: PgRoleConfig['replication'];
	/** @internal */
	readonly bypassRls: PgRoleConfig['bypassRls'];
	/** @internal */
	readonly connLimit: PgRoleConfig['connLimit'];
	/** @internal */
	readonly password: PgRoleConfig['password'];
	/** @internal */
	readonly validUntil: PgRoleConfig['validUntil'];

	constructor(
		readonly name: string,
		config?: PgRoleConfig,
	) {
		if (config) {
			this.superuser = config.superuser;
			this.createDb = config.createDb;
			this.createRole = config.createRole;
			this.inherit = config.inherit;
			this.canLogin = config.canLogin;
			this.replication = config.replication;
			this.bypassRls = config.bypassRls;
			this.connLimit = config.connLimit;
			this.password = config.password;
			this.validUntil = config.validUntil;
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
