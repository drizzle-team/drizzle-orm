//  TODO revise: there is more correct version of this test in pg-checks.test.ts named 'add check contraint to existing table', should I delete this one?
// test('add check constraint to table', async () => {
// 	const schema1 = {
// 		test: pgTable('test', {
// 			id: serial('id').primaryKey(),
// 			values: integer('values').array().default([1, 2, 3]),
// 		}),
// 	};
// 	const schema2 = {
// 		test: pgTable('test', {
// 			id: serial('id').primaryKey(),
// 			values: integer('values').array().default([1, 2, 3]),
// 		}, (table) => [
// 			check('some_check1', sql`${table.values} < 100`),
// 			check('some_check2', sql`'test' < 100`),
// 		]),
// 	};

// 	const { sqlStatements: st } = await diff(schema1, schema2, []);

// 	await push({ db, to: schema1 });
// 	const { sqlStatements: pst } = await push({
// 		db,
// 		to: schema2,
// 	});

// 	const st0: string[] = [
// 		'ALTER TABLE "test" ADD CONSTRAINT "some_check1" CHECK ("test"."values" < 100);',
// 		`ALTER TABLE "test" ADD CONSTRAINT "some_check2" CHECK ('test' < 100);`,
// 	];
// 	expect(st).toStrictEqual(st0);
// 	expect(pst).toStrictEqual(st0);
// });
