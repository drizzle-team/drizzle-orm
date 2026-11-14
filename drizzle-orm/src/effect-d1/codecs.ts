import {
	bigintFromBlob,
	booleanFromInteger,
	bufferFromBinaryIfAvailable,
	dateFromStoredMilliseconds,
	dateFromStoredSeconds,
	jsonFromBlob,
	numericBigintFromValue,
	numericTextFromValue,
	refineSqliteCodecs,
} from '~/sqlite-core/codecs.ts';

// D1 returns blobs as `ArrayBuffer` on workerd and as a plain byte array on miniflare
const driver = 'effect-d1';

export const effectD1Codecs = refineSqliteCodecs({
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
		normalize: bufferFromBinaryIfAvailable,
	},
	'blob:json': {
		normalize: jsonFromBlob,
	},
	'blob:bigint': {
		normalize: bigintFromBlob,
	},
	numeric: {
		normalize: numericTextFromValue(driver),
	},
	'numeric:number': {
		normalize: Number,
	},
	'numeric:bigint': {
		normalize: numericBigintFromValue(driver),
	},
});
