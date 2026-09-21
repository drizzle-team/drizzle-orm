import { type Equal, Expect } from 'type-tests/utils.ts';
import { type InferSelectModel } from '~/index.ts';
import { binary, mysqlTable, varbinary } from '~/mysql-core/index.ts';

const t = mysqlTable('t', {
	b: binary('b', { length: 16 }),
	bs: binary('bs', { length: 16, mode: 'string' }),
	vb: varbinary('vb', { length: 16 }),
	vbs: varbinary('vbs', { length: 16, mode: 'string' }),
});

type Row = InferSelectModel<typeof t>;
Expect<Equal<Row['b'], Buffer | null>>;
Expect<Equal<Row['bs'], string | null>>;
Expect<Equal<Row['vb'], Buffer | null>>;
Expect<Equal<Row['vbs'], string | null>>;
