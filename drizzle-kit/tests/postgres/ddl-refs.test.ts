import { sql } from 'drizzle-orm';
import {
	check,
	foreignKey,
	index,
	integer,
	pgEnum,
	pgPolicy,
	pgRole,
	pgTable,
	unique,
	varchar,
} from 'drizzle-orm/pg-core';
import { expect, test } from 'vitest';
import { drizzleToDDL } from './mocks';

const admin = pgRole('admin');
const mood = pgEnum('mood', ['ok', 'sad']);

const schema = {
	admin,
	mood,
	users: pgTable('users', {
		id: integer('id').primaryKey(),
		email: varchar('email'),
		state: mood('state'),
	}, (t) => [
		index('users_email_ix').on(t.email),
		index('users_state_idx').on(t.state),
		index('users_state_idx2').on(t.email, t.state),
		unique('users_email_uq').on(t.email),
		check('users_id_ck', sql`${t.id} > 0`),
		pgPolicy('users_pol', { for: 'select', to: admin }),
	]),
	orders: pgTable('orders', { id: integer('id'), userId: integer('user_id') }, (t) => [
		foreignKey({ columns: [t.userId], foreignColumns: [usersRef.id], name: 'orders_user_fk' }),
	]),
};

const usersRef = pgTable('users', { id: integer('id').primaryKey() });

const rows = () => drizzleToDDL(schema);

test('test #1', () => {
	const { ddl } = rows();

	ddl.enums.update({ where: { name: 'mood' }, set: { name: 'mood2' } });
	expect(ddl.columns.list({ name: 'state' })[0].type).toBe('mood2');

	ddl.columns.update({ where: { schema: 'public', table: 'users', name: 'state' }, set: { name: 'state2' } });

	expect(ddl.indexes.one({ name: 'users_state_idx' })?.columns[0].value).toBe('state2');
	expect(ddl.indexes.one({ name: 'users_state_idx2' })?.columns[0].value).toBe('email');
	expect(ddl.indexes.one({ name: 'users_state_idx2' })?.columns[1].value).toBe('state2');
});
