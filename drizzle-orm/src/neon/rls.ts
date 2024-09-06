import { is } from '~/entity.ts';
import { pgPolicy, PgRole, pgRole } from '~/pg-core/index.ts';
import type { AnyPgColumn, PgPolicyToOption } from '~/pg-core/index.ts';
import { type SQL, sql } from '~/sql/sql.ts';

export const crudPolicy = (
	options: {
		role: PgPolicyToOption;
		read?: SQL | boolean;
		modify?: SQL | boolean;
	},
) => {
	const read: SQL = options.read === true
		? sql`select true`
		: options.read === false || options.read === undefined
		? sql`select false`
		: options.read;

	const modify: SQL = options.modify === true
		? sql`select true`
		: options.modify === false || options.modify === undefined
		? sql`select false`
		: options.modify;

	let rolesName = '';
	if (Array.isArray(options.role)) {
		rolesName = options.role.map((it) => {
			return is(it, PgRole) ? it.name : it as string;
		}).join('-');
	} else {
		rolesName = is(options.role, PgRole) ? options.role.name : options.role as string;
	}

	// Return the modify policy, followed by the read policy.
	return {
		// Important to have "_drizzle_internal" prefix for any key here. Right after we will make
		// 3rd param in table as an array - we will move it to array and use ... operator
		[`_drizzle_internal-${rolesName}-crud-policy-modify`]: pgPolicy(`crud-policy-modify`, {
			for: 'insert',
			to: options.role,
			using: modify,
			withCheck: modify,
		}),
		[`_drizzle_internal-${rolesName}-crud-policy-read`]: pgPolicy(`crud-policy-read`, {
			for: 'select',
			to: options.role,
			using: read,
		}),
	};
};

// These are default roles that Neon will set up.
export const authenticatedRole = pgRole('authenticated').existing();
export const anonymousRole = pgRole('anonymous').existing();

export const authUid = (userIdColumn: AnyPgColumn) => sql`select auth.user_id() = ${userIdColumn}`;
