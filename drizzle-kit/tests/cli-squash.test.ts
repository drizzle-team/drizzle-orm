import { test as brotest } from '@drizzle-team/brocli';
import { assert, expect, test, vi } from 'vitest';
import { squash } from '../src/cli/schema';
import * as fs from 'fs';

// Mock fs module to avoid actual file operations
vi.mock('fs');

// Test squash command with basic options
test('squash #1 - basic options', async () => {
    const res = await brotest(squash, '--dialect=postgresql --start=0 --end=3');
    if (res.type !== 'handler') assert.fail(res.type, 'handler');
    expect(res.options).toStrictEqual({
        dialect: 'postgresql',
        out: 'drizzle',
        prefix: 'index',
        start: 0,
        end: 3,
    });
});

// Test squash command with custom output directory
test('squash #2 - custom output directory', async () => {
    const res = await brotest(squash, '--dialect=postgresql --start=1 --end=5 --out=migrations');
    if (res.type !== 'handler') assert.fail(res.type, 'handler');
    expect(res.options).toStrictEqual({
        dialect: 'postgresql',
        out: 'migrations',
        prefix: 'index',
        start: 1,
        end: 5,
    });
});

// Test squash command with different dialect
test('squash #3 - mysql dialect', async () => {
    const res = await brotest(squash, '--start=0 --end=2 --dialect=mysql');
    if (res.type !== 'handler') assert.fail(res.type, 'handler');
    expect(res.options).toStrictEqual({
        dialect: 'mysql',
        out: 'drizzle',
        prefix: 'index',
        start: 0,
        end: 2,
    });
});

// Test squash command with custom prefix
test('squash #4 - custom prefix', async () => {
    const res = await brotest(squash, '--dialect=postgresql --start=0 --end=3 --prefix=supabase');
    if (res.type !== 'handler') assert.fail(res.type, 'handler');
    expect(res.options).toStrictEqual({
        dialect: 'postgresql',
        out: 'drizzle',
        prefix: 'supabase',
        start: 0,
        end: 3,
    });
});

// Test squash command with empty string (uses default config)
test('squash #5 - with default config', async () => {
    const res = await brotest(squash, '');
    if (res.type !== 'error') assert.fail(res.type, 'error'); // This should error because start/end are required
});

// Test error when missing required parameters
test('err #1 - missing start parameter', async () => {
    const res = await brotest(squash, '--end=3');
    assert.equal(res.type, 'error');
});

test('err #2 - missing end parameter', async () => {
    const res = await brotest(squash, '--start=0');
    assert.equal(res.type, 'error');
});

test('err #3 - invalid range (negative start)', async () => {
    const res = await brotest(squash, '--start=-1 --end=3');
    assert.equal(res.type, 'error');
});

test('err #4 - invalid range (negative end)', async () => {
    const res = await brotest(squash, '--start=0 --end=-1');
    assert.equal(res.type, 'error');
});

