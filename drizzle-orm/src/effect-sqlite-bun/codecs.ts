import {
	bigintFromBlob,
	booleanFromInteger,
	bufferFromBytes,
	dateFromStoredMilliseconds,
	dateFromStoredSeconds,
	jsonFromBlob,
	refineSqliteCodecs,
} from '~/sqlite-core/codecs.ts';

export const effectSQLiteBunCodecs = refineSqliteCodecs({
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
	// integers of union branches decoded as `real` arrive as bigints on decoded queries
	real: {
		normalize: Number,
	},
	'text:json': {
		normalize: JSON.parse,
	},
	blob: {
		normalize: bufferFromBytes,
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
