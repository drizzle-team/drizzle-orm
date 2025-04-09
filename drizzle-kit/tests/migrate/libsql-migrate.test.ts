import { createClient } from '@libsql/client';
import { connectToLibSQL } from 'src/cli/connections';
import { expect, test } from 'vitest';

test('validate migrate function', async () => {
	const credentials = {
		url: ':memory:',
	};
	const { migrate, query } = await connectToLibSQL(credentials);

	await migrate({ migrationsFolder: 'tests/migrate/migrations' });

	const res = await query(`PRAGMA table_info("users");`);

	expect(res).toStrictEqual([{
		cid: 0,
		name: 'id',
		type: 'INTEGER',
		notnull: 0,
		dflt_value: null,
		pk: 0,
	}, {
		cid: 1,
		name: 'name',
		type: 'INTEGER',
		notnull: 1,
		dflt_value: null,
		pk: 0,
	}]);
});

// test('validate migrate function', async () => {
// 	const credentials = {
// 		url: '',
// 		authToken: '',
// 	};
// 	const { migrate, query } = await connectToLibSQL(credentials);

// 	await migrate({ migrationsFolder: 'tests/migrate/migrations' });

// 	const res = await query(`PRAGMA table_info("users");`);

// 	expect(res).toStrictEqual([{
// 		cid: 0,
// 		name: 'id',
// 		type: 'INTEGER',
// 		notnull: 0,
// 		dflt_value: null,
// 		pk: 0,
// 	}, {
// 		cid: 1,
// 		name: 'name',
// 		type: 'INTEGER',
// 		notnull: 1,
// 		dflt_value: null,
// 		pk: 0,
// 	}]);
// });
