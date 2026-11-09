import { is } from 'drizzle-orm';
import {
	bigint,
	binary,
	blob,
	boolean,
	char,
	customType,
	date,
	datetime,
	decimal,
	double,
	float,
	int,
	json,
	longblob,
	longtext,
	mediumblob,
	mediumint,
	mediumtext,
	MySqlBigInt53,
	MySqlBigInt64,
	MySqlBigIntString,
	MySqlBinary,
	MySqlBoolean,
	MySqlBufferBlob,
	MySqlChar,
	MySqlCustomColumn,
	MySqlDate,
	MySqlDateString,
	MySqlDateTime,
	MySqlDateTimeString,
	MySqlDecimal,
	MySqlDecimalBigInt,
	MySqlDecimalNumber,
	MySqlDouble,
	mysqlEnum,
	MySqlEnumColumn,
	MySqlEnumObjectColumn,
	MySqlFloat,
	MySqlInt,
	MySqlJson,
	MySqlMediumInt,
	MySqlReal,
	MySqlSerial,
	MySqlSmallInt,
	MySqlStringBlob,
	mysqlTable,
	MySqlText,
	MySqlTime,
	MySqlTimestamp,
	MySqlTimestampString,
	MySqlTinyInt,
	MySqlVarBinary,
	MySqlVarChar,
	MySqlYear,
	real,
	serial,
	smallint,
	text,
	time,
	timestamp,
	tinyblob,
	tinyint,
	tinytext,
	varbinary,
	varchar,
	year,
} from 'drizzle-orm/mysql-core';
import { expectTypeOf } from 'vitest';

enum Letters {
	A = 'a',
	B = 'b',
}

const table = mysqlTable('table', {
	bigint53: bigint({ mode: 'number' }),
	bigint64: bigint({ mode: 'bigint' }),
	bigintString: bigint({ mode: 'string' }),
	binary: binary(),
	boolean: boolean(),
	char: char(),
	charEnum: char({ enum: ['a', 'b'] }),
	charEnumNotNull: char({ enum: ['a', 'b'] }).notNull(),
	custom: customType<{ data: string }>({ dataType: () => 'custom' })(),
	date: date(),
	dateString: date({ mode: 'string' }),
	datetime: datetime(),
	datetimeString: datetime({ mode: 'string' }),
	decimal: decimal(),
	decimalNumber: decimal({ mode: 'number' }),
	decimalBigint: decimal({ mode: 'bigint' }),
	double: double(),
	mysqlEnum: mysqlEnum(['a', 'b']),
	mysqlEnumObject: mysqlEnum(Letters),
	float: float(),
	int: int(),
	json: json(),
	mediumint: mediumint(),
	real: real(),
	serial: serial(),
	smallint: smallint(),
	text: text(),
	textEnum: text({ enum: ['a', 'b'] }),
	textEnumNotNull: text({ enum: ['a', 'b'] }).notNull(),
	textType: text().$type<'a' | 'b'>(),
	tinytext: tinytext(),
	tinytextEnum: tinytext({ enum: ['a', 'b'] }),
	mediumtext: mediumtext(),
	longtext: longtext(),
	time: time(),
	timestamp: timestamp(),
	timestampString: timestamp({ mode: 'string' }),
	tinyint: tinyint(),
	varbinary: varbinary({ length: 10 }),
	varchar: varchar({ length: 10 }),
	varcharEnum: varchar({ length: 10, enum: ['a', 'b'] }),
	varcharEnumNotNull: varchar({ length: 10, enum: ['a', 'b'] }).notNull(),
	year: year(),
	blob: blob(),
	blobString: blob({ mode: 'string' }),
	tinyblob: tinyblob(),
	mediumblob: mediumblob(),
	longblob: longblob(),
});

type Table = typeof table;

if (is(table.bigint53, MySqlBigInt53)) {
	expectTypeOf(table.bigint53).not.toBeNever();
	expectTypeOf(table.bigint53.dataType).toEqualTypeOf<Table['bigint53']['dataType']>();
}

if (is(table.bigint64, MySqlBigInt64)) {
	expectTypeOf(table.bigint64).not.toBeNever();
	expectTypeOf(table.bigint64.dataType).toEqualTypeOf<Table['bigint64']['dataType']>();
}

if (is(table.bigintString, MySqlBigIntString)) {
	expectTypeOf(table.bigintString).not.toBeNever();
	expectTypeOf(table.bigintString.dataType).toEqualTypeOf<Table['bigintString']['dataType']>();
}

