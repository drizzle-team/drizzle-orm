import { type Equal, Expect } from 'type-tests/utils.ts';
import { binary, mysqlTable, varbinary } from '~/mysql-core/index.ts';

// Default mode ('string') must be unchanged — backwards compatibility.
{
	const table = mysqlTable('binary_string_mode', {
		bin: binary('bin', { length: 16 }),
		binNoConfig: binary('bin_no_config'),
		varbin: varbinary('varbin', { length: 16 }),
	});

	Expect<Equal<string | null, typeof table.$inferSelect.bin>>;
	Expect<Equal<string | null, typeof table.$inferSelect.binNoConfig>>;
	Expect<Equal<string | null, typeof table.$inferSelect.varbin>>;
}

// Explicit string mode behaves like the default.
{
	const table = mysqlTable('binary_explicit_string_mode', {
		bin: binary('bin', { length: 16, mode: 'string' }),
		varbin: varbinary('varbin', { length: 16, mode: 'string' }),
	});

	Expect<Equal<string | null, typeof table.$inferSelect.bin>>;
	Expect<Equal<string | null, typeof table.$inferSelect.varbin>>;
}

// Buffer mode — the point of the fix. Non-UTF8 bytes must stay Buffers.
{
	const table = mysqlTable('binary_buffer_mode', {
		bin: binary('bin', { length: 16, mode: 'buffer' }),
		varbin: varbinary('varbin', { length: 16, mode: 'buffer' }),
	});

	Expect<Equal<Buffer | null, typeof table.$inferSelect.bin>>;
	Expect<Equal<Buffer | null, typeof table.$inferSelect.varbin>>;
	Expect<Equal<Buffer | null | undefined, typeof table.$inferInsert.bin>>;
	Expect<Equal<Buffer | null | undefined, typeof table.$inferInsert.varbin>>;
}

// Anonymous (nameless) column form must support mode too.
{
	const table = mysqlTable('binary_anonymous', {
		bin: binary({ length: 16, mode: 'buffer' }),
		varbin: varbinary({ length: 16, mode: 'buffer' }),
		binStr: binary({ length: 16 }),
		varbinStr: varbinary({ length: 16 }),
	});

	Expect<Equal<Buffer | null, typeof table.$inferSelect.bin>>;
	Expect<Equal<Buffer | null, typeof table.$inferSelect.varbin>>;
	Expect<Equal<string | null, typeof table.$inferSelect.binStr>>;
	Expect<Equal<string | null, typeof table.$inferSelect.varbinStr>>;
}
