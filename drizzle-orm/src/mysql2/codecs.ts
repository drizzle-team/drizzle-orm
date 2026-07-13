import { floatFromDouble, refineGenericMySqlCodecs } from '~/mysql-core/codecs.ts';
import { sql } from '~/sql/sql.ts';

export const mysql2Codecs = refineGenericMySqlCodecs({
	bigint: {
		normalize: BigInt,
	},
	'bigint:number': {
		normalize: Number,
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
});
