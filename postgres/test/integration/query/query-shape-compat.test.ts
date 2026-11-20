// A shape declares each column's type; the server's RowDescription says what the column really is. drizzle's shape
// comes from the schema in code, which can disagree with the database: a column changed by a migration, or a schema
// that never matched. The driver then reads the real type (src/shape-compat.ts) and gives the JS value the shape
// asked for, or throws a ShapeMismatchError. It never returns a value the database didn't hold.
//
// The rule follows the JS value the shape promises:
//   number   any integer, float or numeric column, loss accepted; an int8 beyond 2^53 throws
//   bigint   any integer column; a float or numeric column when the value is whole
//   string   the database's own text of the value
//   boolean  a numeric column as Boolean(number) does it; text t / f / true / false
//   Date     date, timestamp and timestamptz columns read as each other
// A text column is parsed strictly as the declared type. Everything else throws.
import { describe, expect } from 'bun:test';
import { ShapeMismatchError } from '../../../src/shape-compat.ts';
import { caught } from '../../helpers/db.ts';
import { test } from '../../helpers/test.ts';

describe('shape int4 (number)', () => {
	test('another integer type gives the number', async ({ c }) => {
		const res1 = await c.query('select 5::int2 as v', [], { shape: { v: 'int4' } });
		const res2 = await c.query('select 5000000000::int8 as v', [], { shape: { v: 'int4' } });
		const res3 = await c.query('select null::int8 as v', [], { shape: { v: 'int4' } });

		expect(res1.rows).toEqual([{ v: 5 }]);
		expect(res2.rows).toEqual([{ v: 5000000000 }]);
		expect(res3.rows).toEqual([{ v: null }]);
	});

	test('an int8 beyond 2^53 throws: a number cannot hold it', async ({ c }) => {
		const res1 = await caught(() => c.query('select 9007199254740993::int8 as v', [], { shape: { v: 'int4' } }));

		expect(res1).toBeInstanceOf(ShapeMismatchError);
	});

	test('a float or numeric column gives the database number, not a trimmed one', async ({ c }) => {
		const res1 = await c.query('select 1.5::float8 as v', [], { shape: { v: 'int4' } });
		const res2 = await c.query('select 0.5::float4 as v', [], { shape: { v: 'int4' } });
		const res3 = await c.query('select 1.50::numeric as v', [], { shape: { v: 'int4' } });
		const res4 = await c.query('select 12345678901234567890.123::numeric as v', [], { shape: { v: 'int4' } });
		const res5 = await c.query(`select 'NaN'::numeric as v`, [], { shape: { v: 'int4' } });

		expect(res1.rows).toEqual([{ v: 1.5 }]);
		expect(res2.rows).toEqual([{ v: 0.5 }]);
		expect(res3.rows).toEqual([{ v: 1.5 }]);
		expect(res4.rows).toEqual([{ v: 12345678901234567000 }]);
		expect(res5.rows).toEqual([{ v: NaN }]);
	});

	test('a text column is parsed as a number', async ({ c }) => {
		const res1 = await c.query(`select '42'::text as v`, [], { shape: { v: 'int4' } });
		const res2 = await c.query(`select '-7'::varchar as v`, [], { shape: { v: 'int4' } });
		const res3 = await c.query(`select '1.5'::text as v`, [], { shape: { v: 'int4' } });
		const res4 = await c.query(`select '5000000000'::text as v`, [], { shape: { v: 'int4' } });

		expect(res1.rows).toEqual([{ v: 42 }]);
		expect(res2.rows).toEqual([{ v: -7 }]);
		expect(res3.rows).toEqual([{ v: 1.5 }]);
		expect(res4.rows).toEqual([{ v: 5000000000 }]);
	});

	test('a text that is not a number throws', async ({ c }) => {
		const res1 = await caught(() => c.query(`select 'café'::text as v`, [], { shape: { v: 'int4' } }));
		const res2 = await caught(() => c.query(`select ''::text as v`, [], { shape: { v: 'int4' } }));
		const res3 = await caught(() => c.query(`select '12abc'::text as v`, [], { shape: { v: 'int4' } }));

		expect(res1).toBeInstanceOf(ShapeMismatchError);
		expect(res2).toBeInstanceOf(ShapeMismatchError);
		expect(res3).toBeInstanceOf(ShapeMismatchError);
	});

	test('a column that is not numeric or text throws', async ({ c }) => {
		const res1 = await caught(() => c.query('select true as v', [], { shape: { v: 'int4' } }));
		const res2 = await caught(() => c.query(`select '2024-02-03'::date as v`, [], { shape: { v: 'int4' } }));
		const res3 = await caught(() => c.query(`select '\\x01'::bytea as v`, [], { shape: { v: 'int4' } }));

		expect(res1).toBeInstanceOf(ShapeMismatchError);
		expect(res2).toBeInstanceOf(ShapeMismatchError);
		expect(res3).toBeInstanceOf(ShapeMismatchError);
	});

	test('a named statement gives the same values on its first run and when reused', async ({ c }) => {
		const sql = 'select 5000000000::int8 as v';

		const res1 = await c.query(sql, [], { name: 'compat_int8', shape: { v: 'int4' } });
		const res2 = await c.query(sql, [], { name: 'compat_int8', shape: { v: 'int4' } });

		expect(res1.rows).toEqual([{ v: 5000000000 }]);
		expect(res2.rows).toEqual([{ v: 5000000000 }]);
	});
});