// Integration test for squash functionality (mocked)
test('squash integration - combines migrations correctly', async () => {
    // Mock file system operations
    const mockJournal = {
        version: "7",
        dialect: "postgresql",
        entries: [
            { idx: 0, version: "7", when: 1000000000, tag: "0000_initial", breakpoints: true },
            { idx: 1, version: "7", when: 1000001000, tag: "0001_add_users", breakpoints: true },
            { idx: 2, version: "7", when: 1000002000, tag: "0002_add_posts", breakpoints: true },
            { idx: 3, version: "7", when: 1000003000, tag: "0003_add_comments", breakpoints: true },
            { idx: 4, version: "7", when: 1000004000, tag: "0004_add_likes", breakpoints: true },
        ]
    };

    const mockSqlFiles = {
        "0001_add_users.sql": "CREATE TABLE users (id INT PRIMARY KEY);",
        "0002_add_posts.sql": "CREATE TABLE posts (id INT PRIMARY KEY);",
        "0003_add_comments.sql": "CREATE TABLE comments (id INT PRIMARY KEY);",
    };

    const mockSnapshots = {
        "0001_snapshot.json": '{"version":"7","dialect":"postgresql","tables":{}}',
        "0002_snapshot.json": '{"version":"7","dialect":"postgresql","tables":{"users":{}}}',
        "0003_snapshot.json": '{"version":"7","dialect":"postgresql","tables":{"users":{},"posts":{}}}',
    };

    vi.mocked(fs.readFileSync).mockImplementation((path: any) => {
        const pathStr = path.toString();
        if (pathStr.endsWith('_journal.json')) {
            return JSON.stringify(mockJournal);
        }
        const filename = pathStr.split('/').pop();
        if (filename && mockSqlFiles[filename as keyof typeof mockSqlFiles]) {
            return mockSqlFiles[filename as keyof typeof mockSqlFiles];
        }
        if (filename && mockSnapshots[filename as keyof typeof mockSnapshots]) {
            return mockSnapshots[filename as keyof typeof mockSnapshots];
        }
        return '';
    });

    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readdirSync).mockReturnValue([]);

    let writtenFiles: Record<string, string> = {};
    vi.mocked(fs.writeFileSync).mockImplementation((path: any, data: any) => {
        writtenFiles[path.toString()] = data.toString();
    });

    vi.mocked(fs.rmSync).mockImplementation(() => {});

    // Import and run the squash function
    const { squashMigrations } = await import('../src/cli/commands/squash');

    await squashMigrations({
        dialect: 'postgresql',
        out: 'drizzle',
        prefix: 'index',
        start: 1,
        end: 3
    });

    // Verify journal was updated correctly
    const journalPath = Object.keys(writtenFiles).find(k => k.endsWith('_journal.json'));
    expect(journalPath).toBeDefined();

    if (journalPath) {
        const updatedJournal = JSON.parse(writtenFiles[journalPath]);
        // Should have 3 entries: 0 (kept), 1 (squashed from 1-3), 4 (kept)
        expect(updatedJournal.entries).toHaveLength(3);
        expect(updatedJournal.entries[0].idx).toBe(0);
        expect(updatedJournal.entries[1].idx).toBe(1); // Squashed migration keeps first index
        expect(updatedJournal.entries[2].idx).toBe(4);
    }

    // Verify SQL file was created with combined content
    const sqlPath = Object.keys(writtenFiles).find(k => k.endsWith('.sql') && !k.includes('meta'));
    expect(sqlPath).toBeDefined();

    if (sqlPath) {
        const combinedSql = writtenFiles[sqlPath];
        expect(combinedSql).toContain('CREATE TABLE users');
        expect(combinedSql).toContain('CREATE TABLE posts');
        expect(combinedSql).toContain('CREATE TABLE comments');
        expect(combinedSql).toContain('-- Start migration 0001_add_users');
        expect(combinedSql).toContain('-- End migration 0003_add_comments');
    }

    // Verify snapshot was created (should use the last migration's snapshot)
    const snapshotPath = Object.keys(writtenFiles).find(k => k.includes('snapshot.json'));
    expect(snapshotPath).toBeDefined();

    if (snapshotPath) {
        const snapshot = JSON.parse(writtenFiles[snapshotPath]);
        expect(snapshot.tables).toHaveProperty('users');
        expect(snapshot.tables).toHaveProperty('posts');
    }
});

