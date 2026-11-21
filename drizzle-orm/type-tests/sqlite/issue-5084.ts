import { sql } from '~/sql/sql.ts';
import { integer, sqliteTable, text } from '~/sqlite-core/index.ts';
import { drizzle } from '~/sqlite-proxy/index.ts';

const table = sqliteTable('table', {
    id: integer('id').primaryKey(),
    name: text('name'),
});

const db = drizzle(async () => ({ rows: [] }));

db.insert(table)
    .values({
        id: sql.placeholder('id'),
        name: sql.placeholder('name'),
    })
    .onConflictDoUpdate({
        target: table.id,
        set: {
            id: sql.placeholder('id'),
            name: sql.placeholder('name'),
        },
    });