if (is(table.binary, MySqlBinary)) {
	expectTypeOf(table.binary).not.toBeNever();
	expectTypeOf(table.binary.dataType).toEqualTypeOf<Table['binary']['dataType']>();
}

if (is(table.boolean, MySqlBoolean)) {
	expectTypeOf(table.boolean).not.toBeNever();
	expectTypeOf(table.boolean.dataType).toEqualTypeOf<Table['boolean']['dataType']>();
}

if (is(table.char, MySqlChar)) {
	expectTypeOf(table.char).not.toBeNever();
	expectTypeOf(table.char.dataType).toEqualTypeOf<Table['char']['dataType']>();
}

if (is(table.charEnum, MySqlChar)) {
	expectTypeOf(table.charEnum).not.toBeNever();
	expectTypeOf(table.charEnum.dataType).toEqualTypeOf<Table['charEnum']['dataType']>();
	expectTypeOf<typeof table.charEnum.enumValues[number]>().toEqualTypeOf<'a' | 'b'>();
	expectTypeOf(table.charEnum.enumValues).toExtend<[string, ...string[]]>();
}

if (is(table.charEnumNotNull, MySqlChar)) {
	expectTypeOf(table.charEnumNotNull).not.toBeNever();
	expectTypeOf(table.charEnumNotNull.dataType).toEqualTypeOf<Table['charEnumNotNull']['dataType']>();
	expectTypeOf<typeof table.charEnumNotNull.enumValues[number]>().toEqualTypeOf<'a' | 'b'>();
	expectTypeOf(table.charEnumNotNull.enumValues).toExtend<[string, ...string[]]>();
}

if (is(table.custom, MySqlCustomColumn)) {
	expectTypeOf(table.custom).not.toBeNever();
	expectTypeOf(table.custom.dataType).toEqualTypeOf<Table['custom']['dataType']>();
}

if (is(table.date, MySqlDate)) {
	expectTypeOf(table.date).not.toBeNever();
	expectTypeOf(table.date.dataType).toEqualTypeOf<Table['date']['dataType']>();
}

if (is(table.dateString, MySqlDateString)) {
	expectTypeOf(table.dateString).not.toBeNever();
	expectTypeOf(table.dateString.dataType).toEqualTypeOf<Table['dateString']['dataType']>();
}

if (is(table.datetime, MySqlDateTime)) {
	expectTypeOf(table.datetime).not.toBeNever();
	expectTypeOf(table.datetime.dataType).toEqualTypeOf<Table['datetime']['dataType']>();
}

if (is(table.datetimeString, MySqlDateTimeString)) {
	expectTypeOf(table.datetimeString).not.toBeNever();
	expectTypeOf(table.datetimeString.dataType).toEqualTypeOf<Table['datetimeString']['dataType']>();
}

if (is(table.decimal, MySqlDecimal)) {
	expectTypeOf(table.decimal).not.toBeNever();
	expectTypeOf(table.decimal.dataType).toEqualTypeOf<Table['decimal']['dataType']>();
}

if (is(table.decimalNumber, MySqlDecimalNumber)) {
	expectTypeOf(table.decimalNumber).not.toBeNever();
	expectTypeOf(table.decimalNumber.dataType).toEqualTypeOf<Table['decimalNumber']['dataType']>();
}

if (is(table.decimalBigint, MySqlDecimalBigInt)) {
	expectTypeOf(table.decimalBigint).not.toBeNever();
	expectTypeOf(table.decimalBigint.dataType).toEqualTypeOf<Table['decimalBigint']['dataType']>();
}

if (is(table.double, MySqlDouble)) {
	expectTypeOf(table.double).not.toBeNever();
	expectTypeOf(table.double.dataType).toEqualTypeOf<Table['double']['dataType']>();
}

if (is(table.mysqlEnum, MySqlEnumColumn)) {
	expectTypeOf(table.mysqlEnum).not.toBeNever();
	expectTypeOf(table.mysqlEnum.dataType).toEqualTypeOf<Table['mysqlEnum']['dataType']>();
	expectTypeOf<typeof table.mysqlEnum.enumValues[number]>().toEqualTypeOf<'a' | 'b'>();
	expectTypeOf(table.mysqlEnum.enumValues).toExtend<[string, ...string[]]>();
}

