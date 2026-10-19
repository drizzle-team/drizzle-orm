import { describe, expect, test } from 'vitest';
import { integer, pgFunction, pgSchema, text, uuid } from '~/pg-core';
import { PgDialect } from '~/pg-core/dialect.ts';
import { getPgFunctionArgumentSQLName, getPgFunctionDeclareSQLName, PgFunctionArgument } from '~/pg-core/functions.ts';
import { sql } from '~/sql/sql.ts';

const dialect = new PgDialect();

describe('configuration', () => {
	test('uses expected defaults', () => {
		const fn = pgFunction('test_function', {
			args: {},
			returns: integer(),
		}).as(sql`SELECT 1`);

		expect(fn.config).toMatchObject({
			name: 'test_function',
			schema: undefined,
			language: 'plpgsql',
			volatility: 'volatile',
			security: 'invoker',
			nullInput: 'called',
			parallel: 'unsafe',
		});

		expect(fn.config.searchPath).toBeUndefined();
		expect(fn.config.declare).toBeUndefined();
		expect(fn.config.configuration.size).toBe(0);
	});

	test('distinguishes omitted declare from empty declare', () => {
		const withoutDeclare = pgFunction('without_declare', {
			args: {},
			returns: integer(),
		}).as(sql`SELECT 1`);

		const withEmptyDeclare = pgFunction('with_empty_declare', {
			args: {},
			declare: {},
			returns: integer(),
		}).as(sql`SELECT 1`);

		expect(withoutDeclare.config.declare).toBeUndefined();
		expect(withEmptyDeclare.config.declare).toStrictEqual({});
	});

	test('modifiers update configuration', () => {
		const fn = pgFunction('test_function', {
			args: {},
			returns: integer(),
		})
			.language('sql')
			.stable()
			.securityDefiner()
			.strict()
			.parallelSafe()
			.searchPath('internal', 'pg_temp')
			.setConfig('statement_timeout', '5s')
			.as(sql`SELECT 1`);

		expect(fn.config.language).toBe('sql');
		expect(fn.config.volatility).toBe('stable');
		expect(fn.config.security).toBe('definer');
		expect(fn.config.nullInput).toBe('strict');
		expect(fn.config.parallel).toBe('safe');
		expect(fn.config.searchPath).toStrictEqual(['internal', 'pg_temp']);
		expect(fn.config.configuration.get('statement_timeout')).toBe('5s');
	});

	test('setConfig coerces non-string values to strings', () => {
		const fn = pgFunction('test_function', {
			args: {},
			returns: integer(),
		})
			.setConfig('enable_seqscan', false)
			.setConfig('work_mem', 4096)
			.as(sql`SELECT 1`);

		expect(fn.config.configuration.get('enable_seqscan')).toBe('false');
		expect(fn.config.configuration.get('work_mem')).toBe('4096');
	});

	test('schema function preserves schema', () => {
		const internal = pgSchema('internal');

		const fn = internal.function('test_function', {
			args: {},
			returns: integer(),
		}).as(sql`SELECT 1`);

		expect(fn.config.schema).toBe('internal');
	});

	test('finalized function does not share mutable builder config', () => {
		const builder = pgFunction('test_function', {
			args: {},
			returns: integer(),
		})
			.searchPath('one')
			.setConfig('foo', 'one');

		const first = builder.as(sql`SELECT 1`);

		builder
			.searchPath('two')
			.setConfig('foo', 'two');

		const second = builder.as(sql`SELECT 2`);

		expect(first.config.searchPath).toStrictEqual(['one']);
		expect(first.config.configuration.get('foo')).toBe('one');

		expect(second.config.searchPath).toStrictEqual(['two']);
		expect(second.config.configuration.get('foo')).toBe('two');
	});
});

describe('body', () => {
	test('accepts raw SQL', () => {
		const body = sql`SELECT 1`;

		const fn = pgFunction('test_function', {
			args: {},
			returns: integer(),
		}).as(body);

		expect(fn.config.body).toBe(body);
	});

	test('callback receives argument references', () => {
		pgFunction('test_function', {
			args: {
				id: uuid(),
				count: integer(),
			},
			returns: integer(),
		}).as((f) => {
			expect(f.name).toBe('test_function');

			expect(f.args.id.name).toBe('id');
			expect(f.args.id.sqlName).toBe('test_function.id');

			expect(f.args.count.name).toBe('count');
			expect(f.args.count.sqlName).toBe('test_function.count');

			return sql`SELECT 1`;
		});
	});

	test('callback supports functions without arguments', () => {
		const fn = pgFunction('no_args', {
			args: {},
			returns: integer(),
		}).as((f) => {
			expect(f.args).toStrictEqual({});
			return sql`SELECT 1`;
		});

		expect(fn.config.args).toStrictEqual({});
	});

	test('callback omits declare references without a declare block', () => {
		pgFunction('test_function', {
			args: {},
			returns: integer(),
		}).as((f) => {
			expect(f.declare).toBeUndefined();
			return sql`SELECT 1`;
		});
	});

	test('callback receives declare references', () => {
		pgFunction('test_function', {
			args: {
				id: uuid(),
			},
			declare: {
				total: integer(),
				label: text(),
			},
			returns: integer(),
		}).as((f) => {
			expect(f.declare).toBeDefined();

			expect(f.declare!.total.name).toBe('total');
			expect(f.declare!.total.sqlName).toBe('total');

			expect(f.declare!.label.name).toBe('label');
			expect(f.declare!.label.sqlName).toBe('label');

			return sql`SELECT 1`;
		});
	});

	test('callback supports an empty declare block', () => {
		pgFunction('test_function', {
			args: {},
			declare: {},
			returns: integer(),
		}).as((f) => {
			expect(f.declare).toStrictEqual({});
			return sql`SELECT 1`;
		});
	});
});

