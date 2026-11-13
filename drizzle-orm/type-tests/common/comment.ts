import { mysqlTable, serial, text } from '~/mysql-core/index.ts';
import { pgTable, serial as pgSerial, text as pgText } from '~/pg-core/index.ts';
import { integer, sqliteTable, text as sqliteText } from '~/sqlite-core/index.ts';

{
	const mysqlT = mysqlTable('users', {
		id: serial('id').comment('pk'),
		email: text('email').notNull().comment('email').default('a@b.com'),
	});
	type Select = typeof mysqlT.$inferSelect;
	type Insert = typeof mysqlT.$inferInsert;

	// Ensure comment does not affect select inference
	const _select: Select = { id: 1, email: 'test' };
	// Ensure comment does not affect insert inference (id is optional because serial has default)
	const _insert: Insert = { email: 'test' };
	// Verify id can still be provided
	const _insertWithId: Insert = { id: 1, email: 'test' };
}

{
	const pgT = pgTable('users', {
		id: pgSerial('id').comment('pk'),
		email: pgText('email').notNull().comment('email').default('a@b.com'),
	});
	type Select = typeof pgT.$inferSelect;
	type Insert = typeof pgT.$inferInsert;

	const _select: Select = { id: 1, email: 'test' };
	const _insert: Insert = { email: 'test' };
	const _insertWithId: Insert = { id: 1, email: 'test' };
}

{
	const sqliteT = sqliteTable('users', {
		id: integer('id').primaryKey().comment('pk'),
		email: sqliteText('email').notNull().comment('email').default('a@b.com'),
	});
	type Select = typeof sqliteT.$inferSelect;
	type Insert = typeof sqliteT.$inferInsert;

	const _select: Select = { id: 1, email: 'test' };
	const _insert: Insert = { email: 'test' };
	const _insertWithId: Insert = { id: 1, email: 'test' };
}