if (is(table.mysqlEnumObject, MySqlEnumObjectColumn)) {
	expectTypeOf(table.mysqlEnumObject).not.toBeNever();
	expectTypeOf(table.mysqlEnumObject.dataType).toEqualTypeOf<Table['mysqlEnumObject']['dataType']>();
	expectTypeOf<typeof table.mysqlEnumObject.enumValues[number]>().toEqualTypeOf<Letters>();
	expectTypeOf(table.mysqlEnumObject.enumValues).toExtend<[string, ...string[]]>();
}

if (is(table.float, MySqlFloat)) {
	expectTypeOf(table.float).not.toBeNever();
	expectTypeOf(table.float.dataType).toEqualTypeOf<Table['float']['dataType']>();
}

if (is(table.int, MySqlInt)) {
	expectTypeOf(table.int).not.toBeNever();
	expectTypeOf(table.int.dataType).toEqualTypeOf<Table['int']['dataType']>();
}

if (is(table.json, MySqlJson)) {
	expectTypeOf(table.json).not.toBeNever();
	expectTypeOf(table.json.dataType).toEqualTypeOf<Table['json']['dataType']>();
}

if (is(table.mediumint, MySqlMediumInt)) {
	expectTypeOf(table.mediumint).not.toBeNever();
	expectTypeOf(table.mediumint.dataType).toEqualTypeOf<Table['mediumint']['dataType']>();
}

if (is(table.real, MySqlReal)) {
	expectTypeOf(table.real).not.toBeNever();
	expectTypeOf(table.real.dataType).toEqualTypeOf<Table['real']['dataType']>();
}

if (is(table.serial, MySqlSerial)) {
	expectTypeOf(table.serial).not.toBeNever();
	expectTypeOf(table.serial.dataType).toEqualTypeOf<Table['serial']['dataType']>();
}

if (is(table.smallint, MySqlSmallInt)) {
	expectTypeOf(table.smallint).not.toBeNever();
	expectTypeOf(table.smallint.dataType).toEqualTypeOf<Table['smallint']['dataType']>();
}

if (is(table.text, MySqlText)) {
	expectTypeOf(table.text).not.toBeNever();
	expectTypeOf(table.text.dataType).toEqualTypeOf<Table['text']['dataType']>();
}

if (is(table.textEnum, MySqlText)) {
	expectTypeOf(table.textEnum).not.toBeNever();
	expectTypeOf(table.textEnum.dataType).toEqualTypeOf<Table['textEnum']['dataType']>();
	expectTypeOf<typeof table.textEnum.enumValues[number]>().toEqualTypeOf<'a' | 'b'>();
	expectTypeOf(table.textEnum.enumValues).toExtend<[string, ...string[]]>();
}

if (is(table.textEnumNotNull, MySqlText)) {
	expectTypeOf(table.textEnumNotNull).not.toBeNever();
	expectTypeOf(table.textEnumNotNull.dataType).toEqualTypeOf<Table['textEnumNotNull']['dataType']>();
	expectTypeOf<typeof table.textEnumNotNull.enumValues[number]>().toEqualTypeOf<'a' | 'b'>();
	expectTypeOf(table.textEnumNotNull.enumValues).toExtend<[string, ...string[]]>();
}

if (is(table.textType, MySqlText)) {
	expectTypeOf(table.textType).not.toBeNever();
	expectTypeOf(table.textType.dataType).toEqualTypeOf<Table['textType']['dataType']>();
}

if (is(table.tinytext, MySqlText)) {
	expectTypeOf(table.tinytext).not.toBeNever();
	expectTypeOf(table.tinytext.dataType).toEqualTypeOf<Table['tinytext']['dataType']>();
}

if (is(table.tinytextEnum, MySqlText)) {
	expectTypeOf(table.tinytextEnum).not.toBeNever();
	expectTypeOf(table.tinytextEnum.dataType).toEqualTypeOf<Table['tinytextEnum']['dataType']>();
	expectTypeOf<typeof table.tinytextEnum.enumValues[number]>().toEqualTypeOf<'a' | 'b'>();
	expectTypeOf(table.tinytextEnum.enumValues).toExtend<[string, ...string[]]>();
}

if (is(table.mediumtext, MySqlText)) {
	expectTypeOf(table.mediumtext).not.toBeNever();
	expectTypeOf(table.mediumtext.dataType).toEqualTypeOf<Table['mediumtext']['dataType']>();
}

