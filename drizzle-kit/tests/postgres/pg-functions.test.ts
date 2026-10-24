import { PGlite } from '@electric-sql/pglite';
import { sql } from 'drizzle-orm';
import {
	boolean,
	integer,
	jsonb,
	numeric,
	pgEnum,
	pgFunction,
	pgTable,
	returnsRecord,
	returnsTrigger,
	returnsVoid,
	setOf,
	tableReturn,
	text,
	timestamp,
	uuid,
	varchar,
} from 'drizzle-orm/pg-core';
import { customType } from 'drizzle-orm/pg-core';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, test } from 'vitest';
import { diff, prepareTestDatabase, push, TestDatabase } from './mocks';

fs.mkdirSync('./tests/postgres/migrations', { recursive: true });

// @vitest-environment-options {"max-concurrency":1}
let _: TestDatabase;
let db: TestDatabase['db'];
let client: TestDatabase<PGlite>['client'];

beforeAll(async () => {
	_ = await prepareTestDatabase(false); // due to migrate function from orm in tests
	db = _.db;
	client = _.client;
});

afterAll(async () => {
	await _.close();
});

beforeEach(async () => {
	await _.clear();
});

const fn1 = `CREATE FUNCTION "public"."add_numbers"(
	"a" integer,
	"b" integer
)
RETURNS integer
LANGUAGE sql
IMMUTABLE
STRICT
PARALLEL SAFE
SECURITY INVOKER
AS $function$
	SELECT "add_numbers"."a" + "add_numbers"."b"
$function$;`;

test('create function #1', async () => {
	const addNumbersInt = pgFunction('add_numbers', {
		args: {
			a: integer(),
			b: integer(),
		},
		returns: integer(),
	})
		.language('sql')
		.parallelSafe()
		.immutable()
		.strict()
		.as((f) => sql`\tSELECT ${f.args.a} + ${f.args.b}`);

	const to = { addNumbersInt };

	const { sqlStatements: st } = await diff({}, to, []);
	const { sqlStatements: pst } = await push({
		db,
		to,
		ignoreSubsequent: true,
	});

	expect(st).toStrictEqual([fn1]);
	expect(pst).toStrictEqual([fn1]);

	const result = await client.query(`SELECT add_numbers(1, 2);`);
	expect(result.rows).toStrictEqual([{ add_numbers: 3 }]);
});

const fn2 = `CREATE FUNCTION "public"."add_numbers"(
	"a" numeric,
	"b" numeric
)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
STRICT
PARALLEL SAFE
SECURITY INVOKER
AS $function$
	SELECT "add_numbers"."a" + "add_numbers"."b"
$function$;`;

test('create function #2', async () => {
	const addNumbersNumeric = pgFunction('add_numbers', {
		args: {
			a: numeric(),
			b: numeric(),
		},
		returns: numeric(),
	})
		.language('sql')
		.parallelSafe()
		.immutable()
		.strict()
		.as((f) => sql`\tSELECT ${f.args.a} + ${f.args.b}`);

	const to = { addNumbersNumeric };

	const { sqlStatements: st } = await diff({}, to, []);
	const { sqlStatements: pst } = await push({
		db,
		to,
		ignoreSubsequent: true,
	});

	expect(st).toStrictEqual([fn2]);
	expect(pst).toStrictEqual([fn2]);

	const result = await client.query(`SELECT add_numbers(1.0, 2.0);`);
	expect(result.rows).toStrictEqual([{ add_numbers: '3.0' }]);
});

test('overload functions', async () => {
	const addNumbersInt = pgFunction('add_numbers', {
		args: {
			a: integer(),
			b: integer(),
		},
		returns: integer(),
	})
		.language('sql')
		.parallelSafe()
		.immutable()
		.strict()
		.as((f) => sql`\tSELECT ${f.args.a} + ${f.args.b}`);

	const addNumbersNumeric = pgFunction('add_numbers', {
		args: {
			a: numeric(),
			b: numeric(),
		},
		returns: numeric(),
	})
		.language('sql')
		.parallelSafe()
		.immutable()
		.strict()
		.as((f) => sql`\tSELECT ${f.args.a} + ${f.args.b}`);

	const from = { addNumbersInt };
	const to = { addNumbersInt, addNumbersNumeric };

	const { sqlStatements: st } = await diff(from, to, []);
	const { sqlStatements: pst } = await push({
		db,
		to,
		ignoreSubsequent: true,
	});

	expect(st).toStrictEqual([fn2]);
	expect(pst).toStrictEqual([fn1, fn2]);

	const result = await client.query(`SELECT add_numbers(1, 2);`);
	expect(result.rows).toStrictEqual([{ add_numbers: 3 }]);

	const result2 = await client.query(`SELECT add_numbers(1.0, 2.0);`);
	expect(result2.rows).toStrictEqual([{ add_numbers: '3.0' }]);
});

const argChange = `DROP FUNCTION "public"."add_numbers"(integer, integer);
CREATE FUNCTION "public"."add_numbers"(
	"a_left" integer,
	"b_right" integer
)
RETURNS integer
LANGUAGE sql
IMMUTABLE
STRICT
PARALLEL SAFE
SECURITY INVOKER
AS $function$
	SELECT "add_numbers"."a_left" + "add_numbers"."b_right"
$function$;`;

test('change arg name', async () => {
	const addNumbersInt1 = pgFunction('add_numbers', {
		args: {
			a: integer(),
			b: integer(),
		},
		returns: integer(),
	})
		.language('sql')
		.parallelSafe()
		.immutable()
		.strict()
		.as((f) => sql`SELECT ${f.args.a} + ${f.args.b}`);

	const addNumbersInt2 = pgFunction('add_numbers', {
		args: {
			a_left: integer(),
			b_right: integer(),
		},
		returns: integer(),
	})
		.language('sql')
		.parallelSafe()
		.immutable()
		.strict()
		.as((f) => sql`\tSELECT ${f.args.a_left} + ${f.args.b_right}`);

	const from = { addNumbersInt1 };
	const to = { addNumbersInt2 };

	const { sqlStatements: st } = await diff(from, to, []);
	const { sqlStatements: pst } = await push({
		db,
		to,
		ignoreSubsequent: true,
	});

	expect(st).toStrictEqual([argChange]);
	expect(pst).toStrictEqual([argChange.split('\n').slice(1).join('\n')]); // DB doesn't include the DROP FUNCTION statement

	const result = await client.query(`SELECT add_numbers(1, 2);`);
	expect(result.rows).toStrictEqual([{ add_numbers: 3 }]);
});

const fn3 = `CREATE FUNCTION "public"."greet"(
	"a_name" text DEFAULT NULL,
	"a_prefix" text DEFAULT 'Hello'
)
RETURNS text
LANGUAGE sql
STABLE
CALLED ON NULL INPUT
PARALLEL UNSAFE
SECURITY INVOKER
AS $function$
	SELECT "greet"."a_prefix" || ', ' || COALESCE("greet"."a_name", 'guest')
$function$;`;

