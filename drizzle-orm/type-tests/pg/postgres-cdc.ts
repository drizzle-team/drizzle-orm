import { replicate, type ReplicateHandle, type ReplicateOptions } from '~/postgres/cdc.ts';
import { createPool } from '~/postgres/index.ts';
import { type Equal, Expect } from '../utils.ts';

Expect<Equal<ReturnType<typeof replicate>, ReplicateHandle>>;
Expect<Equal<Parameters<typeof replicate>[0], ReplicateOptions>>;

const pool = createPool('postgres://localhost/db');

const handle = pool.replicate({ slot: 'temporary', publications: ['pub'], onTransaction: () => {} });
Expect<Equal<typeof handle, ReplicateHandle>>;

// @ts-expect-error The pool gives the connection settings, so `url` is not an option.
pool.replicate({ url: 'postgres://localhost/db', slot: 'temporary', publications: ['pub'], onTransaction: () => {} });
