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
test('junction table produces a through relation and direct relations', () => {
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

	expect(tableRelations['users']).toStrictEqual([
		{
			name: 'groups',
			type: 'through',
			tableFrom: 'users',
			columnsFrom: ['id'],
			tableTo: 'groups',
			columnsTo: ['id'],
			tableThrough: 'usersToGroups',
			columnsThroughFrom: ['userId'],
			columnsThroughTo: ['groupId'],
		},
		{
			name: 'usersToGroups',
			type: 'many',
			tableFrom: 'users',
			columnsFrom: ['id'],
			tableTo: 'usersToGroups',
			columnsTo: ['userId'],
		},
	]);

	expect(tableRelations['groups']).toStrictEqual([
		{
			name: 'users',
			type: 'many-through',
			tableFrom: 'groups',
			columnsFrom: ['id'],
			tableTo: 'users',
			columnsTo: ['id'],
			tableThrough: 'usersToGroups',
			columnsThroughFrom: ['userId'],
			columnsThroughTo: ['groupId'],
		},
		{
			name: 'usersToGroups',
			type: 'many',
			tableFrom: 'groups',
			columnsFrom: ['id'],
			tableTo: 'usersToGroups',
			columnsTo: ['groupId'],
		},
	]);

	// the junction table itself gets direct relations to both sides
	expect(tableRelations['usersToGroups']).toStrictEqual([
		{
			name: 'user',
			type: 'one',
			tableFrom: 'usersToGroups',
			columnsFrom: ['userId'],
			tableTo: 'users',
			columnsTo: ['id'],
		},
		{
			name: 'group',
			type: 'one',
			tableFrom: 'usersToGroups',
			columnsFrom: ['groupId'],
			tableTo: 'groups',
			columnsTo: ['id'],
		},
	]);
});

// A domain entity that happens to have two FKs plus its own business columns
// Generate junction and direct relations — see https://github.com/drizzle-team/drizzle-orm/issues/6253
test('domain table with two FKs and extra columns produces junction and direct relations', () => {
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

	// many-to-many through the domain table and plain `many` reverse collections on the referenced tables
	expect(tableRelations['account']).toStrictEqual([
		{
			name: 'categories',
			type: 'through',
			tableFrom: 'account',
			columnsFrom: ['id'],
			tableTo: 'category',
			columnsTo: ['id'],
			tableThrough: 'transactionRecord',
			columnsThroughFrom: ['accountId'],
			columnsThroughTo: ['categoryId'],
		},
		{
			name: 'transactionRecords',
			type: 'many',
			tableFrom: 'account',
			columnsFrom: ['id'],
			tableTo: 'transactionRecord',
			columnsTo: ['accountId'],
		},
	]);
	expect(tableRelations['category']).toStrictEqual([
		{
			name: 'accounts',
			type: 'many-through',
			tableFrom: 'category',
			columnsFrom: ['id'],
			tableTo: 'account',
			columnsTo: ['id'],
			tableThrough: 'transactionRecord',
			columnsThroughFrom: ['accountId'],
			columnsThroughTo: ['categoryId'],
		},
		{
			name: 'transactionRecords',
			type: 'many',
			tableFrom: 'category',
			columnsFrom: ['id'],
			tableTo: 'transactionRecord',
			columnsTo: ['categoryId'],
		},
	]);
});