describe('shape float8 (number)', () => {
	test('an integer, numeric or float4 column gives the number', async ({ c }) => {
		const res1 = await c.query('select 7::int4 as v', [], { shape: { v: 'float8' } });
		const res2 = await c.query('select 5000000000::int8 as v', [], { shape: { v: 'float8' } });
		const res3 = await c.query('select 0.1::numeric as v', [], { shape: { v: 'float8' } });
		const res4 = await c.query('select 0.5::float4 as v', [], { shape: { v: 'float8' } });
		const res5 = await c.query(`select '1e3'::text as v`, [], { shape: { v: 'float8' } });

		expect(res1.rows).toEqual([{ v: 7 }]);
		expect(res2.rows).toEqual([{ v: 5000000000 }]);
		expect(res3.rows).toEqual([{ v: 0.1 }]);
		expect(res4.rows).toEqual([{ v: 0.5 }]);
		expect(res5.rows).toEqual([{ v: 1000 }]);
	});

	test('an int8 beyond 2^53 throws', async ({ c }) => {
		const res1 = await caught(() => c.query('select 9007199254740993::int8 as v', [], { shape: { v: 'float8' } }));

		expect(res1).toBeInstanceOf(ShapeMismatchError);
	});
});

describe('shape int8 (bigint)', () => {
	test('another integer type gives the bigint', async ({ c }) => {
		const res1 = await c.query('select 5::int4 as v', [], { shape: { v: 'int8' } });
		const res2 = await c.query('select 5::int2 as v', [], { shape: { v: 'int8' } });

		expect(res1.rows).toEqual([{ v: 5n }]);
		expect(res2.rows).toEqual([{ v: 5n }]);
	});

	test('a whole value in a float or numeric column gives the bigint', async ({ c }) => {
		const res1 = await c.query('select 5::numeric as v', [], { shape: { v: 'int8' } });
		const res2 = await c.query('select 5.00::numeric as v', [], { shape: { v: 'int8' } });
		const res3 = await c.query('select 5::float8 as v', [], { shape: { v: 'int8' } });

		expect(res1.rows).toEqual([{ v: 5n }]);
		expect(res2.rows).toEqual([{ v: 5n }]);
		expect(res3.rows).toEqual([{ v: 5n }]);
	});

	test('a fractional value throws: a bigint cannot hold it', async ({ c }) => {
		const res1 = await caught(() => c.query('select 1.5::numeric as v', [], { shape: { v: 'int8' } }));
		const res2 = await caught(() => c.query('select 1.5::float8 as v', [], { shape: { v: 'int8' } }));
		const res3 = await caught(() => c.query(`select '1.5'::text as v`, [], { shape: { v: 'int8' } }));

		expect(res1).toBeInstanceOf(ShapeMismatchError);
		expect(res2).toBeInstanceOf(ShapeMismatchError);
		expect(res3).toBeInstanceOf(ShapeMismatchError);
	});

	test('a text of digits is parsed exactly', async ({ c }) => {
		const res1 = await c.query(`select '9007199254740993'::text as v`, [], { shape: { v: 'int8' } });

		expect(res1.rows).toEqual([{ v: 9007199254740993n }]);
	});

	test('int8:string gives the exact text of the real value', async ({ c }) => {
		const res1 = await c.query('select 5::int4 as v', [], { shape: { v: 'int8:string' } });
		const res2 = await c.query('select 1.50::numeric as v', [], { shape: { v: 'int8:string' } });
		const res3 = await c.query(`select '42'::text as v`, [], { shape: { v: 'int8:string' } });

		expect(res1.rows).toEqual([{ v: '5' }]);
		expect(res2.rows).toEqual([{ v: '1.50' }]);
		expect(res3.rows).toEqual([{ v: '42' }]);
	});
});

