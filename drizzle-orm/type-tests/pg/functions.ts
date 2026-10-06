import {
	bigint,
	bigserial,
	boolean,
	char,
	cidr,
	customType,
	date,
	decimal,
	doublePrecision,
	inet,
	integer,
	interval,
	json,
	jsonb,
	line,
	macaddr,
	macaddr8,
	numeric,
	pgEnum,
	point,
	real,
	serial,
	smallint,
	smallserial,
	text,
	time,
	timestamp,
	uuid,
	varchar,
} from '~/pg-core/index.ts';
import { sql } from '~/sql/sql.ts';

import {
	type InferFunctionArgs,
	type InferFunctionReturns,
	pgFunction,
	returnsRecord,
	returnsTrigger,
	returnsVoid,
	setOf,
	tableReturn,
} from '~/pg-core/functions.ts';

import { type Equal, Expect } from 'type-tests/utils.ts';

import { pgTable } from '~/pg-core/table.ts';

/** Arguments */
/** Expect basic types to resolve correctly */
const basicTypesArgs = {
	bigint: bigint({ mode: 'number' }),
	bigserial: bigserial({ mode: 'number' }),
	boolean: boolean(),
	char: char(),
	cidr: cidr(),
	date: date({ mode: 'date' }),
	decimal: decimal({ precision: 100, scale: 2 }),
	doublePrecision: doublePrecision(),
	inet: inet(),
	integer: integer(),
	interval: interval(),
	line: line(),
	macaddr: macaddr(),
	macaddr8: macaddr8(),
	numeric: numeric(),
	point: point(),
	real: real(),
	serial: serial(),
	smallint: smallint(),
	smallserial: smallserial(),
	text: text(),
	time: time(),
	timestamp: timestamp(),
	uuid: uuid(),
	varchar: varchar(),
};

const basicTypesTestFunction = pgFunction('basic_types_test_function', {
	args: basicTypesArgs,
	returns: integer(),
}).as(sql`SELECT 1`);

type BasicTypesTestFunctionArgs = InferFunctionArgs<typeof basicTypesTestFunction>;

Expect<Equal<BasicTypesTestFunctionArgs['bigint'], number>>;
Expect<Equal<BasicTypesTestFunctionArgs['bigserial'], number>>;
Expect<Equal<BasicTypesTestFunctionArgs['boolean'], boolean>>;
Expect<Equal<BasicTypesTestFunctionArgs['char'], string>>;
Expect<Equal<BasicTypesTestFunctionArgs['cidr'], string>>;
Expect<Equal<BasicTypesTestFunctionArgs['date'], Date>>;
Expect<Equal<BasicTypesTestFunctionArgs['decimal'], string>>;
Expect<Equal<BasicTypesTestFunctionArgs['doublePrecision'], number>>;
Expect<Equal<BasicTypesTestFunctionArgs['inet'], string>>;
Expect<Equal<BasicTypesTestFunctionArgs['integer'], number>>;
Expect<Equal<BasicTypesTestFunctionArgs['interval'], string>>;
Expect<Equal<BasicTypesTestFunctionArgs['line'], [number, number, number]>>;
Expect<Equal<BasicTypesTestFunctionArgs['macaddr'], string>>;
Expect<Equal<BasicTypesTestFunctionArgs['macaddr8'], string>>;
Expect<Equal<BasicTypesTestFunctionArgs['numeric'], string>>;
Expect<Equal<BasicTypesTestFunctionArgs['point'], [number, number]>>;
Expect<Equal<BasicTypesTestFunctionArgs['real'], number>>;
Expect<Equal<BasicTypesTestFunctionArgs['serial'], number>>;
Expect<Equal<BasicTypesTestFunctionArgs['smallint'], number>>;
Expect<Equal<BasicTypesTestFunctionArgs['smallserial'], number>>;
Expect<Equal<BasicTypesTestFunctionArgs['text'], string>>;
Expect<Equal<BasicTypesTestFunctionArgs['time'], string>>;
Expect<Equal<BasicTypesTestFunctionArgs['timestamp'], Date>>;
Expect<Equal<BasicTypesTestFunctionArgs['uuid'], string>>;
Expect<Equal<BasicTypesTestFunctionArgs['varchar'], string>>;

/** Expect arrays to resolve correctly */
const arrayTestFunction = pgFunction('array_test_function', {
	args: {
		numbers: integer('numbers').array(),
	},
	returns: integer(),
}).as(sql`SELECT 1`);

type ArrayTestFunctionArgs = InferFunctionArgs<typeof arrayTestFunction>;