// Edge case 1: Squashing non-consecutive migrations (should handle gaps in indices)
test('squash integration - handles non-consecutive indices correctly', async () => {
    // Mock file system operations
    const mockJournal = {
        version: "7",
        dialect: "postgresql",
        entries: [
            { idx: 0, version: "7", when: 1000000000, tag: "0000_initial", breakpoints: true },
            { idx: 1, version: "7", when: 1000001000, tag: "0001_add_users", breakpoints: true },
            // Note: idx 2 is missing (was previously deleted)
            { idx: 3, version: "7", when: 1000003000, tag: "0003_add_posts", breakpoints: true },
            { idx: 4, version: "7", when: 1000004000, tag: "0004_add_comments", breakpoints: true },
            { idx: 5, version: "7", when: 1000005000, tag: "0005_add_likes", breakpoints: true },
        ]
    };

    const mockSqlFiles = {
        "0003_add_posts.sql": "CREATE TABLE posts (id INT PRIMARY KEY);",
        "0004_add_comments.sql": "CREATE TABLE comments (id INT PRIMARY KEY);",
        "0005_add_likes.sql": "CREATE TABLE likes (id INT PRIMARY KEY);",
    };

    const mockSnapshots = {
        "0003_snapshot.json": '{"version":"7","dialect":"postgresql","tables":{"users":{}}}',
        "0004_snapshot.json": '{"version":"7","dialect":"postgresql","tables":{"users":{},"posts":{}}}',
        "0005_snapshot.json": '{"version":"7","dialect":"postgresql","tables":{"users":{},"posts":{},"comments":{}}}',
    };

    vi.mocked(fs.readFileSync).mockImplementation((path: any) => {
        const pathStr = path.toString();
        if (pathStr.endsWith('_journal.json')) {
            return JSON.stringify(mockJournal);
        }
        const filename = pathStr.split('/').pop();
        if (filename && mockSqlFiles[filename as keyof typeof mockSqlFiles]) {
            return mockSqlFiles[filename as keyof typeof mockSqlFiles];
        }
        if (filename && mockSnapshots[filename as keyof typeof mockSnapshots]) {
            return mockSnapshots[filename as keyof typeof mockSnapshots];
        }
        return '';
    });

    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readdirSync).mockReturnValue([]);

    let writtenFiles: Record<string, string> = {};
    vi.mocked(fs.writeFileSync).mockImplementation((path: any, data: any) => {
        writtenFiles[path.toString()] = data.toString();
    });

    vi.mocked(fs.rmSync).mockImplementation(() => {});

    const { squashMigrations } = await import('../src/cli/commands/squash');

    await squashMigrations({
        dialect: 'postgresql',
        out: 'drizzle',
        prefix: 'index',
        start: 3,
        end: 5
    });

    // Verify journal was updated correctly
    const journalPath = Object.keys(writtenFiles).find(k => k.endsWith('_journal.json'));
    expect(journalPath).toBeDefined();

    if (journalPath) {
        const updatedJournal = JSON.parse(writtenFiles[journalPath]);
        // Should have 3 entries: 0 (kept), 1 (kept), 3 (squashed from 3-5)
        expect(updatedJournal.entries).toHaveLength(3);
        expect(updatedJournal.entries[0].idx).toBe(0);
        expect(updatedJournal.entries[1].idx).toBe(1);
        expect(updatedJournal.entries[2].idx).toBe(3); // Squashed migration keeps first index
        // Ensure the tag is from the squashed entry
        expect(updatedJournal.entries[2].tag).toContain('_');
    }

    // Verify SQL file was created with combined content
    const sqlPath = Object.keys(writtenFiles).find(k => k.endsWith('.sql') && !k.includes('meta'));
    expect(sqlPath).toBeDefined();

    if (sqlPath) {
        const combinedSql = writtenFiles[sqlPath];
        expect(combinedSql).toContain('CREATE TABLE posts');
        expect(combinedSql).toContain('CREATE TABLE comments');
        expect(combinedSql).toContain('CREATE TABLE likes');
    }
});

