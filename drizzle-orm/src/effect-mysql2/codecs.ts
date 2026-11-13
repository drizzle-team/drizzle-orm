import {
	floatFromDouble,
	mysqlDateFromText,
	mysqlDatetimeFromText,
	mysqlTimestampFromText,
	refineGenericMySqlCodecs,
} from '~/mysql-core/codecs.ts';

export const effectMysql2Codecs = refineGenericMySqlCodecs({
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
	'decimal:number': {
		normalize: Number,
	},
	'decimal:bigint': {
		normalize: BigInt,
	},
	float: {
		normalize: floatFromDouble,
	},
	date: {
		normalize: mysqlDateFromText,
	},
	datetime: {
		normalize: mysqlDatetimeFromText,
	},
	timestamp: {
		normalize: mysqlTimestampFromText,
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