Expect<Equal<ArrayTestFunctionArgs['numbers'], number[]>>;

/** Expect json and jsonb to resolve correctly with and without a custom type */

const jsonTestFunction = pgFunction('json_test_function', {
	args: {
		json: json(),
		jsonb: jsonb(),
		jsonCustom: json().$type<{ attr: string }>(),
		jsonbCustom: jsonb().$type<{ attr: string }>(),
	},
	returns: json(),
}).as(sql`SELECT '{"attr": "value"}'::json`);

type JsonTestFunctionArgs = InferFunctionArgs<typeof jsonTestFunction>;

Expect<Equal<JsonTestFunctionArgs['json'], unknown>>;
Expect<Equal<JsonTestFunctionArgs['jsonb'], unknown>>;
Expect<Equal<JsonTestFunctionArgs['jsonCustom'], { attr: string }>>;
Expect<Equal<JsonTestFunctionArgs['jsonbCustom'], { attr: string }>>;

/** Expect enums to resolve correctly */

const basicTypesEnum = pgEnum('basic_types_enum', ['a', 'b', 'c']);

const enumTestFunction = pgFunction('enum_test_function', {
	args: {
		enum: basicTypesEnum(),
	},
	returns: basicTypesEnum(),
}).as(sql`SELECT 'a'`);

type EnumTestFunctionArgs = InferFunctionArgs<typeof enumTestFunction>;

Expect<Equal<EnumTestFunctionArgs['enum'], 'a' | 'b' | 'c'>>;

/** Expect custom types to resolve correctly */
const custom = customType<{
	data: { x: number };
	driverData: string;
}>({
	dataType() {
		return 'custom_type';
	},
});

const customTestFunction = pgFunction('custom_test_function', {
	args: {
		custom: custom(),
	},
	returns: custom(),
}).as(sql`SELECT '{"x": 1}'::custom_type`);

type CustomTestFunctionArgs = InferFunctionArgs<typeof customTestFunction>;
Expect<Equal<CustomTestFunctionArgs['custom'], { x: number }>>;

/** Expect bad args to fail */

const badArgsFunction = pgFunction('bad_args_function', {
	args: {
		// @ts-expect-error - arguments must be AnyPgColumnBuilder
		bad: 'nothing',
	},
	returns: json(),
}).as(sql`SELECT 1`);

/** Returns */
/** Expect basic (scalar) returns to resolve correctly */

const basicTypesReturnBigintFunction = pgFunction('basic_types_return_bigint', {
	args: {},
	returns: basicTypesArgs.bigint,
}).as(sql`SELECT 1`);

const basicTypesReturnBigserialFunction = pgFunction('basic_types_return_bigserial', {
	args: {},
	returns: basicTypesArgs.bigserial,
}).as(sql`SELECT 1`);

const basicTypesReturnBooleanFunction = pgFunction('basic_types_return_boolean', {
	args: {},
	returns: basicTypesArgs.boolean,
}).as(sql`SELECT true`);

const basicTypesReturnCharFunction = pgFunction('basic_types_return_char', {
	args: {},
	returns: basicTypesArgs.char,
}).as(sql`SELECT 'a'`);

const basicTypesReturnCidrFunction = pgFunction('basic_types_return_cidr', {
	args: {},
	returns: basicTypesArgs.cidr,
}).as(sql`SELECT '192.168.0.0/24'::cidr`);

const basicTypesReturnDateFunction = pgFunction('basic_types_return_date', {
	args: {},
	returns: basicTypesArgs.date,
}).as(sql`SELECT CURRENT_DATE`);

const basicTypesReturnDecimalFunction = pgFunction('basic_types_return_decimal', {
	args: {},
	returns: basicTypesArgs.decimal,
}).as(sql`SELECT 1.0`);

const basicTypesReturnDoublePrecisionFunction = pgFunction('basic_types_return_double_precision', {
	args: {},
	returns: basicTypesArgs.doublePrecision,
}).as(sql`SELECT 1.0`);

const basicTypesReturnInetFunction = pgFunction('basic_types_return_inet', {
	args: {},
	returns: basicTypesArgs.inet,
}).as(sql`SELECT '127.0.0.1'::inet`);

const basicTypesReturnIntegerFunction = pgFunction('basic_types_return_integer', {
	args: {},
	returns: basicTypesArgs.integer,
}).as(sql`SELECT 1`);

const basicTypesReturnIntervalFunction = pgFunction('basic_types_return_interval', {
	args: {},
	returns: basicTypesArgs.interval,
}).as(sql`SELECT '1 day'::interval`);

