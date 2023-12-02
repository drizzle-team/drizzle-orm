// @ts-ignore
import { RuleTester } from '@typescript-eslint/rule-tester';

import myRule from '../src/enforce-delete-with-where';

const parserResolver = require.resolve('@typescript-eslint/parser');

const ruleTester = new RuleTester({
	parser: parserResolver,
});

ruleTester.run('enforce delete with where (default options)', myRule, {
	valid: [
		'const a = db.delete({}).where({});',
		'delete db.something',
		`dataSource
      .delete()
      .where()`,
		`this.database.delete({}).where()`,
	],
	invalid: [
		{
			code: 'db.delete({})',
			errors: [{ messageId: 'enforceDeleteWithWhere' }],
		},
		{
			code: 'this.dataSource.db.delete({})',
			errors: [{ messageId: 'enforceDeleteWithWhere' }],
		},
		{
			code: 'const a = await db.delete({})',
			errors: [{ messageId: 'enforceDeleteWithWhere' }],
		},
		{
			code: 'const a = db.delete({})',
			errors: [{ messageId: 'enforceDeleteWithWhere' }],
		},
		{
			code: `const a = database
        .delete({})`,
			errors: [{ messageId: 'enforceDeleteWithWhere' }],
		},
	],
});

ruleTester.run('enforce delete with where (string option)', myRule, {
	valid: [
		{ code: 'const a = db.delete({}).where({});', options: [{ drizzleObjectName: 'db' }] },
		{ code: 'const a = this.database.db.delete({}).where({});', options: [{ drizzleObjectName: 'db' }] },
		{ code: 'const a = something.delete({})', options: [{ drizzleObjectName: 'db' }] },
		{ code: 'delete db.something', options: [{ drizzleObjectName: 'db' }] },
		{
			code: `dataSource
      .delete()
      .where()`,
			options: [{ drizzleObjectName: 'db' }],
		},
		{
			code: `const a = database
        .delete({})`,
			options: [{ drizzleObjectName: 'db' }],
		},
	],
	invalid: [
		{
			code: 'db.delete({})',
			errors: [{ messageId: 'enforceDeleteWithWhere' }],
			options: [{ drizzleObjectName: 'db' }],
		},
		{
			code: 'this.database.db.delete({})',
			errors: [{ messageId: 'enforceDeleteWithWhere' }],
			options: [{ drizzleObjectName: 'db' }],
		},
		{
			code: 'const a = await db.delete({})',
			errors: [{ messageId: 'enforceDeleteWithWhere' }],
			options: [{ drizzleObjectName: 'db' }],
		},
		{
			code: 'const a = db.delete({})',
			errors: [{ messageId: 'enforceDeleteWithWhere' }],
			options: [{ drizzleObjectName: 'db' }],
		},
	],
});

ruleTester.run('enforce delete with where (array option)', myRule, {
	valid: [
		{ code: 'const a = db.delete({}).where({});', options: [{ drizzleObjectName: ['db'] }] },
		{
			code: 'const a = this.database.dataSource.delete({}).where({});',
			options: [{ drizzleObjectName: ['db', 'dataSource'] }],
		},
		{ code: 'delete db.something', options: [{ drizzleObjectName: ['db'] }] },
		{
			code: `dataSource
      .delete()
      .where()`,
			options: [{ drizzleObjectName: ['db', 'dataSource'] }],
		},
		{
			code: `const a = database
        .delete({})`,
			options: [{ drizzleObjectName: ['db'] }],
		},
	],
	invalid: [
		{
			code: 'db.delete({})',
			errors: [{ messageId: 'enforceDeleteWithWhere' }],
			options: [{ drizzleObjectName: ['db', 'anotherName'] }],
		},
		{
			code: 'this.dataSource.db.delete({})',
			errors: [{ messageId: 'enforceDeleteWithWhere' }],
			options: [{ drizzleObjectName: ['db', 'anotherName'] }],
		},
		{
			code: 'dataSource.delete({})',
			errors: [{ messageId: 'enforceDeleteWithWhere' }],
			options: [{ drizzleObjectName: ['db', 'dataSource'] }],
		},
		{
			code: 'const a = await db.delete({})',
			errors: [{ messageId: 'enforceDeleteWithWhere' }],
			options: [{ drizzleObjectName: ['db'] }],
		},
		{
			code: 'const a = db.delete({})',
			errors: [{ messageId: 'enforceDeleteWithWhere' }],
			options: [{ drizzleObjectName: ['db'] }],
		},
	],
});
