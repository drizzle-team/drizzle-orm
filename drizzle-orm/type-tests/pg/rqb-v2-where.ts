import { integer, pgTable, text } from '~/pg-core/index.ts';
import { drizzle } from '~/postgres-js/index.ts';
import { defineRelations } from '~/relations.ts';

const contacts = pgTable('contacts', {
	id: integer('id'),
	name: text('name'),
	contact1: text('contact1'),
});

// Single-table schema; no cross-table relations needed for this test
const rels = defineRelations({ contacts }, () => ({}));
const db = drizzle.mock({ relations: rels });

// --- findFirst ---

// Valid: known column keys
db.query.contacts.findFirst({ where: { id: 1 } });
db.query.contacts.findFirst({ where: { name: 'Alice' } });
db.query.contacts.findFirst({ where: { contact1: '010' } });

// Valid: logical combinators
db.query.contacts.findFirst({ where: { OR: [{ id: 1 }, { id: 2 }] } });
db.query.contacts.findFirst({ where: { AND: [{ id: 1 }, { name: 'Alice' }] } });
db.query.contacts.findFirst({ where: { NOT: { id: 1 } } });

// Valid: omitting where entirely
db.query.contacts.findFirst({});
db.query.contacts.findFirst({ where: undefined });

// Invalid: contact2 is not a column on contacts
// @ts-expect-error
db.query.contacts.findFirst({ where: { contact2: '010' } });

// Invalid: mix of valid and invalid keys
// @ts-expect-error
db.query.contacts.findFirst({ where: { id: 1, nonExistentColumn: 'bad' } });

// --- findMany ---

// Valid
db.query.contacts.findMany({ where: { id: 1 } });
db.query.contacts.findMany({});

// Invalid: contact2 is not a column
// @ts-expect-error
db.query.contacts.findMany({ where: { contact2: 'foo' } });

// Invalid: mix
// @ts-expect-error
db.query.contacts.findMany({ where: { id: 1, contact2: 'foo' } });
