import { is } from 'drizzle-orm';
import {
	bigint,
	binary,
	bit,
	char,
	customType,
	date,
	datetime,
	datetime2,
	datetimeoffset,
	decimal,
	float,
	int,
	MsSqlBigInt,
	MsSqlBinary,
	MsSqlBit,
	MsSqlChar,
	MsSqlCustomColumn,
	MsSqlDate,
	MsSqlDateString,
	MsSqlDateTime,
	MsSqlDateTime2,
	MsSqlDateTime2String,
	MsSqlDateTimeOffset,
	MsSqlDateTimeOffsetString,
	MsSqlDateTimeString,
	MsSqlDecimal,
	MsSqlDecimalBigInt,
	MsSqlDecimalNumber,
	MsSqlFloat,
	MsSqlInt,
	MsSqlNumeric,
	MsSqlNumericBigInt,
	MsSqlNumericNumber,
	MsSqlReal,
	MsSqlSmallInt,
	mssqlTable,
	MsSqlText,
	MsSqlTime,
	MsSqlTimeString,
	MsSqlTinyInt,
	MsSqlVarBinary,
	MsSqlVarChar,
	MsSqlVarCharJson,
	ntext,
	numeric,
	nvarchar,
	real,
	smallint,
	text,
	time,
	tinyint,
	varbinary,
	varchar,
} from 'drizzle-orm/mssql-core';
import { expectTypeOf } from 'vitest';

const table = mssqlTable('table', {
	bigint53: bigint({ mode: 'number' }),
	bigint64: bigint({ mode: 'bigint' }),
	bigintString: bigint({ mode: 'string' }),
	binary: binary(),
	bit: bit(),
	char: char(),
	charEnum: char({ enum: ['a', 'b'] }),
	charEnumNotNull: char({ enum: ['a', 'b'] }).notNull(),
	custom: customType<{ data: string }>({ dataType: () => 'custom' })(),
	date: date(),
	dateString: date({ mode: 'string' }),
	datetime: datetime(),
	datetimeString: datetime({ mode: 'string' }),
	datetime2: datetime2(),
	datetime2String: datetime2({ mode: 'string' }),
	datetimeoffset: datetimeoffset(),
	datetimeoffsetString: datetimeoffset({ mode: 'string' }),
	decimal: decimal(),
	decimalNumber: decimal({ mode: 'number' }),
	decimalBigint: decimal({ mode: 'bigint' }),
	float: float(),
	int: int(),
	real: real(),
	numeric: numeric(),
	numericNumber: numeric({ mode: 'number' }),
	numericBigint: numeric({ mode: 'bigint' }),
	smallint: smallint(),
	text: text(),
	textEnum: text({ enum: ['a', 'b'] }),
	textEnumNotNull: text({ enum: ['a', 'b'] }).notNull(),
	textType: text().$type<'a' | 'b'>(),
	ntext: ntext(),
	ntextEnum: ntext({ enum: ['a', 'b'] }),
	time: time(),
	timeString: time({ mode: 'string' }),
	tinyint: tinyint(),
	varbinary: varbinary(),
	varchar: varchar(),
	varcharEnum: varchar({ enum: ['a', 'b'] }),
	varcharEnumNotNull: varchar({ enum: ['a', 'b'] }).notNull(),
	nvarchar: nvarchar(),
	nvarcharEnum: nvarchar({ enum: ['a', 'b'] }),
	nvarcharJson: nvarchar({ mode: 'json' }),
});

type Table = typeof table;

if (is(table.bigint53, MsSqlBigInt)) {
	expectTypeOf(table.bigint53).not.toBeNever();
	expectTypeOf(table.bigint53.dataType).toEqualTypeOf<Table['bigint53']['dataType']>();
}

if (is(table.bigint64, MsSqlBigInt)) {
	expectTypeOf(table.bigint64).not.toBeNever();
	expectTypeOf(table.bigint64.dataType).toEqualTypeOf<Table['bigint64']['dataType']>();
}