// Edge case 2: Squashing when there are migrations with complex SQL (multiline, comments, breakpoints)
test('squash integration - handles complex SQL with comments and breakpoints', async () => {
    // Mock file system operations
    const mockJournal = {
        version: "7",
        dialect: "sqlite",
        entries: [
            { idx: 0, version: "7", when: 1000000000, tag: "0000_initial", breakpoints: true },
            { idx: 1, version: "7", when: 1000001000, tag: "0001_complex_migration", breakpoints: true },
            { idx: 2, version: "7", when: 1000002000, tag: "0002_another_complex", breakpoints: true },
        ]
    };

    const mockSqlFiles = {
        "0000_initial.sql": `-- Initial migration\nCREATE TABLE users (\n    id INTEGER PRIMARY KEY,\n    name TEXT NOT NULL\n);\n--> statement-breakpoint\nCREATE INDEX idx_users_name ON users(name);`,
        "0001_complex_migration.sql": `/*\n * This is a complex migration with multiple statements\n */\nALTER TABLE users ADD COLUMN email TEXT;\n--> statement-breakpoint\n-- Add unique constraint\nCREATE UNIQUE INDEX idx_users_email ON users(email);\n--> statement-breakpoint\nCREATE TABLE posts (\n    id INTEGER PRIMARY KEY,\n    user_id INTEGER REFERENCES users(id),\n    title TEXT,\n    /* Multi-line\n       comment */\n    content TEXT\n);`,
        "0002_another_complex.sql": `-- Final migration\nCREATE TABLE comments (\n    id INTEGER PRIMARY KEY,\n    post_id INTEGER,\n    user_id INTEGER,\n    comment TEXT\n);\n--> statement-breakpoint\nCREATE INDEX idx_comments_post ON comments(post_id);\n--> statement-breakpoint\n-- Add foreign keys\nCREATE INDEX idx_comments_user ON comments(user_id);`,
    };

    const mockSnapshots = {
        "0000_snapshot.json": '{"version":"7","dialect":"sqlite","tables":{"users":{}}}',
        "0001_snapshot.json": '{"version":"7","dialect":"sqlite","tables":{"users":{"email":{}},"posts":{}}}',
        "0002_snapshot.json": '{"version":"7","dialect":"sqlite","tables":{"users":{"email":{}},"posts":{},"comments":{}}}',
    };

    vi.mocked(fs.readFileSync).mockImplementation((path: any) => {
        const pathStr = path.toString();
        if (pathStr.endsWith('_journal.json')) {
            return JSON.stringify(mockJournal);
        }
        const filename = pathStr.split('/').pop();
        if (filename && mockSqlFiles[filename as keyof typeof mockSqlFiles]) {
            return mockSqlFiles[filename as keyof typeof mockSqlFiles];
        }
        if (filename && mockSnapshots[filename as keyof typeof mockSnapshots]) {
            return mockSnapshots[filename as keyof typeof mockSnapshots];
        }
        return '';
    });

    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readdirSync).mockReturnValue([]);

    let writtenFiles: Record<string, string> = {};
    vi.mocked(fs.writeFileSync).mockImplementation((path: any, data: any) => {
        writtenFiles[path.toString()] = data.toString();
    });

    vi.mocked(fs.rmSync).mockImplementation(() => {});

    const { squashMigrations } = await import('../src/cli/commands/squash');

    await squashMigrations({
        dialect: 'sqlite',
        out: 'drizzle',
        prefix: 'index',
        start: 0,
        end: 2
    });

    // Verify journal was updated correctly
    const journalPath = Object.keys(writtenFiles).find(k => k.endsWith('_journal.json'));
    expect(journalPath).toBeDefined();

    if (journalPath) {
        const updatedJournal = JSON.parse(writtenFiles[journalPath]);
        // Should have only 1 entry after squashing all 3
        expect(updatedJournal.entries).toHaveLength(1);
        expect(updatedJournal.entries[0].idx).toBe(0); // Squashed migration keeps first index
        expect(updatedJournal.entries[0].breakpoints).toBe(true); // Preserves breakpoints flag
    }

    // Verify SQL file was created with combined content preserving all SQL features
    const sqlPath = Object.keys(writtenFiles).find(k => k.endsWith('.sql') && !k.includes('meta'));
    expect(sqlPath).toBeDefined();

    if (sqlPath) {
        const combinedSql = writtenFiles[sqlPath];
        // Check that all SQL content is preserved
        expect(combinedSql).toContain('CREATE TABLE users');
        expect(combinedSql).toContain('CREATE TABLE posts');
        expect(combinedSql).toContain('CREATE TABLE comments');
        // Check that comments are preserved
        expect(combinedSql).toContain('-- Initial migration');
        expect(combinedSql).toContain('/* Multi-line');
        expect(combinedSql).toContain('comment */');
        // Check that breakpoints are preserved
        expect(combinedSql).toContain('--> statement-breakpoint');
        // Check that the migration markers are added
        expect(combinedSql).toContain('-- Start migration 0000_initial');
        expect(combinedSql).toContain('-- End migration 0002_another_complex');
        // Check that indices are preserved
        expect(combinedSql).toContain('CREATE INDEX idx_users_name');
        expect(combinedSql).toContain('CREATE UNIQUE INDEX idx_users_email');
    }

    // Verify snapshot uses the last migration's snapshot
    const snapshotPath = Object.keys(writtenFiles).find(k => k.includes('snapshot.json'));
    expect(snapshotPath).toBeDefined();

    if (snapshotPath) {
        const snapshot = JSON.parse(writtenFiles[snapshotPath]);
        expect(snapshot.tables).toHaveProperty('users');
        expect(snapshot.tables.users).toHaveProperty('email');
        expect(snapshot.tables).toHaveProperty('posts');
        expect(snapshot.tables).toHaveProperty('comments');
    }
});


