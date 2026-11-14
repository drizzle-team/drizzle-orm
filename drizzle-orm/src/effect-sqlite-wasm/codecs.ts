import {
	bigintFromBlob,
	booleanFromInteger,
	bufferFromBytesIfAvailable,
	dateFromStoredMilliseconds,
	dateFromStoredSeconds,
	jsonFromBlob,
	refineSqliteCodecs,
} from '~/sqlite-core/codecs.ts';

export const effectSQLiteWasmCodecs = refineSqliteCodecs({
	integer: {
		normalize: Number,
	},
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
		normalize: bufferFromBytesIfAvailable,
	},
	'blob:json': {
		normalize: jsonFromBlob,
	},
	'blob:bigint': {
		normalize: bigintFromBlob,
	},
	numeric: {
		normalize: String,
	},
	'numeric:number': {
		normalize: Number,
	},
	'numeric:bigint': {
		normalize: BigInt,
	},
});