describe('shape numeric (exact string)', () => {
	test('an integer or float column gives the database text of the value', async ({ c }) => {
		const res1 = await c.query('select 5::int4 as v', [], { shape: { v: 'numeric' } });
		const res2 = await c.query('select 5000000000::int8 as v', [], { shape: { v: 'numeric' } });
		const res3 = await c.query('select 0.1::float8 as v', [], { shape: { v: 'numeric' } });
		const res4 = await c.query('select 1e21::float8 as v', [], { shape: { v: 'numeric' } });
		const res5 = await c.query(`select 'NaN'::float8 as v`, [], { shape: { v: 'numeric' } });

		expect(res1.rows).toEqual([{ v: '5' }]);
		expect(res2.rows).toEqual([{ v: '5000000000' }]);
		expect(res3.rows).toEqual([{ v: '0.1' }]);
		expect(res4.rows).toEqual([{ v: '1e+21' }]);
		expect(res5.rows).toEqual([{ v: 'NaN' }]);
	});

	test('a text column must hold a number', async ({ c }) => {
		const res1 = await c.query(`select '1.50'::text as v`, [], { shape: { v: 'numeric' } });
		const res2 = await caught(() => c.query(`select 'café'::text as v`, [], { shape: { v: 'numeric' } }));

		expect(res1.rows).toEqual([{ v: '1.50' }]);
		expect(res2).toBeInstanceOf(ShapeMismatchError);
	});

	test('numeric:number accepts the loss, as on a numeric column', async ({ c }) => {
		const res1 = await c.query('select 1.5::float8 as v', [], { shape: { v: 'numeric:number' } });
		const res2 = await c.query('select 7::int4 as v', [], { shape: { v: 'numeric:number' } });
		const res3 = await caught(() =>
			c.query('select 9007199254740993::int8 as v', [], { shape: { v: 'numeric:number' } })
		);

		expect(res1.rows).toEqual([{ v: 1.5 }]);
		expect(res2.rows).toEqual([{ v: 7 }]);
		expect(res3).toBeInstanceOf(ShapeMismatchError);
	});

	test('a column that is not numeric or text throws', async ({ c }) => {
		const res1 = await caught(() => c.query('select true as v', [], { shape: { v: 'numeric' } }));

		expect(res1).toBeInstanceOf(ShapeMismatchError);
	});
});

