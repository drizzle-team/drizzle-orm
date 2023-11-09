import { entityKind } from '~/entity.ts';

// Since the create role clause only allow one of these, I guess drizzle-kit will have to generate
// alter role clauses if the user defines more than one of these
export type PgRoleConfig = {
	superuser?: boolean;
	createDb?: boolean;
	createRole?: boolean;
	inherit?: boolean;
	login?: boolean;
	replication?: boolean;
	bypassRLS?: boolean;
	connectionLimit?: number;
	password?: string;
	validUntil?: Date;
	inRole?: string;
	role?: string[]; // Should this be a PgRole[]?
	admin?: string[]; // Should this be a PgRole[]?
};

export type AnyPgRole = PgRole<string, PgRoleConfig>;

export const RoleName = Symbol.for('drizzle:RoleName');

// Do we need to implement SQLWrapper here? I'm not entirely sure if drizzle-kit will need it
export class PgRole<TName extends string, TConfig extends PgRoleConfig> {
	static readonly [entityKind]: string = 'PgRole';

	declare readonly _: {
		readonly brand: 'PgRole';
		readonly name: TName;
		readonly config: TConfig;
	};

	[RoleName]: TName;
	config: TConfig;

	constructor(name: TName, config: TConfig) {
		this[RoleName] = name;
		this.config = config;
	}
}

export function pgRole<TName extends string, TConfig extends PgRoleConfig>(
	name: TName,
	config?: TConfig,
): PgRole<TName, TConfig> {
	return new PgRole(name, config ?? {} as TConfig);
}