if (is(table.longtext, MySqlText)) {
	expectTypeOf(table.longtext).not.toBeNever();
	expectTypeOf(table.longtext.dataType).toEqualTypeOf<Table['longtext']['dataType']>();
}

if (is(table.time, MySqlTime)) {
	expectTypeOf(table.time).not.toBeNever();
	expectTypeOf(table.time.dataType).toEqualTypeOf<Table['time']['dataType']>();
}

if (is(table.timestamp, MySqlTimestamp)) {
	expectTypeOf(table.timestamp).not.toBeNever();
	expectTypeOf(table.timestamp.dataType).toEqualTypeOf<Table['timestamp']['dataType']>();
}

if (is(table.timestampString, MySqlTimestampString)) {
	expectTypeOf(table.timestampString).not.toBeNever();
	expectTypeOf(table.timestampString.dataType).toEqualTypeOf<Table['timestampString']['dataType']>();
}

if (is(table.tinyint, MySqlTinyInt)) {
	expectTypeOf(table.tinyint).not.toBeNever();
	expectTypeOf(table.tinyint.dataType).toEqualTypeOf<Table['tinyint']['dataType']>();
}

if (is(table.varbinary, MySqlVarBinary)) {
	expectTypeOf(table.varbinary).not.toBeNever();
	expectTypeOf(table.varbinary.dataType).toEqualTypeOf<Table['varbinary']['dataType']>();
}

if (is(table.varchar, MySqlVarChar)) {
	expectTypeOf(table.varchar).not.toBeNever();
	expectTypeOf(table.varchar.dataType).toEqualTypeOf<Table['varchar']['dataType']>();
}

if (is(table.varcharEnum, MySqlVarChar)) {
	expectTypeOf(table.varcharEnum).not.toBeNever();
	expectTypeOf(table.varcharEnum.dataType).toEqualTypeOf<Table['varcharEnum']['dataType']>();
	expectTypeOf<typeof table.varcharEnum.enumValues[number]>().toEqualTypeOf<'a' | 'b'>();
	expectTypeOf(table.varcharEnum.enumValues).toExtend<[string, ...string[]]>();
}

if (is(table.varcharEnumNotNull, MySqlVarChar)) {
	expectTypeOf(table.varcharEnumNotNull).not.toBeNever();
	expectTypeOf(table.varcharEnumNotNull.dataType).toEqualTypeOf<Table['varcharEnumNotNull']['dataType']>();
	expectTypeOf<typeof table.varcharEnumNotNull.enumValues[number]>().toEqualTypeOf<'a' | 'b'>();
	expectTypeOf(table.varcharEnumNotNull.enumValues).toExtend<[string, ...string[]]>();
}

if (is(table.year, MySqlYear)) {
	expectTypeOf(table.year).not.toBeNever();
	expectTypeOf(table.year.dataType).toEqualTypeOf<Table['year']['dataType']>();
}

if (is(table.blob, MySqlBufferBlob)) {
	expectTypeOf(table.blob).not.toBeNever();
	expectTypeOf(table.blob.dataType).toEqualTypeOf<Table['blob']['dataType']>();
}

if (is(table.blobString, MySqlStringBlob)) {
	expectTypeOf(table.blobString).not.toBeNever();
	expectTypeOf(table.blobString.dataType).toEqualTypeOf<Table['blobString']['dataType']>();
}

if (is(table.tinyblob, MySqlBufferBlob)) {
	expectTypeOf(table.tinyblob).not.toBeNever();
	expectTypeOf(table.tinyblob.dataType).toEqualTypeOf<Table['tinyblob']['dataType']>();
}

if (is(table.mediumblob, MySqlBufferBlob)) {
	expectTypeOf(table.mediumblob).not.toBeNever();
	expectTypeOf(table.mediumblob.dataType).toEqualTypeOf<Table['mediumblob']['dataType']>();
}

if (is(table.longblob, MySqlBufferBlob)) {
	expectTypeOf(table.longblob).not.toBeNever();
	expectTypeOf(table.longblob.dataType).toEqualTypeOf<Table['longblob']['dataType']>();
}

declare const column: unknown;

if (is(column, MySqlEnumColumn)) {
	expectTypeOf(column.enumValues).toExtend<[string, ...string[]]>();
}

if (is(column, MySqlEnumObjectColumn)) {
	expectTypeOf(column.enumValues).toExtend<[string, ...string[]]>();
}