describe('sql name helpers', () => {
	test('qualify argument names with the function name', () => {
		expect(getPgFunctionArgumentSQLName('id', 'get_user')).toBe('get_user.id');
		expect(getPgFunctionArgumentSQLName('user-id', 'test_function')).toBe('test_function.user-id');
	});

	test('use bare names for declare variables', () => {
		expect(getPgFunctionDeclareSQLName('total')).toBe('total');
		expect(getPgFunctionDeclareSQLName('running-total')).toBe('running-total');
	});
});

describe('argument references', () => {
	test('render as function-qualified identifiers without parentheses', () => {
		const fn = pgFunction('get_user', {
			args: {
				id: uuid(),
				count: integer(),
			},
			returns: text(),
		}).as((f) => sql`SELECT ${f.args.id}, ${f.args.count}`);

		const query = dialect.sqlToQuery(fn.config.body);

		expect(query.sql).toStrictEqual(
			'SELECT "get_user.id", "get_user.count"',
		);
		expect(query.params).toStrictEqual([]);
	});

	test('PgFunctionArgument omits SQL parentheses', () => {
		const arg = new PgFunctionArgument('id', 'get_user.id');

		expect(arg.shouldOmitSQLParens()).toBe(true);
	});

	test('escape SQL identifiers', () => {
		const fn = pgFunction('test_function', {
			args: {
				'user-id': text(),
			},
			returns: text(),
		}).as((f) => sql`SELECT ${f.args['user-id']}`);

		const query = dialect.sqlToQuery(fn.config.body);

		expect(query.sql).toBe('SELECT "test_function.user-id"');
	});

	test('use function name rather than schema for qualification', () => {
		const internal = pgSchema('internal');

		const fn = internal.function('schema_fn', {
			args: {
				id: uuid(),
			},
			returns: integer(),
		}).as((f) => sql`SELECT ${f.args.id}`);

		expect(fn.config.schema).toBe('internal');

		const query = dialect.sqlToQuery(fn.config.body);

		expect(query.sql).toBe('SELECT "schema_fn.id"');
	});

	test('preserve declaration order', () => {
		const names: string[] = [];

		pgFunction('test_function', {
			args: {
				first: integer(),
				second: text(),
				third: uuid(),
			},
			returns: integer(),
		}).as((f) => {
			names.push(
				f.args.first.sqlName,
				f.args.second.sqlName,
				f.args.third.sqlName,
			);

			return sql`SELECT 1`;
		});

		expect(names).toStrictEqual([
			'test_function.first',
			'test_function.second',
			'test_function.third',
		]);
	});
});

describe('declare references', () => {
	test('render declare variables as bare identifiers', () => {
		const fn = pgFunction('sum_values', {
			args: {
				id: uuid(),
			},
			declare: {
				total: integer(),
				label: text(),
			},
			returns: integer(),
		}).as((f) => sql`SELECT ${f.args.id}, ${f.declare!.total}, ${f.declare!.label}`);

		const query = dialect.sqlToQuery(fn.config.body);

		expect(query.sql).toStrictEqual(
			'SELECT "sum_values.id", "total", "label"',
		);
		expect(query.params).toStrictEqual([]);
	});

	test('escape SQL identifiers', () => {
		const fn = pgFunction('test_function', {
			args: {},
			declare: {
				'running-total': integer(),
			},
			returns: integer(),
		}).as((f) => sql`SELECT ${f.declare!['running-total']}`);

		const query = dialect.sqlToQuery(fn.config.body);

		expect(query.sql).toBe('SELECT "running-total"');
	});

	test('preserve declaration order', () => {
		const names: string[] = [];

		pgFunction('test_function', {
			args: {},
			declare: {
				first: integer(),
				second: text(),
				third: uuid(),
			},
			returns: integer(),
		}).as((f) => {
			names.push(
				f.declare!.first.sqlName,
				f.declare!.second.sqlName,
				f.declare!.third.sqlName,
			);

			return sql`SELECT 1`;
		});

		expect(names).toStrictEqual([
			'first',
			'second',
			'third',
		]);
	});

	test('finalized function clones declare definition', () => {
		const builder = pgFunction('test_function', {
			args: {},
			declare: {
				total: integer(),
			},
			returns: integer(),
		});

		const first = builder.as(sql`SELECT 1`);
		const second = builder.as(sql`SELECT 2`);

		expect(first.config.declare).not.toBe(second.config.declare);
		expect(first.config.declare).toStrictEqual(second.config.declare);
	});
});
