
import { 
  bigint, 
  boolean,
  json,
  singlestoreTable, 
  text, 
  timestamp, 
  varchar, 
  vector 
} from 'drizzle-orm/singlestore-core';
import { drizzle as singlestoreDrizzle } from 'drizzle-orm/singlestore';
import { reset, seed } from '../src/index.ts';

// Basic users table
const singlestoreUsers = singlestoreTable('users', {
	id: bigint('id', { mode: 'number' }).primaryKey().autoincrement(),
	name: text('name'),
	email: varchar('email', { length: 255 }),
	isActive: boolean('is_active').default(true),
	createdAt: timestamp('created_at').defaultNow(),
	// SingleStore doesn't support references with this syntax
	inviteId: bigint('invite_id', { mode: 'number' }),
});

// Documents table with vector embedding
const singlestoreDocuments = singlestoreTable('documents', {
	id: bigint('id', { mode: 'number' }).primaryKey().autoincrement(),
	title: text('title'),
	content: text('content'),
	embedding: vector('embedding', { dimensions: 1536 }),
	userId: bigint('user_id', { mode: 'number' }),
	metadata: json('metadata'),
});

{
	const db = singlestoreDrizzle('');

	await seed(db, { users: singlestoreUsers });
	await reset(db, { users: singlestoreUsers });

	await seed(db, { documents: singlestoreDocuments });
	await reset(db, { documents: singlestoreDocuments });
}