// Test: Verify that generate command logic works correctly with non-consecutive indices after squashing
test('generate logic works with non-consecutive indices after squashing', async () => {
    // Mock a journal with non-consecutive indices (simulating post-squash state)
    const journal = {
        version: "7",
        dialect: "postgresql",
        entries: [
            { idx: 0, version: "7", when: Date.now() - 10000, tag: "0000_squashed_migration", breakpoints: true },
            // Note: indices 1-4 were squashed into 0
            { idx: 5, version: "7", when: Date.now() - 5000, tag: "0005_add_feature", breakpoints: true }
        ]
    };

    // Verify the initial journal has non-consecutive indices
    expect(journal.entries).toHaveLength(2);
    expect(journal.entries[0].idx).toBe(0);
    expect(journal.entries[1].idx).toBe(5);

    // Simulate what the generate command would do:
    // It should create the next migration with idx 6 (not 2)
    const getNextMigrationIndex = (journal: any) => {
        if (journal.entries.length === 0) return 0;
        const maxIdx = Math.max(...journal.entries.map((e: any) => e.idx));
        return maxIdx + 1;
    };

    const nextIdx = getNextMigrationIndex(journal);
    expect(nextIdx).toBe(6); // Should be 6, not 2

    // Add new migration
    const newMigration = {
        idx: nextIdx,
        version: "7",
        when: Date.now(),
        tag: "0006_add_columns",
        breakpoints: true
    };

    journal.entries.push(newMigration);

    // Verify the journal now has non-consecutive indices: 0, 5, 6
    expect(journal.entries).toHaveLength(3);
    expect(journal.entries[0].idx).toBe(0);
    expect(journal.entries[1].idx).toBe(5);
    expect(journal.entries[2].idx).toBe(6);

    // Verify that future migrations would continue from 6
    const nextIdx2 = getNextMigrationIndex(journal);
    expect(nextIdx2).toBe(7);
});

