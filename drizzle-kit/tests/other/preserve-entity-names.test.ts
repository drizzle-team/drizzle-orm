import { createDDL } from 'src/dialects/postgres/ddl';
import { preserveEntityNames } from 'src/dialects/utils';
import { expect, test } from 'vitest';

const fk = (table: string, name: string, nameExplicit = false, columns = ['a']) => ({
	schema: 'public',
	table,
	name,
	nameExplicit,
	columns,
	schemaTo: 'public',
	tableTo: 'parent',
	columnsTo: ['id'],
	onUpdate: null,
	onDelete: null,
});

test('preserveEntityNames: implicit name from the left side is carried over to the matching right side entity', () => {
	const left = createDDL();
	const right = createDDL();
	left.fks.push(fk('child', 'child_a_parent_id_fk'));
	right.fks.push(fk('child', 'child_hashed_fkey'));

	preserveEntityNames(left.fks, right.fks, 'default');

	expect(right.fks.list().map((it) => it.name)).toStrictEqual(['child_a_parent_id_fk']);
});

test('preserveEntityNames: identical entities on different tables each keep their own table', () => {
	const left = createDDL();
	const right = createDDL();
	left.fks.push(fk('orders', 'orders_a_parent_id_fk'));
	left.fks.push(fk('invoices', 'invoices_a_parent_id_fk'));
	right.fks.push(fk('orders', 'orders_hashed_fkey'));
	right.fks.push(fk('invoices', 'invoices_hashed_fkey'));

	preserveEntityNames(left.fks, right.fks, 'default');

	expect(right.fks.one({ table: 'orders' })!.name).toBe('orders_a_parent_id_fk');
	expect(right.fks.one({ table: 'invoices' })!.name).toBe('invoices_a_parent_id_fk');
});

test('preserveEntityNames: explicitly named entities on the right side are left alone', () => {
	const left = createDDL();
	const right = createDDL();
	left.fks.push(fk('child', 'child_a_parent_id_fk'));
	right.fks.push(fk('child', 'my_custom_fk', true));

	preserveEntityNames(left.fks, right.fks, 'default');

	expect(right.fks.list().map((it) => it.name)).toStrictEqual(['my_custom_fk']);
});

test('preserveEntityNames: ambiguous match (two identical right side candidates) is not renamed', () => {
	const left = createDDL();
	const right = createDDL();
	left.fks.push(fk('child', 'child_a_parent_id_fk'));
	right.fks.push(fk('child', 'child_hashed_1'));
	right.fks.push(fk('child', 'child_hashed_2'));

	preserveEntityNames(left.fks, right.fks, 'default');

	expect(right.fks.list().map((it) => it.name).sort()).toStrictEqual(['child_hashed_1', 'child_hashed_2']);
});

test('preserveEntityNames: differing columns on the same table do not match', () => {
	const left = createDDL();
	const right = createDDL();
	left.fks.push(fk('child', 'child_a_parent_id_fk', false, ['a']));
	right.fks.push(fk('child', 'child_hashed_fkey', false, ['b']));

	preserveEntityNames(left.fks, right.fks, 'default');

	expect(right.fks.list().map((it) => it.name)).toStrictEqual(['child_hashed_fkey']);
});
