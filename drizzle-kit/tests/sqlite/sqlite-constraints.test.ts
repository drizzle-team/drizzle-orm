import { sql } from 'drizzle-orm';
import {
	AnySQLiteColumn,
	foreignKey,
	index,
	int,
	integer,
	primaryKey,
	sqliteTable,
	text,
	unique,
	uniqueIndex,
} from 'drizzle-orm/sqlite-core';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { diff, drizzleToDDL, prepareTestDatabase, push, TestDatabase } from './mocks';

// @vitest-environment-options {"max-concurrency":1}
let _: TestDatabase;
let db: TestDatabase['db'];

beforeAll(() => {
	_ = prepareTestDatabase();
	db = _.db;
});

afterAll(async () => {
	await _.close();
});

beforeEach(async () => {
	await _.clear();
});

test('unique #1. add unique. inline param without name', async () => {
	const from = {
		users: sqliteTable('users', {
			name: text(),
		}),
	};
	const to = {
		users: sqliteTable('users', {
			name: text().unique(),
		}),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({
		db,
		to,
	});
	const st0 = [
		'PRAGMA foreign_keys=OFF;',
		`CREATE TABLE \`__new_users\` (
	\`name\` text UNIQUE
);\n`,
		'INSERT INTO `__new_users`(`name`) SELECT `name` FROM `users`;',
		'DROP TABLE `users`;',
		'ALTER TABLE `__new_users` RENAME TO `users`;',
		'PRAGMA foreign_keys=ON;',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

// https://github.com/drizzle-team/drizzle-orm/issues/4152
test('unique #2. create table with unique. inline param without name', async () => {
	const to = {
		users: sqliteTable('users', {
			name: text().unique(),
		}),
	};

	const { sqlStatements: st } = await diff({}, to, []);
	const { sqlStatements: pst } = await push({
		db,
		to,
	});

	const st0 = [
		`CREATE TABLE \`users\` (\n\t\`name\` text UNIQUE\n);\n`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);

	await db.run(`insert into users values ('name1') on conflict (name) do update set name = 'name2';`);
});

test('unique #1_0. drop table with unique', async () => {
	const from = {
		users: sqliteTable('users', {
			name: text().unique(),
		}),
	};
	const to = {};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({
		db,
		to,
	});
	const st0 = ['DROP TABLE `users`;'];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('unique #1_1. drop column with unique', async () => {
	const from = {
		users: sqliteTable('users', {
			id: int(),
			name: text().unique(),
		}),
	};
	const to = {
		users: sqliteTable('users', {
			id: int(),
		}),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({
		db,
		to,
	});
	const st0 = [
		'PRAGMA foreign_keys=OFF;',
		`CREATE TABLE \`__new_users\` (
	\`id\` integer
);\n`,
		'INSERT INTO `__new_users`(`id`) SELECT `id` FROM `users`;',
		'DROP TABLE `users`;',
		'ALTER TABLE `__new_users` RENAME TO `users`;',
		'PRAGMA foreign_keys=ON;',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('unique #2. no changes unique. inline param without name', async () => {
	const from = {
		users: sqliteTable('users', {
			name: text().unique(),
		}),
	};
	const to = {
		users: sqliteTable('users', {
			name: text().unique(),
		}),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({
		db,
		to,
	});
	expect(st).toStrictEqual([]);
	expect(pst).toStrictEqual([]);
});

test('unique #3. add unique. inline param with name', async () => {
	const from = {
		users: sqliteTable('users', {
			name: text(),
		}),
	};
	const to = {
		users: sqliteTable('users', {
			name: text().unique('unique_name'),
		}),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({
		db,
		to,
	});

	const st0 = [
		'PRAGMA foreign_keys=OFF;',
		`CREATE TABLE \`__new_users\` (
	\`name\` text CONSTRAINT \`unique_name\` UNIQUE
);\n`,
		'INSERT INTO `__new_users`(`name`) SELECT `name` FROM `users`;',
		'DROP TABLE `users`;',
		'ALTER TABLE `__new_users` RENAME TO `users`;',
		'PRAGMA foreign_keys=ON;',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('unique #4. add unique. 3rd param with name', async () => {
	const from = {
		users: sqliteTable('users', {
			name: text(),
		}),
	};
	const to = {
		users: sqliteTable('users', {
			name: text(),
		}, (t) => [unique('unique_name').on(t.name)]),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({
		db,
		to,
	});

	const st0 = [
		'PRAGMA foreign_keys=OFF;',
		`CREATE TABLE \`__new_users\` (
	\`name\` text CONSTRAINT \`unique_name\` UNIQUE
);\n`,
		'INSERT INTO `__new_users`(`name`) SELECT `name` FROM `users`;',
		'DROP TABLE `users`;',
		'ALTER TABLE `__new_users` RENAME TO `users`;',
		'PRAGMA foreign_keys=ON;',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('unique #5. add unique. 3rd param without name', async () => {
	const from = {
		users: sqliteTable('users', {
			name: text(),
		}),
	};
	const to = {
		users: sqliteTable('users', {
			name: text(),
		}, (t) => [unique().on(t.name)]),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({
		db,
		to,
	});

	const st0 = [
		'PRAGMA foreign_keys=OFF;',
		`CREATE TABLE \`__new_users\` (
	\`name\` text UNIQUE
);\n`,
		'INSERT INTO `__new_users`(`name`) SELECT `name` FROM `users`;',
		'DROP TABLE `users`;',
		'ALTER TABLE `__new_users` RENAME TO `users`;',
		'PRAGMA foreign_keys=ON;',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('unique #6. no changes unique. 3rd param without name', async () => {
	const from = {
		users: sqliteTable('users', {
			name: text(),
		}, (t) => [unique().on(t.name)]),
	};
	const to = {
		users: sqliteTable('users', {
			name: text(),
		}, (t) => [unique().on(t.name)]),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({
		db,
		to,
	});

	expect(st).toStrictEqual([]);
	expect(pst).toStrictEqual([]);
});

test('unique #7.no changes unique. 3rd param with name', async () => {
	const from = {
		users: sqliteTable('users', {
			name: text(),
			name2: text(),
		}, (t) => [unique('unique_name').on(t.name, t.name2)]),
	};
	const to = {
		users: sqliteTable('users', {
			name: text(),
			name2: text(),
		}, (t) => [unique('unique_name').on(t.name, t.name2)]),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({
		db,
		to,
	});

	expect(st).toStrictEqual([]);
	expect(pst).toStrictEqual([]);
});

test('unique #8. rename unique. 3rd param with name', async () => {
	const from = {
		users: sqliteTable('users', {
			name: text(),
		}, (t) => [unique('unique_name').on(t.name)]),
	};
	const to = {
		users: sqliteTable('users', {
			name: text(),
		}, (t) => [unique('unique_name2').on(t.name)]),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({
		db,
		to,
		renames: [],
	});

	const st0 = [
		'PRAGMA foreign_keys=OFF;',
		`CREATE TABLE \`__new_users\` (
	\`name\` text CONSTRAINT \`unique_name2\` UNIQUE
);\n`,
		'INSERT INTO `__new_users`(`name`) SELECT `name` FROM `users`;',
		'DROP TABLE `users`;',
		'ALTER TABLE `__new_users` RENAME TO `users`;',
		'PRAGMA foreign_keys=ON;',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('unique #9. rename unique. 3rd without + with name', async () => {
	const from = {
		users: sqliteTable('users', {
			name: text(),
		}, (t) => [unique().on(t.name)]),
	};
	const to = {
		users: sqliteTable('users', {
			name: text(),
		}, (t) => [unique('unique_name2').on(t.name)]),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({
		db,
		to,
		renames: [],
	});

	const st0 = [
		'PRAGMA foreign_keys=OFF;',
		`CREATE TABLE \`__new_users\` (
	\`name\` text CONSTRAINT \`unique_name2\` UNIQUE
);\n`,
		'INSERT INTO `__new_users`(`name`) SELECT `name` FROM `users`;',
		'DROP TABLE `users`;',
		'ALTER TABLE `__new_users` RENAME TO `users`;',
		'PRAGMA foreign_keys=ON;',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('unique multistep #1', async () => {
	const sch1 = {
		users: sqliteTable('users', {
			name: text().unique(),
		}),
	};

	const { sqlStatements: st1, next: n1 } = await diff({}, sch1, []);
	const { sqlStatements: pst1 } = await push({ db, to: sch1 });

	const e1 = ['CREATE TABLE `users` (\n\t`name` text UNIQUE\n);\n'];
	expect(st1).toStrictEqual(e1);
	expect(pst1).toStrictEqual(e1);

	const sch2 = {
		users: sqliteTable('users2', {
			name: text('name2').unique(),
		}),
	};

	const renames = ['users->users2', 'users2.name->users2.name2'];
	const { sqlStatements: st2, next: n2 } = await diff(n1, sch2, renames);
	const { sqlStatements: pst2 } = await push({ db, to: sch2, renames });

	const e2 = [
		'ALTER TABLE `users` RENAME TO `users2`;',
		'ALTER TABLE `users2` RENAME COLUMN `name` TO `name2`;',
	];
	expect(st2).toStrictEqual(e2);
	expect(pst2).toStrictEqual(e2);

	const { sqlStatements: st3, next: n3 } = await diff(n2, sch2, []);
	const { sqlStatements: pst3, next: pn3 } = await push({ db, to: sch2 });

	expect(st3).toStrictEqual([]);
	expect(pst3).toStrictEqual([]);
	expect(n3.uniques.list()).toStrictEqual([{
		columns: ['name2'],
		nameExplicit: false,
		name: 'users_name_unique',
		entityType: 'uniques',
		table: 'users2',
	}]);
	expect(pn3.uniques.list()).toStrictEqual([{
		columns: ['name2'],
		nameExplicit: false,
		name: 'users2_name2_unique',
		entityType: 'uniques',
		table: 'users2',
	}]);

	const sch3 = {
		users: sqliteTable('users2', {
			name: text('name2'),
		}),
	};

	const { sqlStatements: st4 } = await diff(n3, sch3, []);
	const { sqlStatements: pst4 } = await push({ db, to: sch3 });

	const e3 = [
		'PRAGMA foreign_keys=OFF;',
		`CREATE TABLE \`__new_users2\` (
	\`name2\` text
);
`,
		'INSERT INTO `__new_users2`(`name2`) SELECT `name2` FROM `users2`;',
		'DROP TABLE `users2`;',
		'ALTER TABLE `__new_users2` RENAME TO `users2`;',
		'PRAGMA foreign_keys=ON;',
	];

	expect(st4).toStrictEqual(e3);
	expect(pst4).toStrictEqual(e3);
});

test('unique multistep #2', async () => {
	const sch1 = {
		users: sqliteTable('users', {
			name: text().unique(),
		}),
	};

	const { sqlStatements: st1, next: n1 } = await diff({}, sch1, []);
	const { sqlStatements: pst1 } = await push({ db, to: sch1 });
	const e1 = ['CREATE TABLE `users` (\n\t`name` text UNIQUE\n);\n'];
	expect(st1).toStrictEqual(e1);
	expect(pst1).toStrictEqual(e1);

	const sch2 = {
		users: sqliteTable('users2', {
			name: text('name2').unique(),
		}),
	};

	const r1 = [
		'users->users2',
		'users2.name->users2.name2',
	];
	const { sqlStatements: st2, next: n2 } = await diff(n1, sch2, r1);
	const { sqlStatements: pst2 } = await push({ db, to: sch2, renames: r1 });

	const e2 = [
		'ALTER TABLE \`users\` RENAME TO \`users2\`;',
		'ALTER TABLE \`users2\` RENAME COLUMN \`name\` TO \`name2\`;',
	];
	expect(pst2).toStrictEqual(e2);
	expect(st2).toStrictEqual(e2);

	const { sqlStatements: st3, next: n3 } = await diff(n2, sch2, []);
	const { sqlStatements: pst3 } = await push({ db, to: sch2 });

	expect(st3).toStrictEqual([]);
	expect(pst3).toStrictEqual([]);

	const sch3 = {
		users: sqliteTable('users2', {
			name: text('name2'),
		}, (t) => [unique().on(t.name)]),
	};

	const { sqlStatements: st4, next: n4 } = await diff(n3, sch3, []);
	const { sqlStatements: pst4, next: pn4 } = await push({ db, to: sch3 });
	expect(st4).toStrictEqual([]);
	expect(pst4).toStrictEqual([]);
	expect(n4.uniques.list()).toStrictEqual([{
		columns: [
			'name2',
		],
		entityType: 'uniques',
		name: 'users_name_unique',
		nameExplicit: false,
		table: 'users2',
	}]);
	expect(pn4.uniques.list()).toStrictEqual([{
		columns: [
			'name2',
		],
		entityType: 'uniques',
		name: 'users2_name2_unique',
		nameExplicit: false,
		table: 'users2',
	}]);
});

test('unique multistep #3', async () => {
	const sch1 = {
		users: sqliteTable('users', {
			name: text().unique(),
		}),
	};

	const { sqlStatements: st1, next: n1 } = await diff({}, sch1, []);
	const { sqlStatements: pst1 } = await push({ db, to: sch1 });

	expect(st1).toStrictEqual([
		'CREATE TABLE `users` (\n\t`name` text UNIQUE\n);\n',
	]);
	expect(pst1).toStrictEqual([
		'CREATE TABLE `users` (\n\t`name` text UNIQUE\n);\n',
	]);

	const sch2 = {
		users: sqliteTable('users2', {
			name: text('name2').unique(),
		}),
	};

	const renames = ['users->users2', 'users2.name->users2.name2'];
	const { sqlStatements: st2, next: n2 } = await diff(n1, sch2, renames);
	const { sqlStatements: pst2 } = await push({ db, to: sch2, renames });

	const e2 = [
		'ALTER TABLE `users` RENAME TO `users2`;',
		'ALTER TABLE `users2` RENAME COLUMN `name` TO `name2`;',
	];
	expect(st2).toStrictEqual(e2);
	expect(pst2).toStrictEqual(e2);

	const { sqlStatements: st3, next: n3 } = await diff(n2, sch2, []);
	const { sqlStatements: pst3 } = await push({ db, to: sch2 });

	expect(st3).toStrictEqual([]);
	expect(pst3).toStrictEqual([]);

	const sch3 = {
		users: sqliteTable('users2', {
			name: text('name2'),
		}, (t) => [unique('name_unique').on(t.name)]),
	};

	const { sqlStatements: st4, next: n4 } = await diff(n3, sch3, []);
	const { sqlStatements: pst4 } = await push({ db, to: sch3 });

	const e4 = [
		'PRAGMA foreign_keys=OFF;',
		`CREATE TABLE \`__new_users2\` (
	\`name2\` text CONSTRAINT \`name_unique\` UNIQUE
);
`,
		'INSERT INTO `__new_users2`(`name2`) SELECT `name2` FROM `users2`;',
		'DROP TABLE `users2`;',
		'ALTER TABLE `__new_users2` RENAME TO `users2`;',
		'PRAGMA foreign_keys=ON;',
	];
	expect(st4).toStrictEqual(e4);
	expect(pst4).toStrictEqual(e4);

	const sch4 = {
		users: sqliteTable('users2', {
			name: text('name2'),
		}),
	};

	const { sqlStatements: st5 } = await diff(n4, sch4, []);
	const { sqlStatements: pst5 } = await push({ db, to: sch4 });
	const e5 = [
		'PRAGMA foreign_keys=OFF;',
		`CREATE TABLE \`__new_users2\` (
	\`name2\` text
);
`,
		'INSERT INTO `__new_users2`(`name2`) SELECT `name2` FROM `users2`;',
		'DROP TABLE `users2`;',
		'ALTER TABLE `__new_users2` RENAME TO `users2`;',
		'PRAGMA foreign_keys=ON;',
	];
	expect(st5).toStrictEqual(e5);
	expect(pst5).toStrictEqual(e5);
});

test('pk #1. add pk. inline param without name', async () => {
	const from = {
		users: sqliteTable('users', {
			name: text(),
		}),
	};
	const to = {
		users: sqliteTable('users', {
			name: text().primaryKey(),
		}),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({
		db,
		to,
	});
	const st0 = [
		'PRAGMA foreign_keys=OFF;',
		`CREATE TABLE \`__new_users\` (
	\`name\` text PRIMARY KEY
);\n`,
		'INSERT INTO `__new_users`(`name`) SELECT `name` FROM `users`;',
		'DROP TABLE `users`;',
		'ALTER TABLE `__new_users` RENAME TO `users`;',
		'PRAGMA foreign_keys=ON;',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('pk #1_0. drop table with pk', async () => {
	const from = {
		users: sqliteTable('users', {
			name: text().primaryKey(),
		}),
	};
	const to = {};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({
		db,
		to,
	});
	const st0 = [
		'DROP TABLE `users`;',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

// https://github.com/drizzle-team/drizzle-orm/issues/3801
test('pk #1_1. add column with pk', async () => {
	const from = {
		users: sqliteTable('users', {
			name: text(),
		}),
	};
	const to = {
		users: sqliteTable('users', {
			name: text(),
			id: integer().primaryKey({ autoIncrement: true }),
		}),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({
		db,
		to,
	});
	const st0 = [
		'ALTER TABLE `users` ADD `id` integer;',
		'PRAGMA foreign_keys=OFF;',
		`CREATE TABLE \`__new_users\` (\n\t\`name\` text,\n\t\`id\` integer PRIMARY KEY AUTOINCREMENT\n);\n`,
		'INSERT INTO `__new_users`(`name`) SELECT `name` FROM `users`;',
		'DROP TABLE `users`;',
		'ALTER TABLE `__new_users` RENAME TO `users`;',
		'PRAGMA foreign_keys=ON;',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('pk #1_0. drop column with pk', async () => {
	const from = {
		users: sqliteTable('users', {
			id: int(),
			name: text().primaryKey(),
		}),
	};
	const to = {
		users: sqliteTable('users', {
			id: int(),
		}),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({
		db,
		to,
	});
	const st0 = [
		'PRAGMA foreign_keys=OFF;',
		`CREATE TABLE \`__new_users\` (
	\`id\` integer
);\n`,
		'INSERT INTO `__new_users`(`id`) SELECT `id` FROM `users`;',
		'DROP TABLE `users`;',
		'ALTER TABLE `__new_users` RENAME TO `users`;',
		'PRAGMA foreign_keys=ON;',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('pk #1_2. add pk', async () => {
	const from = {
		users: sqliteTable('users', {
			name: text(),
		}),
	};
	const to = {
		users: sqliteTable('users', {
			name: text(),
		}, (t) => [primaryKey({ columns: [t.name] })]),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({
		db,
		to,
	});
	const st0 = [
		'PRAGMA foreign_keys=OFF;',
		`CREATE TABLE \`__new_users\` (
	\`name\` text PRIMARY KEY
);\n`,
		'INSERT INTO `__new_users`(`name`) SELECT `name` FROM `users`;',
		'DROP TABLE `users`;',
		'ALTER TABLE `__new_users` RENAME TO `users`;',
		'PRAGMA foreign_keys=ON;',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('pk #1_3. add pk', async () => {
	const from = {
		users: sqliteTable('users', {
			name: text(),
		}),
	};
	const to = {
		users: sqliteTable('users', {
			name: text(),
		}, (t) => [primaryKey({ name: 'test_pk', columns: [t.name] })]),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({
		db,
		to,
	});
	const st0 = [
		'PRAGMA foreign_keys=OFF;',
		`CREATE TABLE \`__new_users\` (
	\`name\` text,
	CONSTRAINT \`test_pk\` PRIMARY KEY(\`name\`)
);\n`,
		'INSERT INTO `__new_users`(`name`) SELECT `name` FROM `users`;',
		'DROP TABLE `users`;',
		'ALTER TABLE `__new_users` RENAME TO `users`;',
		'PRAGMA foreign_keys=ON;',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('pk #2. no changes pk. inline param without name', async () => {
	const from = {
		users: sqliteTable('users', {
			name: text().primaryKey(),
		}),
	};
	const to = {
		users: sqliteTable('users', {
			name: text().primaryKey(),
		}),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({
		db,
		to,
	});
	expect(st).toStrictEqual([]);
	expect(pst).toStrictEqual([]);
});

test('pk #3. add pk. inline param with autoincrement', async () => {
	const from = {
		users: sqliteTable('users', {
			name: int(),
		}),
	};
	const to = {
		users: sqliteTable('users', {
			name: int().primaryKey({ autoIncrement: true, onConflict: 'replace' }),
		}),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({
		db,
		to,
	});

	const st0 = [
		'PRAGMA foreign_keys=OFF;',
		`CREATE TABLE \`__new_users\` (
	\`name\` integer PRIMARY KEY AUTOINCREMENT
);\n`,
		'INSERT INTO `__new_users`(`name`) SELECT `name` FROM `users`;',
		'DROP TABLE `users`;',
		'ALTER TABLE `__new_users` RENAME TO `users`;',
		'PRAGMA foreign_keys=ON;',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('pk #4. add pk. 3rd param with name', async () => {
	const from = {
		users: sqliteTable('users', {
			name: text(),
		}),
	};
	const to = {
		users: sqliteTable('users', {
			name: text(),
		}, (t) => [primaryKey({ name: 'unique_name', columns: [t.name] })]),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({
		db,
		to,
	});

	const st0 = [
		'PRAGMA foreign_keys=OFF;',
		`CREATE TABLE \`__new_users\` (
	\`name\` text,
	CONSTRAINT \`unique_name\` PRIMARY KEY(\`name\`)
);\n`,
		'INSERT INTO `__new_users`(`name`) SELECT `name` FROM `users`;',
		'DROP TABLE `users`;',
		'ALTER TABLE `__new_users` RENAME TO `users`;',
		'PRAGMA foreign_keys=ON;',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('pk #5. add pk. 3rd param without name', async () => {
	const from = {
		users: sqliteTable('users', {
			name: text(),
		}),
	};
	const to = {
		users: sqliteTable('users', {
			name: text(),
		}, (t) => [primaryKey({ columns: [t.name] })]),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({
		db,
		to,
	});

	const st0 = [
		'PRAGMA foreign_keys=OFF;',
		`CREATE TABLE \`__new_users\` (
	\`name\` text PRIMARY KEY
);\n`,
		'INSERT INTO `__new_users`(`name`) SELECT `name` FROM `users`;',
		'DROP TABLE `users`;',
		'ALTER TABLE `__new_users` RENAME TO `users`;',
		'PRAGMA foreign_keys=ON;',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('pk #6. no changes pk. 3rd param without name', async () => {
	const from = {
		users: sqliteTable('users', {
			name: text(),
		}, (t) => [primaryKey({ columns: [t.name] })]),
	};
	const to = {
		users: sqliteTable('users', {
			name: text(),
		}, (t) => [primaryKey({ columns: [t.name] })]),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({
		db,
		to,
	});

	expect(st).toStrictEqual([]);
	expect(pst).toStrictEqual([]);
});

test('pk #7.no changes pk. 3rd param with name', async () => {
	const from = {
		users: sqliteTable('users', {
			name: text(),
			name2: text(),
		}, (t) => [primaryKey({ name: 'pk_name', columns: [t.name] })]),
	};
	const to = {
		users: sqliteTable('users', {
			name: text(),
			name2: text(),
		}, (t) => [primaryKey({ name: 'pk_name', columns: [t.name] })]),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({
		db,
		to,
	});

	expect(st).toStrictEqual([]);
	expect(pst).toStrictEqual([]);
});

test('pk #8. rename pk. 3rd param with name', async () => {
	const from = {
		users: sqliteTable('users', {
			name: text(),
			name2: text(),
		}, (t) => [primaryKey({ name: 'pk_name', columns: [t.name, t.name2] })]),
	};
	const to = {
		users: sqliteTable('users', {
			name: text(),
			name2: text(),
		}, (t) => [primaryKey({ name: 'pk_name_new', columns: [t.name, t.name2] })]),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({
		db,
		to,
		renames: [],
	});

	const st0 = [
		'PRAGMA foreign_keys=OFF;',
		`CREATE TABLE \`__new_users\` (
	\`name\` text,
	\`name2\` text,
	CONSTRAINT \`pk_name_new\` PRIMARY KEY(\`name\`, \`name2\`)
);\n`,
		'INSERT INTO `__new_users`(`name`, `name2`) SELECT `name`, `name2` FROM `users`;',
		'DROP TABLE `users`;',
		'ALTER TABLE `__new_users` RENAME TO `users`;',
		'PRAGMA foreign_keys=ON;',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('pk #9. rename pk. 3rd without + with name', async () => {
	const from = {
		users: sqliteTable('users', {
			name: text(),
			name2: text(),
		}, (t) => [primaryKey({ columns: [t.name, t.name2] })]),
	};
	const to = {
		users: sqliteTable('users', {
			name: text(),
			name2: text(),
		}, (t) => [primaryKey({ name: 'pk_name', columns: [t.name, t.name2] })]),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({
		db,
		to,
		renames: [],
	});

	const st0 = [
		'PRAGMA foreign_keys=OFF;',
		`CREATE TABLE \`__new_users\` (
	\`name\` text,
	\`name2\` text,
	CONSTRAINT \`pk_name\` PRIMARY KEY(\`name\`, \`name2\`)
);\n`,
		'INSERT INTO `__new_users`(`name`, `name2`) SELECT `name`, `name2` FROM `users`;',
		'DROP TABLE `users`;',
		'ALTER TABLE `__new_users` RENAME TO `users`;',
		'PRAGMA foreign_keys=ON;',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('pk multistep #1', async () => {
	const sch1 = {
		users: sqliteTable('users', {
			name: text().primaryKey(),
		}),
	};

	const { sqlStatements: st1, next: n1 } = await diff({}, sch1, []);
	const { sqlStatements: pst1 } = await push({ db, to: sch1 });

	const e1 = ['CREATE TABLE `users` (\n\t`name` text PRIMARY KEY\n);\n'];
	expect(st1).toStrictEqual(e1);
	expect(pst1).toStrictEqual(e1);

	const sch2 = {
		users: sqliteTable('users2', {
			name: text('name2').primaryKey(),
		}),
	};

	const renames = ['users->users2', 'users2.name->users2.name2'];
	const { sqlStatements: st2, next: n2 } = await diff(n1, sch2, renames);
	const { sqlStatements: pst2 } = await push({ db, to: sch2, renames });

	const e2 = [
		'ALTER TABLE `users` RENAME TO `users2`;',
		'ALTER TABLE `users2` RENAME COLUMN `name` TO `name2`;',
	];
	expect(st2).toStrictEqual(e2);
	expect(pst2).toStrictEqual(e2);

	const { sqlStatements: st3, next: n3 } = await diff(n2, sch2, []);
	const { sqlStatements: pst3, next: pn3 } = await push({ db, to: sch2 });

	expect(st3).toStrictEqual([]);
	expect(pst3).toStrictEqual([]);
	expect(n3.pks.list()).toStrictEqual([{
		columns: ['name2'],
		nameExplicit: false,
		name: 'users_pk',
		entityType: 'pks',
		table: 'users2',
	}]);
	expect(pn3.pks.list()).toStrictEqual([{
		columns: ['name2'],
		nameExplicit: false,
		name: 'users2_pk',
		entityType: 'pks',
		table: 'users2',
	}]);

	const sch3 = {
		users: sqliteTable('users2', {
			name: text('name2'),
		}),
	};

	const { sqlStatements: st4 } = await diff(n3, sch3, []);
	const { sqlStatements: pst4 } = await push({ db, to: sch3 });

	const e3 = [
		'PRAGMA foreign_keys=OFF;',
		`CREATE TABLE \`__new_users2\` (
	\`name2\` text
);
`,
		'INSERT INTO `__new_users2`(`name2`) SELECT `name2` FROM `users2`;',
		'DROP TABLE `users2`;',
		'ALTER TABLE `__new_users2` RENAME TO `users2`;',
		'PRAGMA foreign_keys=ON;',
	];

	expect(st4).toStrictEqual(e3);
	expect(pst4).toStrictEqual(e3);
});

test('pk multistep #2', async () => {
	const sch1 = {
		users: sqliteTable('users', {
			name: text().primaryKey(),
		}),
	};

	const { sqlStatements: st1, next: n1 } = await diff({}, sch1, []);
	const { sqlStatements: pst1 } = await push({ db, to: sch1 });
	const e1 = ['CREATE TABLE `users` (\n\t`name` text PRIMARY KEY\n);\n'];
	expect(st1).toStrictEqual(e1);
	expect(pst1).toStrictEqual(e1);

	const sch2 = {
		users: sqliteTable('users2', {
			name: text('name2').primaryKey(),
		}),
	};

	const r1 = [
		'users->users2',
		'users2.name->users2.name2',
	];
	const { sqlStatements: st2, next: n2 } = await diff(n1, sch2, r1);
	const { sqlStatements: pst2 } = await push({ db, to: sch2, renames: r1 });

	const e2 = [
		'ALTER TABLE \`users\` RENAME TO \`users2\`;',
		'ALTER TABLE \`users2\` RENAME COLUMN \`name\` TO \`name2\`;',
	];
	expect(pst2).toStrictEqual(e2);
	expect(st2).toStrictEqual(e2);

	const { sqlStatements: st3, next: n3 } = await diff(n2, sch2, []);
	const { sqlStatements: pst3 } = await push({ db, to: sch2 });

	expect(st3).toStrictEqual([]);
	expect(pst3).toStrictEqual([]);

	const sch3 = {
		users: sqliteTable('users2', {
			name: text('name2'),
		}, (t) => [primaryKey({ columns: [t.name] })]),
	};

	const { sqlStatements: st4, next: n4 } = await diff(n3, sch3, []);
	const { sqlStatements: pst4, next: pn4 } = await push({ db, to: sch3 });
	expect(st4).toStrictEqual([]);
	expect(pst4).toStrictEqual([]);
	expect(n4.pks.list()).toStrictEqual([{
		columns: [
			'name2',
		],
		entityType: 'pks',
		name: 'users_pk',
		nameExplicit: false,
		table: 'users2',
	}]);
	expect(pn4.pks.list()).toStrictEqual([{
		columns: [
			'name2',
		],
		entityType: 'pks',
		name: 'users2_pk',
		nameExplicit: false,
		table: 'users2',
	}]);
});

test('pk multistep #3', async () => {
	const sch1 = {
		users: sqliteTable('users', {
			name: text().primaryKey(),
		}),
	};

	const { sqlStatements: st1, next: n1 } = await diff({}, sch1, []);
	const { sqlStatements: pst1 } = await push({ db, to: sch1 });

	expect(st1).toStrictEqual([
		'CREATE TABLE `users` (\n\t`name` text PRIMARY KEY\n);\n',
	]);
	expect(pst1).toStrictEqual([
		'CREATE TABLE `users` (\n\t`name` text PRIMARY KEY\n);\n',
	]);

	const sch2 = {
		users: sqliteTable('users2', {
			name: text('name2').primaryKey(),
		}),
	};

	const renames = ['users->users2', 'users2.name->users2.name2'];
	const { sqlStatements: st2, next: n2 } = await diff(n1, sch2, renames);
	const { sqlStatements: pst2 } = await push({ db, to: sch2, renames });

	const e2 = [
		'ALTER TABLE `users` RENAME TO `users2`;',
		'ALTER TABLE `users2` RENAME COLUMN `name` TO `name2`;',
	];
	expect(st2).toStrictEqual(e2);
	expect(pst2).toStrictEqual(e2);

	const { sqlStatements: st3, next: n3 } = await diff(n2, sch2, []);
	const { sqlStatements: pst3 } = await push({ db, to: sch2 });

	expect(st3).toStrictEqual([]);
	expect(pst3).toStrictEqual([]);

	const sch3 = {
		users: sqliteTable('users2', {
			name: text('name2'),
		}, (t) => [primaryKey({ name: 'name_pk', columns: [t.name] })]),
	};

	const { sqlStatements: st4, next: n4 } = await diff(n3, sch3, []);
	const { sqlStatements: pst4 } = await push({ db, to: sch3 });

	const e4 = [
		'PRAGMA foreign_keys=OFF;',
		`CREATE TABLE \`__new_users2\` (
	\`name2\` text,
	CONSTRAINT \`name_pk\` PRIMARY KEY(\`name2\`)
);
`,
		'INSERT INTO `__new_users2`(`name2`) SELECT `name2` FROM `users2`;',
		'DROP TABLE `users2`;',
		'ALTER TABLE `__new_users2` RENAME TO `users2`;',
		'PRAGMA foreign_keys=ON;',
	];
	expect(st4).toStrictEqual(e4);
	expect(pst4).toStrictEqual(e4);

	const sch4 = {
		users: sqliteTable('users2', {
			name: text('name2'),
		}),
	};

	const { sqlStatements: st5 } = await diff(n4, sch4, []);
	const { sqlStatements: pst5 } = await push({ db, to: sch4 });
	const e5 = [
		'PRAGMA foreign_keys=OFF;',
		`CREATE TABLE \`__new_users2\` (
	\`name2\` text
);
`,
		'INSERT INTO `__new_users2`(`name2`) SELECT `name2` FROM `users2`;',
		'DROP TABLE `users2`;',
		'ALTER TABLE `__new_users2` RENAME TO `users2`;',
		'PRAGMA foreign_keys=ON;',
	];
	expect(st5).toStrictEqual(e5);
	expect(pst5).toStrictEqual(e5);
});

// https://github.com/drizzle-team/drizzle-orm/issues/3103
// https://github.com/drizzle-team/drizzle-orm/issues/3844
test('composite pk multistep #1', async () => {
	const organisations = sqliteTable('organisation', {
		id: int().primaryKey({ autoIncrement: true }),
	});

	const users = sqliteTable('user', {
		id: int().primaryKey({ autoIncrement: true }),
	});

	const organisationUsers = sqliteTable(
		'organisationUser',
		{
			organisationId: int()
				.notNull()
				.references(() => organisations.id),
			userId: int()
				.notNull()
				.references(() => users.id),
			roles: text({ mode: 'json' }).$type<string[]>().default([]),
		},
		(t) => [
			primaryKey({ columns: [t.userId, t.organisationId] }),
		],
	);

	const schema1 = { users, organisations, organisationUsers };

	const { next: n1 } = await diff({}, schema1, []);
	await push({ db, to: schema1 });

	const { sqlStatements: st2 } = await diff(n1, schema1, []);
	const { sqlStatements: pst2 } = await push({ db, to: schema1 });
	expect(st2).toStrictEqual([]);
	expect(pst2).toStrictEqual([]);
});

// https://github.com/drizzle-team/drizzle-orm/issues/3844
// https://github.com/drizzle-team/drizzle-orm/issues/3103
test('composite pk multistep #2', async () => {
	const userAsyncTasks = sqliteTable('userAsyncTask', {
		userId: text('userId').notNull(),
		identifier: text('identifier').notNull(),
		type: text('type').notNull(),
	}, (t) => [
		primaryKey({ columns: [t.userId, t.type, t.identifier] }),
	]);
	const schema = { userAsyncTasks };

	const { next: n1 } = await diff({}, schema, []);
	await push({ db, to: schema });

	const { sqlStatements: st2 } = await diff(n1, schema, []);
	const { sqlStatements: pst2 } = await push({ db, to: schema });
	expect(st2).toStrictEqual([]);
	expect(pst2).toStrictEqual([]);
});

test('fk #0', async () => {
	const users = sqliteTable('users', {
		id: int().references((): AnySQLiteColumn => users.id2),
		id2: int(),
	});

	const to = {
		users,
	};

	const { sqlStatements } = await diff({}, to, []);
	const { sqlStatements: pst } = await push({ db, to });

	const e = [
		`CREATE TABLE \`users\` (\n\t\`id\` integer,\n\t\`id2\` integer,\n\tCONSTRAINT \`fk_users_id_users_id2_fk\` FOREIGN KEY (\`id\`) REFERENCES \`users\`(\`id2\`)\n);\n`,
	];
	expect(sqlStatements).toStrictEqual(e);
	expect(pst).toStrictEqual(e);
});

test('fk #1', async () => {
	const users = sqliteTable('users', {
		id: int().primaryKey(),
	});
	const posts = sqliteTable('posts', {
		id: int().primaryKey(),
		authorId: int().references(() => users.id),
	});

	const to = {
		posts,
		users,
	};

	const { sqlStatements } = await diff({}, to, []);
	const { sqlStatements: pst } = await push({ db, to });

	const e = [
		`CREATE TABLE \`posts\` (\n\t\`id\` integer PRIMARY KEY,\n\t\`authorId\` integer,\n\tCONSTRAINT \`fk_posts_authorId_users_id_fk\` FOREIGN KEY (\`authorId\`) REFERENCES \`users\`(\`id\`)\n);\n`,
		`CREATE TABLE \`users\` (\n\t\`id\` integer PRIMARY KEY\n);\n`,
	];
	expect(sqlStatements).toStrictEqual(e);
	expect(pst).toStrictEqual(e);
});

test('fk #2', async () => {
	const users = sqliteTable('users', {
		id: int().primaryKey(),
		id2: int().references((): AnySQLiteColumn => users.id),
	});

	const to = { users };

	const { sqlStatements } = await diff({}, to, []);
	const { sqlStatements: pst } = await push({ db, to });

	const e = [
		`CREATE TABLE \`users\` (\n\t\`id\` integer PRIMARY KEY,\n\t\`id2\` integer,\n\tCONSTRAINT \`fk_users_id2_users_id_fk\` FOREIGN KEY (\`id2\`) REFERENCES \`users\`(\`id\`)\n);\n`,
	];
	expect(sqlStatements).toStrictEqual(e);
	expect(pst).toStrictEqual(e);
});

test('fk #3', async () => {
	const posts = sqliteTable('posts', {
		id: int(),
	});
	const users = sqliteTable('users', {
		id: int().primaryKey(),
		id2: int(),
	}, (t) => [foreignKey({
		name: 'fk_name',
		columns: [t.id2],
		foreignColumns: [posts.id],
	})]);

	const to = { posts, users };

	const { sqlStatements } = await diff({}, to, []);
	const { sqlStatements: pst } = await push({ db, to });

	const e = [
		`CREATE TABLE \`posts\` (\n\t\`id\` integer\n);\n`,
		`CREATE TABLE \`users\` (\n\t\`id\` integer PRIMARY KEY,\n\t\`id2\` integer,\n\tCONSTRAINT \`fk_name\` FOREIGN KEY (\`id2\`) REFERENCES \`posts\`(\`id\`)\n);\n`,
	];
	expect(sqlStatements).toStrictEqual(e);
	expect(pst).toStrictEqual(e);
});

test('fk #4', async () => {
	const posts = sqliteTable('posts', {
		id: int(),
	});
	const users = sqliteTable('users', {
		id: int().primaryKey(),
		id2: int(),
	}, (t) => [foreignKey({
		columns: [t.id2],
		foreignColumns: [posts.id],
	})]);

	const to = { posts, users };

	const { sqlStatements } = await diff({}, to, []);
	const { sqlStatements: pst } = await push({ db, to });

	const e = [
		`CREATE TABLE \`posts\` (\n\t\`id\` integer\n);\n`,
		`CREATE TABLE \`users\` (\n\t\`id\` integer PRIMARY KEY,\n\t\`id2\` integer,\n\tCONSTRAINT \`fk_users_id2_posts_id_fk\` FOREIGN KEY (\`id2\`) REFERENCES \`posts\`(\`id\`)\n);\n`,
	];
	expect(sqlStatements).toStrictEqual(e);
	expect(pst).toStrictEqual(e);
});

test('fk #5', async () => {
	const users = sqliteTable('users', {
		id: int().primaryKey(),
		id2: int().references((): AnySQLiteColumn => users.id),
	});

	const users2 = sqliteTable('users2', {
		id: int('id3').primaryKey(),
		id2: int().references((): AnySQLiteColumn => users2.id),
	});

	const from = { users };
	const to = { users: users2 };

	const renames = ['users->users2', 'users2.id->users2.id3'];
	const { sqlStatements } = await diff(from, to, renames);
	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to, renames });

	const e = [
		'ALTER TABLE \`users\` RENAME TO \`users2\`;',
		'ALTER TABLE \`users2\` RENAME COLUMN \`id\` TO \`id3\`;',
	];
	expect(sqlStatements).toStrictEqual(e);
	expect(pst).toStrictEqual(e);
});

test('fk #6', async () => {
	const users = sqliteTable('users', {
		id1: int().primaryKey(),
		id2: int().references((): AnySQLiteColumn => users.id1),
	});

	const users2 = sqliteTable('users', {
		id1: int().primaryKey(),
		id2: int(),
	}, (t) => [foreignKey({ name: 'id2_id1_fk', columns: [t.id2], foreignColumns: [t.id1] })]);

	const from = { users };
	const to = { users: users2 };

	const renames = ['users.users_id2_users_id1_fkey->users.id2_id1_fk'];
	const { sqlStatements } = await diff(from, to, renames);
	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to, renames });

	const e = [
		'PRAGMA foreign_keys=OFF;',
		`CREATE TABLE \`__new_users\` (
\t\`id1\` integer PRIMARY KEY,
\t\`id2\` integer,
\tCONSTRAINT \`id2_id1_fk\` FOREIGN KEY (\`id2\`) REFERENCES \`users\`(\`id1\`)
);\n`,
		'INSERT INTO \`__new_users\`(\`id1\`, \`id2\`) SELECT \`id1\`, \`id2\` FROM \`users\`;',
		'DROP TABLE \`users\`;',
		'ALTER TABLE \`__new_users\` RENAME TO \`users\`;',
		'PRAGMA foreign_keys=ON;',
	];
	expect(sqlStatements).toStrictEqual(e);
	expect(pst).toStrictEqual(e);
});

test('fk #8', async () => {
	const users = sqliteTable('users', {
		id1: int().primaryKey(),
		id2: int().unique(),
		id3: int().references((): AnySQLiteColumn => users.id1),
	});

	const users2 = sqliteTable('users', {
		id1: int().primaryKey(),
		id2: int().unique(),
		id3: int().references((): AnySQLiteColumn => users.id2),
	});

	const from = { users };
	const to = { users: users2 };

	const { sqlStatements } = await diff(from, to, []);
	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to });

	const e = [
		'PRAGMA foreign_keys=OFF;',
		`CREATE TABLE \`__new_users\` (
\t\`id1\` integer PRIMARY KEY,
\t\`id2\` integer UNIQUE,
\t\`id3\` integer,
\tCONSTRAINT \`fk_users_id3_users_id2_fk\` FOREIGN KEY (\`id3\`) REFERENCES \`users\`(\`id2\`)
);\n`,
		'INSERT INTO \`__new_users\`(\`id1\`, \`id2\`, \`id3\`) SELECT \`id1\`, \`id2\`, \`id3\` FROM \`users\`;',
		'DROP TABLE \`users\`;',
		'ALTER TABLE \`__new_users\` RENAME TO \`users\`;',
		'PRAGMA foreign_keys=ON;',
	];
	expect(sqlStatements).toStrictEqual(e);
	expect(pst).toStrictEqual(e);
});

test('fk #9', async () => {
	const users = sqliteTable('users', {
		id1: int().primaryKey(),
		id2: int().unique(),
		id3: int(),
	}, (t) => [foreignKey({ name: 'fk1', columns: [t.id3], foreignColumns: [t.id1] })]);

	const users2 = sqliteTable('users', {
		id1: int().primaryKey(),
		id2: int().unique(),
		id3: int(),
	}, (t) => [foreignKey({ name: 'fk1', columns: [t.id3], foreignColumns: [t.id1] })]);

	const from = { users };
	const to = { users: users2 };

	const { sqlStatements } = await diff(from, to, []);
	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to });

	expect(sqlStatements).toStrictEqual([]);
	expect(pst).toStrictEqual([]);
});

test('fk #10', async () => {
	const users = sqliteTable('users', {
		id1: int().primaryKey(),
		id2: int().unique(),
		id3: int(),
	}, (t) => [foreignKey({ columns: [t.id3], foreignColumns: [t.id1] })]);

	const users2 = sqliteTable('users', {
		id1: int().primaryKey(),
		id2: int().unique(),
		id3: int(),
	}, (t) => [foreignKey({ columns: [t.id3], foreignColumns: [t.id1] })]);

	const from = { users };
	const to = { users: users2 };

	const { sqlStatements } = await diff(from, to, []);
	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to });

	expect(sqlStatements).toStrictEqual([]);
	expect(pst).toStrictEqual([]);
});

test('fk #11', async () => {
	const users = sqliteTable('users', {
		id1: int().primaryKey(),
	});

	const users2 = sqliteTable('users2', {
		id1: int().primaryKey(),
		id2: int().references((): AnySQLiteColumn => users2.id1),
	});

	const from = { users };
	const to = { users: users2 };

	const renames = ['users->users2'];
	const { sqlStatements } = await diff(from, to, renames);
	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to, renames });

	const e = [
		'ALTER TABLE `users` RENAME TO `users2`;',
		'ALTER TABLE `users2` ADD `id2` integer REFERENCES users2(id1);',
	];
	expect(sqlStatements).toStrictEqual(e);
	expect(pst).toStrictEqual(e);
});

test('fk #12', async () => {
	const users = sqliteTable('users', {
		id1: int().primaryKey(),
	});

	const users2 = sqliteTable('users2', {
		id1: int().primaryKey(),
		id2: int(),
	}, (t) => [foreignKey({ columns: [t.id2], foreignColumns: [users.id1] })]);

	const from = { users };
	const to = { users: users2 };

	const renames = ['users->users2'];
	const { sqlStatements } = await diff(from, to, renames);
	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to, renames });

	const e = [
		'ALTER TABLE `users` RENAME TO `users2`;',
		'ALTER TABLE `users2` ADD `id2` integer REFERENCES users2(id1);',
	];
	expect(sqlStatements).toStrictEqual(e);
	expect(pst).toStrictEqual(e);
});

test('fk #13', async () => {
	const users = sqliteTable('users', {
		id1: int().primaryKey(),
	});

	const users2 = sqliteTable('users2', {
		id1: int().primaryKey(),
		id2: int(),
	}, (t) => [foreignKey({ name: 'hey_fk', columns: [t.id2], foreignColumns: [users.id1] })]);

	const from = { users };
	const to = { users: users2 };

	const renames = ['users->users2'];
	const { sqlStatements } = await diff(from, to, renames);
	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to, renames });

	const e = [
		'ALTER TABLE `users` RENAME TO `users2`;',
		'ALTER TABLE `users2` ADD `id2` integer CONSTRAINT \`hey_fk\` REFERENCES users2(id1);',
	];
	expect(sqlStatements).toStrictEqual(e);
	expect(pst).toStrictEqual(e);
});

test('fk #14', async () => {
	const users = sqliteTable('users', {
		id1: int(),
		id2: int(),
	});

	const users2 = sqliteTable('users2', {
		id1: int(),
		id2: int(),
	}, (t) => [foreignKey({ name: 'hey_fk', columns: [t.id2, t.id1], foreignColumns: [users.id1, users.id1] })]);

	const from = { users };
	const to = { users: users2 };

	const renames = ['users->users2'];
	const { sqlStatements } = await diff(from, to, renames);
	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to, renames });

	const e = [
		'ALTER TABLE `users` RENAME TO `users2`;',
		'PRAGMA foreign_keys=OFF;',
		`CREATE TABLE \`__new_users2\` (
	\`id1\` integer,
	\`id2\` integer,
	CONSTRAINT \`hey_fk\` FOREIGN KEY (\`id2\`,\`id1\`) REFERENCES \`users2\`(\`id1\`,\`id1\`)
);\n`,
		'INSERT INTO `__new_users2`(`id1`, `id2`) SELECT `id1`, `id2` FROM `users2`;',
		'DROP TABLE `users2`;',
		'ALTER TABLE `__new_users2` RENAME TO `users2`;',
		'PRAGMA foreign_keys=ON;',
	];
	expect(sqlStatements).toStrictEqual(e);
	expect(pst).toStrictEqual(e);
});

test('fk #15', async () => {
	const users = sqliteTable('users', {
		id1: int(),
		id2: int(),
	});

	const users2 = sqliteTable('users2', {
		id1: int(),
		id2: int(),
	}, (t) => [foreignKey({ columns: [t.id2, t.id1], foreignColumns: [users.id1, users.id1] })]);

	const from = { users };
	const to = { users: users2 };

	const renames = ['users->users2'];
	const { sqlStatements } = await diff(from, to, renames);
	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to, renames });

	const e = [
		'ALTER TABLE `users` RENAME TO `users2`;',
		'PRAGMA foreign_keys=OFF;',
		`CREATE TABLE \`__new_users2\` (
	\`id1\` integer,
	\`id2\` integer,
	CONSTRAINT \`fk_users2_id2_id1_users_id1_id1_fk\` FOREIGN KEY (\`id2\`,\`id1\`) REFERENCES \`users2\`(\`id1\`,\`id1\`)
);\n`,
		'INSERT INTO `__new_users2`(`id1`, `id2`) SELECT `id1`, `id2` FROM `users2`;',
		'DROP TABLE `users2`;',
		'ALTER TABLE `__new_users2` RENAME TO `users2`;',
		'PRAGMA foreign_keys=ON;',
	];
	expect(sqlStatements).toStrictEqual(e);
	expect(pst).toStrictEqual(e);
});

// https://github.com/drizzle-team/drizzle-orm/issues/3653
test('fk #16', async () => {
	const services1 = sqliteTable('services', {
		id: integer().primaryKey(),
	});

	const serviceLinks1 = sqliteTable('service_links', {
		id: integer().primaryKey(),
		serviceId: integer().references(() => services1.id, { onUpdate: 'restrict', onDelete: 'cascade' }),
	});
	const schema1 = { services1, serviceLinks1 };

	const casing = 'snake_case';
	const { next: n1 } = await diff({}, schema1, [], casing);
	await push({ db, to: schema1, casing });

	const services2 = sqliteTable('services', {
		id: integer().primaryKey(),
	});

	const serviceLinks2 = sqliteTable('service_links', {
		id: integer().primaryKey(),
		clientId: integer().references(() => services2.id, { onUpdate: 'restrict', onDelete: 'cascade' }),
	});
	const schema2 = { services2, serviceLinks2 };

	const renames = ['service_links.service_id->service_links.client_id'];
	const { sqlStatements: st2 } = await diff(n1, schema2, renames, casing);
	const { sqlStatements: pst2 } = await push({ db, to: schema2, casing, renames });

	const expectedSt2 = [
		'ALTER TABLE `service_links` RENAME COLUMN `service_id` TO `client_id`;',
	];
	expect(st2).toStrictEqual(expectedSt2);
	expect(pst2).toStrictEqual(expectedSt2);
});

test('fk multistep #1', async () => {
	const users = sqliteTable('users', {
		id: int().primaryKey(),
		id2: int().references((): AnySQLiteColumn => users.id),
	});

	const users2 = sqliteTable('users2', {
		id: int('id3').primaryKey(),
		id2: int().references((): AnySQLiteColumn => users2.id),
	});

	const sch1 = { users };
	const sch2 = { users: users2 };

	const { sqlStatements: st1, next: n1 } = await diff({}, sch1, []);
	const { sqlStatements: pst1 } = await push({ db, to: sch1 });

	const e1 = [
		'CREATE TABLE \`users\` (\n\t\`id\` integer PRIMARY KEY,\n\t\`id2\` integer,' + '\n'
		+ '\tCONSTRAINT \`fk_users_id2_users_id_fk\` FOREIGN KEY (\`id2\`) REFERENCES \`users\`(\`id\`)\n);\n',
	];
	expect(st1).toStrictEqual(e1);
	expect(pst1).toStrictEqual(e1);

	const renames = ['users->users2', 'users2.id->users2.id3'];
	const { sqlStatements: st2, next: n2 } = await diff(n1, sch2, renames);
	const { sqlStatements: pst2 } = await push({ db, to: sch2, renames });

	const e2 = [
		'ALTER TABLE \`users\` RENAME TO \`users2\`;',
		'ALTER TABLE \`users2\` RENAME COLUMN \`id\` TO \`id3\`;',
	];
	expect(st2).toStrictEqual(e2);
	expect(pst2).toStrictEqual(e2);

	const { sqlStatements: st3, next: n3 } = await diff(n2, sch2, []);
	const { sqlStatements: pst3 } = await push({ db, to: sch2 });

	expect(st3).toStrictEqual([]);
	expect(pst3).toStrictEqual([]);

	const users3 = sqliteTable('users2', {
		id: int('id3').primaryKey(),
		id2: int(),
	});
	const sch3 = { users: users3 };

	const { sqlStatements: st4 } = await diff(n3, sch3, []);
	const { sqlStatements: pst4 } = await push({ db, to: sch3 });
	const e4 = [
		'PRAGMA foreign_keys=OFF;',
		`CREATE TABLE \`__new_users2\` (
	\`id3\` integer PRIMARY KEY,
	\`id2\` integer
);\n`,
		'INSERT INTO \`__new_users2\`(\`id3\`, \`id2\`) SELECT \`id3\`, \`id2\` FROM \`users2\`;',
		'DROP TABLE \`users2\`;',
		'ALTER TABLE \`__new_users2\` RENAME TO \`users2\`;',
		'PRAGMA foreign_keys=ON;',
	];
	expect(st4).toStrictEqual(e4);
	expect(pst4).toStrictEqual(e4);
});

test('fk multistep #2', async () => {
	const users = sqliteTable('users', {
		id: int().primaryKey(),
		id2: int().references((): AnySQLiteColumn => users.id),
	});

	const users2 = sqliteTable('users2', {
		id: int('id3').primaryKey(),
		id2: int().references((): AnySQLiteColumn => users2.id),
	});

	const sch1 = { users };
	const sch2 = { users: users2 };

	const { sqlStatements: st1, next: n1 } = await diff({}, sch1, []);
	const { sqlStatements: pst1 } = await push({ db, to: sch1 });

	const e1 = [
		'CREATE TABLE \`users\` (\n\t\`id\` integer PRIMARY KEY,\n\t\`id2\` integer,'
		+ '\n\tCONSTRAINT \`fk_users_id2_users_id_fk\` FOREIGN KEY (\`id2\`) REFERENCES \`users\`(\`id\`)\n);\n',
	];
	expect(st1).toStrictEqual(e1);
	expect(pst1).toStrictEqual(e1);

	const { sqlStatements: st2, next: n2 } = await diff(n1, sch2, []);
	const { sqlStatements: pst2 } = await push({ db, to: sch2 });

	const e2 = [
		'CREATE TABLE \`users2\` (\n\t\`id3\` integer PRIMARY KEY,\n\t\`id2\` integer,'
		+ '\n\tCONSTRAINT \`fk_users2_id2_users2_id3_fk\` FOREIGN KEY (\`id2\`) REFERENCES \`users2\`(\`id3\`)\n);\n',
		'DROP TABLE \`users\`;',
	];
	expect(st2).toStrictEqual(e2);
	expect(pst2).toStrictEqual(e2);

	const { sqlStatements: st3 } = await diff(n2, sch2, []);
	const { sqlStatements: pst3 } = await push({ db, to: sch2 });

	expect(st3).toStrictEqual([]);
	expect(pst3).toStrictEqual([]);
});

// https://github.com/drizzle-team/drizzle-orm/issues/3255
test('index #1', async () => {
	const table1 = sqliteTable('table1', {
		col1: integer(),
		col2: integer(),
	}, () => [
		index1,
		index2,
		index3,
		index4,
		index5,
		index6,
	]);

	const index1 = uniqueIndex('index1').on(table1.col1);
	const index2 = uniqueIndex('index2').on(table1.col1, table1.col2);
	const index3 = index('index3').on(table1.col1);
	const index4 = index('index4').on(table1.col1, table1.col2);
	const index5 = index('index5').on(sql`${table1.col1} asc`);
	const index6 = index('index6').on(sql`${table1.col1} asc`, sql`${table1.col2} desc`);

	const schema1 = { table1 };

	const { sqlStatements: st1 } = await diff({}, schema1, []);
	const { sqlStatements: pst1 } = await push({ db, to: schema1 });

	const expectedSt1 = [
		'CREATE TABLE `table1` (\n'
		+ '\t`col1` integer,\n'
		+ '\t`col2` integer\n'
		+ ');\n',
		'CREATE UNIQUE INDEX `index1` ON `table1` (`col1`);',
		'CREATE UNIQUE INDEX `index2` ON `table1` (`col1`,`col2`);',
		'CREATE INDEX `index3` ON `table1` (`col1`);',
		'CREATE INDEX `index4` ON `table1` (`col1`,`col2`);',
		'CREATE INDEX `index5` ON `table1` ("col1" asc);',
		'CREATE INDEX `index6` ON `table1` ("col1" asc,"col2" desc);',
	];
	expect(st1).toStrictEqual(expectedSt1);
	expect(pst1).toStrictEqual(expectedSt1);
});
