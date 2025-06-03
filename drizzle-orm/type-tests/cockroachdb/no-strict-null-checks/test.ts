import { drizzle } from '~/cockroachdb';
import { cockroachdbTable, int4, text } from '~/cockroachdb-core';

export const test = cockroachdbTable(
	'test',
	{
		id: text('id')
			.primaryKey()
			.generatedAlwaysAs('genstr'),
		intId: int4('int_id')
			.primaryKey()
			.generatedAlwaysAsIdentity(),
		int2Id: int4('int2_id').generatedByDefaultAsIdentity(),
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
		// @ts-expect-error
		intId: 1,
		name: 'name',
		title: 'title',
		description: 'desc',
		dbdef: 'upddef',
	});

db.update(test)
	.set({
		int2Id: 1,
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
	// @ts-expect-error
	intId: 1,
	name: 'name',
	title: 'title',
	description: 'desc',
	dbdef: 'upddef',
});

db.insert(test).values({
	int2Id: 1,
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