describe('shape bool', () => {
	// For now as Boolean(number). A strict mode that accepts only 0 and 1 is to come as an opt-in.
	test('a numeric column reads as Boolean(number)', async ({ c }) => {
		const res1 = await c.query('select 1::int4 as v', [], { shape: { v: 'bool' } });
		const res2 = await c.query('select 0::int4 as v', [], { shape: { v: 'bool' } });
		const res3 = await c.query('select 2::int8 as v', [], { shape: { v: 'bool' } });
		const res4 = await c.query(`select '-0'::float8 as v`, [], { shape: { v: 'bool' } });
		const res5 = await c.query(`select 'NaN'::float8 as v`, [], { shape: { v: 'bool' } });
		const res6 = await c.query('select 1.0::numeric as v', [], { shape: { v: 'bool' } });

		expect(res1.rows).toEqual([{ v: true }]);
		expect(res2.rows).toEqual([{ v: false }]);
		expect(res3.rows).toEqual([{ v: true }]);
		expect(res4.rows).toEqual([{ v: false }]);
		expect(res5.rows).toEqual([{ v: false }]);
		expect(res6.rows).toEqual([{ v: true }]);
	});

	test('a text column holding t, f, true or false', async ({ c }) => {
		const res1 = await c.query(`select 't'::text as v`, [], { shape: { v: 'bool' } });
		const res2 = await c.query(`select 'f'::text as v`, [], { shape: { v: 'bool' } });
		const res3 = await c.query(`select 'true'::text as v`, [], { shape: { v: 'bool' } });
		const res4 = await c.query(`select 'false'::text as v`, [], { shape: { v: 'bool' } });

		expect(res1.rows).toEqual([{ v: true }]);
		expect(res2.rows).toEqual([{ v: false }]);
		expect(res3.rows).toEqual([{ v: true }]);
		expect(res4.rows).toEqual([{ v: false }]);
	});

	test('any other text, or another type, throws', async ({ c }) => {
		const res1 = await caught(() => c.query(`select 'yes'::text as v`, [], { shape: { v: 'bool' } }));
		const res2 = await caught(() => c.query(`select '2024-02-03'::date as v`, [], { shape: { v: 'bool' } }));

		expect(res1).toBeInstanceOf(ShapeMismatchError);
		expect(res2).toBeInstanceOf(ShapeMismatchError);
	});
});