const basicTypesReturnLineFunction = pgFunction('basic_types_return_line', {
	args: {},
	returns: basicTypesArgs.line,
}).as(sql`SELECT '{1,2,3}'::line`);

const basicTypesReturnMacaddrFunction = pgFunction('basic_types_return_macaddr', {
	args: {},
	returns: basicTypesArgs.macaddr,
}).as(sql`SELECT '08:00:2b:01:02:03'::macaddr`);

const basicTypesReturnMacaddr8Function = pgFunction('basic_types_return_macaddr8', {
	args: {},
	returns: basicTypesArgs.macaddr8,
}).as(sql`SELECT '08:00:2b:01:02:03:04:05'::macaddr8`);

const basicTypesReturnNumericFunction = pgFunction('basic_types_return_numeric', {
	args: {},
	returns: basicTypesArgs.numeric,
}).as(sql`SELECT 1.0`);

const basicTypesReturnPointFunction = pgFunction('basic_types_return_point', {
	args: {},
	returns: basicTypesArgs.point,
}).as(sql`SELECT '(1,2)'::point`);

const basicTypesReturnRealFunction = pgFunction('basic_types_return_real', {
	args: {},
	returns: basicTypesArgs.real,
}).as(sql`SELECT 1.0`);

const basicTypesReturnSerialFunction = pgFunction('basic_types_return_serial', {
	args: {},
	returns: basicTypesArgs.serial,
}).as(sql`SELECT 1`);

const basicTypesReturnSmallintFunction = pgFunction('basic_types_return_smallint', {
	args: {},
	returns: basicTypesArgs.smallint,
}).as(sql`SELECT 1::smallint`);

const basicTypesReturnSmallserialFunction = pgFunction('basic_types_return_smallserial', {
	args: {},
	returns: basicTypesArgs.smallserial,
}).as(sql`SELECT 1::smallint`);

const basicTypesReturnTextFunction = pgFunction('basic_types_return_text', {
	args: {},
	returns: basicTypesArgs.text,
}).as(sql`SELECT 'text'`);

const basicTypesReturnTimeFunction = pgFunction('basic_types_return_time', {
	args: {},
	returns: basicTypesArgs.time,
}).as(sql`SELECT '00:00:00'::time`);

const basicTypesReturnTimestampFunction = pgFunction('basic_types_return_timestamp', {
	args: {},
	returns: basicTypesArgs.timestamp,
}).as(sql`SELECT NOW()`);

const basicTypesReturnUuidFunction = pgFunction('basic_types_return_uuid', {
	args: {},
	returns: basicTypesArgs.uuid,
}).as(sql`SELECT gen_random_uuid()`);

const basicTypesReturnVarcharFunction = pgFunction('basic_types_return_varchar', {
	args: {},
	returns: basicTypesArgs.varchar,
}).as(sql`SELECT 'varchar'`);

Expect<Equal<InferFunctionReturns<typeof basicTypesReturnBigintFunction>, number>>;
Expect<Equal<InferFunctionReturns<typeof basicTypesReturnBigserialFunction>, number>>;
Expect<Equal<InferFunctionReturns<typeof basicTypesReturnBooleanFunction>, boolean>>;
Expect<Equal<InferFunctionReturns<typeof basicTypesReturnCharFunction>, string>>;
Expect<Equal<InferFunctionReturns<typeof basicTypesReturnCidrFunction>, string>>;
Expect<Equal<InferFunctionReturns<typeof basicTypesReturnDateFunction>, Date>>;
Expect<Equal<InferFunctionReturns<typeof basicTypesReturnDecimalFunction>, string>>;
Expect<Equal<InferFunctionReturns<typeof basicTypesReturnDoublePrecisionFunction>, number>>;
Expect<Equal<InferFunctionReturns<typeof basicTypesReturnInetFunction>, string>>;
Expect<Equal<InferFunctionReturns<typeof basicTypesReturnIntegerFunction>, number>>;
Expect<Equal<InferFunctionReturns<typeof basicTypesReturnIntervalFunction>, string>>;
Expect<Equal<InferFunctionReturns<typeof basicTypesReturnLineFunction>, [number, number, number]>>;
Expect<Equal<InferFunctionReturns<typeof basicTypesReturnMacaddrFunction>, string>>;
Expect<Equal<InferFunctionReturns<typeof basicTypesReturnMacaddr8Function>, string>>;
Expect<Equal<InferFunctionReturns<typeof basicTypesReturnNumericFunction>, string>>;
Expect<Equal<InferFunctionReturns<typeof basicTypesReturnPointFunction>, [number, number]>>;
Expect<Equal<InferFunctionReturns<typeof basicTypesReturnRealFunction>, number>>;
Expect<Equal<InferFunctionReturns<typeof basicTypesReturnSerialFunction>, number>>;
Expect<Equal<InferFunctionReturns<typeof basicTypesReturnSmallintFunction>, number>>;
Expect<Equal<InferFunctionReturns<typeof basicTypesReturnSmallserialFunction>, number>>;
Expect<Equal<InferFunctionReturns<typeof basicTypesReturnTextFunction>, string>>;
Expect<Equal<InferFunctionReturns<typeof basicTypesReturnTimeFunction>, string>>;
Expect<Equal<InferFunctionReturns<typeof basicTypesReturnTimestampFunction>, Date>>;
Expect<Equal<InferFunctionReturns<typeof basicTypesReturnUuidFunction>, string>>;
Expect<Equal<InferFunctionReturns<typeof basicTypesReturnVarcharFunction>, string>>;

