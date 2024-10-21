import { is } from '~/entity.ts';
import { pgPolicy, PgRole, pgRole } from '~/pg-core/index.ts';
import type { AnyPgColumn, PgPolicyToOption } from '~/pg-core/index.ts';
import { type SQL, sql } from '~/sql/sql.ts';

export const crudPolicy = (options: {
	role: PgPolicyToOption;
	read?: SQL | boolean;
	modify?: SQL | boolean;
}) => {
	const read: SQL = options.read === true
		? sql`true`
		: options.read === false || options.read === undefined
		? sql`false`
		: options.read;

	const modify: SQL = options.modify === true
		? sql`true`
		: options.modify === false || options.modify === undefined
		? sql`false`
		: options.modify;

	let rolesName = '';
	if (Array.isArray(options.role)) {
		rolesName = options.role
			.map((it) => {
				return is(it, PgRole) ? it.name : (it as string);
			})
			.join('-');
	} else {
		rolesName = is(options.role, PgRole)
			? options.role.name
			: (options.role as string);
	}

	return [
		pgPolicy(`crud-${rolesName}-policy-insert`, {
			for: 'insert',
			to: options.role,
			withCheck: modify,
		}),
		pgPolicy(`crud-${rolesName}-policy-update`, {
			for: 'update',
			to: options.role,
			using: modify,
			withCheck: modify,
		}),
		pgPolicy(`crud-${rolesName}-policy-delete`, {
			for: 'delete',
			to: options.role,
			using: modify,
		}),
		pgPolicy(`crud-${rolesName}-policy-select`, {
			for: 'select',
			to: options.role,
			using: read,
		}),
	];
};

// These are default roles that Neon will set up.
export const authenticatedRole = pgRole('authenticated').existing();
export const anonymousRole = pgRole('anonymous').existing();

export const authUid = (userIdColumn: AnyPgColumn) => sql`(select auth.user_id() = ${userIdColumn})`;
