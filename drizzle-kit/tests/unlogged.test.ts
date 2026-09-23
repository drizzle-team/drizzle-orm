import { expect, test } from 'vitest';
import { pgTable } from '../../drizzle-orm/src/pg-core/table';
import { uuid } from '../../drizzle-orm/src/pg-core/columns';
import { diffTestSchemas } from 'tests/schemaDiffer';

test('unlogged table generates correct DDL', async () => {
    const schema = {
        logs: pgTable('logs', {
            id: uuid('id'),
        }).unlogged(),
    };

    const { sqlStatements } = await diffTestSchemas({}, schema, []);
    expect(sqlStatements[0]).toMatch(/^CREATE UNLOGGED TABLE/);
});