/** Expect arrays (scalar) returns to resolve correctly */

const arrayReturnFunction = pgFunction('array_return_function', {
	args: {},
	returns: integer().array(),
}).as(sql`SELECT ARRAY[1, 2, 3]`);

type ArrayReturnFunctionReturns = InferFunctionReturns<typeof arrayReturnFunction>;

Expect<Equal<ArrayReturnFunctionReturns, number[]>>;

/** Expect json and jsonb (scalar) returns to resolve correctly with and without a custom type */

const jsonReturnFunction = pgFunction('json_return_function', {
	args: {},
	returns: json(),
}).as(sql`SELECT '{}'::json`);

const jsonbReturnFunction = pgFunction('jsonb_return_function', {
	args: {},
	returns: jsonb(),
}).as(sql`SELECT '{}'::jsonb`);

const jsonCustomReturnFunction = pgFunction('json_custom_return_function', {
	args: {},
	returns: json().$type<{ attr: string }>(),
}).as(sql`SELECT '{"attr": "value"}'::json`);

const jsonbCustomReturnFunction = pgFunction('jsonb_custom_return_function', {
	args: {},
	returns: jsonb().$type<{ attr: string }>(),
}).as(sql`SELECT '{"attr": "value"}'::jsonb`);

Expect<Equal<InferFunctionReturns<typeof jsonReturnFunction>, unknown>>;
Expect<Equal<InferFunctionReturns<typeof jsonbReturnFunction>, unknown>>;
Expect<Equal<InferFunctionReturns<typeof jsonCustomReturnFunction>, { attr: string }>>;
Expect<Equal<InferFunctionReturns<typeof jsonbCustomReturnFunction>, { attr: string }>>;

/** Expect enums (scalar) returns to resolve correctly */

type EnumTestFunctionReturns = InferFunctionReturns<typeof enumTestFunction>;

Expect<Equal<EnumTestFunctionReturns, 'a' | 'b' | 'c'>>;

/** Expect defined tables (scalars) to resolve correctly */

const testTable = pgTable('test_table', {
	id: integer('id').primaryKey(),
	name: text('name').notNull(),
});

const tableTestFunction = pgFunction('table_test_function', {
	args: {},
	returns: testTable,
}).as(sql`SELECT 1, 'test'`);

type TableTestFunctionReturns = InferFunctionReturns<typeof tableTestFunction>;

Expect<Equal<TableTestFunctionReturns, typeof testTable.$inferSelect>>;

/** Expect setof returns to resolve correctly */

const setOfTestFunction = pgFunction('setof_test_function', {
	args: {},
	returns: setOf(integer()),
}).as(sql`SELECT 1, 2, 3`);

const setOfTestFunction2 = pgFunction('setof_test_function2', {
	args: {},
	returns: setOf(json().$type<{ attr: string }>()),
}).as(sql`SELECT '{"attr": "value"}'::json, '{"attr2": "value2"}'::json`);

const setOfTestFunction3 = pgFunction('setof_test_function3', {
	args: {},
	returns: setOf(testTable),
}).as(sql`SELECT 1, 'test'`);

type SetOfTestFunctionReturns = InferFunctionReturns<typeof setOfTestFunction>;
type SetOfTestFunctionReturns2 = InferFunctionReturns<typeof setOfTestFunction2>;
type SetOfTestFunctionReturns3 = InferFunctionReturns<typeof setOfTestFunction3>;