describe('shape text', () => {
	test('a column of another type gives the text the database prints', async ({ c }) => {
		const res1 = await c.query('select 5::int4 as v', [], { shape: { v: 'text' } });
		const res2 = await c.query('select 1e21::float8 as v', [], { shape: { v: 'text' } });
		const res3 = await c.query('select 1.50::numeric as v', [], { shape: { v: 'text' } });
		const res4 = await c.query('select true as v', [], { shape: { v: 'text' } });
		const res5 = await c.query(`select '2024-02-03'::date as v`, [], { shape: { v: 'text' } });
		const res6 = await c.query(`select '{"a":1}'::json as v`, [], { shape: { v: 'text' } });
		const res7 = await c.query(`select 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'::uuid as v`, [], {
			shape: { v: 'text' },
		});
		const res8 = await c.query(`select 'café'::varchar as v`, [], { shape: { v: 'text' } });

		expect(res1.rows).toEqual([{ v: '5' }]);
		expect(res2.rows).toEqual([{ v: '1e+21' }]);
		expect(res3.rows).toEqual([{ v: '1.50' }]);
		expect(res4.rows).toEqual([{ v: 't' }]);
		expect(res5.rows).toEqual([{ v: '2024-02-03' }]);
		expect(res6.rows).toEqual([{ v: '{"a":1}' }]);
		expect(res7.rows).toEqual([{ v: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11' }]);
		expect(res8.rows).toEqual([{ v: 'café' }]);
	});

	test('a bytea column throws: bytes have no text value', async ({ c }) => {
		const res1 = await caught(() => c.query(`select '\\x0102'::bytea as v`, [], { shape: { v: 'text' } }));

		expect(res1).toBeInstanceOf(ShapeMismatchError);
	});
});

describe('shape uuid, json and bytea', () => {
	test('uuid: a text column must hold a uuid', async ({ c }) => {
		const res1 = await c.query(`select 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'::text as v`, [], {
			shape: { v: 'uuid' },
		});
		const res2 = await caught(() => c.query(`select 'café'::text as v`, [], { shape: { v: 'uuid' } }));
		const res3 = await caught(() => c.query('select 5::int4 as v', [], { shape: { v: 'uuid' } }));

		expect(res1.rows).toEqual([{ v: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11' }]);
		expect(res2).toBeInstanceOf(ShapeMismatchError);
		expect(res3).toBeInstanceOf(ShapeMismatchError);
	});

	test('json: json, jsonb and text columns are parsed; another type throws', async ({ c }) => {
		const res1 = await c.query(`select '{"a":1}'::jsonb as v`, [], { shape: { v: 'json' } });
		const res2 = await c.query(`select '{"a":1}'::text as v`, [], { shape: { v: 'jsonb' } });
		const res3 = await caught(() => c.query('select 5::int4 as v', [], { shape: { v: 'json' } }));

		expect(res1.rows).toEqual([{ v: { a: 1 } }]);
		expect(res2.rows).toEqual([{ v: { a: 1 } }]);
		expect(res3).toBeInstanceOf(ShapeMismatchError);
	});

	test('bytea: only a bytea column', async ({ c }) => {
		const res1 = await caught(() => c.query(`select 'abc'::text as v`, [], { shape: { v: 'bytea' } }));
		const res2 = await caught(() => c.query('select 5::int4 as v', [], { shape: { v: 'bytea' } }));

		expect(res1).toBeInstanceOf(ShapeMismatchError);
		expect(res2).toBeInstanceOf(ShapeMismatchError);
	});
});

describe('shape date, timestamp and timestamptz', () => {
	test('read as each other, they give the instant as a Date', async ({ c }) => {
		const res1 = await c.query(`select '2024-02-03 12:34:56.789'::timestamp as v`, [], { shape: { v: 'date' } });
		const res2 = await c.query(`select '2024-02-03 12:34:56.789+00'::timestamptz as v`, [], { shape: { v: 'date' } });
		const res3 = await c.query(`select '2024-02-03'::date as v`, [], { shape: { v: 'timestamptz' } });
		const res4 = await c.query(`select '2024-02-03 12:34:56.789'::timestamp as v`, [], { shape: { v: 'timestamptz' } });
		const res5 = await c.query(`select '2024-02-03 12:34:56.789+00'::timestamptz as v`, [], {
			shape: { v: 'timestamp' },
		});

		expect(res1.rows).toEqual([{ v: new Date('2024-02-03T12:34:56.789Z') }]);
		expect(res2.rows).toEqual([{ v: new Date('2024-02-03T12:34:56.789Z') }]);
		expect(res3.rows).toEqual([{ v: new Date('2024-02-03T00:00:00.000Z') }]);
		expect(res4.rows).toEqual([{ v: new Date('2024-02-03T12:34:56.789Z') }]);
		expect(res5.rows).toEqual([{ v: new Date('2024-02-03T12:34:56.789Z') }]);
	});

	test(':ms gives the same instant as a number', async ({ c }) => {
		const res1 = await c.query(`select '2024-02-03'::date as v`, [], { shape: { v: 'timestamptz:ms' } });

		expect(res1.rows).toEqual([{ v: Date.UTC(2024, 1, 3) }]);
	});

	test(':string gives the text the database prints for the real type', async ({ c }) => {
		const res1 = await c.query(`select '2024-02-03'::date as v`, [], { shape: { v: 'timestamptz:string' } });
		const res2 = await c.query(`select '2024-02-03 12:34:56.789'::timestamp as v`, [], { shape: { v: 'date:string' } });

		expect(res1.rows).toEqual([{ v: '2024-02-03' }]);
		expect(res2.rows).toEqual([{ v: '2024-02-03 12:34:56.789' }]);
	});

	test('a text column is parsed as a date or timestamp', async ({ c }) => {
		const res1 = await c.query(`select '2024-02-03'::text as v`, [], { shape: { v: 'date' } });
		const res2 = await c.query(`select '2024-02-03 12:34:56.789+00'::text as v`, [], { shape: { v: 'timestamptz' } });
		const res3 = await caught(() => c.query(`select 'café'::text as v`, [], { shape: { v: 'timestamptz' } }));
		const res4 = await caught(() => c.query(`select 'café'::text as v`, [], { shape: { v: 'timestamptz:string' } }));

		expect(res1.rows).toEqual([{ v: new Date('2024-02-03T00:00:00.000Z') }]);
		expect(res2.rows).toEqual([{ v: new Date('2024-02-03T12:34:56.789Z') }]);
		expect(res3).toBeInstanceOf(ShapeMismatchError);
		expect(res4).toBeInstanceOf(ShapeMismatchError);
	});

	test('a column with no date in it throws', async ({ c }) => {
		const res1 = await caught(() => c.query('select 5::int4 as v', [], { shape: { v: 'timestamptz' } }));
		const res2 = await caught(() => c.query(`select '12:34:56'::time as v`, [], { shape: { v: 'date' } }));

		expect(res1).toBeInstanceOf(ShapeMismatchError);
		expect(res2).toBeInstanceOf(ShapeMismatchError);
	});
});

describe('shape time, interval and money', () => {
	test('a text column gives its text; another type throws', async ({ c }) => {
		const res1 = await c.query(`select '12:34:56'::text as v`, [], { shape: { v: 'time' } });
		const res2 = await caught(() => c.query('select 5::int4 as v', [], { shape: { v: 'time' } }));
		const res3 = await caught(() => c.query(`select '1 day'::interval as v`, [], { shape: { v: 'time' } }));

		expect(res1.rows).toEqual([{ v: '12:34:56' }]);
		expect(res2).toBeInstanceOf(ShapeMismatchError);
		expect(res3).toBeInstanceOf(ShapeMismatchError);
	});

	// money's text is in the server's locale format, so there is no number to read from it
	test('money is its text, and has no :number target', async ({ c }) => {
		const res1 = await c.query('select 12.5::money as v', [], { shape: { v: 'money' } });
		const res2 = await caught(() => c.query('select 12.5::money as v', [], { shape: { v: 'money:number' as never } }));

		expect(res1.rows).toEqual([{ v: '$12.50' }]);
		expect((res2 as Error).message).toContain('money has no :number target');
	});
});

describe('string targets of a mismatched type', () => {
	// A text column holding 'café' used to come back as 'cafÃ©' under numeric, uuid and timestamptz:string, and as
	// '7161117873040195584' under int8:string. It is not a value of any of those types.
	test('a text that is not a value of the declared type throws', async ({ c }) => {
		const sql = `select 'café'::text as v`;

		const res1 = await caught(() => c.query(sql, [], { shape: { v: 'int4:string' } }));
		const res2 = await caught(() => c.query(sql, [], { shape: { v: 'int8:string' } }));
		const res3 = await caught(() => c.query(sql, [], { shape: { v: 'numeric' } }));
		const res4 = await caught(() => c.query(sql, [], { shape: { v: 'uuid' } }));
		const res5 = await caught(() => c.query(sql, [], { shape: { v: 'timestamptz:string' } }));

		expect(res1).toBeInstanceOf(ShapeMismatchError);
		expect(res2).toBeInstanceOf(ShapeMismatchError);
		expect(res3).toBeInstanceOf(ShapeMismatchError);
		expect(res4).toBeInstanceOf(ShapeMismatchError);
		expect(res5).toBeInstanceOf(ShapeMismatchError);
	});
});

describe('a named statement with a shape, across DDL', () => {
	// The statement cached before the DDL fails with 0A000; the driver prepares it again and settles the shape against
	// the new column types.
	test('still works when its result type changes, and reads the new type', async ({ c }) => {
		await c.query('create temp table compat_ddl (v int4)');
		await c.query('insert into compat_ddl values (5)');
		const sql = 'select v from compat_ddl';

		const res1 = await c.query(sql, [], { name: 'compat_ddl_q', shape: { v: 'int4' } });
		await c.query('alter table compat_ddl alter column v type int8');
		await c.query('update compat_ddl set v = 5000000000');
		const res2 = await c.query(sql, [], { name: 'compat_ddl_q', shape: { v: 'int4' } });
		const res3 = await c.query(sql, [], { name: 'compat_ddl_q', shape: { v: 'int4' } });

		expect(res1.rows).toEqual([{ v: 5 }]);
		expect(res2.rows).toEqual([{ v: 5000000000 }]);
		expect(res3.rows).toEqual([{ v: 5000000000 }]);
	});

	test('still works when only the column length changes', async ({ c }) => {
		await c.query('create temp table compat_len (v varchar(10))');
		await c.query(`insert into compat_len values ('a')`);
		const sql = 'select v from compat_len';

		const res1 = await c.query(sql, [], { name: 'compat_len_q', shape: { v: 'varchar' } });
		await c.query('alter table compat_len alter column v type varchar(20)');
		const res2 = await c.query(sql, [], { name: 'compat_len_q', shape: { v: 'varchar' } });

		expect(res1.rows).toEqual([{ v: 'a' }]);
		expect(res2.rows).toEqual([{ v: 'a' }]);
	});
});
