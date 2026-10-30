import { castToText, floatFromDouble, refineGenericMySqlCodecs } from '~/mysql-core/codecs.ts';
import { sql } from '~/sql/sql.ts';

export const mysql2Codecs = refineGenericMySqlCodecs({
	serial: {
		cast: castToText,
		normalize: Number,
	},
	bigint: {
		cast: castToText,
		normalize: BigInt,
	},
	'bigint:number': {
		cast: castToText,
		normalize: Number,
	},
	'bigint:string': {
		cast: castToText,
	},
	boolean: {
		normalize: (value: number) => value === 1,
	},
	date: {
		cast: castToText,
		normalize: (value: string) => new Date(value),
	},
	datetime: {
		cast: castToText,
		normalize: (value: string) => new Date(value.replace(' ', 'T') + 'Z'),
	},
	timestamp: {
		cast: castToText,
		normalize: (value: string) => new Date(value + '+0000'),
	},
	'decimal:number': {
		cast: castToText,
		normalize: Number,
	},
	'decimal:bigint': {
		cast: castToText,
		normalize: BigInt,
	},
	float: {
		cast: (name) => sql`cast(${name} as double)`,
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
	decimal: {
		cast: castToText,
	},
	'date:string': {
		cast: castToText,
	},
	'datetime:string': {
		cast: castToText,
	},
	'timestamp:string': {
		cast: castToText,
	},
	time: {
		cast: castToText,
	},
	json: {
		cast: castToText,
		normalize: JSON.parse,
	},
});