test('default arguments', async () => {
	const greet = pgFunction('greet', {
		args: {
			a_name: text().default(sql`NULL`),
			a_prefix: text().default('Hello'),
		},
		returns: text(),
	})
		.language('sql')
		.stable()
		.calledOnNullInput()
		.as((f) => sql`\tSELECT ${f.args.a_prefix} || ', ' || COALESCE(${f.args.a_name}, 'guest')`);

	const to = { greet };

	const { sqlStatements: st } = await diff({}, to, []);
	const { sqlStatements: pst } = await push({
		db,
		to,
		ignoreSubsequent: true,
	});

	expect(st).toStrictEqual([fn3]);
	expect(pst).toStrictEqual([fn3]);

	const result = await client.query(`SELECT greet();`);
	expect(result.rows).toStrictEqual([{ greet: 'Hello, guest' }]);

	const result2 = await client.query(`SELECT greet('John');`);
	expect(result2.rows).toStrictEqual([{ greet: 'Hello, John' }]);
});

const fn4 = `CREATE FUNCTION "public"."clamp_number"(
	"a_value" integer,
	"a_min" integer DEFAULT 0,
	"a_max" integer DEFAULT 100
)
RETURNS integer
LANGUAGE plpgsql
IMMUTABLE
CALLED ON NULL INPUT
PARALLEL UNSAFE
SECURITY INVOKER
AS $function$
DECLARE
	"v_result" integer;
BEGIN
	"v_result" := "clamp_number"."a_value";
	IF "clamp_number"."a_min" > "clamp_number"."a_max" THEN
		RAISE EXCEPTION 'min cannot exceed max';
	END IF;

	IF "v_result" < "clamp_number"."a_min" THEN
		"v_result" := "clamp_number"."a_min";
	ELSEIF "v_result" > "clamp_number"."a_max" THEN
		"v_result" := "clamp_number"."a_max";
	END IF;

	RETURN "v_result";
END;
$function$;`;

test('plpgsql function', async () => {
	const clampNumber = pgFunction('clamp_number', {
		args: {
			a_value: integer(),
			a_min: integer().default(0),
			a_max: integer().default(100),
		},
		declare: {
			v_result: integer(),
		},
		returns: integer(),
	})
		.language('plpgsql')
		.immutable()
		.as((f) =>
			sql`\t${f.declare!.v_result} := ${f.args.a_value};
	IF ${f.args.a_min} > ${f.args.a_max} THEN
		RAISE EXCEPTION 'min cannot exceed max';
	END IF;

	IF ${f.declare!.v_result} < ${f.args.a_min} THEN
		${f.declare!.v_result} := ${f.args.a_min};
	ELSEIF ${f.declare!.v_result} > ${f.args.a_max} THEN
		${f.declare!.v_result} := ${f.args.a_max};
	END IF;

	RETURN ${f.declare!.v_result};`
		);

	const to = { clampNumber };

	const { sqlStatements: st } = await diff({}, to, []);
	const { sqlStatements: pst } = await push({
		db,
		to,
		ignoreSubsequent: true,
	});

	expect(st).toStrictEqual([fn4]);
	expect(pst).toStrictEqual([fn4]);

	const result = await client.query(`SELECT clamp_number(50);`);
	expect(result.rows).toStrictEqual([{ clamp_number: 50 }]);

	const result2 = await client.query(`SELECT clamp_number(50, 0, 100);`);
	expect(result2.rows).toStrictEqual([{ clamp_number: 50 }]);

	await expect(client.query(`SELECT clamp_number(50, 100, 0);`)).rejects.toThrow();

	const result4 = await client.query(`SELECT clamp_number(50, 75, 100);`);
	expect(result4.rows).toStrictEqual([{ clamp_number: 75 }]);

	const result5 = await client.query(`SELECT clamp_number(50, 0, 25);`);
	expect(result5.rows).toStrictEqual([{ clamp_number: 25 }]);
});

const fn5 = `CREATE FUNCTION "public"."number_series"(
	"a_start" integer,
	"a_end" integer
)
RETURNS SETOF integer
LANGUAGE sql
IMMUTABLE
CALLED ON NULL INPUT
PARALLEL SAFE
SECURITY INVOKER
AS $function$
	SELECT generate_series("number_series"."a_start", "number_series"."a_end")
$function$;`;

test('setof function', async () => {
	const numberSeries = pgFunction('number_series', {
		args: {
			a_start: integer(),
			a_end: integer(),
		},
		returns: setOf(integer()),
	})
		.language('sql')
		.immutable()
		.parallelSafe()
		.as((f) => sql`\tSELECT generate_series(${f.args.a_start}, ${f.args.a_end})`);

	const to = { numberSeries };

	const { sqlStatements: st } = await diff({}, to, []);
	const { sqlStatements: pst } = await push({
		db,
		to,
		ignoreSubsequent: true,
	});

	expect(st).toStrictEqual([fn5]);
	expect(pst).toStrictEqual([fn5]);

	const result = await client.query(`SELECT * FROM number_series(1, 5);`);
	expect(result.rows).toStrictEqual([{ number_series: 1 }, { number_series: 2 }, { number_series: 3 }, {
		number_series: 4,
	}, { number_series: 5 }]);
});

const fn6 = `CREATE FUNCTION "public"."split_label"(
	"a_value" text
)
RETURNS TABLE("part" text, "value" text)
LANGUAGE sql
IMMUTABLE
CALLED ON NULL INPUT
PARALLEL SAFE
SECURITY INVOKER
AS $function$
	SELECT token, length(token)
	FROM regexp_split_to_table("split_label"."a_value", '\\s+') token;
$function$;`;

test('table function', async () => {
	const splitLabel = pgFunction('split_label', {
		args: {
			a_value: text(),
		},
		returns: tableReturn({
			part: text(),
			value: text(),
		}),
	})
		.language('sql')
		.immutable()
		.parallelSafe()
		.as((f) =>
			sql`\tSELECT token, length(token)
	FROM regexp_split_to_table(${f.args.a_value}, '\\s+') token;`
		);

	const to = { splitLabel };

	const { sqlStatements: st } = await diff({}, to, []);
	const { sqlStatements: pst } = await push({
		db,
		to,
		ignoreSubsequent: true,
	});

	expect(st).toStrictEqual([fn6]);
	expect(pst).toStrictEqual([fn6]);

	const result = await client.query(`SELECT * FROM split_label('Hello World');`);
	expect(result.rows).toStrictEqual([{ part: 'Hello', value: '5' }, { part: 'World', value: '5' }]);
});

const fn7 = `CREATE FUNCTION "public"."to_uuid_array"(
	"a_values" uuid[]
)
RETURNS uuid[]
LANGUAGE sql
IMMUTABLE
CALLED ON NULL INPUT
PARALLEL SAFE
SECURITY INVOKER
AS $function$
	SELECT COALESCE(ARRAY_AGG(value ORDER BY value), ARRAY[]::uuid[])
	FROM UNNEST("to_uuid_array"."a_values") AS value
	WHERE value IS NOT NULL;
$function$;`;

test('uuid array function', async () => {
	const toUuidArray = pgFunction('to_uuid_array', {
		args: {
			a_values: uuid().array(),
		},
		returns: uuid().array(),
	})
		.language('sql')
		.immutable()
		.parallelSafe()
		.as((f) =>
			sql`\tSELECT COALESCE(ARRAY_AGG(value ORDER BY value), ARRAY[]::uuid[])
	FROM UNNEST(${f.args.a_values}) AS value
	WHERE value IS NOT NULL;`
		);

	const to = { toUuidArray };

	const { sqlStatements: st } = await diff({}, to, []);
	const { sqlStatements: pst } = await push({
		db,
		to,
		ignoreSubsequent: true,
	});

	expect(st).toStrictEqual([fn7]);
	expect(pst).toStrictEqual([fn7]);

	const result = await client.query(
		`SELECT * FROM to_uuid_array(ARRAY['123e4567-e89b-12d3-a456-426614174000'::uuid, '123e4567-e89b-12d3-a456-426614174001'::uuid]);`,
	);
	expect(result.rows).toStrictEqual([{
		to_uuid_array: ['123e4567-e89b-12d3-a456-426614174000', '123e4567-e89b-12d3-a456-426614174001'],
	}]);
});

