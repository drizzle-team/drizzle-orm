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

const driver = 'expo-sqlite';

export const expoSQLiteCodecs = refineSqliteCodecs({
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
