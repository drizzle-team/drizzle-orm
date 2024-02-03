import { sql } from 'drizzle-orm';
import { boolean, mysqlTable, serial, text, withReplicas } from 'drizzle-orm/mysql-core';
import { drizzle } from 'drizzle-orm/mysql2';
import { describe, expect, it, vi } from 'vitest';

const usersTable = mysqlTable('users', {
	id: serial('id' as string).primaryKey(),
	name: text('name').notNull(),
	verified: boolean('verified').notNull().default(false),
});

const users = mysqlTable('users', {
	id: serial('id' as string).primaryKey(),
});

describe('[select] read replicas mysql', () => {
	it('primary select', () => {
		const primaryDb = drizzle({} as any);
		const read1 = drizzle({} as any);
		const read2 = drizzle({} as any);

		const db = withReplicas(primaryDb, [read1, read2]);

		const spyPrimary = vi.spyOn(primaryDb, 'select');
		const spyRead1 = vi.spyOn(read1, 'select');
		const spyRead2 = vi.spyOn(read2, 'select');

		const query = db.$primary.select().from(users);

		expect(spyPrimary).toHaveBeenCalledTimes(1);
		expect(query.toSQL().sql).toEqual('select `id` from `users`');

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

		const query1 = db.select({ count: sql`count(*)`.as('count') }).from(users).limit(1);

		expect(spyPrimary).toHaveBeenCalledTimes(0);
		expect(spyRead1).toHaveBeenCalledTimes(1);
		expect(spyRead2).toHaveBeenCalledTimes(0);

		expect(query1.toSQL().sql).toEqual('select count(*) as `count` from `users` limit ?');

		const query2 = db.select().from(users);
		expect(spyRead1).toHaveBeenCalledTimes(1);
		expect(spyRead2).toHaveBeenCalledTimes(1);
		expect(query2.toSQL().sql).toEqual('select `id` from `users`');
	});

	it('single read replica select', () => {
		const primaryDb = drizzle({} as any);
		const read1 = drizzle({} as any);

		const db = withReplicas(primaryDb, [read1]);

		const spyPrimary = vi.spyOn(primaryDb, 'select');
		const spyRead1 = vi.spyOn(read1, 'select');

		const query1 = db.select().from(users);

		expect(spyPrimary).toHaveBeenCalledTimes(0);
		expect(spyRead1).toHaveBeenCalledTimes(1);
		expect(query1.toSQL().sql).toEqual('select `id` from `users`');

		const query2 = db.select().from(users);
		expect(spyRead1).toHaveBeenCalledTimes(2);
		expect(query2.toSQL().sql).toEqual('select `id` from `users`');
	});

	it('single read replica select + primary select', () => {
		const primaryDb = drizzle({} as any);
		const read1 = drizzle({} as any);

		const db = withReplicas(primaryDb, [read1]);

		const spyPrimary = vi.spyOn(primaryDb, 'select');
		const spyRead1 = vi.spyOn(read1, 'select');

		const query1 = db.select({ id: users.id }).from(users);

		expect(spyPrimary).toHaveBeenCalledTimes(0);
		expect(spyRead1).toHaveBeenCalledTimes(1);
		expect(query1.toSQL().sql).toEqual('select `id` from `users`');

		const query2 = db.$primary.select().from(users);
		expect(spyPrimary).toHaveBeenCalledTimes(1);
		expect(spyRead1).toHaveBeenCalledTimes(1);
		expect(query2.toSQL().sql).toEqual('select `id` from `users`');
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

		const query1 = db.select().from(users);

		expect(spyPrimary).toHaveBeenCalledTimes(0);
		expect(spyRead1).toHaveBeenCalledTimes(1);
		expect(spyRead2).toHaveBeenCalledTimes(0);
		expect(query1.toSQL().sql).toEqual('select `id` from `users`');

		const query2 = db.select().from(users);

		expect(spyRead1).toHaveBeenCalledTimes(2);
		expect(spyRead2).toHaveBeenCalledTimes(0);
		expect(query2.toSQL().sql).toEqual('select `id` from `users`');
	});
});