if (is(table.bigintString, MsSqlBigInt)) {
	expectTypeOf(table.bigintString).not.toBeNever();
	expectTypeOf(table.bigintString.dataType).toEqualTypeOf<Table['bigintString']['dataType']>();
}

if (is(table.binary, MsSqlBinary)) {
	expectTypeOf(table.binary).not.toBeNever();
	expectTypeOf(table.binary.dataType).toEqualTypeOf<Table['binary']['dataType']>();
}

if (is(table.bit, MsSqlBit)) {
	expectTypeOf(table.bit).not.toBeNever();
	expectTypeOf(table.bit.dataType).toEqualTypeOf<Table['bit']['dataType']>();
}

if (is(table.char, MsSqlChar)) {
	expectTypeOf(table.char).not.toBeNever();
	expectTypeOf(table.char.dataType).toEqualTypeOf<Table['char']['dataType']>();
}

if (is(table.charEnum, MsSqlChar)) {
	expectTypeOf(table.charEnum).not.toBeNever();
	expectTypeOf(table.charEnum.dataType).toEqualTypeOf<Table['charEnum']['dataType']>();
	expectTypeOf<typeof table.charEnum.enumValues[number]>().toEqualTypeOf<'a' | 'b'>();
	expectTypeOf(table.charEnum.enumValues).toExtend<[string, ...string[]]>();
}

if (is(table.charEnumNotNull, MsSqlChar)) {
	expectTypeOf(table.charEnumNotNull).not.toBeNever();
	expectTypeOf(table.charEnumNotNull.dataType).toEqualTypeOf<Table['charEnumNotNull']['dataType']>();
	expectTypeOf<typeof table.charEnumNotNull.enumValues[number]>().toEqualTypeOf<'a' | 'b'>();
	expectTypeOf(table.charEnumNotNull.enumValues).toExtend<[string, ...string[]]>();
}

if (is(table.custom, MsSqlCustomColumn)) {
	expectTypeOf(table.custom).not.toBeNever();
	expectTypeOf(table.custom.dataType).toEqualTypeOf<Table['custom']['dataType']>();
}

if (is(table.date, MsSqlDate)) {
	expectTypeOf(table.date).not.toBeNever();
	expectTypeOf(table.date.dataType).toEqualTypeOf<Table['date']['dataType']>();
}

if (is(table.dateString, MsSqlDateString)) {
	expectTypeOf(table.dateString).not.toBeNever();
	expectTypeOf(table.dateString.dataType).toEqualTypeOf<Table['dateString']['dataType']>();
}

if (is(table.datetime, MsSqlDateTime)) {
	expectTypeOf(table.datetime).not.toBeNever();
	expectTypeOf(table.datetime.dataType).toEqualTypeOf<Table['datetime']['dataType']>();
}

if (is(table.datetimeString, MsSqlDateTimeString)) {
	expectTypeOf(table.datetimeString).not.toBeNever();
	expectTypeOf(table.datetimeString.dataType).toEqualTypeOf<Table['datetimeString']['dataType']>();
}

if (is(table.datetime2, MsSqlDateTime2)) {
	expectTypeOf(table.datetime2).not.toBeNever();
	expectTypeOf(table.datetime2.dataType).toEqualTypeOf<Table['datetime2']['dataType']>();
}

if (is(table.datetime2String, MsSqlDateTime2String)) {
	expectTypeOf(table.datetime2String).not.toBeNever();
	expectTypeOf(table.datetime2String.dataType).toEqualTypeOf<Table['datetime2String']['dataType']>();
}

if (is(table.datetimeoffset, MsSqlDateTimeOffset)) {
	expectTypeOf(table.datetimeoffset).not.toBeNever();
	expectTypeOf(table.datetimeoffset.dataType).toEqualTypeOf<Table['datetimeoffset']['dataType']>();
}

