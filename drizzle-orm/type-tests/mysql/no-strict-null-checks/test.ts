import { mysqlTable, text } from '~/mysql-core';
import { drizzle } from '~/mysql2';

export const test = mysqlTable(
	'test',
	{
		id: text('id')
			.primaryKey()
			.generatedAlwaysAs('genstr'),
		name: text('name').$defaultFn(() => '' as string),
		title: text('title').notNull(),
		description: text('description'),
		dbdef: text('dbdef').default('dbdefval'),
	},
);

const db = drizzle.mock();

db.update(test)
	.set({
		// @ts-expect-error
		id: '1',
		name: 'name',
		title: 'title',
		description: 'desc',
		dbdef: 'upddef',
	});

db.update(test)
	.set({
		name: 'name',
		title: 'title',
		description: 'desc',
		dbdef: 'upddef',
	});

db.insert(test).values({
	// @ts-expect-error
	id: '1',
	name: 'name',
	title: 'title',
	description: 'desc',
	dbdef: 'upddef',
});

db.insert(test).values({
	name: 'name',
	title: 'title',
	description: 'desc',
	dbdef: 'upddef',
});

db.insert(test).values({
	title: 'title',
	description: 'desc',
	dbdef: 'upddef',
});

db.insert(test).values({
	title: 'title',
	description: 'desc',
});

db.insert(test).values({
	title: 'title',
});