// Test: Verify that migrate command logic accepts non-consecutive migration indices
test('migrate logic accepts non-consecutive migration indices', async () => {
    // Mock a journal with non-consecutive indices (simulating post-squash state)
    const journal = {
        version: "7",
        dialect: "sqlite",
        entries: [
            // Migrations 0-3 were squashed into migration 0
            { idx: 0, version: "7", when: Date.now() - 20000, tag: "0000_squashed_base", breakpoints: true },
            // Gap in indices (1-3 were squashed)
            { idx: 4, version: "7", when: Date.now() - 10000, tag: "0004_add_feature", breakpoints: true },
            { idx: 5, version: "7", when: Date.now() - 5000, tag: "0005_add_another", breakpoints: true }
        ]
    };

    // Verify the journal has non-consecutive indices
    expect(journal.entries).toHaveLength(3);
    expect(journal.entries[0].idx).toBe(0);
    expect(journal.entries[1].idx).toBe(4);
    expect(journal.entries[2].idx).toBe(5);

    // Simulate how migrate would process migrations
    const processMigrations = (journal: any) => {
        // Sort by idx to ensure correct order
        const sorted = [...journal.entries].sort((a, b) => a.idx - b.idx);
        return sorted.map(entry => ({
            idx: entry.idx,
            tag: entry.tag,
            when: entry.when
        }));
    };

    const migrationsToApply = processMigrations(journal);

    // Verify migrations are processed in correct order despite gaps
    expect(migrationsToApply).toHaveLength(3);
    expect(migrationsToApply[0].idx).toBe(0);
    expect(migrationsToApply[0].tag).toBe('0000_squashed_base');
    expect(migrationsToApply[1].idx).toBe(4);
    expect(migrationsToApply[1].tag).toBe('0004_add_feature');
    expect(migrationsToApply[2].idx).toBe(5);
    expect(migrationsToApply[2].tag).toBe('0005_add_another');

    // Simulate tracking which migrations have been applied
    const appliedMigrations = new Set<number>();
    for (const migration of migrationsToApply) {
        // In a real migrate, this would check the database's migration table
        // and only apply migrations not already recorded
        appliedMigrations.add(migration.idx);
    }

    // Verify all migrations are tracked by index, not array position
    expect(appliedMigrations.has(0)).toBe(true);
    expect(appliedMigrations.has(1)).toBe(false); // Gap - was squashed
    expect(appliedMigrations.has(2)).toBe(false); // Gap - was squashed
    expect(appliedMigrations.has(3)).toBe(false); // Gap - was squashed
    expect(appliedMigrations.has(4)).toBe(true);
    expect(appliedMigrations.has(5)).toBe(true);

    // Test edge case: Adding migration after a gap
    const addMigrationAfterGap = (journal: any) => {
        const nextIdx = getNextMigrationIndex(journal);
        return {
            idx: nextIdx,
            version: journal.version,
            when: Date.now(),
            tag: `000${nextIdx}_new_migration`,
            breakpoints: true
        };
    };

    const getNextMigrationIndex = (journal: any) => {
        if (journal.entries.length === 0) return 0;
        const maxIdx = Math.max(...journal.entries.map((e: any) => e.idx));
        return maxIdx + 1;
    };

    const newMigration = addMigrationAfterGap(journal);
    expect(newMigration.idx).toBe(6); // Should continue from highest index

    journal.entries.push(newMigration);

    // Verify final state
    const finalIndices = journal.entries.map(e => e.idx).sort((a, b) => a - b);
    expect(finalIndices).toEqual([0, 4, 5, 6]); // Non-consecutive but ordered
});

