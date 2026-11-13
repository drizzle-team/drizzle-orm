import { castToText, refineGenericMsSqlCodecs } from '~/mssql-core/codecs.ts';

export const nodeMssqlCodecs = refineGenericMsSqlCodecs({
	bigint: {
		normalize: BigInt,
	},
	'bigint:number': {
		normalize: Number,
	},
	decimal: {
		cast: castToText,
	},
	'decimal:number': {
		cast: castToText,
		normalize: Number,
	},
	'decimal:bigint': {
		cast: castToText,
		normalize: BigInt,
	},
	numeric: {
		cast: castToText,
	},
	'numeric:number': {
		cast: castToText,
		normalize: Number,
	},
	'numeric:bigint': {
		cast: castToText,
		normalize: BigInt,
	},
});
