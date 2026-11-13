import {
	bigintFromBlob,
	booleanFromInteger,
	bufferFromBytesIfAvailable,
	dateFromStoredMilliseconds,
	dateFromStoredSeconds,
	jsonFromBlob,
	numericBigintFromValue,
	numericTextFromValue,
	refineSqliteCodecs,
} from '~/sqlite-core/codecs.ts';

const driver = 'sql-js';

export const sqlJsCodecs = refineSqliteCodecs({
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
		normalize: numericTextFromValue(driver),
	},
	'numeric:number': {
		normalize: Number,
	},
	'numeric:bigint': {
		normalize: numericBigintFromValue(driver),
	},
});
