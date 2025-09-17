import chalk from 'chalk';
import { readFileSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { assertV1OutFolder, Journal, prepareMigrationFolder } from '../../utils';
import { prepareMigrationMetadata } from '../../utils/words';
import { SquashConfig } from './utils';
import { embeddedMigrations } from './migrate';

export const squashMigrations = async ({start, end, out, dialect, prefix}: SquashConfig) => {
    try {
        assertV1OutFolder(out);

        const { journal }: {journal: Journal} = prepareMigrationFolder(out, dialect);

        // Filter entries within the specified range
        const entriesToSquash = journal.entries.filter(
            entry => entry.idx >= start && entry.idx <= end
        );
        entriesToSquash.sort((a, b) => a.idx - b.idx);

        if (entriesToSquash.length === 0) {
            console.log(`[${chalk.yellow('!')}] No migrations found in range ${start}-${end}`);
            return;
        }

        if (entriesToSquash.length === 1) {
            console.log(`[${chalk.yellow('!')}] Only one migration found in range ${start}-${end}, nothing to squash`);
            return;
        }

        console.log(
            `[${chalk.green('✓')}] Found ${entriesToSquash.length} migrations to squash (${entriesToSquash[0].tag} through ${entriesToSquash[entriesToSquash.length - 1].tag})`
        );

        // Combine all SQL statements
        let combinedSql = entriesToSquash.map(
            (entry) => `-- Start migration ${entry.tag}\n${readFileSync(join(out, `${entry.tag}.sql`), 'utf-8')}\n-- End migration ${entry.tag}`
        ).join('\n');

        // Use the last snapshot as the new snapshot
        const lastEntry = entriesToSquash[entriesToSquash.length - 1];
        const lastSnapshotPath = join(
            out,
            'meta',
            `${lastEntry.tag.split('_')[0]}_snapshot.json`
        );
        const lastSnapshot = readFileSync(lastSnapshotPath, 'utf-8');

        // Create new migration
        const newMetadata = prepareMigrationMetadata(end, prefix);
        const newTag = newMetadata.tag;
        const newSnapshotPath = join(
            out,
            'meta',
            `${newTag.split('_')[0]}_snapshot.json`
        );
        const newSqlPath = join(out, `${newTag}.sql`);

        // Write new files
        writeFileSync(newSnapshotPath, lastSnapshot);
        writeFileSync(newSqlPath, combinedSql);

        // Update journal
        const newJournalEntry = {
            idx: entriesToSquash[0].idx,
            version: journal.version,
            when: Date.now(),
            tag: newTag,
            breakpoints: entriesToSquash[0].breakpoints
        };

        // Keep entries outside the squash range
        const keptEntries = journal.entries.filter(
            entry => entry.idx < start || entry.idx > end
        );

        // Insert new squashed entry at the correct position (maintaining index order)
        const beforeSquash = keptEntries.filter(e => e.idx < start);
        const afterSquash = keptEntries.filter(e => e.idx > end);

        const updatedEntries = [
            ...beforeSquash,
            newJournalEntry,
            ...afterSquash
        ];

        const updatedJournal: Journal = {
            ...journal,
            entries: updatedEntries
        };

        // Write updated journal
        const metaFilePath = join(out, 'meta', '_journal.json');
        writeFileSync(metaFilePath, JSON.stringify(updatedJournal, null, 2));

        // Remove old migration files
        for (const entry of entriesToSquash) {
            const oldSqlPath = join(out, `${entry.tag}.sql`);
            const oldSnapshotPath = join(
                out,
                'meta',
                `${entry.tag.split('_')[0]}_snapshot.json`
            );
            rmSync(oldSqlPath);
            rmSync(oldSnapshotPath);
        }

        console.log(
            `[${chalk.green('✓')}] Successfully squashed ${entriesToSquash.length} migrations into ${newTag}`
        );
        console.log(
            `[${chalk.blue('i')}] Removed: ${entriesToSquash.map(e => e.tag).join(', ')}`
        );
        console.log(
            `[${chalk.blue('i')}] Created: ${newTag}`
        );

    } catch (e) {
        console.error(e);
        process.exit(1);
    }
};