const fn8 = `CREATE FUNCTION "public"."set_json_flag"(
	"a_document" jsonb,
	"a_flag" boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
CALLED ON NULL INPUT
PARALLEL SAFE
SECURITY INVOKER
AS $function$
	SELECT jsonb_set(
		COALESCE("set_json_flag"."a_document", '{}'::jsonb),
		'{enabled}',
		to_jsonb("set_json_flag"."a_flag"),
		true
	);
$function$;`;

test('jsonb function', async () => {
	const setJsonFlag = pgFunction('set_json_flag', {
		args: {
			a_document: jsonb(),
			a_flag: boolean().default(true),
		},
		returns: jsonb(),
	})
		.language('sql')
		.immutable()
		.parallelSafe()
		.as((f) =>
			sql`\tSELECT jsonb_set(
		COALESCE(${f.args.a_document}, '{}'::jsonb),
		'{enabled}',
		to_jsonb(${f.args.a_flag}),
		true
	);`
		);

	const to = { setJsonFlag };

	const { sqlStatements: st } = await diff({}, to, []);
	const { sqlStatements: pst } = await push({
		db,
		to,
		ignoreSubsequent: true,
	});

	expect(st).toStrictEqual([fn8]);
	expect(pst).toStrictEqual([fn8]);

	const asJson = (value: string | Record<string, unknown>) => typeof value === 'string' ? JSON.parse(value) : value;

	const result = await client.query(`SELECT * FROM set_json_flag('{"enabled": false}', true);`);
	expect(asJson((result.rows[0] as { set_json_flag: string | Record<string, unknown> }).set_json_flag)).toEqual({
		enabled: true,
	});

	const result2 = await client.query(`SELECT * FROM set_json_flag('{"enabled": false}', false);`);
	expect(asJson((result2.rows[0] as { set_json_flag: string | Record<string, unknown> }).set_json_flag)).toEqual({
		enabled: false,
	});
});

const fn9 = `CREATE FUNCTION "public"."next_item_status"(
	"a_status" "public"."item_status"
)
RETURNS "public"."item_status"
LANGUAGE sql
IMMUTABLE
CALLED ON NULL INPUT
PARALLEL SAFE
SECURITY INVOKER
AS $function$
	SELECT CASE
		WHEN "next_item_status"."a_status" = 'active' THEN 'inactive'::item_status
		WHEN "next_item_status"."a_status" = 'inactive' THEN 'active'::item_status
		ELSE 'unknown'::item_status
	END;
$function$;`;

test('enum function', async () => {
	const itemStatus = pgEnum('item_status', ['active', 'inactive', 'unknown']);

	const itemStatusFunction = pgFunction('next_item_status', {
		args: {
			a_status: itemStatus(),
		},
		returns: itemStatus(),
	})
		.language('sql')
		.immutable()
		.parallelSafe()
		.as((f) =>
			sql`\tSELECT CASE
		WHEN ${f.args.a_status} = 'active' THEN 'inactive'::item_status
		WHEN ${f.args.a_status} = 'inactive' THEN 'active'::item_status
		ELSE 'unknown'::item_status
	END;`
		);

	const to = { itemStatus, itemStatusFunction };

	const { sqlStatements: st } = await diff({}, to, []);
	const { sqlStatements: pst } = await push({
		db,
		to,
		ignoreSubsequent: true,
	});

	expect(st.slice(1)).toStrictEqual([fn9]);
	expect(pst.slice(1)).toStrictEqual([fn9]);

	const result = await client.query(`SELECT next_item_status('active');`);
	expect(result.rows).toStrictEqual([{ next_item_status: 'inactive' }]);

	const result2 = await client.query(`SELECT next_item_status('inactive');`);
	expect(result2.rows).toStrictEqual([{ next_item_status: 'active' }]);

	const result3 = await client.query(`SELECT next_item_status('unknown');`);
	expect(result3.rows).toStrictEqual([{ next_item_status: 'unknown' }]);
});

const fn10 = `CREATE FUNCTION "public"."make_coordinate"(
	"x" integer,
	"y" integer
)
RETURNS coordinate
LANGUAGE sql
IMMUTABLE
CALLED ON NULL INPUT
PARALLEL SAFE
SECURITY INVOKER
AS $function$
	SELECT ROW("make_coordinate"."x", "make_coordinate"."y")::coordinate;
$function$;`;

test('composite type function', async () => {
	const coordinate = customType<{ data: { x: number; y: number } }>({
		dataType() {
			return 'coordinate';
		},
	});

	await client.query(`CREATE TYPE public.coordinate AS (x integer, y integer);`);

	const makeCoordinate = pgFunction('make_coordinate', {
		args: {
			x: integer(),
			y: integer(),
		},
		returns: coordinate(),
	})
		.language('sql')
		.immutable()
		.parallelSafe()
		.as((f) => sql`\tSELECT ROW(${f.args.x}, ${f.args.y})::coordinate;`);

	const to = { makeCoordinate };

	const { sqlStatements: st } = await diff({}, to, []);
	const { sqlStatements: pst } = await push({
		db,
		to,
		ignoreSubsequent: true,
	});

	expect(st).toStrictEqual([fn10]);
	expect(pst).toStrictEqual([fn10]);

	const result = await client.query(`SELECT * FROM make_coordinate(1, 2);`);
	expect(result.rows).toStrictEqual([{ x: 1, y: 2 }]);
});

const fn11 = `CREATE FUNCTION "public"."find_items"(
	"a_minimum" integer DEFAULT 0
)
RETURNS SETOF "public"."items"
LANGUAGE sql
STABLE
CALLED ON NULL INPUT
PARALLEL UNSAFE
SECURITY INVOKER
AS $function$
	SELECT *
	FROM "items"
	WHERE "items"."quantity" >= "find_items"."a_minimum"
	ORDER BY "items"."id";
$function$;`;

test('table function', async () => {
	const items = pgTable('items', {
		id: integer().primaryKey().generatedByDefaultAsIdentity(),
		label: text().notNull(),
		quantity: integer().notNull().default(0),
		tags: text().array().notNull().default([]),
		metadata: jsonb().notNull().default({}),
		modified_at: timestamp(),
	});

	const findItems = pgFunction('find_items', {
		args: {
			a_minimum: integer().default(0),
		},
		returns: setOf(items),
	})
		.language('sql')
		.stable()
		.as((f) =>
			sql`\tSELECT *
	FROM ${items}
	WHERE ${items.quantity} >= ${f.args.a_minimum}
	ORDER BY ${items.id};`
		);

	const to = { items, findItems };

	const { sqlStatements: st } = await diff({}, to, []);
	const { sqlStatements: pst } = await push({
		db,
		to,
		ignoreSubsequent: true,
	});

	expect(st.slice(1)).toStrictEqual([fn11]);
	expect(pst.slice(1)).toStrictEqual([fn11]);

	await client.query(`INSERT INTO items (label, quantity) VALUES ('Item 1', 1);`);

	const result = await client.query(`SELECT * FROM find_items(1);`);
	expect(result.rows).toStrictEqual([{
		id: 1,
		label: 'Item 1',
		quantity: 1,
		tags: [],
		metadata: {},
		modified_at: null,
	}]);
});

