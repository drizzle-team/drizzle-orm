// @ts-ignore
import { RuleTester } from '@typescript-eslint/rule-tester';

import myRule from '../src/enforce-update-with-where';

const parserResolver = require.resolve('@typescript-eslint/parser');

const ruleTester = new RuleTester({
	parser: parserResolver,
});

ruleTester.run('enforce update with where (default options)', myRule, {
	valid: [
		'const a = db.update({}).set().where({});',
		'const a = db.update();',
		'update()',
		`db
      .update()
      .set()
      .where()`,
		`dataSource
      .update()
      .set()
      .where()`,
		`this
      .dataSource
      .update()
      .set()
      .where()`,
	],
	invalid: [
		{
			code: 'db.update({}).set()',
			errors: [{ messageId: 'enforceUpdateWithWhere' }],
		},
		{
			code: 'this.database.db.update({}).set()',
			errors: [{ messageId: 'enforceUpdateWithWhere' }],
		},
		{
			code: 'const a = await db.update({}).set()',
			errors: [{ messageId: 'enforceUpdateWithWhere' }],
		},
		{
			code: 'const a = db.update({}).set',
			errors: [{ messageId: 'enforceUpdateWithWhere' }],
		},
		{
			code: `const a = database
        .update({})
        .set()`,
			errors: [{ messageId: 'enforceUpdateWithWhere' }],
		},
	],
});

ruleTester.run('enforce update with where (string option)', myRule, {
	valid: [
		{ code: 'const a = db.update({}).set().where({});', options: [{ drizzleObjectName: 'db' }] },
		{ code: 'const a = this.database.db.update({}).set().where({});', options: [{ drizzleObjectName: 'db' }] },
		{ code: 'update.db.update()', options: [{ drizzleObjectName: 'db' }] },
		{
			code: `dataSource
      .update()
      .set()`,
			options: [{ drizzleObjectName: 'db' }],
		},
		{
			code: `const a = database
        .update({})`,
			options: [{ drizzleObjectName: 'db' }],
		},
	],
	invalid: [
		{
			code: 'db.update({}).set({})',
			errors: [{ messageId: 'enforceUpdateWithWhere' }],
			options: [{ drizzleObjectName: 'db' }],
		},
		{
			code: 'this.dataSource.db.update({}).set({})',
			errors: [{ messageId: 'enforceUpdateWithWhere' }],
			options: [{ drizzleObjectName: 'db' }],
		},
		{
			code: 'const a = await db.update({}).set()',
			errors: [{ messageId: 'enforceUpdateWithWhere' }],
			options: [{ drizzleObjectName: 'db' }],
		},
		{
			code: 'const a = db.update({}).set()',
			errors: [{ messageId: 'enforceUpdateWithWhere' }],
			options: [{ drizzleObjectName: 'db' }],
		},
	],
});

ruleTester.run('enforce delete with where (array option)', myRule, {
	valid: [
		{ code: 'const a = db.update({}).set().where({});', options: [{ drizzleObjectName: ['db'] }] },
		{ code: 'const a = this.dataSource.db.update({}).set().where({});', options: [{ drizzleObjectName: ['db'] }] },
		{ code: 'update.db.something', options: [{ drizzleObjectName: ['db'] }] },
		{
			code: `dataSource
      .update()
      .set()
      .where()`,
			options: [{ drizzleObjectName: ['db', 'dataSource'] }],
		},
		{
			code: `const a = database
        .update({})`,
			options: [{ drizzleObjectName: ['db'] }],
		},
	],
	invalid: [
		{
			code: 'db.update({}).set()',
			errors: [{ messageId: 'enforceUpdateWithWhere' }],
			options: [{ drizzleObjectName: ['db', 'anotherName'] }],
		},
		{
			code: 'this.dataSource.db.update({}).set()',
			errors: [{ messageId: 'enforceUpdateWithWhere' }],
			options: [{ drizzleObjectName: ['db', 'anotherName'] }],
		},
		{
			code: 'dataSource.update({}).set({})',
			errors: [{ messageId: 'enforceUpdateWithWhere' }],
			options: [{ drizzleObjectName: ['db', 'dataSource'] }],
		},
		{
			code: 'const a = await db.update({}).set()',
			errors: [{ messageId: 'enforceUpdateWithWhere' }],
			options: [{ drizzleObjectName: ['db'] }],
		},
		{
			code: 'const a = db.update({}).set()',
			errors: [{ messageId: 'enforceUpdateWithWhere' }],
			options: [{ drizzleObjectName: ['db'] }],
		},
	],
});
