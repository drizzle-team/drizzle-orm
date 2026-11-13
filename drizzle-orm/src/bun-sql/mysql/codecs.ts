import { floatFromDouble, mysqlDatetimeTextFromUtcDate, refineGenericMySqlCodecs } from '~/mysql-core/codecs.ts';

/** `YYYY-MM-DD` of a `date` the driver decoded to UTC midnight */
const dateTextFromUtc = (value: Date): string =>
	`${String(value.getUTCFullYear()).padStart(4, '0')}-${String(value.getUTCMonth() + 1).padStart(2, '0')}-${
		String(value.getUTCDate()).padStart(2, '0')
	}`;

export const bunSqlMySqlCodecs = refineGenericMySqlCodecs({
	serial: {
		normalize: Number,
	},
	bigint: {
		normalize: BigInt,
	},
	'bigint:number': {
		normalize: Number,
	},
	'bigint:string': {
		normalize: String,
	},
	boolean: {
		normalize: (value: number) => value === 1,
	},
	'date:string': {
		normalize: dateTextFromUtc,
	},
	'datetime:string': {
		normalize: mysqlDatetimeTextFromUtcDate,
	},
	'timestamp:string': {
		normalize: mysqlDatetimeTextFromUtcDate,
	},
	'decimal:number': {
		normalize: Number,
	},
	'decimal:bigint': {
		normalize: BigInt,
	},
	float: {
		normalize: floatFromDouble,
	},
	binary: {
		normalize: (value: Buffer) => value.toString(),
	},
	varbinary: {
		normalize: (value: Buffer) => value.toString(),
	},
	blob: {
		normalize: (value: Buffer) => value.toString('utf8'),
	},
	tinyblob: {
		normalize: (value: Buffer) => value.toString('utf8'),
	},
	mediumblob: {
		normalize: (value: Buffer) => value.toString('utf8'),
	},
	longblob: {
		normalize: (value: Buffer) => value.toString('utf8'),
	},
});