if (is(table.datetimeoffsetString, MsSqlDateTimeOffsetString)) {
	expectTypeOf(table.datetimeoffsetString).not.toBeNever();
	expectTypeOf(table.datetimeoffsetString.dataType).toEqualTypeOf<Table['datetimeoffsetString']['dataType']>();
}

if (is(table.decimal, MsSqlDecimal)) {
	expectTypeOf(table.decimal).not.toBeNever();
	expectTypeOf(table.decimal.dataType).toEqualTypeOf<Table['decimal']['dataType']>();
}

if (is(table.decimalNumber, MsSqlDecimalNumber)) {
	expectTypeOf(table.decimalNumber).not.toBeNever();
	expectTypeOf(table.decimalNumber.dataType).toEqualTypeOf<Table['decimalNumber']['dataType']>();
}

if (is(table.decimalBigint, MsSqlDecimalBigInt)) {
	expectTypeOf(table.decimalBigint).not.toBeNever();
	expectTypeOf(table.decimalBigint.dataType).toEqualTypeOf<Table['decimalBigint']['dataType']>();
}

if (is(table.float, MsSqlFloat)) {
	expectTypeOf(table.float).not.toBeNever();
	expectTypeOf(table.float.dataType).toEqualTypeOf<Table['float']['dataType']>();
}

if (is(table.int, MsSqlInt)) {
	expectTypeOf(table.int).not.toBeNever();
	expectTypeOf(table.int.dataType).toEqualTypeOf<Table['int']['dataType']>();
}

if (is(table.real, MsSqlReal)) {
	expectTypeOf(table.real).not.toBeNever();
	expectTypeOf(table.real.dataType).toEqualTypeOf<Table['real']['dataType']>();
}

if (is(table.numeric, MsSqlNumeric)) {
	expectTypeOf(table.numeric).not.toBeNever();
	expectTypeOf(table.numeric.dataType).toEqualTypeOf<Table['numeric']['dataType']>();
}

if (is(table.numericNumber, MsSqlNumericNumber)) {
	expectTypeOf(table.numericNumber).not.toBeNever();
	expectTypeOf(table.numericNumber.dataType).toEqualTypeOf<Table['numericNumber']['dataType']>();
}

if (is(table.numericBigint, MsSqlNumericBigInt)) {
	expectTypeOf(table.numericBigint).not.toBeNever();
	expectTypeOf(table.numericBigint.dataType).toEqualTypeOf<Table['numericBigint']['dataType']>();
}

if (is(table.smallint, MsSqlSmallInt)) {
	expectTypeOf(table.smallint).not.toBeNever();
	expectTypeOf(table.smallint.dataType).toEqualTypeOf<Table['smallint']['dataType']>();
}

if (is(table.text, MsSqlText)) {
	expectTypeOf(table.text).not.toBeNever();
	expectTypeOf(table.text.dataType).toEqualTypeOf<Table['text']['dataType']>();
}

if (is(table.textEnum, MsSqlText)) {
	expectTypeOf(table.textEnum).not.toBeNever();
	expectTypeOf(table.textEnum.dataType).toEqualTypeOf<Table['textEnum']['dataType']>();
	expectTypeOf<typeof table.textEnum.enumValues[number]>().toEqualTypeOf<'a' | 'b'>();
	expectTypeOf(table.textEnum.enumValues).toExtend<[string, ...string[]]>();
}

if (is(table.textEnumNotNull, MsSqlText)) {
	expectTypeOf(table.textEnumNotNull).not.toBeNever();
	expectTypeOf(table.textEnumNotNull.dataType).toEqualTypeOf<Table['textEnumNotNull']['dataType']>();
	expectTypeOf<typeof table.textEnumNotNull.enumValues[number]>().toEqualTypeOf<'a' | 'b'>();
	expectTypeOf(table.textEnumNotNull.enumValues).toExtend<[string, ...string[]]>();
}

if (is(table.textType, MsSqlText)) {
	expectTypeOf(table.textType).not.toBeNever();
	expectTypeOf(table.textType.dataType).toEqualTypeOf<Table['textType']['dataType']>();
}

