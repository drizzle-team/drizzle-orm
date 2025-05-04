import { blob, integer, numeric, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const allDataTypes = sqliteTable('all_data_types', {
	integerNumber: integer('integer_number', { mode: 'number' }),
	integerBoolean: integer('integer_boolean', { mode: 'boolean' }),
	integerTimestamp: integer('integer_timestamp', { mode: 'timestamp' }),
	integerTimestampms: integer('integer_timestampms', { mode: 'timestamp_ms' }),
	real: real('real'),
	text: text('text', { mode: 'text' }),
	textJson: text('text_json', { mode: 'json' }),
	blobBigint: blob('blob_bigint', { mode: 'bigint' }),
	blobBuffer: blob('blob_buffer', { mode: 'buffer' }),
	blobJson: blob('blob_json', { mode: 'json' }),
	numeric: numeric('numeric'),
});