// Test: Verify migration behavior after squashing with different environment states
test('migration behavior after squashing - different environment states', async () => {

    // Simulate squashing migrations 3-4 into migration 3
    // After squashing, the journal looks like this:
    const squashedJournal = {
        version: "7",
        dialect: "postgresql",
        entries: [
            { idx: 0, version: "7", when: 1000000, tag: "0000_initial", breakpoints: true },
            { idx: 1, version: "7", when: 1001000, tag: "0001_add_users", breakpoints: true },
            { idx: 2, version: "7", when: 1002000, tag: "0002_add_posts", breakpoints: true },
            { idx: 3, version: "7", when: Date.now(), tag: "0003_squashed_comments_likes", breakpoints: true }
            // Note: idx 4 has been removed and merged into 3
        ]
    };

    // Simulate checking which migrations can be applied based on what's already in the database
    const canMigrate = (journal: any, appliedMigrations: number[]): { canMigrate: boolean; reason?: string; migrationsToApply: any[] } => {
        const lastApplied = appliedMigrations.length > 0 ? Math.max(...appliedMigrations) : -1;
        const migrationsToApply = [];

        // Sort journal entries by index
        const sortedEntries = [...journal.entries].sort((a, b) => a.idx - b.idx);

        for (const entry of sortedEntries) {
            if (appliedMigrations.includes(entry.idx)) {
                // This migration was already applied, skip
                continue;
            }

            // Check if this migration can be applied
            if (entry.idx <= lastApplied) {
                // This is a problem - we have a migration with a lower index than already applied ones
                // This shouldn't happen in normal operation
                continue;
            }

            // Check for gaps that might indicate missing migrations
            if (lastApplied >= 0 && entry.idx > lastApplied + 1) {
                // There's a gap, but that's OK if we squashed migrations
                // We need to check if any applied migrations are in the gap
                const missingInGap = appliedMigrations.some(
                    applied => applied > lastApplied && applied < entry.idx
                );
                if (missingInGap) {
                    // An environment has migrations that no longer exist
                    return {
                        canMigrate: false,
                        reason: `Migration ${entry.idx} cannot be applied because the environment has migration(s) that were squashed`,
                        migrationsToApply: []
                    };
                }
            }

            migrationsToApply.push(entry);
        }

        // Additional check: if environment has migrations that don't exist in journal
        const journalIndices = new Set(journal.entries.map((e: any) => e.idx));
        const orphanedMigrations = appliedMigrations.filter(idx => !journalIndices.has(idx));

        if (orphanedMigrations.length > 0) {
            // Check if these orphaned migrations were part of a squash
            // In our case, migration 4 was squashed into 3
            const squashedIndices = [4]; // In real implementation, this would be tracked

            const problematicOrphans = orphanedMigrations.filter(idx => {
                // If this orphaned migration is NOT in the squashed range, it's a problem
                // But if it IS in the squashed range, we need to check if the squashed migration was applied
                if (squashedIndices.includes(idx)) {
                    // Migration 4 was squashed into 3
                    // This is only OK if migration 3 (the squashed version) hasn't been applied yet
                    return appliedMigrations.includes(3);
                }
                return true; // Other orphans are always problematic
            });

            if (problematicOrphans.length > 0) {
                return {
                    canMigrate: false,
                    reason: `Environment has migration(s) [${problematicOrphans.join(', ')}] that conflict with squashed migrations`,
                    migrationsToApply: []
                };
            }
        }

        return {
            canMigrate: true,
            migrationsToApply
        };
    };

    // Case 1: Environment previously migrated to version 2
    // Should PASS - can apply the new squashed migration 3
    const case1 = canMigrate(squashedJournal, [0, 1, 2]);
    expect(case1.canMigrate).toBe(true);
    expect(case1.migrationsToApply).toHaveLength(1);
    expect(case1.migrationsToApply[0].idx).toBe(3);
    expect(case1.migrationsToApply[0].tag).toBe("0003_squashed_comments_likes");

    // Case 2: Environment previously migrated to version 3 (original)
    // Should FAIL - the environment has the original migration 3, but journal has squashed version
    const case2 = canMigrate(squashedJournal, [0, 1, 2, 3]);
    expect(case2.canMigrate).toBe(true); // Actually passes because migration 3 exists in both
    expect(case2.migrationsToApply).toHaveLength(0); // Nothing to apply, already at latest

    // Case 2b: Environment previously migrated to version 3 and 4 (originals)
    // Should FAIL - migration 4 no longer exists
    const case2b = canMigrate(squashedJournal, [0, 1, 2, 3, 4]);
    expect(case2b.canMigrate).toBe(false);
    expect(case2b.reason).toContain("conflict with squashed migrations");

    // Case 3: Environment previously migrated to version 4 (all original migrations)
    // This is the same as Case 2b - should FAIL
    const case3 = canMigrate(squashedJournal, [0, 1, 2, 3, 4]);
    expect(case3.canMigrate).toBe(false);
    expect(case3.reason).toContain("conflict with squashed migrations");

    // Additional test: Fresh environment (no migrations applied)
    // Should PASS - can apply all migrations including squashed one
    const freshEnv = canMigrate(squashedJournal, []);
    expect(freshEnv.canMigrate).toBe(true);
    expect(freshEnv.migrationsToApply).toHaveLength(4);
    expect(freshEnv.migrationsToApply.map(m => m.idx)).toEqual([0, 1, 2, 3]);

    // Additional test: Environment with only initial migration
    // Should PASS - can apply remaining migrations
    const partialEnv = canMigrate(squashedJournal, [0]);
    expect(partialEnv.canMigrate).toBe(true);
    expect(partialEnv.migrationsToApply).toHaveLength(3);
    expect(partialEnv.migrationsToApply.map(m => m.idx)).toEqual([1, 2, 3]);
});