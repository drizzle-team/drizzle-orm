import { castToText, floatFromDouble, refineGenericMySqlCodecs } from '~/mysql-core/codecs.ts';

export const effectMysql2Codecs = refineGenericMySqlCodecs({
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
		cast: castToText,
		normalize: (value: string) => new Date(value),
	},
	'date:string': {
		cast: castToText,
	},
	datetime: {
		cast: castToText,
		normalize: (value: string) => new Date(value.replace(' ', 'T') + 'Z'),
	},
	'datetime:string': {
		cast: castToText,
	},
	timestamp: {
		cast: castToText,
		normalize: (value: string) => new Date(value + '+0000'),
	},
	'timestamp:string': {
		cast: castToText,
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
