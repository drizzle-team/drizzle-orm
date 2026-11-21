import { refineGenericMySqlCodecs } from '~/mysql-core/codecs.ts';

export const mysql2Codecs = refineGenericMySqlCodecs({
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
	date: {
		normalize: (value: string) => new Date(value),
	},
	datetime: {
		normalize: (value: string) => new Date(value.replace(' ', 'T') + 'Z'),
	},
	timestamp: {
		normalize: (value: string) => new Date(value + '+0000'),
	},
	'decimal:number': {
		normalize: Number,
	},
	'decimal:bigint': {
		normalize: BigInt,
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
