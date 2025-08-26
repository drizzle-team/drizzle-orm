import { pgFunction, pgSchema } from 'drizzle-orm/pg-core';
import { expect, test } from 'vitest';
import { diffTestSchemas } from './schemaDiffer';

test('create function #1', async () => {
	const to = {
		test_function: pgFunction('test_function', {
			args: 'arg1 text',
			language: 'sql',
			returns: 'text',
			stability: 'stable',
			security: 'invoker',
			params: {
				search_path: 'public',
			},
			body: 'select arg1',
		}),
	};

	const { statements, sqlStatements } = await diffTestSchemas({}, to, []);

	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		type: 'create_function',
		name: 'test_function',
		schema: 'public',
		args: 'arg1 text',
		language: 'sql',
		returns: 'text',
		stability: 'stable',
		security: 'invoker',
		params: {
			search_path: 'public',
		},
		body: 'select arg1',
	});
	expect(sqlStatements[0]).toStrictEqual(
		`CREATE OR REPLACE FUNCTION "public"."test_function"(arg1 text) RETURNS text LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS
$$
select arg1
$$;`,
	);
});

test('no change function', async () => {
	const to = {
		test_function: pgFunction('test_function', {
			args: 'arg1 text',
			language: 'sql',
			returns: 'text',
			stability: 'stable',
			security: 'invoker',
			params: {
				search_path: 'public',
			},
			body: 'select arg1',
		}),
	};

	const { statements, sqlStatements } = await diffTestSchemas(to, to, []);

	expect(statements.length).toBe(0);
});

test('create and drop function', async () => {
	const from = {
		test_function_2: pgFunction('test_function_2', {
			args: 'arg1 text',
			language: 'sql',
			returns: 'text',
			stability: 'stable',
			security: 'invoker',
			params: {
				search_path: 'public',
			},
			body: 'select arg1',
		}),
	};
	const to = {
		test_function: pgFunction('test_function', {
			args: 'arg1 text',
			language: 'sql',
			returns: 'text',
			stability: 'stable',
			security: 'invoker',
			params: {
				search_path: 'public',
			},
			body: 'select arg1',
		}),
	};

	const { statements, sqlStatements } = await diffTestSchemas(from, to, []);

	expect(statements.length).toBe(2);
	expect(statements[0]).toStrictEqual({
		type: 'drop_function',
		name: 'test_function_2',
		schema: 'public',
		args: 'arg1 text',
	});
	expect(statements[1]).toStrictEqual({
		type: 'create_function',
		name: 'test_function',
		schema: 'public',
		args: 'arg1 text',
		language: 'sql',
		returns: 'text',
		stability: 'stable',
		security: 'invoker',
		params: {
			search_path: 'public',
		},
		body: 'select arg1',
	});
	expect(sqlStatements[0]).toStrictEqual(`DROP FUNCTION IF EXISTS "public"."test_function_2"(arg1 text);`);
	expect(sqlStatements[1]).toStrictEqual(
		`CREATE OR REPLACE FUNCTION "public"."test_function"(arg1 text) RETURNS text LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS
$$
select arg1
$$;`,
	);
});

test('create and drop function same name different args', async () => {
	const from = {
		test_function: pgFunction('test_function', {
			args: 'arg1 text, arg2 text',
			language: 'sql',
			returns: 'text',
			stability: 'stable',
			security: 'invoker',
			params: {
				search_path: 'public',
			},
			body: 'select arg1',
		}),
	};
	const to = {
		test_function: pgFunction('test_function', {
			args: 'arg1 text',
			language: 'sql',
			returns: 'text',
			stability: 'stable',
			security: 'invoker',
			params: {
				search_path: 'public',
			},
			body: 'select arg1',
		}),
	};

	const { statements, sqlStatements } = await diffTestSchemas(from, to, []);

	expect(statements.length).toBe(2);
	expect(statements[0]).toStrictEqual({
		type: 'drop_function',
		name: 'test_function',
		schema: 'public',
		args: 'arg1 text, arg2 text',
	});
	expect(statements[1]).toStrictEqual({
		type: 'create_function',
		name: 'test_function',
		schema: 'public',
		args: 'arg1 text',
		language: 'sql',
		returns: 'text',
		stability: 'stable',
		security: 'invoker',
		params: {
			search_path: 'public',
		},
		body: 'select arg1',
	});
	expect(sqlStatements[0]).toStrictEqual(`DROP FUNCTION IF EXISTS "public"."test_function"(arg1 text, arg2 text);`);
	expect(sqlStatements[1]).toStrictEqual(
		`CREATE OR REPLACE FUNCTION "public"."test_function"(arg1 text) RETURNS text LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS
$$
select arg1
$$;`,
	);
});
