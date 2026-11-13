import {
	booleanFromInteger,
	bufferFromBinaryIfAvailable,
	castToText,
	dateFromStoredMilliseconds,
	dateFromStoredSeconds,
	refineSqliteCodecs,
} from '~/sqlite-core/codecs.ts';

export const effectLibsqlCodecs = refineSqliteCodecs({
	'integer:boolean': {
		normalize: booleanFromInteger,
	},
	'integer:timestamp': {
		normalize: dateFromStoredSeconds,
	},
	'integer:timestamp_ms': {
		normalize: dateFromStoredMilliseconds,
	},
	'text:json': {
		normalize: JSON.parse,
	},
	blob: {
		normalize: bufferFromBinaryIfAvailable,
	},
	'blob:json': {
		cast: castToText,
		normalize: JSON.parse,
	},
	'blob:bigint': {
		cast: castToText,
		normalize: BigInt,
	},
	numeric: {
		cast: castToText,
		normalize: String,
	},
	'numeric:number': {
		normalize: Number,
	},
	'numeric:bigint': {
		cast: castToText,
		normalize: BigInt,
	},
});
