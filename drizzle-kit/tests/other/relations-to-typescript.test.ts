import { relationsToTypeScript, type SchemaForPull } from 'src/cli/commands/pull-common';
import { expect, test } from 'vitest';

const fk = (
	table: string,
	columns: string[],
	tableTo: string,
	columnsTo: string[],
): SchemaForPull[number]['foreignKeys'][number] => ({
	table,
	nameExplicit: false,
	columns,
	tableTo,
	columnsTo,
	name: `${table}_${columns.join('_')}_fk`,
	entityType: 'fks',
});

test('issue 6253: two-FK domain table is not a junction', () => {
	const schema: SchemaForPull = [
		{
			columns: [
				{ name: 'id' },
				{ name: 'account_id' },
				{ name: 'category_id' },
				{ name: 'amount' },
				{ name: 'status' },
				{ name: 'description' },
				{ name: 'created_at' },
			],
			uniques: [],
			foreignKeys: [
				fk('transaction_record', ['account_id'], 'account', ['id']),
				fk('transaction_record', ['category_id'], 'category', ['id']),
			],
		},
	];

	const { file, tableRelations } = relationsToTypeScript(schema, 'camel');

	expect(tableRelations.transactionRecord?.map((it) => it.type).sort()).toEqual(['one', 'one']);
	expect(tableRelations.account?.map((it) => it.type)).toEqual(['many']);
	expect(tableRelations.category?.map((it) => it.type)).toEqual(['many']);
	expect(file).toContain('account: r.one.account({');
	expect(file).toContain('category: r.one.category({');
	expect(file).toContain('transactionRecords: r.many.transactionRecord()');
	expect(file).not.toContain('.through(');
});

test('issue 6253: own PK plus two FKs is still not a junction', () => {
	const schema: SchemaForPull = [
		{
			columns: [
				{ name: 'id' },
				{ name: 'account_id' },
				{ name: 'category_id' },
			],
			uniques: [],
			foreignKeys: [
				fk('transaction_record', ['account_id'], 'account', ['id']),
				fk('transaction_record', ['category_id'], 'category', ['id']),
			],
		},
	];

	const { file } = relationsToTypeScript(schema, 'camel');
	expect(file).toContain('r.one.account({');
	expect(file).not.toContain('.through(');
});

test('pure two-FK join table is still a through relation', () => {
	const schema: SchemaForPull = [
		{
			columns: [
				{ name: 'user_id' },
				{ name: 'role_id' },
			],
			uniques: [],
			foreignKeys: [
				fk('user_roles', ['user_id'], 'users', ['id']),
				fk('user_roles', ['role_id'], 'roles', ['id']),
			],
		},
	];

	const { file, tableRelations } = relationsToTypeScript(schema, 'camel');

	expect(tableRelations.users?.some((it) => it.type === 'through')).toBe(true);
	expect(tableRelations.roles?.some((it) => it.type === 'many-through')).toBe(true);
	expect(tableRelations.userRoles).toBeUndefined();
	expect(file).toContain('.through(');
	expect(file).toContain('r.many.roles({');
});

test('issue 6197: self-referencing two-FK table is not a junction', () => {
	const schema: SchemaForPull = [
		{
			columns: [
				{ name: 'id' },
				{ name: 'organization_id' },
				{ name: 'referrer_id' },
			],
			uniques: [],
			foreignKeys: [
				fk('users', ['organization_id'], 'organizations', ['id']),
				fk('users', ['referrer_id'], 'users', ['id']),
			],
		},
	];

	const { file } = relationsToTypeScript(schema, 'camel');
	expect(file).toContain('organization: r.one.organizations({');
	expect(file).toContain('user: r.one.users({');
	expect(file).not.toContain('.through(');
});