describe('[selectDistinct] read replicas mysql', () => {
	it('primary selectDistinct', () => {
		const primaryDb = drizzle({} as any);
		const read1 = drizzle({} as any);
		const read2 = drizzle({} as any);

		const db = withReplicas(primaryDb, [read1, read2]);

		const spyPrimary = vi.spyOn(primaryDb, 'selectDistinct');
		const spyRead1 = vi.spyOn(read1, 'selectDistinct');
		const spyRead2 = vi.spyOn(read2, 'selectDistinct');

		const query = db.$primary.selectDistinct().from(users);

		expect(spyPrimary).toHaveBeenCalledTimes(1);
		expect(spyRead1).toHaveBeenCalledTimes(0);
		expect(spyRead2).toHaveBeenCalledTimes(0);
		expect(query.toSQL().sql).toEqual('select distinct `id` from `users`');
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

		const query1 = db.selectDistinct().from(users);

		expect(spyPrimary).toHaveBeenCalledTimes(0);
		expect(spyRead1).toHaveBeenCalledTimes(1);
		expect(spyRead2).toHaveBeenCalledTimes(0);
		expect(query1.toSQL().sql).toEqual('select distinct `id` from `users`');

		const query2 = db.selectDistinct().from(users);
		expect(spyRead1).toHaveBeenCalledTimes(1);
		expect(spyRead2).toHaveBeenCalledTimes(1);
		expect(query2.toSQL().sql).toEqual('select distinct `id` from `users`');
	});

	it('single read replica selectDistinct', () => {
		const primaryDb = drizzle({} as any);
		const read1 = drizzle({} as any);

		const db = withReplicas(primaryDb, [read1]);

		const spyPrimary = vi.spyOn(primaryDb, 'selectDistinct');
		const spyRead1 = vi.spyOn(read1, 'selectDistinct');

		const query1 = db.selectDistinct().from(users);

		expect(spyPrimary).toHaveBeenCalledTimes(0);
		expect(spyRead1).toHaveBeenCalledTimes(1);
		expect(query1.toSQL().sql).toEqual('select distinct `id` from `users`');

		const query2 = db.selectDistinct().from(users);
		expect(spyRead1).toHaveBeenCalledTimes(2);
		expect(query2.toSQL().sql).toEqual('select distinct `id` from `users`');
	});

	it('single read replica selectDistinct + primary selectDistinct', () => {
		const primaryDb = drizzle({} as any);
		const read1 = drizzle({} as any);

		const db = withReplicas(primaryDb, [read1]);

		const spyPrimary = vi.spyOn(primaryDb, 'selectDistinct');
		const spyRead1 = vi.spyOn(read1, 'selectDistinct');

		const query1 = db.selectDistinct().from(users);

		expect(spyPrimary).toHaveBeenCalledTimes(0);
		expect(spyRead1).toHaveBeenCalledTimes(1);
		expect(query1.toSQL().sql).toEqual('select distinct `id` from `users`');

		const query2 = db.$primary.selectDistinct().from(users);
		expect(spyPrimary).toHaveBeenCalledTimes(1);
		expect(spyRead1).toHaveBeenCalledTimes(1);
		expect(query2.toSQL().sql).toEqual('select distinct `id` from `users`');
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

		const query1 = db.selectDistinct().from(users);

		expect(spyPrimary).toHaveBeenCalledTimes(0);
		expect(spyRead1).toHaveBeenCalledTimes(1);
		expect(spyRead2).toHaveBeenCalledTimes(0);
		expect(query1.toSQL().sql).toEqual('select distinct `id` from `users`');

		const query2 = db.selectDistinct().from(users);
		expect(spyRead1).toHaveBeenCalledTimes(2);
		expect(spyRead2).toHaveBeenCalledTimes(0);
		expect(query2.toSQL().sql).toEqual('select distinct `id` from `users`');
	});
});