const fn12 = `CREATE FUNCTION "public"."safe_constant"()
RETURNS integer
LANGUAGE sql
STABLE
CALLED ON NULL INPUT
PARALLEL SAFE
SECURITY DEFINER
AS $function$
	SELECT 42;
$function$;`;

test('safe constant function', async () => {
	const safeConstant = pgFunction('safe_constant', {
		args: {},
		returns: integer(),
	})
		.language('sql')
		.stable()
		.parallelSafe()
		.securityDefiner()
		.as(() => sql`\tSELECT 42;`);

	const to = { safeConstant };

	const { sqlStatements: st } = await diff({}, to, []);
	const { sqlStatements: pst } = await push({
		db,
		to,
		ignoreSubsequent: true,
	});

	expect(st).toStrictEqual([fn12]);
	expect(pst).toStrictEqual([fn12]);

	const result = await client.query(`SELECT safe_constant();`);
	expect(result.rows).toStrictEqual([{ safe_constant: 42 }]);
});

const fn13 = `CREATE FUNCTION "public"."configured_constant"()
RETURNS integer
LANGUAGE sql
STABLE
CALLED ON NULL INPUT
PARALLEL SAFE
SECURITY INVOKER
SET search_path TO "pg_catalog", "public"
SET "statement_timeout" TO '5s'
SET "work_mem" TO '4MB'
AS $function$
	SELECT 7;
$function$;`;

test('configured constant function', async () => {
	const configuredConstant = pgFunction('configured_constant', {
		args: {},
		returns: integer(),
	})
		.language('sql')
		.stable()
		.parallelSafe()
		.searchPath('pg_catalog', 'public')
		.setConfig('statement_timeout', '5s')
		.setConfig('work_mem', '4MB')
		.as(() => sql`\tSELECT 7;`);

	const to = { configuredConstant };

	const { sqlStatements: st } = await diff({}, to, []);
	const { sqlStatements: pst } = await push({
		db,
		to,
		ignoreSubsequent: true,
	});

	expect(st).toStrictEqual([fn13]);
	expect(pst).toStrictEqual([fn13]);

	const result = await client.query(`SELECT configured_constant();`);
	expect(result.rows).toStrictEqual([{ configured_constant: 7 }]);
});

const fn14 = `CREATE FUNCTION "public"."total_lengths"(
	"a_values" text[]
)
RETURNS integer
LANGUAGE plpgsql
IMMUTABLE
CALLED ON NULL INPUT
PARALLEL UNSAFE
SECURITY INVOKER
AS $function$
DECLARE
	"v_text" text;
	"v_total" integer := 0;
BEGIN
	FOREACH "v_text" IN ARRAY "total_lengths"."a_values" LOOP
		"v_total" := "v_total" + COALESCE(length("v_text"), 0);
	END LOOP;
	RETURN "v_total";
END;
$function$;`;

test('plpgsql function, declare, array variable', async () => {
	const totalLengths = pgFunction('total_lengths', {
		args: {
			a_values: text().array(),
		},
		declare: {
			v_text: text(),
			v_total: integer().default(0),
		},
		returns: integer(),
	})
		.language('plpgsql')
		.immutable()
		.as((f) =>
			sql`\tFOREACH ${f.declare!.v_text} IN ARRAY ${f.args.a_values} LOOP
		${f.declare!.v_total} := ${f.declare!.v_total} + COALESCE(length(${f.declare!.v_text}), 0);
	END LOOP;
	RETURN ${f.declare!.v_total};`
		);

	const to = { totalLengths };

	const { sqlStatements: st } = await diff({}, to, []);
	const { sqlStatements: pst } = await push({
		db,
		to,
		ignoreSubsequent: true,
	});

	expect(st).toStrictEqual([fn14]);
	expect(pst).toStrictEqual([fn14]);

	const result = await client.query(`SELECT total_lengths('{Hello,World}');`);
	expect(result.rows).toStrictEqual([{ total_lengths: 10 }]);
});

const fn15 = `CREATE FUNCTION "public"."filtered_items"(
	"a_minimum" integer
)
RETURNS TABLE("item_id" integer, "item_label" text)
LANGUAGE plpgsql
STABLE
CALLED ON NULL INPUT
PARALLEL UNSAFE
SECURITY INVOKER
AS $function$
BEGIN
	RETURN QUERY
		SELECT "items"."id", "items"."label"
		FROM "items"
		WHERE "items"."quantity" >= "filtered_items"."a_minimum"
		ORDER BY "items"."id";
END;
$function$;`;

test('plpgsql function, return query', async () => {
	const items = pgTable('items', {
		id: integer().primaryKey().generatedByDefaultAsIdentity(),
		label: text().notNull(),
		quantity: integer().notNull().default(0),
		tags: text().array().notNull().default([]),
		metadata: jsonb().notNull().default({}),
		modified_at: timestamp(),
	});

	const filteredItems = pgFunction('filtered_items', {
		args: {
			a_minimum: integer(),
		},
		returns: tableReturn({
			item_id: integer(),
			item_label: text(),
		}),
	})
		.language('plpgsql')
		.stable()
		.as((f) =>
			sql`BEGIN
	RETURN QUERY
		SELECT ${items.id}, ${items.label}
		FROM ${items}
		WHERE ${items.quantity} >= ${f.args.a_minimum}
		ORDER BY ${items.id};
END;`
		);

	const to = { items, filteredItems };

	const { sqlStatements: st } = await diff({}, to, []);
	const { sqlStatements: pst } = await push({
		db,
		to,
		ignoreSubsequent: true,
	});

	expect(st.slice(1)).toStrictEqual([fn15]);
	expect(pst.slice(1)).toStrictEqual([fn15]);

	await client.query(`INSERT INTO items (label, quantity) VALUES ('Item 1', 1);`);

	const result = await client.query(`SELECT * FROM filtered_items(1);`);
	expect(result.rows).toStrictEqual([{ item_id: 1, item_label: 'Item 1' }]);
});

// CREATE OR REPLACE FUNCTION fn_tests.emit_notice(a_message text DEFAULT 'test')
// RETURNS void
// LANGUAGE plpgsql
// VOLATILE
// AS $function$
// BEGIN
//     RAISE NOTICE 'Function test: %', a_message;
// END;
// $function$;

const fn16 = `CREATE FUNCTION "public"."emit_notice"(
	"a_message" text DEFAULT 'test'
)
RETURNS void
LANGUAGE plpgsql
VOLATILE
CALLED ON NULL INPUT
PARALLEL UNSAFE
SECURITY INVOKER
AS $function$
BEGIN
	RAISE NOTICE 'Function test: %', "emit_notice"."a_message";
END;
$function$;`;

test('plpgsql function, raise notice, void return', async () => {
	const emitNotice = pgFunction('emit_notice', {
		args: {
			a_message: text().default('test'),
		},
		declare: {},
		returns: returnsVoid(),
	})
		.language('plpgsql')
		.volatile()
		.as((f) => sql`\tRAISE NOTICE 'Function test: %', ${f.args.a_message};`);

	const to = { emitNotice };

	const { sqlStatements: st } = await diff({}, to, []);
	const { sqlStatements: pst } = await push({
		db,
		to,
		ignoreSubsequent: true,
	});

	expect(st).toStrictEqual([fn16]);
	expect(pst).toStrictEqual([fn16]);

	const notices: string[] = [];
	const result = await client.query(`SELECT emit_notice('Hello, World!');`, [], {
		onNotice: (notice) => {
			if (!notice.message) return;
			notices.push(notice.message);
		},
	});

	// This should return void/undefined/null in real PostGreSQL, this is a testing gap with pglite as our test driver
	expect(result.rows).toStrictEqual([{ emit_notice: '' }]);
	expect(notices).toContain(`Function test: Hello, World!`);
});

