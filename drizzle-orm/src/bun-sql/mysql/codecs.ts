import { castToText, floatFromDouble, refineGenericMySqlCodecs } from '~/mysql-core/codecs.ts';
import { sql } from '~/sql/sql.ts';

export const bunSqlMySqlCodecs = refineGenericMySqlCodecs({
	'bigint:number': {
		normalize: Number,
	},
	'bigint:string': {
		normalize: String,
	},
	boolean: {
		normalize: (value: number) => value === 1,
	},
	year: {
		// YEAR type is corrupted by driver in bun v1.3 and earlier
		cast: (name) => sql`cast(${name} as unsigned)`,
		normalize: Number,
	},
	'date:string': {
		normalize: (value: Date) => value.toISOString().slice(0, -14),
	},
	'datetime:string': {
		normalize: (value: Date) => value.toISOString().slice(0, -1).replace('T', ' '),
	},
	'timestamp:string': {
		cast: castToText,
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