describe('[with] read replicas mysql', () => {
	it('primary with', () => {
		const primaryDb = drizzle({} as any);
		const read1 = drizzle({} as any);
		const read2 = drizzle({} as any);

		const db = withReplicas(primaryDb, [read1, read2]);

		const spyPrimary = vi.spyOn(primaryDb, 'with');
		const spyRead1 = vi.spyOn(read1, 'with');
		const spyRead2 = vi.spyOn(read2, 'with');
		const obj1 = {} as any;
		const obj2 = {} as any;
		const obj3 = {} as any;
		const obj4 = {} as any;

		db.$primary.with(obj1, obj2, obj3, obj4);

		expect(spyPrimary).toHaveBeenCalledTimes(1);
		expect(spyRead1).toHaveBeenCalledTimes(0);
		expect(spyRead2).toHaveBeenCalledTimes(0);
		expect(spyPrimary).toHaveBeenCalledWith(obj1, obj2, obj3, obj4);
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
		const obj1 = {} as any;
		const obj2 = {} as any;
		const obj3 = {} as any;

		db.with(obj1);

		expect(spyPrimary).toHaveBeenCalledTimes(0);
		expect(spyRead1).toHaveBeenCalledTimes(1);
		expect(spyRead2).toHaveBeenCalledTimes(0);
		expect(spyRead1).toHaveBeenCalledWith(obj1);

		db.with(obj2, obj3);
		expect(spyRead1).toHaveBeenCalledTimes(2);
		expect(spyRead2).toHaveBeenCalledTimes(0);
		expect(spyRead1).toHaveBeenCalledWith(obj2, obj3);
	});
});

describe('[update] replicas mysql', () => {
	it('primary update', () => {
		const primaryDb = drizzle({} as any);
		const read1 = drizzle({} as any);
		const read2 = drizzle({} as any);

		const db = withReplicas(primaryDb, [read1, read2]);

		const spyPrimary = vi.spyOn(primaryDb, 'update');
		const spyRead1 = vi.spyOn(read1, 'update');
		const spyRead2 = vi.spyOn(read2, 'update');

		const query1 = db.update(users).set({ id: 1 });

		expect(spyPrimary).toHaveBeenCalledTimes(1);
		expect(spyRead1).toHaveBeenCalledTimes(0);
		expect(spyRead2).toHaveBeenCalledTimes(0);
		expect(query1.toSQL().sql).toEqual('update `users` set `id` = ?');

		const query2 = db.update(users).set({ id: 1 });

		expect(spyPrimary).toHaveBeenCalledTimes(2);
		expect(spyRead1).toHaveBeenCalledTimes(0);
		expect(spyRead2).toHaveBeenCalledTimes(0);
		expect(query2.toSQL().sql).toEqual('update `users` set `id` = ?');

		const query3 = db.$primary.update(users).set({ id: 1 });

		expect(spyPrimary).toHaveBeenCalledTimes(3);
		expect(spyRead1).toHaveBeenCalledTimes(0);
		expect(spyRead2).toHaveBeenCalledTimes(0);
		expect(query3.toSQL().sql).toEqual('update `users` set `id` = ?');
	});
});