const fn17 = `CREATE FUNCTION "public"."stamp_item"()
RETURNS trigger
LANGUAGE plpgsql
VOLATILE
CALLED ON NULL INPUT
PARALLEL UNSAFE
SECURITY INVOKER
AS $function$
BEGIN
	IF TG_OP = 'INSERT' THEN
		NEW.modified_at = '2026-01-01 00:00:00'::timestamp;
	END IF;
	RETURN NEW;
END;
$function$;`;

test('plpgsql function, trigger function', async () => {
	const items = pgTable('items', {
		id: integer().primaryKey().generatedByDefaultAsIdentity(),
		label: text().notNull(),
		quantity: integer().notNull().default(0),
		tags: text().array().notNull().default([]),
		metadata: jsonb().notNull().default({}),
		modified_at: timestamp(),
	});

	const stampItem = pgFunction('stamp_item', {
		args: {},
		returns: returnsTrigger(),
	})
		.language('plpgsql')
		.volatile()
		// TODO: Add trigger function context
		.as((f) =>
			sql`BEGIN
	IF TG_OP = 'INSERT' THEN
		NEW.modified_at = '2026-01-01 00:00:00'::timestamp;
	END IF;
	RETURN NEW;
END;`
		);

	const to = { items, stampItem };

	const { sqlStatements: st } = await diff({}, to, []);
	const { sqlStatements: pst } = await push({
		db,
		to,
		ignoreSubsequent: true,
	});

	expect(st.slice(1)).toStrictEqual([fn17]);
	expect(pst.slice(1)).toStrictEqual([fn17]);

	await client.query(
		`CREATE TRIGGER "items_stamp_item" BEFORE INSERT ON "items" FOR EACH ROW EXECUTE FUNCTION "public"."stamp_item"();`,
	);

	await client.query(`INSERT INTO items (label, quantity) VALUES ('Item 1', 1);`);

	const result = await client.query(`
		SELECT
			id,
			label,
			quantity,
			tags,
			metadata,
			(modified_at = TIMESTAMP '2026-01-01 00:00:00') AS modified_at_stamped
		FROM items;
	`);
	expect(result.rows).toStrictEqual([
		{
			id: 1,
			label: 'Item 1',
			quantity: 1,
			tags: [],
			metadata: {},
			modified_at_stamped: true,
		},
	]);
});

const fn18 = `CREATE FUNCTION "public"."literal_delimiter"()
RETURNS text
LANGUAGE sql
STABLE
CALLED ON NULL INPUT
PARALLEL SAFE
SECURITY INVOKER
AS $function_1$
	SELECT '$function$ appears inside this body'::text;
$function_1$;`;

test('delimiter in function body', async () => {
	const literalDelimter = pgFunction('literal_delimiter', {
		args: {},
		returns: text(),
	})
		.language('sql')
		.parallelSafe()
		.stable()
		.as((f) => sql`\tSELECT '$function$ appears inside this body'::text;`);

	const to = { literalDelimter };

	const { sqlStatements: st } = await diff({}, to, []);
	const { sqlStatements: pst } = await push({
		db,
		to,
		ignoreSubsequent: true,
	});

	expect(st).toStrictEqual([fn18]);
	expect(pst).toStrictEqual([fn18]);

	const result = await client.query(`SELECT literal_delimiter();`);
	expect(result.rows).toStrictEqual([{ literal_delimiter: '$function$ appears inside this body' }]);
});

const fn19 = `CREATE FUNCTION "public"."intentionally_forcast_delimter"()
RETURNS text
LANGUAGE sql
STABLE
CALLED ON NULL INPUT
PARALLEL SAFE
SECURITY INVOKER
AS $function_2$
	SELECT '$function$ and $function_1$ appears inside this body'::text;
$function_2$;`;

test('intentionally forcast delimter', async () => {
	const intentionallyForcastDelimter = pgFunction('intentionally_forcast_delimter', {
		args: {},
		returns: text(),
	})
		.language('sql')
		.parallelSafe()
		.stable()
		.as((f) => sql`\tSELECT '$function$ and $function_1$ appears inside this body'::text;`);

	const to = { intentionallyForcastDelimter };

	const { sqlStatements: st } = await diff({}, to, []);
	const { sqlStatements: pst } = await push({
		db,
		to,
		ignoreSubsequent: true,
	});

	expect(st).toStrictEqual([fn19]);
	expect(pst).toStrictEqual([fn19]);

	const result = await client.query(`SELECT intentionally_forcast_delimter();`);
	expect(result.rows).toStrictEqual([{
		intentionally_forcast_delimter: '$function$ and $function_1$ appears inside this body',
	}]);
});

const fn20 = `CREATE FUNCTION "public"."odd""name"(
	"a_text" text
)
RETURNS text
LANGUAGE sql
STABLE
CALLED ON NULL INPUT
PARALLEL SAFE
SECURITY INVOKER
AS $function$
	SELECT "odd""name"."a_text"::text;
$function$;`;

test('odd name', async () => {
	const oddName = pgFunction('odd"name', {
		args: {
			a_text: text(),
		},
		returns: text(),
	})
		.language('sql')
		.parallelSafe()
		.stable()
		.as((f) => sql`\tSELECT ${f.args.a_text}::text;`);

	const to = { oddName };

	const { sqlStatements: st } = await diff({}, to, []);
	const { sqlStatements: pst } = await push({
		db,
		to,
		ignoreSubsequent: true,
	});

	expect(st).toStrictEqual([fn20]);
	expect(pst).toStrictEqual([fn20]);

	const result = await client.query(`SELECT "odd""name"('Hello, World!');`);
	expect(result.rows).toStrictEqual([{ 'odd"name': 'Hello, World!' }]);
});

const fn21 = `CREATE FUNCTION "public"."make_record"(
	"a_number" integer
)
RETURNS record
LANGUAGE sql
IMMUTABLE
CALLED ON NULL INPUT
PARALLEL UNSAFE
SECURITY INVOKER
AS $function$
	SELECT "make_record"."a_number" AS number, "make_record"."a_number"::text as description;
$function$;`;

test('record return', async () => {
	const makeRecord = pgFunction('make_record', {
		args: {
			a_number: integer(),
		},
		returns: returnsRecord(),
	})
		.language('sql')
		.immutable()
		.as((f) => sql`\tSELECT ${f.args.a_number} AS number, ${f.args.a_number}::text as description;`);

	const to = { makeRecord };

	const { sqlStatements: st } = await diff({}, to, []);
	const { sqlStatements: pst } = await push({
		db,
		to,
		ignoreSubsequent: true,
	});

	expect(st).toStrictEqual([fn21]);
	expect(pst).toStrictEqual([fn21]);

	const result = await client.query(`SELECT * FROM make_record(1) as r(number integer, description text);`);
	expect(result.rows).toStrictEqual([{ number: 1, description: '1' }]);
});

