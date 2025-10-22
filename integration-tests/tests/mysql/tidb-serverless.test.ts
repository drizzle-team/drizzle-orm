import { tidbTest as test } from './instrumentation';
import { tests } from './mysql-common';
import { runTests as cacheTests } from './mysql-common-cache';

const skip = new Set([
	// 'mySchema :: select with group by as field',
	// 'mySchema :: delete with returning all fields',
	// 'mySchema :: update with returning partial',
	// 'mySchema :: delete returning sql',
	// 'mySchema :: insert returning sql',
	// 'test $onUpdateFn and $onUpdate works updating',
	'join on aliased sql from with clause',
	'join on aliased sql from select',
	'select from raw sql with joins',
	'select from raw sql',
	'having',
	'select count()',
	'with ... select',
	// 'insert via db.execute w/ query builder',
	// 'insert via db.execute + select via db.execute',
	// 'select with group by as sql',
	// 'select with group by as field',
	// 'insert many with returning',
	// 'delete with returning partial',
	// 'delete with returning all fields',
	// 'update with returning partial',
	// 'update with returning all fields',
	// 'update returning sql',
	// 'delete returning sql',
	// 'insert returning sql',

	// not supported
	'set operations (mixed all) as function with subquery',
	'set operations (union) from query builder with subquery',
	'set operations (except all) as function',
	'set operations (except all) from query builder',
	'set operations (intersect all) as function',
	'set operations (intersect all) from query builder',
	'set operations (union all) as function',
	'set operations (union) as function',
	'tc config for datetime',
	'select iterator w/ prepared statement',
	'select iterator',
	'transaction',
	'transaction with options (set isolationLevel)',
	'Insert all defaults in multiple rows',
	'Insert all defaults in 1 row',
	'$default with empty array',
	'utc config for datetime',
]);

tests('mysql', test, skip);
// cacheTests("mysql",test)