describe('[delete] replicas mysql', () => {
	it('primary delete', () => {
		const primaryDb = drizzle({} as any);
		const read1 = drizzle({} as any);
		const read2 = drizzle({} as any);

		const db = withReplicas(primaryDb, [read1, read2]);

		const spyPrimary = vi.spyOn(primaryDb, 'delete');
		const spyRead1 = vi.spyOn(read1, 'delete');
		const spyRead2 = vi.spyOn(read2, 'delete');

		const query1 = db.delete(users);

		expect(spyPrimary).toHaveBeenCalledTimes(1);
		expect(spyRead1).toHaveBeenCalledTimes(0);
		expect(spyRead2).toHaveBeenCalledTimes(0);
		expect(spyPrimary).toHaveBeenCalledWith(users);
		expect(query1.toSQL().sql).toEqual('delete from `users`');

		const query2 = db.delete(users);

		expect(spyPrimary).toHaveBeenCalledTimes(2);
		expect(spyRead1).toHaveBeenCalledTimes(0);
		expect(spyRead2).toHaveBeenCalledTimes(0);
		expect(spyPrimary).toHaveBeenNthCalledWith(2, users);
		expect(query2.toSQL().sql).toEqual('delete from `users`');

		db.$primary.delete({} as any);

		expect(spyPrimary).toHaveBeenCalledTimes(3);
		expect(spyRead1).toHaveBeenCalledTimes(0);
		expect(spyRead2).toHaveBeenCalledTimes(0);
	});
});

describe('[insert] replicas mysql', () => {
	it('primary insert', () => {
		const primaryDb = drizzle({} as any);
		const read1 = drizzle({} as any);
		const read2 = drizzle({} as any);

		const db = withReplicas(primaryDb, [read1, read2]);

		const spyPrimary = vi.spyOn(primaryDb, 'insert');
		const spyRead1 = vi.spyOn(read1, 'insert');
		const spyRead2 = vi.spyOn(read2, 'insert');

		const query = db.insert(users).values({ id: 1 });

		expect(spyPrimary).toHaveBeenCalledTimes(1);
		expect(spyRead1).toHaveBeenCalledTimes(0);
		expect(spyRead2).toHaveBeenCalledTimes(0);
		expect(spyPrimary).toHaveBeenCalledWith(users);
		expect(query.toSQL().sql).toEqual('insert into `users` (`id`) values (?)');

		db.insert(users);

		expect(spyPrimary).toHaveBeenCalledTimes(2);
		expect(spyRead1).toHaveBeenCalledTimes(0);
		expect(spyRead2).toHaveBeenCalledTimes(0);
		expect(spyPrimary).toHaveBeenNthCalledWith(2, users);

		db.$primary.insert({} as any);

		expect(spyPrimary).toHaveBeenCalledTimes(3);
		expect(spyRead1).toHaveBeenCalledTimes(0);
		expect(spyRead2).toHaveBeenCalledTimes(0);
	});
});

describe('[execute] replicas mysql', () => {
	it('primary execute', async () => {
		const primaryDb = drizzle({} as any);
		const read1 = drizzle({} as any);
		const read2 = drizzle({} as any);

		const db = withReplicas(primaryDb, [read1, read2]);

		const spyPrimary = vi.spyOn(primaryDb, 'execute');
		const spyRead1 = vi.spyOn(read1, 'execute');
		const spyRead2 = vi.spyOn(read2, 'execute');

		expect(db.execute(sql``)).rejects.toThrow();

		// try {
		// 	db.execute(sql``);
		// } catch { /* empty */ }

		expect(spyPrimary).toHaveBeenCalledTimes(1);
		expect(spyRead1).toHaveBeenCalledTimes(0);
		expect(spyRead2).toHaveBeenCalledTimes(0);

		expect(db.execute(sql``)).rejects.toThrow();
		// try {
		// 	db.execute(sql``);
		// } catch { /* empty */ }

		expect(spyPrimary).toHaveBeenCalledTimes(2);
		expect(spyRead1).toHaveBeenCalledTimes(0);
		expect(spyRead2).toHaveBeenCalledTimes(0);

		expect(db.execute(sql``)).rejects.toThrow();
		// try {
		// 	db.execute(sql``);
		// } catch { /* empty */ }

		expect(spyPrimary).toHaveBeenCalledTimes(3);
		expect(spyRead1).toHaveBeenCalledTimes(0);
		expect(spyRead2).toHaveBeenCalledTimes(0);
	});
});