const fn22 = `CREATE FUNCTION "public"."count_rows"(
	"table_name" text DEFAULT 'items'
)
RETURNS integer
LANGUAGE plpgsql
STABLE
CALLED ON NULL INPUT
PARALLEL UNSAFE
SECURITY INVOKER
AS $function$
DECLARE
	"v_count" integer;
BEGIN
	IF "count_rows"."table_name" <> 'items' THEN
		RAISE EXCEPTION 'Test table name not valid';
	END IF;

	EXECUTE format('SELECT count(*) FROM %s', "count_rows"."table_name") INTO "v_count";

	RETURN "v_count";
END;
$function$;`;

test('dynamic sql and formatting', async () => {
	const items = pgTable('items', {
		id: integer().primaryKey().generatedByDefaultAsIdentity(),
		label: text().notNull(),
		quantity: integer().notNull().default(0),
		tags: text().array().notNull().default([]),
		metadata: jsonb().notNull().default({}),
		modified_at: timestamp(),
	});

	const countRows = pgFunction('count_rows', {
		args: {
			table_name: text().default('items'),
		},
		declare: {
			v_count: integer(),
		},
		returns: integer(),
	})
		.language('plpgsql')
		.stable()
		.as((f) =>
			sql`\tIF ${f.args.table_name} <> 'items' THEN
		RAISE EXCEPTION 'Test table name not valid';
	END IF;

	EXECUTE format('SELECT count(*) FROM %s', ${f.args.table_name}) INTO ${f.declare!.v_count};

	RETURN ${f.declare!.v_count};`
		);

	const to = { items, countRows };

	const { sqlStatements: st } = await diff({}, to, []);
	const { sqlStatements: pst } = await push({
		db,
		to,
		ignoreSubsequent: true,
	});

	expect(st.slice(1)).toStrictEqual([fn22]);
	expect(pst.slice(1)).toStrictEqual([fn22]);

	await client.query(`INSERT INTO items (label, quantity) VALUES ('Item 1', 1);`);
	await client.query(`INSERT INTO items (label, quantity) VALUES ('Item 2', 2);`);

	const result = await client.query(`SELECT count_rows();`);
	expect(result.rows).toStrictEqual([{ count_rows: 2 }]);
});

const fn23 = `CREATE FUNCTION "public"."empty_path_settings"()
RETURNS text
LANGUAGE sql
VOLATILE
CALLED ON NULL INPUT
PARALLEL UNSAFE
SECURITY INVOKER
SET search_path TO ''
SET "statement_timeout" TO '1000'
AS $function$
	SELECT pg_catalog.current_setting('search_path');
$function$;`;

test('read catalog configuration', async () => {
	const emptyPathSettings = pgFunction('empty_path_settings', {
		args: {},
		returns: text(),
	})
		.language('sql')
		.searchPath()
		.setConfig('statement_timeout', 1000)
		.as((f) => sql`\tSELECT pg_catalog.current_setting('search_path');`);

	const to = { emptyPathSettings };

	const { sqlStatements: st } = await diff({}, to, []);
	const { sqlStatements: pst } = await push({
		db,
		to,
		ignoreSubsequent: true,
	});

	expect(st).toStrictEqual([fn23]);
	expect(pst).toStrictEqual([fn23]);

	const result = await client.query(`SELECT empty_path_settings();`);
	expect(result.rows).toStrictEqual([{ empty_path_settings: '""' }]);
});

/** Explicit use case tests
 *
 * Defined in this comment https://github.com/drizzle-team/drizzle-orm/pull/6467#issuecomment-6142364390
 *
 * Test cases 1-6 are testable in this file.
 * Case 7 is an introspection test.
 * Case 8 is a more complicated multi object dependency test, will be added in a follow-up.
 */

/** 1. Overload Identity */

const fn24 = `CREATE FUNCTION "public"."text_args"(
	"a_text" text
)
RETURNS text
LANGUAGE sql
STABLE
CALLED ON NULL INPUT
PARALLEL SAFE
SECURITY INVOKER
AS $function$
	SELECT "text_args"."a_text"::text;
$function$;`;

const fn24Replace = `CREATE OR REPLACE FUNCTION "public"."text_args"(
	"a_text" text
)
RETURNS text
LANGUAGE sql
STABLE
CALLED ON NULL INPUT
PARALLEL SAFE
SECURITY INVOKER
AS $function$
	SELECT upper("text_args"."a_text")::text;
$function$;`;

const fn24Drop = `DROP FUNCTION "public"."text_args"(text);`;

const fn24UpdatedArgs = `CREATE FUNCTION "public"."text_args"(
	"a_label" text
)
RETURNS text
LANGUAGE sql
STABLE
CALLED ON NULL INPUT
PARALLEL SAFE
SECURITY INVOKER
AS $function$
	SELECT "text_args"."a_label"::text;
$function$;`;

const fn25 = `CREATE FUNCTION "public"."var_char_args"(
	"a_var_char" varchar
)
RETURNS varchar
LANGUAGE sql
STABLE
CALLED ON NULL INPUT
PARALLEL SAFE
SECURITY INVOKER
AS $function$
	SELECT "var_char_args"."a_var_char"::varchar;
$function$;`;

describe('overload identity', () => {
	const textArgs = pgFunction('text_args', {
		args: {
			a_text: text(),
		},
		returns: text(),
	})
		.language('sql')
		.stable()
		.parallelSafe()
		.as((f) => sql`\tSELECT ${f.args.a_text}::text;`);

	const varCharArgs = pgFunction('var_char_args', {
		args: {
			a_var_char: varchar(),
		},
		returns: varchar(),
	})
		.language('sql')
		.stable()
		.parallelSafe()
		.as((f) => sql`\tSELECT ${f.args.a_var_char}::varchar;`);

	const textArgsBodyUpdated = pgFunction('text_args', {
		args: {
			a_text: text(),
		},
		returns: text(),
	})
		.language('sql')
		.stable()
		.parallelSafe()
		.as((f) => sql`\tSELECT upper(${f.args.a_text})::text;`);

	it('adds both functions if they both exist', async () => {
		const to = { textArgs, varCharArgs };

		const { sqlStatements: st } = await diff({}, to, []);

		expect(st).toStrictEqual([fn24, fn25]);
	});

	it('adds only the new overload when the first identity already exists', async () => {
		const from = { textArgs };
		const to = { textArgs, varCharArgs };

		const { sqlStatements: st } = await diff(from, to, []);

		expect(st).toStrictEqual([fn25]);
	});

	it('replaces the function in place when identity is unchanged', async () => {
		const from = { textArgs };
		const to = { textArgsBodyUpdated };

		const { sqlStatements: st } = await diff(from, to, []);

		expect(st).toStrictEqual([fn24Replace]);
	});
});

/** 2. `DROP` then `CREATE` on identity changes */

