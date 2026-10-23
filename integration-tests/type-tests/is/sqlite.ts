import { is } from 'drizzle-orm';
import {
	blob,
	customType,
	integer,
	numeric,
	real,
	SQLiteBigInt,
	SQLiteBlobBuffer,
	SQLiteBlobJson,
	SQLiteBoolean,
	SQLiteCustomColumn,
	SQLiteInteger,
	SQLiteNumeric,
	SQLiteNumericBigInt,
	SQLiteNumericNumber,
	SQLiteReal,
	sqliteTable,
	SQLiteText,
	SQLiteTextJson,
	SQLiteTimestamp,
	text,
} from 'drizzle-orm/sqlite-core';
import { expectTypeOf } from 'vitest';

const table = sqliteTable('table', {
	blobBuffer: blob({ mode: 'buffer' }),
	blobJson: blob({ mode: 'json' }),
	blobBigint: blob({ mode: 'bigint' }),
	custom: customType<{ data: string }>({ dataType: () => 'custom' })(),
	integer: integer(),
	integerTimestamp: integer({ mode: 'timestamp' }),
	integerTimestampMs: integer({ mode: 'timestamp_ms' }),
	integerBoolean: integer({ mode: 'boolean' }),
	numeric: numeric(),
	numericNumber: numeric({ mode: 'number' }),
	numericBigint: numeric({ mode: 'bigint' }),
	real: real(),
	text: text(),
	textEnum: text({ enum: ['a', 'b'] }),
	textEnumNotNull: text({ enum: ['a', 'b'] }).notNull(),
	textType: text().$type<'a' | 'b'>(),
	textJson: text({ mode: 'json' }),
});

type Table = typeof table;

if (is(table.blobBuffer, SQLiteBlobBuffer)) {
	expectTypeOf(table.blobBuffer).not.toBeNever();
	expectTypeOf(table.blobBuffer.dataType).toEqualTypeOf<Table['blobBuffer']['dataType']>();
}

if (is(table.blobJson, SQLiteBlobJson)) {
	expectTypeOf(table.blobJson).not.toBeNever();
	expectTypeOf(table.blobJson.dataType).toEqualTypeOf<Table['blobJson']['dataType']>();
}

if (is(table.blobBigint, SQLiteBigInt)) {
	expectTypeOf(table.blobBigint).not.toBeNever();
	expectTypeOf(table.blobBigint.dataType).toEqualTypeOf<Table['blobBigint']['dataType']>();
}

if (is(table.custom, SQLiteCustomColumn)) {
	expectTypeOf(table.custom).not.toBeNever();
	expectTypeOf(table.custom.dataType).toEqualTypeOf<Table['custom']['dataType']>();
}

if (is(table.integer, SQLiteInteger)) {
	expectTypeOf(table.integer).not.toBeNever();
	expectTypeOf(table.integer.dataType).toEqualTypeOf<Table['integer']['dataType']>();
}

if (is(table.integerTimestamp, SQLiteTimestamp)) {
	expectTypeOf(table.integerTimestamp).not.toBeNever();
	expectTypeOf(table.integerTimestamp.dataType).toEqualTypeOf<Table['integerTimestamp']['dataType']>();
}

if (is(table.integerTimestampMs, SQLiteTimestamp)) {
	expectTypeOf(table.integerTimestampMs).not.toBeNever();
	expectTypeOf(table.integerTimestampMs.dataType).toEqualTypeOf<Table['integerTimestampMs']['dataType']>();
}

if (is(table.integerBoolean, SQLiteBoolean)) {
	expectTypeOf(table.integerBoolean).not.toBeNever();
	expectTypeOf(table.integerBoolean.dataType).toEqualTypeOf<Table['integerBoolean']['dataType']>();
}

if (is(table.numeric, SQLiteNumeric)) {
	expectTypeOf(table.numeric).not.toBeNever();
	expectTypeOf(table.numeric.dataType).toEqualTypeOf<Table['numeric']['dataType']>();
}

if (is(table.numericNumber, SQLiteNumericNumber)) {
	expectTypeOf(table.numericNumber).not.toBeNever();
	expectTypeOf(table.numericNumber.dataType).toEqualTypeOf<Table['numericNumber']['dataType']>();
}

if (is(table.numericBigint, SQLiteNumericBigInt)) {
	expectTypeOf(table.numericBigint).not.toBeNever();
	expectTypeOf(table.numericBigint.dataType).toEqualTypeOf<Table['numericBigint']['dataType']>();
}

if (is(table.real, SQLiteReal)) {
	expectTypeOf(table.real).not.toBeNever();
	expectTypeOf(table.real.dataType).toEqualTypeOf<Table['real']['dataType']>();
}

if (is(table.text, SQLiteText)) {
	expectTypeOf(table.text).not.toBeNever();
	expectTypeOf(table.text.dataType).toEqualTypeOf<Table['text']['dataType']>();
}

if (is(table.textEnum, SQLiteText)) {
	expectTypeOf(table.textEnum).not.toBeNever();
	expectTypeOf(table.textEnum.dataType).toEqualTypeOf<Table['textEnum']['dataType']>();
	expectTypeOf<typeof table.textEnum.enumValues[number]>().toEqualTypeOf<'a' | 'b'>();
	expectTypeOf(table.textEnum.enumValues).toExtend<[string, ...string[]]>();
}

if (is(table.textEnumNotNull, SQLiteText)) {
	expectTypeOf(table.textEnumNotNull).not.toBeNever();
	expectTypeOf(table.textEnumNotNull.dataType).toEqualTypeOf<Table['textEnumNotNull']['dataType']>();
	expectTypeOf<typeof table.textEnumNotNull.enumValues[number]>().toEqualTypeOf<'a' | 'b'>();
	expectTypeOf(table.textEnumNotNull.enumValues).toExtend<[string, ...string[]]>();
}

if (is(table.textType, SQLiteText)) {
	expectTypeOf(table.textType).not.toBeNever();
	expectTypeOf(table.textType.dataType).toEqualTypeOf<Table['textType']['dataType']>();
}

if (is(table.textJson, SQLiteTextJson)) {
	expectTypeOf(table.textJson).not.toBeNever();
	expectTypeOf(table.textJson.dataType).toEqualTypeOf<Table['textJson']['dataType']>();
}
