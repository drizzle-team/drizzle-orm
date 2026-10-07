import { entityKind } from '~/entity.ts';

export interface CockroachRoleConfig {
	createDb?: boolean;
	createRole?: boolean;
}

export class CockroachRole implements CockroachRoleConfig {
	static readonly [entityKind]: string = 'CockroachRole';

	/** @internal */
	_existing?: boolean;

	declare readonly createDb?: Required<CockroachRoleConfig>['createDb'];
	declare readonly createRole?: Required<CockroachRoleConfig>['createRole'];

	constructor(
		readonly name: string,
		config?: CockroachRoleConfig,
	) {
		if (config) {
			const { createDb, createRole } = config;
			if (createDb !== undefined) {
				this.createDb = createDb;
			}
			if (createRole !== undefined) {
				this.createRole = createRole;
			}
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
