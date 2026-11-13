import {
	bigintFromBlob,
	booleanFromInteger,
	dateFromStoredMilliseconds,
	dateFromStoredSeconds,
	jsonFromBlob,
	numericBigintFromValue,
	numericTextFromValue,
	refineSqliteCodecs,
} from '~/sqlite-core/codecs.ts';

const driver = 'sqlite-cloud';

export const sqliteCloudCodecs = refineSqliteCodecs({
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