Expect<Equal<SetOfTestFunctionReturns, number[]>>;
Expect<Equal<SetOfTestFunctionReturns2, { attr: string }[]>>;
Expect<Equal<SetOfTestFunctionReturns3, typeof testTable.$inferSelect[]>>;

/** Expect arbitrary table returns to resolve correctly */

const tableReturnTestFunction = pgFunction('table_return_test_function', {
	args: {},
	returns: tableReturn({
		id: integer('id'),
		name: text('name'),
	}),
}).as(sql`SELECT 1, 'test'`);

type TableReturnTestFunctionReturns = InferFunctionReturns<typeof tableReturnTestFunction>;

Expect<Equal<TableReturnTestFunctionReturns, { id: number; name: string }[]>>;

/** Expect special return types to resolve correctly */

const voidReturnTestFunction = pgFunction('void_return_test_function', {
	args: {},
	returns: returnsVoid(),
}).as(sql`SELECT NULL`);

type VoidReturnTestFunctionReturns = InferFunctionReturns<typeof voidReturnTestFunction>;

Expect<Equal<VoidReturnTestFunctionReturns, void>>;

const recordReturnTestFunction = pgFunction('record_return_test_function', {
	args: {},
	returns: returnsRecord(),
}).as(sql`SELECT 1, 'test'`);

type RecordReturnTestFunctionReturns = InferFunctionReturns<typeof recordReturnTestFunction>;

Expect<Equal<RecordReturnTestFunctionReturns, unknown>>;

const triggerReturnTestFunction = pgFunction('trigger_return_test_function', {
	args: {},
	returns: returnsTrigger(),
}).as(sql`SELECT NULL`);

type TriggerReturnTestFunctionReturns = InferFunctionReturns<typeof triggerReturnTestFunction>;

Expect<Equal<TriggerReturnTestFunctionReturns, unknown>>;

/** Expect SQL returns to resolve correctly with and without a custom type */

const sqlReturnFunction = pgFunction('sql_return_function', {
	args: {},
	returns: sql`SELECT 1`,
}).as(sql`SELECT 1`);

const sqlCustomReturnFunction = pgFunction('sql_custom_return_function', {
	args: {},
	returns: sql<{ id: number }>`some_custom_type`,
}).as(sql`SELECT 1`);

type SqlReturnFunctionReturns = InferFunctionReturns<typeof sqlReturnFunction>;
type SqlCustomReturnFunctionReturns = InferFunctionReturns<typeof sqlCustomReturnFunction>;

Expect<Equal<SqlReturnFunctionReturns, unknown>>;
Expect<Equal<SqlCustomReturnFunctionReturns, { id: number }>>;

/** Expect custom types (scalar) returns to resolve correctly */

const customReturnFunction = pgFunction('custom_return_function', {
	args: {},
	returns: custom(),
}).as(sql`SELECT '{"x": 1}'::custom_type`);

type CustomReturnFunctionReturns = InferFunctionReturns<typeof customReturnFunction>;

Expect<Equal<CustomReturnFunctionReturns, { x: number }>>;

/** Expect bad returns to fail */

const badReturnsFunction = pgFunction('bad_returns_function', {
	args: {},
	// @ts-expect-error - returns must be PgFunctionReturnType, cannot be arbitrary string
	returns: 'nothing',
}).as(sql`SELECT 1`);

const badReturnsFunction2 = pgFunction('bad_returns_function2', {
	args: {},
	// @ts-expect-error - returns must be PgFunctionReturnType, cannot be arbitrary object
	returns: {},
}).as(sql`SELECT 1`);

/** Expect generics to persist through builder modifiers */

const chainedFunction = pgFunction('chained_function', {
	args: {
		id: uuid(),
	},
	returns: text(),
})
	.stable()
	.securityDefiner()
	.strict()
	.parallelSafe()
	.searchPath('public')
	.as(sql`SELECT 'test'`);

Expect<Equal<typeof chainedFunction.config.name, 'chained_function'>>;
Expect<
	Equal<
		InferFunctionArgs<typeof chainedFunction>,
		{ id: string }
	>
>;
Expect<
	Equal<
		InferFunctionReturns<typeof chainedFunction>,
		string
	>
>;

// Expect setof to fail on a non scalar argument
// @ts-expect-error - setof must be a scalar return type
setOf(tableReturn({
	id: integer('id'),
	name: text('name'),
}));

// Expect table return to fail on a non PgBuilder column
tableReturn({
	// @ts-expect-error - table return must be a PgBuilder column
	id: 'id',
	name: text('name'),
});
