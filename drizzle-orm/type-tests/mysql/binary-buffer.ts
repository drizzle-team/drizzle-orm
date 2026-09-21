import { type Equal, Expect } from 'type-tests/utils.ts';
import { binary, mysqlTable, varbinary } from '~/mysql-core/index.ts';

const table = mysqlTable('binary_buffer_types', {
	binary: binary('binary').notNull(),
	varbinary: varbinary('varbinary', { length: 255 }).notNull(),
});

Expect<Equal<typeof table.$inferSelect.binary, Buffer>>;
Expect<Equal<typeof table.$inferSelect.varbinary, Buffer>>;
Expect<Equal<typeof table.$inferInsert.binary, Buffer>>;
Expect<Equal<typeof table.$inferInsert.varbinary, Buffer>>;

// Keep accepting string SQL defaults for backwards compatibility while
// the selected/inserted application data type is correctly inferred as Buffer.
binary('binary_default').default('');
varbinary('varbinary_default', { length: 255 }).default('');
