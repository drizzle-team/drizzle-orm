import { expect, test } from 'vitest';
import { relationsToTypeScript } from '../../src/cli/commands/pull-common';
import type { SchemaForPull } from '../../src/cli/commands/pull-common';

type ForeignKey = SchemaForPull[number]['foreignKeys'][number];

const fk = (
	table: string,
	columns: string[],
	tableTo: string,
	columnsTo: string[],
	name: string,
): ForeignKey => ({
	schema: 'public',
	table,
	nameExplicit: true,
	columns,
	schemaTo: 'public',
	tableTo,
	columnsTo,
	name,
	entityType: 'fks',
});

const table = (
	foreignKeys: ForeignKey[],
	columns: string[],
	uniques: { columns: string[] }[] = [],
): SchemaForPull[number] => ({
	schema: 'public',
	foreignKeys,
	columns: columns.map((name) => ({ name })),
	uniques,
});

// A pure link table: exactly two FKs and no columns beyond the FK columns.
test('junction table produces a through relation', () => {
	const schema: SchemaForPull = [
		table([], ['id'], [{ columns: ['id'] }]), // users
		table([], ['id'], [{ columns: ['id'] }]), // groups
		table(
			[
				fk('users_to_groups', ['user_id'], 'users', ['id'], 'utg_user_fk'),
				fk('users_to_groups', ['group_id'], 'groups', ['id'], 'utg_group_fk'),
			],
			['user_id', 'group_id'],
			[{ columns: ['user_id', 'group_id'] }],
		),
	];

	const { tableRelations } = relationsToTypeScript(schema, 'camel');

	expect(tableRelations['users']).toStrictEqual([{
		name: 'groups',
		type: 'through',
		tableFrom: 'users',
		columnsFrom: ['id'],
		tableTo: 'groups',
		columnsTo: ['id'],
		tableThrough: 'usersToGroups',
		columnsThroughFrom: ['userId'],
		columnsThroughTo: ['groupId'],
	}]);

	expect(tableRelations['groups']).toStrictEqual([{
		name: 'users',
		type: 'many-through',
		tableFrom: 'groups',
		columnsFrom: ['id'],
		tableTo: 'users',
		columnsTo: ['id'],
		tableThrough: 'usersToGroups',
		columnsThroughFrom: ['userId'],
		columnsThroughTo: ['groupId'],
	}]);

	// the junction table itself gets no relations
	expect(tableRelations['usersToGroups']).toBeUndefined();
});

// A domain entity that happens to have two FKs plus its own business columns
// It must NOT be collapsed into a junction — see https://github.com/drizzle-team/drizzle-orm/issues/6253
test('domain table with two FKs and extra columns produces direct relations', () => {
	const schema: SchemaForPull = [
		table([], ['id'], [{ columns: ['id'] }]), // account
		table([], ['id'], [{ columns: ['id'] }]), // category
		table(
			[
				fk('transaction_record', ['account_id'], 'account', ['id'], 'tr_account_fk'),
				fk('transaction_record', ['category_id'], 'category', ['id'], 'tr_category_fk'),
			],
			['id', 'account_id', 'category_id', 'amount', 'status'],
			[{ columns: ['id'] }],
		),
	];

	const { tableRelations } = relationsToTypeScript(schema, 'camel');

	// direct `one` relations from the domain table to both referenced tables
	expect(tableRelations['transactionRecord']).toStrictEqual([
		{
			name: 'account',
			type: 'one',
			tableFrom: 'transactionRecord',
			columnsFrom: ['accountId'],
			tableTo: 'account',
			columnsTo: ['id'],
		},
		{
			name: 'category',
			type: 'one',
			tableFrom: 'transactionRecord',
			columnsFrom: ['categoryId'],
			tableTo: 'category',
			columnsTo: ['id'],
		},
	]);

	// plain `many` reverse collections on the referenced tables
	expect(tableRelations['account']).toStrictEqual([{
		name: 'transactionRecords',
		type: 'many',
		tableFrom: 'account',
		columnsFrom: ['id'],
		tableTo: 'transactionRecord',
		columnsTo: ['accountId'],
	}]);
	expect(tableRelations['category']).toStrictEqual([{
		name: 'transactionRecords',
		type: 'many',
		tableFrom: 'category',
		columnsFrom: ['id'],
		tableTo: 'transactionRecord',
		columnsTo: ['categoryId'],
	}]);

	// no many-to-many was inferred
	const allTypes = Object.values(tableRelations).flat().map((r) => r.type);
	expect(allTypes).not.toContain('through');
	expect(allTypes).not.toContain('many-through');
});

// A table whose two FKs point at two different tables, one of which is the table
// itself, is NOT a junction — treating it as one swallowed both `one` relations.
// See https://github.com/drizzle-team/drizzle-orm/issues/6197
test('self-referencing FK next to another FK produces direct relations', () => {
	const schema: SchemaForPull = [
		table([], ['id'], [{ columns: ['id'] }]), // organizations
		table(
			[
				fk('users', ['organization_id'], 'organizations', ['id'], 'users_organization_fk'),
				fk('users', ['referrer_id'], 'users', ['id'], 'users_referrer_fk'),
			],
			['organization_id', 'referrer_id'],
		),
	];

	const { file, tableRelations } = relationsToTypeScript(schema, 'camel');

	// both FKs get their own `one` relation, including the self reference
	expect(tableRelations['users']).toStrictEqual([
		{
			name: 'organization',
			type: 'one',
			tableFrom: 'users',
			columnsFrom: ['organizationId'],
			tableTo: 'organizations',
			columnsTo: ['id'],
		},
		{
			name: 'user',
			type: 'one',
			tableFrom: 'users',
			columnsFrom: ['referrerId'],
			tableTo: 'users',
			columnsTo: ['id'],
		},
		{
			name: 'users',
			type: 'many',
			tableFrom: 'users',
			columnsFrom: ['id'],
			tableTo: 'users',
			columnsTo: ['referrerId'],
		},
	]);

	// the reverse of the non-self FK
	expect(tableRelations['organizations']).toStrictEqual([{
		name: 'users',
		type: 'many',
		tableFrom: 'organizations',
		columnsFrom: ['id'],
		tableTo: 'users',
		columnsTo: ['organizationId'],
	}]);

	// no many-to-many was inferred — `users` is not a junction between itself and organizations
	const allTypes = Object.values(tableRelations).flat().map((r) => r.type);
	expect(allTypes).not.toContain('through');
	expect(allTypes).not.toContain('many-through');

	// the `one`/`many` pair of the self reference shares an alias, so both sides line up
	expect(file).toContain(`user: r.one.users({
			from: r.users.referrerId,
			to: r.users.id,
			alias: "users_referrerId_users_id"
		}),`);
	expect(file).toContain(`users: r.many.users({
			alias: "users_referrerId_users_id"
		}),`);
});