describe('drop and create on identity changes', () => {
	const textArgs = pgFunction('text_args', {
		args: {
			a_text: text(),
		},
		returns: text(),
	})
		.language('sql')
		.stable()
		.parallelSafe()
		.as((f) => sql`\tSELECT ${f.args.a_text}::text;`);

	const varCharArgs = pgFunction('var_char_args', {
		args: {
			a_var_char: varchar(),
		},
		returns: varchar(),
	})
		.language('sql')
		.stable()
		.parallelSafe()
		.as((f) => sql`\tSELECT ${f.args.a_var_char}::varchar;`);

	const textArgsRenamedArg = pgFunction('text_args', {
		args: {
			a_label: text(),
		},
		returns: text(),
	})
		.language('sql')
		.stable()
		.parallelSafe()
		.as((f) => sql`\tSELECT ${f.args.a_label}::text;`);

	it('creates the function when adding it to an empty schema', async () => {
		const to = { textArgs };

		const { sqlStatements: st } = await diff({}, to, []);

		expect(st).toStrictEqual([fn24]);
	});

	it('drops the old function and creates the new one when the export is replaced', async () => {
		const from = { textArgs };
		const to = { varCharArgs };

		const { sqlStatements: st } = await diff(from, to, []);

		expect(st).toStrictEqual([fn25, fn24Drop]);
	});

	it('drops and recreates when argument names change', async () => {
		const from = { textArgs };
		const to = { textArgsRenamedArg };

		const { sqlStatements: st } = await diff(from, to, []);

		expect(st).toStrictEqual([`${fn24Drop}\n${fn24UpdatedArgs}`]);
	});
});

const atttributeDriftBaseFn = `CREATE FUNCTION "public"."base_function"(
	"a_text" text
)
RETURNS text
LANGUAGE plpgsql
VOLATILE
CALLED ON NULL INPUT
PARALLEL UNSAFE
SECURITY INVOKER
AS $function$
BEGIN
	RETURN "base_function"."a_text"::text;
END;
$function$;`;

/** 3. Attribute Drift */
describe('attribute drift', async () => {
	let baseFunction = pgFunction('base_function', {
		args: {
			a_text: text(),
		},
		declare: {},
		returns: text(),
	})
		.language('plpgsql')
		.volatile()
		.securityInvoker()
		.calledOnNullInput()
		.parallelUnsafe();

	// Reset the function to the original state after each test
	afterEach(() => {
		baseFunction = pgFunction('base_function', {
			args: {
				a_text: text(),
			},
			declare: {},
			returns: text(),
		})
			.language('plpgsql')
			.volatile()
			.securityInvoker()
			.calledOnNullInput()
			.parallelUnsafe();
	});

	it('adds the function when adding to an empty db', async () => {
		const fn = baseFunction.as((f) => sql`\tRETURN ${f.args.a_text}::text;`);
		const to = { fn };

		const { sqlStatements: st } = await diff({}, to, []);
		const { sqlStatements: pst } = await push({
			db,
			to,
			ignoreSubsequent: true,
		});

		expect(st).toStrictEqual([atttributeDriftBaseFn]);
		expect(pst).toStrictEqual([atttributeDriftBaseFn]);

		const result = await client.query(`SELECT base_function('Hello, World!');`);
		expect(result.rows).toStrictEqual([{ base_function: 'Hello, World!' }]);
	});

	it('create or replaces the function when the body changes', async () => {
		const fnBefore = baseFunction.as((f) => sql`\tRETURN ${f.args.a_text}::text;`);
		const fnAfter = baseFunction.as((f) => sql`\tRETURN upper(${f.args.a_text})::text;`);

		const from = { fnBefore };
		const to = { fnAfter };

		const { sqlStatements: st } = await diff(from, to, []);
		const { sqlStatements: pst } = await push({
			db,
			to,
			ignoreSubsequent: true,
		});

		expect(st).toStrictEqual([
			atttributeDriftBaseFn.replace('CREATE FUNCTION', 'CREATE OR REPLACE FUNCTION').replace(
				'\tRETURN "base_function"."a_text"::text;',
				'\tRETURN upper("base_function"."a_text")::text;',
			),
		]);
		expect(pst).toStrictEqual([
			atttributeDriftBaseFn.replace(
				'\tRETURN "base_function"."a_text"::text;',
				'\tRETURN upper("base_function"."a_text")::text;',
			),
		]);

		const result = await client.query(`SELECT base_function('Hello, World!');`);
		expect(result.rows).toStrictEqual([{ base_function: 'HELLO, WORLD!' }]);
	});

	it('creates or replaces the function when volatility changes', async () => {
		const fnBefore = baseFunction.volatile().as((f) => sql`\tRETURN ${f.args.a_text}::text;`);
		const fnAfter = baseFunction.stable().as((f) => sql`\tRETURN ${f.args.a_text}::text;`);

		const from = { fnBefore };
		const to = { fnAfter };

		const { sqlStatements: st } = await diff(from, to, []);

		expect(st).toStrictEqual([
			atttributeDriftBaseFn.replace('CREATE FUNCTION', 'CREATE OR REPLACE FUNCTION').replace('VOLATILE', 'STABLE'),
		]);
	});

	it('creates or replaces the function when security changes', async () => {
		const fnBefore = baseFunction.securityInvoker().as((f) => sql`\tRETURN ${f.args.a_text}::text;`);
		const fnAfter = baseFunction.securityDefiner().as((f) => sql`\tRETURN ${f.args.a_text}::text;`);

		const from = { fnBefore };
		const to = { fnAfter };

		const { sqlStatements: st } = await diff(from, to, []);

		expect(st).toStrictEqual([
			atttributeDriftBaseFn.replace('CREATE FUNCTION', 'CREATE OR REPLACE FUNCTION').replace(
				'SECURITY INVOKER',
				'SECURITY DEFINER',
			),
		]);
	});

	it('creates or replaces the function when null input changes', async () => {
		const fnBefore1 = baseFunction.calledOnNullInput().as((f) => sql`\tRETURN ${f.args.a_text}::text;`);
		const fnAfter1 = baseFunction.returnedOnNullInput().as((f) => sql`\tRETURN ${f.args.a_text}::text;`);

		const from1 = { fnBefore1 };
		const to1 = { fnAfter1 };

		const { sqlStatements: st1 } = await diff(from1, to1, []);

		expect(st1).toStrictEqual([
			atttributeDriftBaseFn.replace('CREATE FUNCTION', 'CREATE OR REPLACE FUNCTION').replace(
				'CALLED ON NULL INPUT',
				'RETURNS NULL ON NULL INPUT',
			),
		]);

		const fnBefore2 = fnAfter1;
		const fnAfter2 = baseFunction.strict().as((f) => sql`\tRETURN ${f.args.a_text}::text;`);

		const from2 = { fnBefore2 };
		const to2 = { fnAfter2 };

		const { sqlStatements: st2 } = await diff(from2, to2, []);

		expect(st2).toStrictEqual([
			atttributeDriftBaseFn.replace('CREATE FUNCTION', 'CREATE OR REPLACE FUNCTION').replace(
				'CALLED ON NULL INPUT',
				'STRICT',
			),
		]);
	});

	it('creates or replaces the function when parallel changes', async () => {
		const fnBefore1 = baseFunction.parallelUnsafe().as((f) => sql`\tRETURN ${f.args.a_text}::text;`);
		const fnAfter1 = baseFunction.parallelSafe().as((f) => sql`\tRETURN ${f.args.a_text}::text;`);

		const from1 = { fnBefore1 };
		const to1 = { fnAfter1 };

		const { sqlStatements: st1 } = await diff(from1, to1, []);

		expect(st1).toStrictEqual([
			atttributeDriftBaseFn.replace('CREATE FUNCTION', 'CREATE OR REPLACE FUNCTION').replace(
				'PARALLEL UNSAFE',
				'PARALLEL SAFE',
			),
		]);

		const fnBefore2 = fnAfter1;
		const fnAfter2 = baseFunction.parallelRestricted().as((f) => sql`\tRETURN ${f.args.a_text}::text;`);

		const from2 = { fnBefore2 };
		const to2 = { fnAfter2 };

		const { sqlStatements: st2 } = await diff(from2, to2, []);

		expect(st2).toStrictEqual([
			atttributeDriftBaseFn.replace('CREATE FUNCTION', 'CREATE OR REPLACE FUNCTION').replace(
				'PARALLEL UNSAFE',
				'PARALLEL RESTRICTED',
			),
		]);
	});

	it('creates or replaces the function when search path changes', async () => {
		const fnBefore1 = baseFunction.as((f) => sql`\tRETURN ${f.args.a_text}::text;`);
		const fnAfter1 = baseFunction.searchPath('public').as((f) => sql`\tRETURN ${f.args.a_text}::text;`);

		const from1 = { fnBefore1 };
		const to1 = { fnAfter1 };

		const { sqlStatements: st1 } = await diff(from1, to1, []);

		expect(st1).toStrictEqual([
			atttributeDriftBaseFn.replace('CREATE FUNCTION', 'CREATE OR REPLACE FUNCTION').replace(
				'SECURITY INVOKER',
				'SECURITY INVOKER\nSET search_path TO "public"',
			),
		]);

		const fnBefore2 = fnAfter1;
		const fnAfter2 = baseFunction.searchPath('public', 'other').as((f) => sql`\tRETURN ${f.args.a_text}::text;`);

		const from2 = { fnBefore2 };
		const to2 = { fnAfter2 };

		const { sqlStatements: st2 } = await diff(from2, to2, []);

		expect(st2).toStrictEqual([
			atttributeDriftBaseFn.replace('CREATE FUNCTION', 'CREATE OR REPLACE FUNCTION').replace(
				'SECURITY INVOKER',
				'SECURITY INVOKER\nSET search_path TO "public", "other"',
			),
		]);
	});

	it('creates or replaces the function when configuration changes', async () => {
		const fnBefore1 = baseFunction.as((f) => sql`\tRETURN ${f.args.a_text}::text;`);
		const fnAfter1 = baseFunction.setConfig('application_name', 'my_app').as((f) =>
			sql`\tRETURN ${f.args.a_text}::text;`
		);

		const from1 = { fnBefore1 };
		const to1 = { fnAfter1 };

		const { sqlStatements: st1 } = await diff(from1, to1, []);

		expect(st1).toStrictEqual([
			atttributeDriftBaseFn.replace('CREATE FUNCTION', 'CREATE OR REPLACE FUNCTION').replace(
				'SECURITY INVOKER',
				'SECURITY INVOKER\nSET "application_name" TO \'my_app\'',
			),
		]);

		const fnBefore2 = fnAfter1;
		const fnAfter2 = baseFunction.setConfig('query_timeout', 10000).as((f) => sql`\tRETURN ${f.args.a_text}::text;`);

		const from2 = { fnBefore2 };
		const to2 = { fnAfter2 };

		const { sqlStatements: st2 } = await diff(from2, to2, []);

		expect(st2).toStrictEqual([
			atttributeDriftBaseFn.replace('CREATE FUNCTION', 'CREATE OR REPLACE FUNCTION').replace(
				'SECURITY INVOKER',
				'SECURITY INVOKER\nSET "application_name" TO \'my_app\'\nSET "query_timeout" TO \'10000\'',
			),
		]);
	});
});