if (is(table.ntext, MsSqlText)) {
	expectTypeOf(table.ntext).not.toBeNever();
	expectTypeOf(table.ntext.dataType).toEqualTypeOf<Table['ntext']['dataType']>();
}

if (is(table.ntextEnum, MsSqlText)) {
	expectTypeOf(table.ntextEnum).not.toBeNever();
	expectTypeOf(table.ntextEnum.dataType).toEqualTypeOf<Table['ntextEnum']['dataType']>();
	expectTypeOf<typeof table.ntextEnum.enumValues[number]>().toEqualTypeOf<'a' | 'b'>();
	expectTypeOf(table.ntextEnum.enumValues).toExtend<[string, ...string[]]>();
}

if (is(table.time, MsSqlTime)) {
	expectTypeOf(table.time).not.toBeNever();
	expectTypeOf(table.time.dataType).toEqualTypeOf<Table['time']['dataType']>();
}

if (is(table.timeString, MsSqlTimeString)) {
	expectTypeOf(table.timeString).not.toBeNever();
	expectTypeOf(table.timeString.dataType).toEqualTypeOf<Table['timeString']['dataType']>();
}

if (is(table.tinyint, MsSqlTinyInt)) {
	expectTypeOf(table.tinyint).not.toBeNever();
	expectTypeOf(table.tinyint.dataType).toEqualTypeOf<Table['tinyint']['dataType']>();
}

if (is(table.varbinary, MsSqlVarBinary)) {
	expectTypeOf(table.varbinary).not.toBeNever();
	expectTypeOf(table.varbinary.dataType).toEqualTypeOf<Table['varbinary']['dataType']>();
}

if (is(table.varchar, MsSqlVarChar)) {
	expectTypeOf(table.varchar).not.toBeNever();
	expectTypeOf(table.varchar.dataType).toEqualTypeOf<Table['varchar']['dataType']>();
}

if (is(table.varcharEnum, MsSqlVarChar)) {
	expectTypeOf(table.varcharEnum).not.toBeNever();
	expectTypeOf(table.varcharEnum.dataType).toEqualTypeOf<Table['varcharEnum']['dataType']>();
	expectTypeOf<typeof table.varcharEnum.enumValues[number]>().toEqualTypeOf<'a' | 'b'>();
	expectTypeOf(table.varcharEnum.enumValues).toExtend<[string, ...string[]]>();
}

if (is(table.varcharEnumNotNull, MsSqlVarChar)) {
	expectTypeOf(table.varcharEnumNotNull).not.toBeNever();
	expectTypeOf(table.varcharEnumNotNull.dataType).toEqualTypeOf<Table['varcharEnumNotNull']['dataType']>();
	expectTypeOf<typeof table.varcharEnumNotNull.enumValues[number]>().toEqualTypeOf<'a' | 'b'>();
	expectTypeOf(table.varcharEnumNotNull.enumValues).toExtend<[string, ...string[]]>();
}

if (is(table.nvarchar, MsSqlVarChar)) {
	expectTypeOf(table.nvarchar).not.toBeNever();
	expectTypeOf(table.nvarchar.dataType).toEqualTypeOf<Table['nvarchar']['dataType']>();
}

if (is(table.nvarcharEnum, MsSqlVarChar)) {
	expectTypeOf(table.nvarcharEnum).not.toBeNever();
	expectTypeOf(table.nvarcharEnum.dataType).toEqualTypeOf<Table['nvarcharEnum']['dataType']>();
	expectTypeOf<typeof table.nvarcharEnum.enumValues[number]>().toEqualTypeOf<'a' | 'b'>();
	expectTypeOf(table.nvarcharEnum.enumValues).toExtend<[string, ...string[]]>();
}

if (is(table.nvarcharJson, MsSqlVarCharJson)) {
	expectTypeOf(table.nvarcharJson).not.toBeNever();
	expectTypeOf(table.nvarcharJson.dataType).toEqualTypeOf<Table['nvarcharJson']['dataType']>();
}