describe('[transaction] replicas mysql', () => {
	it('primary transaction', async () => {
		const primaryDb = drizzle({} as any);
		const read1 = drizzle({} as any);
		const read2 = drizzle({} as any);

		const db = withReplicas(primaryDb, [read1, read2]);

		const spyPrimary = vi.spyOn(primaryDb, 'transaction');
		const spyRead1 = vi.spyOn(read1, 'transaction');
		const spyRead2 = vi.spyOn(read2, 'transaction');
		const txFn1 = async (tx: any) => {
			tx.select().from({} as any);
		};

		expect(db.transaction(txFn1)).rejects.toThrow();

		expect(spyPrimary).toHaveBeenCalledTimes(1);
		expect(spyRead1).toHaveBeenCalledTimes(0);
		expect(spyRead2).toHaveBeenCalledTimes(0);
		expect(spyPrimary).toHaveBeenCalledWith(txFn1);

		const txFn2 = async (tx: any) => {
			tx.select().from({} as any);
		};

		expect(db.transaction(txFn2)).rejects.toThrow();

		expect(spyPrimary).toHaveBeenCalledTimes(2);
		expect(spyRead1).toHaveBeenCalledTimes(0);
		expect(spyRead2).toHaveBeenCalledTimes(0);
		expect(spyPrimary).toHaveBeenNthCalledWith(2, txFn2);

		expect(db.transaction(async (tx) => {
			tx.select().from({} as any);
		})).rejects.toThrow();

		expect(spyPrimary).toHaveBeenCalledTimes(3);
		expect(spyRead1).toHaveBeenCalledTimes(0);
		expect(spyRead2).toHaveBeenCalledTimes(0);
	});
});

