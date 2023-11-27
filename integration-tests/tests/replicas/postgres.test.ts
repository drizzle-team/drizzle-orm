import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { boolean, jsonb, pgTable, serial, text, timestamp, withReplicas } from 'drizzle-orm/pg-core';
import { describe, expect, it, vi } from 'vitest';

const usersTable = pgTable('users', {
	id: serial('id' as string).primaryKey(),
	name: text('name').notNull(),
	verified: boolean('verified').notNull().default(false),
	jsonb: jsonb('jsonb').$type<string[]>(),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

describe('[select] read replicas postgres', () => {
	it('primary select', () => {
		const primaryDb = drizzle({} as any);
		const read1 = drizzle({} as any);
		const read2 = drizzle({} as any);

		const db = withReplicas(primaryDb, [read1, read2]);

		const spyPrimary = vi.spyOn(primaryDb, 'select');
		const spyRead1 = vi.spyOn(read1, 'select');
		const spyRead2 = vi.spyOn(read2, 'select');

		db.$primary.select().from({} as any);

		expect(spyPrimary).toHaveBeenCalledTimes(1);
		expect(spyRead1).toHaveBeenCalledTimes(0);
		expect(spyRead2).toHaveBeenCalledTimes(0);
	});

	it('random replica select', () => {
		const primaryDb = drizzle({} as any);
		const read1 = drizzle({} as any);
		const read2 = drizzle({} as any);

		const randomMockReplica = vi.fn().mockReturnValueOnce(read1).mockReturnValueOnce(read2);

		const db = withReplicas(primaryDb, [read1, read2], () => {
			return randomMockReplica();
		});

		const spyPrimary = vi.spyOn(primaryDb, 'select');
		const spyRead1 = vi.spyOn(read1, 'select');
		const spyRead2 = vi.spyOn(read2, 'select');

		db.select().from({} as any);

		expect(spyPrimary).toHaveBeenCalledTimes(0);
		expect(spyRead1).toHaveBeenCalledTimes(1);
		expect(spyRead2).toHaveBeenCalledTimes(0);

		db.select().from({} as any);
		expect(spyRead1).toHaveBeenCalledTimes(1);
		expect(spyRead2).toHaveBeenCalledTimes(1);
	});

	it('single read replica select', () => {
		const primaryDb = drizzle({} as any);
		const read1 = drizzle({} as any);

		const db = withReplicas(primaryDb, [read1]);

		const spyPrimary = vi.spyOn(primaryDb, 'select');
		const spyRead1 = vi.spyOn(read1, 'select');

		db.select().from({} as any);

		expect(spyPrimary).toHaveBeenCalledTimes(0);
		expect(spyRead1).toHaveBeenCalledTimes(1);

		db.select().from({} as any);
		expect(spyRead1).toHaveBeenCalledTimes(2);
	});

	it('single read replica select + primary select', () => {
		const primaryDb = drizzle({} as any);
		const read1 = drizzle({} as any);

		const db = withReplicas(primaryDb, [read1]);

		const spyPrimary = vi.spyOn(primaryDb, 'select');
		const spyRead1 = vi.spyOn(read1, 'select');

		db.select().from({} as any);

		expect(spyPrimary).toHaveBeenCalledTimes(0);
		expect(spyRead1).toHaveBeenCalledTimes(1);

		db.$primary.select().from({} as any);
		expect(spyPrimary).toHaveBeenCalledTimes(1);
		expect(spyRead1).toHaveBeenCalledTimes(1);
	});

	it('always first read select', () => {
		const primaryDb = drizzle({} as any);
		const read1 = drizzle({} as any);
		const read2 = drizzle({} as any);

		const db = withReplicas(primaryDb, [read1, read2], (replicas) => {
			return replicas[0]!;
		});

		const spyPrimary = vi.spyOn(primaryDb, 'select');
		const spyRead1 = vi.spyOn(read1, 'select');
		const spyRead2 = vi.spyOn(read2, 'select');

		db.select().from({} as any);

		expect(spyPrimary).toHaveBeenCalledTimes(0);
		expect(spyRead1).toHaveBeenCalledTimes(1);
		expect(spyRead2).toHaveBeenCalledTimes(0);

		db.select().from({} as any);
		expect(spyRead1).toHaveBeenCalledTimes(2);
		expect(spyRead2).toHaveBeenCalledTimes(0);
	});
});

describe('[selectDistinct] read replicas postgres', () => {
	it('primary selectDistinct', () => {
		const primaryDb = drizzle({} as any);
		const read1 = drizzle({} as any);
		const read2 = drizzle({} as any);

		const db = withReplicas(primaryDb, [read1, read2]);

		const spyPrimary = vi.spyOn(primaryDb, 'selectDistinct');
		const spyRead1 = vi.spyOn(read1, 'selectDistinct');
		const spyRead2 = vi.spyOn(read2, 'selectDistinct');

		db.$primary.selectDistinct().from({} as any);

		expect(spyPrimary).toHaveBeenCalledTimes(1);
		expect(spyRead1).toHaveBeenCalledTimes(0);
		expect(spyRead2).toHaveBeenCalledTimes(0);
	});

	it('random replica selectDistinct', () => {
		const primaryDb = drizzle({} as any);
		const read1 = drizzle({} as any);
		const read2 = drizzle({} as any);

		const randomMockReplica = vi.fn().mockReturnValueOnce(read1).mockReturnValueOnce(read2);

		const db = withReplicas(primaryDb, [read1, read2], () => {
			return randomMockReplica();
		});

		const spyPrimary = vi.spyOn(primaryDb, 'selectDistinct');
		const spyRead1 = vi.spyOn(read1, 'selectDistinct');
		const spyRead2 = vi.spyOn(read2, 'selectDistinct');

		db.selectDistinct().from({} as any);

		expect(spyPrimary).toHaveBeenCalledTimes(0);
		expect(spyRead1).toHaveBeenCalledTimes(1);
		expect(spyRead2).toHaveBeenCalledTimes(0);

		db.selectDistinct().from({} as any);
		expect(spyRead1).toHaveBeenCalledTimes(1);
		expect(spyRead2).toHaveBeenCalledTimes(1);
	});

	it('single read replica selectDistinct', () => {
		const primaryDb = drizzle({} as any);
		const read1 = drizzle({} as any);

		const db = withReplicas(primaryDb, [read1]);

		const spyPrimary = vi.spyOn(primaryDb, 'selectDistinct');
		const spyRead1 = vi.spyOn(read1, 'selectDistinct');

		db.selectDistinct().from({} as any);

		expect(spyPrimary).toHaveBeenCalledTimes(0);
		expect(spyRead1).toHaveBeenCalledTimes(1);

		db.selectDistinct().from({} as any);
		expect(spyRead1).toHaveBeenCalledTimes(2);
	});

	it('single read replica selectDistinct + primary selectDistinct', () => {
		const primaryDb = drizzle({} as any);
		const read1 = drizzle({} as any);

		const db = withReplicas(primaryDb, [read1]);

		const spyPrimary = vi.spyOn(primaryDb, 'selectDistinct');
		const spyRead1 = vi.spyOn(read1, 'selectDistinct');

		db.selectDistinct().from({} as any);

		expect(spyPrimary).toHaveBeenCalledTimes(0);
		expect(spyRead1).toHaveBeenCalledTimes(1);

		db.$primary.selectDistinct().from({} as any);
		expect(spyPrimary).toHaveBeenCalledTimes(1);
		expect(spyRead1).toHaveBeenCalledTimes(1);
	});

	it('always first read selectDistinct', () => {
		const primaryDb = drizzle({} as any);
		const read1 = drizzle({} as any);
		const read2 = drizzle({} as any);

		const db = withReplicas(primaryDb, [read1, read2], (replicas) => {
			return replicas[0]!;
		});

		const spyPrimary = vi.spyOn(primaryDb, 'selectDistinct');
		const spyRead1 = vi.spyOn(read1, 'selectDistinct');
		const spyRead2 = vi.spyOn(read2, 'selectDistinct');

		db.selectDistinct().from({} as any);

		expect(spyPrimary).toHaveBeenCalledTimes(0);
		expect(spyRead1).toHaveBeenCalledTimes(1);
		expect(spyRead2).toHaveBeenCalledTimes(0);

		db.selectDistinct().from({} as any);
		expect(spyRead1).toHaveBeenCalledTimes(2);
		expect(spyRead2).toHaveBeenCalledTimes(0);
	});
});

describe('[selectDistinctOn] read replicas postgres', () => {
	it('primary selectDistinctOn', () => {
		const primaryDb = drizzle({} as any);
		const read1 = drizzle({} as any);
		const read2 = drizzle({} as any);

		const db = withReplicas(primaryDb, [read1, read2]);

		const spyPrimary = vi.spyOn(primaryDb, 'selectDistinctOn');
		const spyRead1 = vi.spyOn(read1, 'selectDistinctOn');
		const spyRead2 = vi.spyOn(read2, 'selectDistinctOn');

		db.$primary.selectDistinctOn({} as any).from({} as any);

		expect(spyPrimary).toHaveBeenCalledTimes(1);
		expect(spyRead1).toHaveBeenCalledTimes(0);
		expect(spyRead2).toHaveBeenCalledTimes(0);
	});

	it('random replica selectDistinctOn', () => {
		const primaryDb = drizzle({} as any);
		const read1 = drizzle({} as any);
		const read2 = drizzle({} as any);

		const randomMockReplica = vi.fn().mockReturnValueOnce(read1).mockReturnValueOnce(read2);

		const db = withReplicas(primaryDb, [read1, read2], () => {
			return randomMockReplica();
		});

		const spyPrimary = vi.spyOn(primaryDb, 'selectDistinctOn');
		const spyRead1 = vi.spyOn(read1, 'selectDistinctOn');
		const spyRead2 = vi.spyOn(read2, 'selectDistinctOn');

		db.selectDistinctOn({} as any).from({} as any);

		expect(spyPrimary).toHaveBeenCalledTimes(0);
		expect(spyRead1).toHaveBeenCalledTimes(1);
		expect(spyRead2).toHaveBeenCalledTimes(0);

		db.selectDistinctOn({} as any).from({} as any);
		expect(spyRead1).toHaveBeenCalledTimes(1);
		expect(spyRead2).toHaveBeenCalledTimes(1);
	});

	it('single read replica selectDistinctOn', () => {
		const primaryDb = drizzle({} as any);
		const read1 = drizzle({} as any);

		const db = withReplicas(primaryDb, [read1]);

		const spyPrimary = vi.spyOn(primaryDb, 'selectDistinctOn');
		const spyRead1 = vi.spyOn(read1, 'selectDistinctOn');

		db.selectDistinctOn({} as any).from({} as any);

		expect(spyPrimary).toHaveBeenCalledTimes(0);
		expect(spyRead1).toHaveBeenCalledTimes(1);

		db.selectDistinctOn({} as any).from({} as any);
		expect(spyRead1).toHaveBeenCalledTimes(2);
	});

	it('single read replica selectDistinctOn + primary selectDistinctOn', () => {
		const primaryDb = drizzle({} as any);
		const read1 = drizzle({} as any);

		const db = withReplicas(primaryDb, [read1]);

		const spyPrimary = vi.spyOn(primaryDb, 'selectDistinctOn');
		const spyRead1 = vi.spyOn(read1, 'selectDistinctOn');

		db.selectDistinctOn({} as any).from({} as any);

		expect(spyPrimary).toHaveBeenCalledTimes(0);
		expect(spyRead1).toHaveBeenCalledTimes(1);

		db.$primary.selectDistinctOn({} as any).from({} as any);
		expect(spyPrimary).toHaveBeenCalledTimes(1);
		expect(spyRead1).toHaveBeenCalledTimes(1);
	});

	it('always first read selectDistinctOn', () => {
		const primaryDb = drizzle({} as any);
		const read1 = drizzle({} as any);
		const read2 = drizzle({} as any);

		const db = withReplicas(primaryDb, [read1, read2], (replicas) => {
			return replicas[0]!;
		});

		const spyPrimary = vi.spyOn(primaryDb, 'selectDistinctOn');
		const spyRead1 = vi.spyOn(read1, 'selectDistinctOn');
		const spyRead2 = vi.spyOn(read2, 'selectDistinctOn');

		db.selectDistinctOn({} as any).from({} as any);

		expect(spyPrimary).toHaveBeenCalledTimes(0);
		expect(spyRead1).toHaveBeenCalledTimes(1);
		expect(spyRead2).toHaveBeenCalledTimes(0);

		db.selectDistinctOn({} as any).from({} as any);
		expect(spyRead1).toHaveBeenCalledTimes(2);
		expect(spyRead2).toHaveBeenCalledTimes(0);
	});
});

describe('[with] read replicas postgres', () => {
	it('primary with', () => {
		const primaryDb = drizzle({} as any);
		const read1 = drizzle({} as any);
		const read2 = drizzle({} as any);

		const db = withReplicas(primaryDb, [read1, read2]);

		const spyPrimary = vi.spyOn(primaryDb, 'with');
		const spyRead1 = vi.spyOn(read1, 'with');
		const spyRead2 = vi.spyOn(read2, 'with');

		db.$primary.with();

		expect(spyPrimary).toHaveBeenCalledTimes(1);
		expect(spyRead1).toHaveBeenCalledTimes(0);
		expect(spyRead2).toHaveBeenCalledTimes(0);
	});

	it('random replica with', () => {
		const primaryDb = drizzle({} as any);
		const read1 = drizzle({} as any);
		const read2 = drizzle({} as any);

		const randomMockReplica = vi.fn().mockReturnValueOnce(read1).mockReturnValueOnce(read2);

		const db = withReplicas(primaryDb, [read1, read2], () => {
			return randomMockReplica();
		});

		const spyPrimary = vi.spyOn(primaryDb, 'with');
		const spyRead1 = vi.spyOn(read1, 'with');
		const spyRead2 = vi.spyOn(read2, 'with');

		db.with();

		expect(spyPrimary).toHaveBeenCalledTimes(0);
		expect(spyRead1).toHaveBeenCalledTimes(1);
		expect(spyRead2).toHaveBeenCalledTimes(0);

		db.with();
		expect(spyRead1).toHaveBeenCalledTimes(1);
		expect(spyRead2).toHaveBeenCalledTimes(1);
	});

	it('single read replica with', () => {
		const primaryDb = drizzle({} as any);
		const read1 = drizzle({} as any);

		const db = withReplicas(primaryDb, [read1]);

		const spyPrimary = vi.spyOn(primaryDb, 'with');
		const spyRead1 = vi.spyOn(read1, 'with');

		db.with();

		expect(spyPrimary).toHaveBeenCalledTimes(0);
		expect(spyRead1).toHaveBeenCalledTimes(1);

		db.with();
		expect(spyRead1).toHaveBeenCalledTimes(2);
	});

	it('single read replica with + primary with', () => {
		const primaryDb = drizzle({} as any);
		const read1 = drizzle({} as any);

		const db = withReplicas(primaryDb, [read1]);

		const spyPrimary = vi.spyOn(primaryDb, 'with');
		const spyRead1 = vi.spyOn(read1, 'with');

		db.with();

		expect(spyPrimary).toHaveBeenCalledTimes(0);
		expect(spyRead1).toHaveBeenCalledTimes(1);

		db.$primary.with();
		expect(spyPrimary).toHaveBeenCalledTimes(1);
		expect(spyRead1).toHaveBeenCalledTimes(1);
	});

	it('always first read with', () => {
		const primaryDb = drizzle({} as any);
		const read1 = drizzle({} as any);
		const read2 = drizzle({} as any);

		const db = withReplicas(primaryDb, [read1, read2], (replicas) => {
			return replicas[0]!;
		});

		const spyPrimary = vi.spyOn(primaryDb, 'with');
		const spyRead1 = vi.spyOn(read1, 'with');
		const spyRead2 = vi.spyOn(read2, 'with');

		db.with();

		expect(spyPrimary).toHaveBeenCalledTimes(0);
		expect(spyRead1).toHaveBeenCalledTimes(1);
		expect(spyRead2).toHaveBeenCalledTimes(0);

		db.with();
		expect(spyRead1).toHaveBeenCalledTimes(2);
		expect(spyRead2).toHaveBeenCalledTimes(0);
	});
});

describe('[update] replicas postgres', () => {
	it('primary update', () => {
		const primaryDb = drizzle({} as any);
		const read1 = drizzle({} as any);
		const read2 = drizzle({} as any);

		const db = withReplicas(primaryDb, [read1, read2]);

		const spyPrimary = vi.spyOn(primaryDb, 'update');
		const spyRead1 = vi.spyOn(read1, 'update');
		const spyRead2 = vi.spyOn(read2, 'update');

		db.update({} as any);

		expect(spyPrimary).toHaveBeenCalledTimes(1);
		expect(spyRead1).toHaveBeenCalledTimes(0);
		expect(spyRead2).toHaveBeenCalledTimes(0);

		db.update({} as any);

		expect(spyPrimary).toHaveBeenCalledTimes(2);
		expect(spyRead1).toHaveBeenCalledTimes(0);
		expect(spyRead2).toHaveBeenCalledTimes(0);

		db.$primary.update({} as any);

		expect(spyPrimary).toHaveBeenCalledTimes(3);
		expect(spyRead1).toHaveBeenCalledTimes(0);
		expect(spyRead2).toHaveBeenCalledTimes(0);
	});
});

describe('[delete] replicas postgres', () => {
	it('primary delete', () => {
		const primaryDb = drizzle({} as any);
		const read1 = drizzle({} as any);
		const read2 = drizzle({} as any);

		const db = withReplicas(primaryDb, [read1, read2]);

		const spyPrimary = vi.spyOn(primaryDb, 'delete');
		const spyRead1 = vi.spyOn(read1, 'delete');
		const spyRead2 = vi.spyOn(read2, 'delete');

		db.delete({} as any);

		expect(spyPrimary).toHaveBeenCalledTimes(1);
		expect(spyRead1).toHaveBeenCalledTimes(0);
		expect(spyRead2).toHaveBeenCalledTimes(0);

		db.delete({} as any);

		expect(spyPrimary).toHaveBeenCalledTimes(2);
		expect(spyRead1).toHaveBeenCalledTimes(0);
		expect(spyRead2).toHaveBeenCalledTimes(0);

		db.$primary.delete({} as any);

		expect(spyPrimary).toHaveBeenCalledTimes(3);
		expect(spyRead1).toHaveBeenCalledTimes(0);
		expect(spyRead2).toHaveBeenCalledTimes(0);
	});
});

describe('[insert] replicas postgres', () => {
	it('primary insert', () => {
		const primaryDb = drizzle({} as any);
		const read1 = drizzle({} as any);
		const read2 = drizzle({} as any);

		const db = withReplicas(primaryDb, [read1, read2]);

		const spyPrimary = vi.spyOn(primaryDb, 'insert');
		const spyRead1 = vi.spyOn(read1, 'insert');
		const spyRead2 = vi.spyOn(read2, 'insert');

		db.insert({} as any);

		expect(spyPrimary).toHaveBeenCalledTimes(1);
		expect(spyRead1).toHaveBeenCalledTimes(0);
		expect(spyRead2).toHaveBeenCalledTimes(0);

		db.insert({} as any);

		expect(spyPrimary).toHaveBeenCalledTimes(2);
		expect(spyRead1).toHaveBeenCalledTimes(0);
		expect(spyRead2).toHaveBeenCalledTimes(0);

		db.$primary.insert({} as any);

		expect(spyPrimary).toHaveBeenCalledTimes(3);
		expect(spyRead1).toHaveBeenCalledTimes(0);
		expect(spyRead2).toHaveBeenCalledTimes(0);
	});
});

describe('[execute] replicas postgres', () => {
	it('primary execute', async () => {
		const primaryDb = drizzle({} as any);
		const read1 = drizzle({} as any);
		const read2 = drizzle({} as any);

		const db = withReplicas(primaryDb, [read1, read2]);

		const spyPrimary = vi.spyOn(primaryDb, 'execute');
		const spyRead1 = vi.spyOn(read1, 'execute');
		const spyRead2 = vi.spyOn(read2, 'execute');

		// expect(db.execute(sql``)).rejects.toThrow();

		try {
			db.execute(sql``);
		} catch { /* empty */ }

		expect(spyPrimary).toHaveBeenCalledTimes(1);
		expect(spyRead1).toHaveBeenCalledTimes(0);
		expect(spyRead2).toHaveBeenCalledTimes(0);

		try {
			db.execute(sql``);
		} catch { /* empty */ }

		expect(spyPrimary).toHaveBeenCalledTimes(2);
		expect(spyRead1).toHaveBeenCalledTimes(0);
		expect(spyRead2).toHaveBeenCalledTimes(0);

		try {
			db.execute(sql``);
		} catch { /* empty */ }

		expect(spyPrimary).toHaveBeenCalledTimes(3);
		expect(spyRead1).toHaveBeenCalledTimes(0);
		expect(spyRead2).toHaveBeenCalledTimes(0);
	});
});

describe('[transaction] replicas postgres', () => {
	it('primary transaction', async () => {
		const primaryDb = drizzle({} as any);
		const read1 = drizzle({} as any);
		const read2 = drizzle({} as any);

		const db = withReplicas(primaryDb, [read1, read2]);

		const spyPrimary = vi.spyOn(primaryDb, 'transaction');
		const spyRead1 = vi.spyOn(read1, 'transaction');
		const spyRead2 = vi.spyOn(read2, 'transaction');

		expect(db.transaction(async (tx) => {
			tx.select().from({} as any);
		})).rejects.toThrow();

		expect(spyPrimary).toHaveBeenCalledTimes(1);
		expect(spyRead1).toHaveBeenCalledTimes(0);
		expect(spyRead2).toHaveBeenCalledTimes(0);

		expect(db.transaction(async (tx) => {
			tx.select().from({} as any);
		})).rejects.toThrow();

		expect(spyPrimary).toHaveBeenCalledTimes(2);
		expect(spyRead1).toHaveBeenCalledTimes(0);
		expect(spyRead2).toHaveBeenCalledTimes(0);

		expect(db.transaction(async (tx) => {
			tx.select().from({} as any);
		})).rejects.toThrow();

		expect(spyPrimary).toHaveBeenCalledTimes(3);
		expect(spyRead1).toHaveBeenCalledTimes(0);
		expect(spyRead2).toHaveBeenCalledTimes(0);
	});
});

describe('[refreshView] replicas postgres', () => {
	it('primary refreshView', () => {
		const primaryDb = drizzle({} as any);
		const read1 = drizzle({} as any);
		const read2 = drizzle({} as any);

		const db = withReplicas(primaryDb, [read1, read2]);

		const spyPrimary = vi.spyOn(primaryDb, 'refreshMaterializedView');
		const spyRead1 = vi.spyOn(read1, 'refreshMaterializedView');
		const spyRead2 = vi.spyOn(read2, 'refreshMaterializedView');

		db.refreshMaterializedView({} as any);

		expect(spyPrimary).toHaveBeenCalledTimes(1);
		expect(spyRead1).toHaveBeenCalledTimes(0);
		expect(spyRead2).toHaveBeenCalledTimes(0);

		db.refreshMaterializedView({} as any);

		expect(spyPrimary).toHaveBeenCalledTimes(2);
		expect(spyRead1).toHaveBeenCalledTimes(0);
		expect(spyRead2).toHaveBeenCalledTimes(0);

		db.$primary.refreshMaterializedView({} as any);

		expect(spyPrimary).toHaveBeenCalledTimes(3);
		expect(spyRead1).toHaveBeenCalledTimes(0);
		expect(spyRead2).toHaveBeenCalledTimes(0);
	});
});

describe('[findFirst] read replicas postgres', () => {
	it('primary findFirst', () => {
		const primaryDb = drizzle({} as any, { schema: { usersTable } });
		const read1 = drizzle({} as any, { schema: { usersTable } });
		const read2 = drizzle({} as any, { schema: { usersTable } });

		const db = withReplicas(primaryDb, [read1, read2]);

		const spyPrimary = vi.spyOn(primaryDb['query']['usersTable'], 'findFirst');
		const spyRead1 = vi.spyOn(read1['query']['usersTable'], 'findFirst');
		const spyRead2 = vi.spyOn(read2['query']['usersTable'], 'findFirst');

		db.$primary.query.usersTable.findFirst();

		expect(spyPrimary).toHaveBeenCalledTimes(1);
		expect(spyRead1).toHaveBeenCalledTimes(0);
		expect(spyRead2).toHaveBeenCalledTimes(0);
	});

	it('random replica findFirst', () => {
		const primaryDb = drizzle({} as any, { schema: { usersTable } });
		const read1 = drizzle({} as any, { schema: { usersTable } });
		const read2 = drizzle({} as any, { schema: { usersTable } });
		
		const randomMockReplica = vi.fn().mockReturnValueOnce(read1).mockReturnValueOnce(read2);

		const db = withReplicas(primaryDb, [read1, read2], () => {
			return randomMockReplica();
		});

		const spyPrimary = vi.spyOn(primaryDb['query']['usersTable'], 'findFirst');
		const spyRead1 = vi.spyOn(read1['query']['usersTable'], 'findFirst');
		const spyRead2 = vi.spyOn(read2['query']['usersTable'], 'findFirst');

		db.query.usersTable.findFirst();

		expect(spyPrimary).toHaveBeenCalledTimes(0);
		expect(spyRead1).toHaveBeenCalledTimes(1);
		expect(spyRead2).toHaveBeenCalledTimes(0);

		db.query.usersTable.findFirst();
		expect(spyRead1).toHaveBeenCalledTimes(1);
		expect(spyRead2).toHaveBeenCalledTimes(1);
	});

	it('single read replica findFirst', () => {
		const primaryDb = drizzle({} as any, { schema: { usersTable } });
		const read1 = drizzle({} as any, { schema: { usersTable } });

		const db = withReplicas(primaryDb, [read1]);

		const spyPrimary = vi.spyOn(primaryDb['query']['usersTable'], 'findFirst');
		const spyRead1 = vi.spyOn(read1['query']['usersTable'], 'findFirst');

		db.query.usersTable.findFirst();

		expect(spyPrimary).toHaveBeenCalledTimes(0);
		expect(spyRead1).toHaveBeenCalledTimes(1);

		db.query.usersTable.findFirst();
		expect(spyRead1).toHaveBeenCalledTimes(2);
	});

	it('single read replica findFirst + primary findFirst', () => {
		const primaryDb = drizzle({} as any, { schema: { usersTable } });
		const read1 = drizzle({} as any, { schema: { usersTable } });
		
		const db = withReplicas(primaryDb, [read1]);

		const spyPrimary = vi.spyOn(primaryDb['query']['usersTable'], 'findFirst');
		const spyRead1 = vi.spyOn(read1['query']['usersTable'], 'findFirst');

		db.query.usersTable.findFirst();

		expect(spyPrimary).toHaveBeenCalledTimes(0);
		expect(spyRead1).toHaveBeenCalledTimes(1);

		db.$primary.query.usersTable.findFirst();
		expect(spyPrimary).toHaveBeenCalledTimes(1);
		expect(spyRead1).toHaveBeenCalledTimes(1);
	});

	it('always first read findFirst', () => {
		const primaryDb = drizzle({} as any, { schema: { usersTable } });
		const read1 = drizzle({} as any, { schema: { usersTable } });
		const read2 = drizzle({} as any, { schema: { usersTable } });

		const db = withReplicas(primaryDb, [read1, read2], (replicas) => {
			return replicas[0]!;
		});

		const spyPrimary = vi.spyOn(primaryDb['query']['usersTable'], 'findFirst');
		const spyRead1 = vi.spyOn(read1['query']['usersTable'], 'findFirst');
		const spyRead2 = vi.spyOn(read2['query']['usersTable'], 'findFirst');

		db.query.usersTable.findFirst();

		expect(spyPrimary).toHaveBeenCalledTimes(0);
		expect(spyRead1).toHaveBeenCalledTimes(1);
		expect(spyRead2).toHaveBeenCalledTimes(0);

		db.query.usersTable.findFirst();
		expect(spyRead1).toHaveBeenCalledTimes(2);
		expect(spyRead2).toHaveBeenCalledTimes(0);
	});
});

describe('[findMany] read replicas postgres', () => {
	it('primary findMany', () => {
		const primaryDb = drizzle({} as any, { schema: { usersTable } });
		const read1 = drizzle({} as any, { schema: { usersTable } });
		const read2 = drizzle({} as any, { schema: { usersTable } });

		const db = withReplicas(primaryDb, [read1, read2]);

		const spyPrimary = vi.spyOn(primaryDb['query']['usersTable'], 'findMany');
		const spyRead1 = vi.spyOn(read1['query']['usersTable'], 'findMany');
		const spyRead2 = vi.spyOn(read2['query']['usersTable'], 'findMany');

		db.$primary.query.usersTable.findMany();

		expect(spyPrimary).toHaveBeenCalledTimes(1);
		expect(spyRead1).toHaveBeenCalledTimes(0);
		expect(spyRead2).toHaveBeenCalledTimes(0);
	});

	it('random replica findMany', () => {
		const primaryDb = drizzle({} as any, { schema: { usersTable } });
		const read1 = drizzle({} as any, { schema: { usersTable } });
		const read2 = drizzle({} as any, { schema: { usersTable } });
		
		const randomMockReplica = vi.fn().mockReturnValueOnce(read1).mockReturnValueOnce(read2);

		const db = withReplicas(primaryDb, [read1, read2], () => {
			return randomMockReplica();
		});

		const spyPrimary = vi.spyOn(primaryDb['query']['usersTable'], 'findMany');
		const spyRead1 = vi.spyOn(read1['query']['usersTable'], 'findMany');
		const spyRead2 = vi.spyOn(read2['query']['usersTable'], 'findMany');

		db.query.usersTable.findMany();

		expect(spyPrimary).toHaveBeenCalledTimes(0);
		expect(spyRead1).toHaveBeenCalledTimes(1);
		expect(spyRead2).toHaveBeenCalledTimes(0);

		db.query.usersTable.findMany();
		expect(spyRead1).toHaveBeenCalledTimes(1);
		expect(spyRead2).toHaveBeenCalledTimes(1);
	});

	it('single read replica findMany', () => {
		const primaryDb = drizzle({} as any, { schema: { usersTable } });
		const read1 = drizzle({} as any, { schema: { usersTable } });

		const db = withReplicas(primaryDb, [read1]);

		const spyPrimary = vi.spyOn(primaryDb['query']['usersTable'], 'findMany');
		const spyRead1 = vi.spyOn(read1['query']['usersTable'], 'findMany');

		db.query.usersTable.findMany();

		expect(spyPrimary).toHaveBeenCalledTimes(0);
		expect(spyRead1).toHaveBeenCalledTimes(1);

		db.query.usersTable.findMany();
		expect(spyRead1).toHaveBeenCalledTimes(2);
	});

	it('single read replica findMany + primary findMany', () => {
		const primaryDb = drizzle({} as any, { schema: { usersTable } });
		const read1 = drizzle({} as any, { schema: { usersTable } });
		
		const db = withReplicas(primaryDb, [read1]);

		const spyPrimary = vi.spyOn(primaryDb['query']['usersTable'], 'findMany');
		const spyRead1 = vi.spyOn(read1['query']['usersTable'], 'findMany');

		db.query.usersTable.findMany();

		expect(spyPrimary).toHaveBeenCalledTimes(0);
		expect(spyRead1).toHaveBeenCalledTimes(1);

		db.$primary.query.usersTable.findMany();
		expect(spyPrimary).toHaveBeenCalledTimes(1);
		expect(spyRead1).toHaveBeenCalledTimes(1);
	});

	it('always first read findMany', () => {
		const primaryDb = drizzle({} as any, { schema: { usersTable } });
		const read1 = drizzle({} as any, { schema: { usersTable } });
		const read2 = drizzle({} as any, { schema: { usersTable } });

		const db = withReplicas(primaryDb, [read1, read2], (replicas) => {
			return replicas[0]!;
		});

		const spyPrimary = vi.spyOn(primaryDb['query']['usersTable'], 'findMany');
		const spyRead1 = vi.spyOn(read1['query']['usersTable'], 'findMany');
		const spyRead2 = vi.spyOn(read2['query']['usersTable'], 'findMany');

		db.query.usersTable.findMany();

		expect(spyPrimary).toHaveBeenCalledTimes(0);
		expect(spyRead1).toHaveBeenCalledTimes(1);
		expect(spyRead2).toHaveBeenCalledTimes(0);

		db.query.usersTable.findMany();
		expect(spyRead1).toHaveBeenCalledTimes(2);
		expect(spyRead2).toHaveBeenCalledTimes(0);
	});
});