/** 4. Idempotency */

test('idempotency', async () => {
	const textArgs = pgFunction('text_args', {
		args: {
			a_text: text(),
		},
		returns: text(),
	})
		.language('sql')
		.stable()
		.parallelSafe()
		.as((f) => sql`\tSELECT ${f.args.a_text}::text;`);

	const from = { textArgs };
	const to = { textArgs };

	const { sqlStatements: st } = await diff(from, to, []);

	expect(st).toStrictEqual([]);
});

/** 5. Nest $$ */

describe('nested $$', async () => {
	it('handles delimiters in fn body', async () => {
		const literalDelimter = pgFunction('literal_delimiter', {
			args: {},
			returns: text(),
		})
			.language('sql')
			.parallelSafe()
			.stable()
			.as((f) => sql`\tSELECT '$function$ appears inside this body'::text;`);

		const to = { literalDelimter };

		const { sqlStatements: st } = await diff({}, to, []);
		const { sqlStatements: pst } = await push({
			db,
			to,
			ignoreSubsequent: true,
		});

		expect(st).toStrictEqual([fn18]);
		expect(pst).toStrictEqual([fn18]);

		const result = await client.query(`SELECT literal_delimiter();`);
		expect(result.rows).toStrictEqual([{ literal_delimiter: '$function$ appears inside this body' }]);
	});

	it('handles forecasted delimiters in fn body', async () => {
		const intentionallyForcastDelimter = pgFunction('intentionally_forcast_delimter', {
			args: {},
			returns: text(),
		})
			.language('sql')
			.parallelSafe()
			.stable()
			.as((f) => sql`\tSELECT '$function$ and $function_1$ appears inside this body'::text;`);

		const to = { intentionallyForcastDelimter };

		const { sqlStatements: st } = await diff({}, to, []);
		const { sqlStatements: pst } = await push({
			db,
			to,
			ignoreSubsequent: true,
		});

		expect(st).toStrictEqual([fn19]);
		expect(pst).toStrictEqual([fn19]);

		const result = await client.query(`SELECT intentionally_forcast_delimter();`);
		expect(result.rows).toStrictEqual([{
			intentionally_forcast_delimter: '$function$ and $function_1$ appears inside this body',
		}]);
	});
});

/** 6. Multiple Functions */

const multipleFnTextArgs = `CREATE FUNCTION "public"."text_args"(
	"a_text" text
)
RETURNS text
LANGUAGE sql
STABLE
CALLED ON NULL INPUT
PARALLEL SAFE
SECURITY INVOKER
AS $function$
	SELECT "text_args"."a_text"::text;
$function$;`;

const multipleFnIntArgs = `CREATE FUNCTION "public"."int_args"(
	"a_int" integer
)
RETURNS text
LANGUAGE sql
STABLE
CALLED ON NULL INPUT
PARALLEL SAFE
SECURITY INVOKER
AS $function$
	SELECT "int_args"."a_int"::text;
$function$;`;

const multipleFnBoolArgs = `CREATE FUNCTION "public"."bool_args"(
	"a_bool" boolean
)
RETURNS text
LANGUAGE sql
STABLE
CALLED ON NULL INPUT
PARALLEL SAFE
SECURITY INVOKER
AS $function$
	SELECT "bool_args"."a_bool"::text;
$function$;`;

test('multiple functions', async () => {
	const textArgs = pgFunction('text_args', {
		args: {
			a_text: text(),
		},
		returns: text(),
	})
		.language('sql')
		.stable()
		.parallelSafe()
		.as((f) => sql`\tSELECT ${f.args.a_text}::text;`);

	const intArgs = pgFunction('int_args', {
		args: {
			a_int: integer(),
		},
		returns: text(),
	})
		.language('sql')
		.stable()
		.parallelSafe()
		.as((f) => sql`\tSELECT ${f.args.a_int}::text;`);

	const boolArgs = pgFunction('bool_args', {
		args: {
			a_bool: boolean(),
		},
		returns: text(),
	})
		.language('sql')
		.stable()
		.parallelSafe()
		.as((f) => sql`\tSELECT ${f.args.a_bool}::text;`);

	const to = { textArgs, intArgs, boolArgs };

	const { sqlStatements: st } = await diff({}, to, []);

	expect(st).toStrictEqual([multipleFnTextArgs, multipleFnIntArgs, multipleFnBoolArgs]);
});