describe('[findFirst] read replicas mysql', () => {
	it('primary findFirst', () => {
		const primaryDb = drizzle({} as any, { schema: { usersTable }, mode: 'default' });
		const read1 = drizzle({} as any, { schema: { usersTable }, mode: 'default' });
		const read2 = drizzle({} as any, { schema: { usersTable }, mode: 'default' });

		const db = withReplicas(primaryDb, [read1, read2]);

		const spyPrimary = vi.spyOn(primaryDb['query']['usersTable'], 'findFirst');
		const spyRead1 = vi.spyOn(read1['query']['usersTable'], 'findFirst');
		const spyRead2 = vi.spyOn(read2['query']['usersTable'], 'findFirst');
		const obj = {} as any;

		db.$primary.query.usersTable.findFirst(obj);

		expect(spyPrimary).toHaveBeenCalledTimes(1);
		expect(spyRead1).toHaveBeenCalledTimes(0);
		expect(spyRead2).toHaveBeenCalledTimes(0);
		expect(spyPrimary).toHaveBeenCalledWith(obj);
	});

	it('random replica findFirst', () => {
		const primaryDb = drizzle({} as any, { schema: { usersTable }, mode: 'default' });
		const read1 = drizzle({} as any, { schema: { usersTable }, mode: 'default' });
		const read2 = drizzle({} as any, { schema: { usersTable }, mode: 'default' });

		const randomMockReplica = vi.fn().mockReturnValueOnce(read1).mockReturnValueOnce(read2);

		const db = withReplicas(primaryDb, [read1, read2], () => {
			return randomMockReplica();
		});

		const spyPrimary = vi.spyOn(primaryDb['query']['usersTable'], 'findFirst');
		const spyRead1 = vi.spyOn(read1['query']['usersTable'], 'findFirst');
		const spyRead2 = vi.spyOn(read2['query']['usersTable'], 'findFirst');
		const par1 = {} as any;

		db.query.usersTable.findFirst(par1);

		expect(spyPrimary).toHaveBeenCalledTimes(0);
		expect(spyRead1).toHaveBeenCalledTimes(1);
		expect(spyRead2).toHaveBeenCalledTimes(0);
		expect(spyRead1).toHaveBeenCalledWith(par1);

		const query = db.query.usersTable.findFirst();
		expect(spyRead1).toHaveBeenCalledTimes(1);
		expect(spyRead2).toHaveBeenCalledTimes(1);
		expect(query.toSQL().sql).toEqual('select `id`, `name`, `verified` from `users` `usersTable` limit ?');
	});

	it('single read replica findFirst', () => {
		const primaryDb = drizzle({} as any, { schema: { usersTable }, mode: 'default' });
		const read1 = drizzle({} as any, { schema: { usersTable }, mode: 'default' });

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
		const primaryDb = drizzle({} as any, { schema: { usersTable }, mode: 'default' });
		const read1 = drizzle({} as any, { schema: { usersTable }, mode: 'default' });

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
		const primaryDb = drizzle({} as any, { schema: { usersTable }, mode: 'default' });
		const read1 = drizzle({} as any, { schema: { usersTable }, mode: 'default' });
		const read2 = drizzle({} as any, { schema: { usersTable }, mode: 'default' });

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

describe('[findMany] read replicas mysql', () => {
	it('primary findMany', () => {
		const primaryDb = drizzle({} as any, { schema: { usersTable }, mode: 'default' });
		const read1 = drizzle({} as any, { schema: { usersTable }, mode: 'default' });
		const read2 = drizzle({} as any, { schema: { usersTable }, mode: 'default' });

		const db = withReplicas(primaryDb, [read1, read2]);

		const spyPrimary = vi.spyOn(primaryDb['query']['usersTable'], 'findMany');
		const spyRead1 = vi.spyOn(read1['query']['usersTable'], 'findMany');
		const spyRead2 = vi.spyOn(read2['query']['usersTable'], 'findMany');
		const obj = {} as any;

		const query = db.$primary.query.usersTable.findMany(obj);

		expect(spyPrimary).toHaveBeenCalledTimes(1);
		expect(spyRead1).toHaveBeenCalledTimes(0);
		expect(spyRead2).toHaveBeenCalledTimes(0);
		expect(spyPrimary).toHaveBeenCalledWith(obj);
		expect(query.toSQL().sql).toEqual('select `id`, `name`, `verified` from `users` `usersTable`');
	});

	it('random replica findMany', () => {
		const primaryDb = drizzle({} as any, { schema: { usersTable }, mode: 'default' });
		const read1 = drizzle({} as any, { schema: { usersTable }, mode: 'default' });
		const read2 = drizzle({} as any, { schema: { usersTable }, mode: 'default' });

		const randomMockReplica = vi.fn().mockReturnValueOnce(read1).mockReturnValueOnce(read2);

		const db = withReplicas(primaryDb, [read1, read2], () => {
			return randomMockReplica();
		});

		const spyPrimary = vi.spyOn(primaryDb['query']['usersTable'], 'findMany');
		const spyRead1 = vi.spyOn(read1['query']['usersTable'], 'findMany');
		const spyRead2 = vi.spyOn(read2['query']['usersTable'], 'findMany');
		const obj1 = {} as any;
		const obj2 = {} as any;

		const query1 = db.query.usersTable.findMany(obj1);

		expect(spyPrimary).toHaveBeenCalledTimes(0);
		expect(spyRead1).toHaveBeenCalledTimes(1);
		expect(spyRead2).toHaveBeenCalledTimes(0);
		expect(query1.toSQL().sql).toEqual('select `id`, `name`, `verified` from `users` `usersTable`');
		expect(spyRead1).toHaveBeenCalledWith(obj1);

		const query2 = db.query.usersTable.findMany(obj2);

		expect(spyRead1).toHaveBeenCalledTimes(1);
		expect(spyRead2).toHaveBeenCalledTimes(1);
		expect(query2.toSQL().sql).toEqual('select `id`, `name`, `verified` from `users` `usersTable`');
		expect(spyRead2).toHaveBeenCalledWith(obj2);
	});

	it('single read replica findMany', () => {
		const primaryDb = drizzle({} as any, { schema: { usersTable }, mode: 'default' });
		const read1 = drizzle({} as any, { schema: { usersTable }, mode: 'default' });

		const db = withReplicas(primaryDb, [read1]);

		const spyPrimary = vi.spyOn(primaryDb['query']['usersTable'], 'findMany');
		const spyRead1 = vi.spyOn(read1['query']['usersTable'], 'findMany');
		const obj1 = {} as any;
		const obj2 = {} as any;

		const query1 = db.query.usersTable.findMany(obj1);

		expect(spyPrimary).toHaveBeenCalledTimes(0);
		expect(spyRead1).toHaveBeenCalledTimes(1);
		expect(spyRead1).toHaveBeenCalledWith(obj1);
		expect(query1.toSQL().sql).toEqual('select `id`, `name`, `verified` from `users` `usersTable`');

		const query2 = db.query.usersTable.findMany(obj2);
		expect(spyRead1).toHaveBeenCalledTimes(2);
		expect(spyRead1).toHaveBeenNthCalledWith(2, obj2);
		expect(query2.toSQL().sql).toEqual('select `id`, `name`, `verified` from `users` `usersTable`');
	});

	it('single read replica findMany + primary findMany', () => {
		const primaryDb = drizzle({} as any, { schema: { usersTable }, mode: 'default' });
		const read1 = drizzle({} as any, { schema: { usersTable }, mode: 'default' });

		const db = withReplicas(primaryDb, [read1]);

		const spyPrimary = vi.spyOn(primaryDb['query']['usersTable'], 'findMany');
		const spyRead1 = vi.spyOn(read1['query']['usersTable'], 'findMany');
		const obj1 = {} as any;
		const obj2 = {} as any;

		const query1 = db.query.usersTable.findMany(obj1);

		expect(spyPrimary).toHaveBeenCalledTimes(0);
		expect(spyRead1).toHaveBeenCalledTimes(1);
		expect(spyRead1).toHaveBeenCalledWith(obj1);
		expect(query1.toSQL().sql).toEqual('select `id`, `name`, `verified` from `users` `usersTable`');

		const query2 = db.$primary.query.usersTable.findMany(obj2);

		expect(spyPrimary).toHaveBeenCalledTimes(1);
		expect(spyRead1).toHaveBeenCalledTimes(1);
		expect(spyPrimary).toHaveBeenNthCalledWith(1, obj2);
		expect(query2.toSQL().sql).toEqual('select `id`, `name`, `verified` from `users` `usersTable`');
	});

	it('always first read findMany', () => {
		const primaryDb = drizzle({} as any, { schema: { usersTable }, mode: 'default' });
		const read1 = drizzle({} as any, { schema: { usersTable }, mode: 'default' });
		const read2 = drizzle({} as any, { schema: { usersTable }, mode: 'default' });

		const db = withReplicas(primaryDb, [read1, read2], (replicas) => {
			return replicas[0]!;
		});

		const spyPrimary = vi.spyOn(primaryDb['query']['usersTable'], 'findMany');
		const spyRead1 = vi.spyOn(read1['query']['usersTable'], 'findMany');
		const spyRead2 = vi.spyOn(read2['query']['usersTable'], 'findMany');
		const obj1 = {} as any;
		const obj2 = {} as any;

		const query1 = db.query.usersTable.findMany(obj1);

		expect(spyPrimary).toHaveBeenCalledTimes(0);
		expect(spyRead1).toHaveBeenCalledTimes(1);
		expect(spyRead2).toHaveBeenCalledTimes(0);
		expect(spyRead1).toHaveBeenCalledWith(obj1);
		expect(query1.toSQL().sql).toEqual('select `id`, `name`, `verified` from `users` `usersTable`');

		const query2 = db.query.usersTable.findMany(obj2);
		expect(spyRead1).toHaveBeenCalledTimes(2);
		expect(spyRead2).toHaveBeenCalledTimes(0);
		expect(spyRead1).toHaveBeenNthCalledWith(2, obj2);
		expect(query2.toSQL().sql).toEqual('select `id`, `name`, `verified` from `users` `usersTable`');
	});
});
