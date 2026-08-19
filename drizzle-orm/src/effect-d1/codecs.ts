import {
	booleanFromInteger,
	bufferFromBinaryIfAvailable,
	castToText,
	dateFromStoredMilliseconds,
	dateFromStoredSeconds,
	refineSqliteCodecs,
} from '~/sqlite-core/codecs.ts';

// D1 returns blobs as `ArrayBuffer` on workerd and as a plain byte array on miniflare
export const effectD1Codecs = refineSqliteCodecs({
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
