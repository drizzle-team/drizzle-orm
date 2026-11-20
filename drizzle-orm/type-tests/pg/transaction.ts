import type { PgTransactionConfig } from '~/pg-core/session.ts';
import { db } from './db.ts';

// `snapshot` needs an isolation level that can import one
{
	const ok: PgTransactionConfig[] = [
		{},
		{ isolationLevel: 'read committed', accessMode: 'read only', deferrable: true },
		{ isolationLevel: 'repeatable read', snapshot: '00000003-0000001B-1' },
		{ isolationLevel: 'serializable', accessMode: 'read only', deferrable: true, snapshot: '00000003-0000001B-1' },
	];
	void ok;

	// @ts-expect-error - no isolation level: the server default, `read committed`, can't import a snapshot
	const noIsolation: PgTransactionConfig = { snapshot: '00000003-0000001B-1' };
	// @ts-expect-error - `read committed` can't import a snapshot
	const readCommitted: PgTransactionConfig = { isolationLevel: 'read committed', snapshot: '00000003-0000001B-1' };
	// @ts-expect-error - `read uncommitted` can't import a snapshot
	const readUncommitted: PgTransactionConfig = { isolationLevel: 'read uncommitted', snapshot: '00000003-0000001B-1' };
	void [noIsolation, readCommitted, readUncommitted];

	// same at the call site
	db.transaction(async () => {}, { isolationLevel: 'repeatable read', snapshot: '00000003-0000001B-1' });
	// @ts-expect-error - no isolation level
	db.transaction(async () => {}, { snapshot: '00000003-0000001B-1' });
	// @ts-expect-error - `read committed` can't import a snapshot
	db.transaction(async () => {}, { isolationLevel: 'read committed', snapshot: '00000003-0000001B-1' });
}
