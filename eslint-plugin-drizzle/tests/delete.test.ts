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
			errors: [{ messageId: 'enforceDeleteWithWhere', data: { drizzleObjName: 'db' } }],
		},
		{
			code: 'this.dataSource.db.delete({})',
			errors: [{ messageId: 'enforceDeleteWithWhere', data: { drizzleObjName: 'this.dataSource.db' } }],
		},
		{
			code: 'const a = await db.delete({})',
			errors: [{ messageId: 'enforceDeleteWithWhere', data: { drizzleObjName: 'db' } }],
		},
		{
			code: 'const a = db.delete({})',
			errors: [{ messageId: 'enforceDeleteWithWhere', data: { drizzleObjName: 'db' } }],
		},
		{
			code: `const a = database
        .delete({})`,
			errors: [{ messageId: 'enforceDeleteWithWhere', data: { drizzleObjName: 'database' } }],
		},
		{
			code: `const a = getDatabase().delete({})`,
			errors: [{ messageId: 'enforceDeleteWithWhere', data: { drizzleObjName: 'getDatabase(...)' } }],
		},
		{
			code: `const a = getDatabase(arg1, arg2).delete({})`,
			errors: [{ messageId: 'enforceDeleteWithWhere', data: { drizzleObjName: 'getDatabase(...)' } }],
		},
		{
			code: `const a = getDatabase(arg1, arg2).delete({})`,
			errors: [{ messageId: 'enforceDeleteWithWhere', data: { drizzleObjName: 'getDatabase(...)' } }],
		},
		{
			code: `const a = this.dataSource.getDatabase(arg1, arg2).delete({})`,
			errors: [{ messageId: 'enforceDeleteWithWhere', data: { drizzleObjName: 'this.dataSource.getDatabase(...)' } }],
		},
		{
			code: `const a = this.getDataSource().getDatabase(arg1, arg2).delete({})`,
			errors: [{
				messageId: 'enforceDeleteWithWhere',
				data: { drizzleObjName: 'this.getDataSource(...).getDatabase(...)' },
			}],
		},
		{
			code: `const a = this.getDataSource().db.delete({})`,
			errors: [{
				messageId: 'enforceDeleteWithWhere',
				data: { drizzleObjName: 'this.getDataSource(...).db' },
			}],
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
		{
			code: `const a = getDatabase(arg1, arg2).delete({})`,
			options: [{ drizzleObjectName: 'db' }],
		},
		{
			code: `const a = this.database.getDatabase().delete({})`,
			options: [{ drizzleObjectName: 'db' }],
		},
		{
			code: `const a = this.getDataSource().getDatabase(arg1, arg2).delete({})`,
			options: [{ drizzleObjectName: 'db' }],
		},
		{
			code: `const a = this.getDataSource().db.delete({})`,
			options: [{ drizzleObjectName: 'getDataSource' }],
		},
	],
	invalid: [
		{
			code: 'db.delete({})',
			errors: [{ messageId: 'enforceDeleteWithWhere', data: { drizzleObjName: 'db' } }],
			options: [{ drizzleObjectName: 'db' }],
		},
		{
			code: 'this.database.db.delete({})',
			errors: [{ messageId: 'enforceDeleteWithWhere', data: { drizzleObjName: 'this.database.db' } }],
			options: [{ drizzleObjectName: 'db' }],
		},
		{
			code: 'const a = await db.delete({})',
			errors: [{ messageId: 'enforceDeleteWithWhere', data: { drizzleObjName: 'db' } }],
			options: [{ drizzleObjectName: 'db' }],
		},
		{
			code: 'const a = db.delete({})',
			errors: [{ messageId: 'enforceDeleteWithWhere', data: { drizzleObjName: 'db' } }],
			options: [{ drizzleObjectName: 'db' }],
		},
		{
			code: `const a = getDatabase().delete({})`,
			errors: [{ messageId: 'enforceDeleteWithWhere', data: { drizzleObjName: 'getDatabase(...)' } }],
			options: [{ drizzleObjectName: 'getDatabase' }],
		},
		{
			code: `const a = getDatabase(arg1, arg2).delete({})`,
			errors: [{ messageId: 'enforceDeleteWithWhere', data: { drizzleObjName: 'getDatabase(...)' } }],
			options: [{ drizzleObjectName: 'getDatabase' }],
		},
		{
			code: `const a = getDatabase(arg1, arg2).delete({})`,
			errors: [{ messageId: 'enforceDeleteWithWhere', data: { drizzleObjName: 'getDatabase(...)' } }],
			options: [{ drizzleObjectName: 'getDatabase' }],
		},
		{
			code: `const a = this.dataSource.getDatabase(arg1, arg2).delete({})`,
			errors: [{ messageId: 'enforceDeleteWithWhere', data: { drizzleObjName: 'this.dataSource.getDatabase(...)' } }],
			options: [{ drizzleObjectName: 'getDatabase' }],
		},
		{
			code: `const a = this.getDataSource().getDatabase(arg1, arg2).delete({})`,
			errors: [{
				messageId: 'enforceDeleteWithWhere',
				data: { drizzleObjName: 'this.getDataSource(...).getDatabase(...)' },
			}],
			options: [{ drizzleObjectName: 'getDatabase' }],
		},
		{
			code: `const a = this.getDataSource().db.delete({})`,
			errors: [{
				messageId: 'enforceDeleteWithWhere',
				data: { drizzleObjName: 'this.getDataSource(...).db' },
			}],
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
		{
			code: `const a = getDatabase(arg1, arg2).delete({})`,
			options: [{ drizzleObjectName: ['db'] }],
		},
		{
			code: `const a = this.database.getDatabase().delete({})`,
			options: [{ drizzleObjectName: ['db', 'database'] }],
		},
		{
			code: `const a = this.getDataSource().getDatabase(arg1, arg2).delete({})`,
			options: [{ drizzleObjectName: ['db', 'getDataSource'] }],
		},
		{
			code: `const a = this.getDataSource().db.delete({})`,
			options: [{ drizzleObjectName: ['getDataSource'] }],
		},
	],
	invalid: [
		{
			code: 'db.delete({})',
			errors: [{ messageId: 'enforceDeleteWithWhere', data: { drizzleObjName: 'db' } }],
			options: [{ drizzleObjectName: ['db', 'anotherName'] }],
		},
		{
			code: 'this.dataSource.db.delete({})',
			errors: [{ messageId: 'enforceDeleteWithWhere', data: { drizzleObjName: 'this.dataSource.db' } }],
			options: [{ drizzleObjectName: ['db', 'anotherName'] }],
		},
		{
			code: 'dataSource.delete({})',
			errors: [{ messageId: 'enforceDeleteWithWhere', data: { drizzleObjName: 'dataSource' } }],
			options: [{ drizzleObjectName: ['db', 'dataSource'] }],
		},
		{
			code: 'const a = await db.delete({})',
			errors: [{ messageId: 'enforceDeleteWithWhere', data: { drizzleObjName: 'db' } }],
			options: [{ drizzleObjectName: ['db'] }],
		},
		{
			code: 'const a = db.delete({})',
			errors: [{ messageId: 'enforceDeleteWithWhere', data: { drizzleObjName: 'db' } }],
			options: [{ drizzleObjectName: ['db'] }],
		},
		{
			code: `const a = getDatabase().delete({})`,
			errors: [{ messageId: 'enforceDeleteWithWhere', data: { drizzleObjName: 'getDatabase(...)' } }],
			options: [{ drizzleObjectName: ['getDatabase', 'db'] }],
		},
		{
			code: `const a = getDatabase(arg1, arg2).delete({})`,
			errors: [{ messageId: 'enforceDeleteWithWhere', data: { drizzleObjName: 'getDatabase(...)' } }],
			options: [{ drizzleObjectName: ['getDatabase', 'db'] }],
		},
		{
			code: `const a = getDatabase(arg1, arg2).delete({})`,
			errors: [{ messageId: 'enforceDeleteWithWhere', data: { drizzleObjName: 'getDatabase(...)' } }],
			options: [{ drizzleObjectName: ['getDatabase', 'db'] }],
		},
		{
			code: `const a = this.dataSource.getDatabase(arg1, arg2).delete({})`,
			errors: [{ messageId: 'enforceDeleteWithWhere', data: { drizzleObjName: 'this.dataSource.getDatabase(...)' } }],
			options: [{ drizzleObjectName: ['getDatabase', 'dataSource'] }],
		},
		{
			code: `const a = this.getDataSource().getDatabase(arg1, arg2).delete({})`,
			errors: [{
				messageId: 'enforceDeleteWithWhere',
				data: { drizzleObjName: 'this.getDataSource(...).getDatabase(...)' },
			}],
			options: [{ drizzleObjectName: ['getDatabase'] }],
		},
		{
			code: `const a = this.getDataSource().db.delete({})`,
			errors: [{
				messageId: 'enforceDeleteWithWhere',
				data: { drizzleObjName: 'this.getDataSource(...).db' },
			}],
			options: [{ drizzleObjectName: ['db'] }],
		},
	],
});
