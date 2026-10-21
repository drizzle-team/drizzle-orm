import chalk from 'chalk';
import { readFileSync, writeFileSync } from 'fs';
import { basename, dirname, join } from 'path';
import { DuplicateEntityError, fromEntities } from '../../dialects/postgres/ddl';
import { folderOrderError, sortsAfter } from '../../dialects/postgres/folder';
import { reconstruct } from '../../dialects/postgres/reconstruct';
import {
	type PostgresSnapshot,
	type PostgresSnapshotV8,
	snapshotValidator,
	stateDifference,
} from '../../dialects/postgres/snapshot';
import { isSnapshotV8, upToV8 } from '../../dialects/postgres/versions';
import { UnsupportedMergeError, upToV9, withStateKeyNames } from '../../dialects/postgres/versions-v9';
import { originUUID } from '../../utils';
import { assertSnapshotStatus, prepareOutFolder, validatorForDialect } from '../../utils/utils-node';
import { outputFormat } from '../context';
import { CheckCliError, CommandOutputCliError, DrizzleCliError, UnsupportedSnapshotVersionCliError } from '../errors';
import { applyFoldersV3, planFoldersV3 } from './utils';

const reportIssueHint =
	'Keep the current snapshot files and report this issue at https://github.com/drizzle-team/drizzle-orm/issues.';

const conversionError = (name: string, reason: string, next: string, meta: Record<string, string>) =>
	new CommandOutputCliError(
		'up',
		`Cannot convert migration ${name} to snapshot format 9: ${reason}. No snapshot was converted. ${next}`,
		meta,
	);

// Reports a migration that would sort before its parent after the move out of a journal folder. The migration
// folders do not exist yet, so the message names the journal entries. The JSON output matches `folderOrderError`.
const journalOrderError = (file: { name: string; path: string }, parent: { name: string; path: string }) =>
	new CheckCliError(
		'order',
		`After drizzle-kit up moves the migrations into folders, migration ${file.name} sorts before its parent `
			+ `${parent.name}, so migrate can run it first. drizzle-kit up names each folder after the time in \`when\` `
			+ `of its journal entry. No file was changed. In meta/_journal.json, set \`when\` of ${file.name} to a time at `
			+ `least one second after \`when\` of ${parent.name}, then run drizzle-kit up again.`,
		{ snapshot: file.path, parentSnapshot: parent.path },
	);

// Reports a migration history that `up` cannot convert. `reason` and `fix` must be full sentences with a final
// period, because the message joins them with no punctuation.
const historyError = (reason: string, fix: string, meta: Record<string, string> = {}) =>
	new CommandOutputCliError(
		'up',
		`Cannot convert the migrations folder to snapshot format 9: ${reason} No file was changed. ${fix}`,
		{ kind: 'history', ...meta },
	);

// Converts the snapshots of the migrations folder `out` to format 9 and returns the paths of the written files.
// It moves and writes files only after every snapshot is converted and checked, so a failure leaves the folder
// as it was. A journal folder (the drizzle-kit 0.x layout) is read in place and moved last.
export const upPgHandler = async (out: string): Promise<string[]> => {
	const moves = planFoldersV3(out);
	const withoutSql = moves?.find((it) => !it.sqlPath);
	if (withoutSql) {
		const sql = join(out, `${withoutSql.tag}.sql`);
		throw historyError(
			`the journal entry ${withoutSql.tag} has no SQL file. drizzle-kit expects it at ${sql}.`,
			'Restore this file from git, then run drizzle-kit up again.',
			{ entry: withoutSql.tag, sql },
		);
	}

	const validate = validatorForDialect('postgresql');
	// The errors below are thrown before the move, so `path` and `name` are the file and the migration name
	// before the move. `folder` is the migration folder after the move.
	const sources = (moves
		? moves.map((it) => ({ path: it.snapshotPath, folder: it.folder, name: it.tag }))
		: prepareOutFolder(out).snapshots.map((path) => ({
			path,
			folder: basename(dirname(path)),
			name: basename(dirname(path)),
		})))
		.map((it) => {
			let raw: any;
			try {
				raw = JSON.parse(readFileSync(it.path, 'utf8'));
			} catch {
				assertSnapshotStatus(it.path, 'malformed');
			}
			const { status } = validate(raw);
			if (status === 'unsupported') throw new UnsupportedSnapshotVersionCliError(it.path);
			return { ...it, raw, status };
		});

	// A folder that holds only format 9 snapshots needs no conversion. `check` validates such a folder, so `up`
	// does not validate it here.
	const converted: { path: string; text: string }[] = [];
	if (sources.some((it) => it.status === 'nonLatest')) {
		const files = sources.map(({ raw, ...it }) => {
			const snapshot: PostgresSnapshotV8 | PostgresSnapshot = Number(raw.version) < 8 ? upToV8(raw).snapshot : raw;
			return { ...it, snapshot };
		}).sort((a, b) => (a.folder < b.folder ? -1 : 1));
		// `validate` returns `nonLatest` for a format 8 file without a check of its shape, so `isSnapshotV8`
		// checks that shape here.
		const malformedFile = files.find(({ status, snapshot }) =>
			status === 'malformed' || (snapshot.version === '8' && !isSnapshotV8(snapshot))
		);
		if (malformedFile) {
			throw conversionError(
				malformedFile.name,
				'its snapshot.json is malformed',
				`Restore ${malformedFile.path} from git, then run drizzle-kit up again.`,
				{ kind: 'malformed', snapshot: malformedFile.path },
			);
		}

		const fileOf = new Map(files.map((it) => [it.snapshot.id, it]));
		for (const file of files) {
			for (const parentId of file.snapshot.prevIds) {
				if (!parentId || parentId === originUUID) continue;
				const parent = fileOf.get(parentId);
				if (!parent) {
					throw historyError(
						`a migration was deleted in the middle of the history. Migration ${file.name} follows the snapshot `
							+ `${parentId}, and no migration in the folder has this snapshot.`,
						`Restore the missing migration from git. If that is not possible, delete ${file.name} and every later `
							+ 'migration, run drizzle-kit up, and generate them again.',
						{ snapshot: file.path, parentId },
					);
				}
				if (!sortsAfter(file.folder, parent.folder)) {
					throw moves ? journalOrderError(file, parent) : folderOrderError(file, parent);
				}
			}
		}

		// `upToV9` turns each snapshot with no parent into a base snapshot. A folder can hold one base snapshot,
		// so a `second` snapshot with no parent is an error.
		const [first, second] = files.filter((it) => it.snapshot.prevIds.every((id) => !id || id === originUUID));
		if (second) {
			throw historyError(
				`the folder has two first migrations, ${first.name} and ${second.name}, and a folder must have one.`,
				'Delete one of the two migrations together with every migration that follows it, run drizzle-kit up '
					+ 'again, and then run drizzle-kit generate.',
				{ snapshot: second.path, baseSnapshot: first.path },
			);
		}

		let snapshotTexts: string[];
		try {
			snapshotTexts = (await upToV9(files)).map((it) => JSON.stringify(it, null, 2));
		} catch (e) {
			if (e instanceof DrizzleCliError) throw e;
			if (e instanceof UnsupportedMergeError) {
				const snapshot = files.find((it) => it.folder === e.folder)!.path;
				throw historyError(
					e.message,
					`Snapshot format 9 does not support a merge of such branches. Delete the merge migration ${e.folder}, `
						+ 'every later migration, and the migrations of one of its branches after the fork point. After that, '
						+ 'run drizzle-kit up again, and then run drizzle-kit generate. A database that ran a deleted migration '
						+ 'must be reset.',
					{ snapshot },
				);
			}
			if (e instanceof DuplicateEntityError) {
				throw historyError(
					`a snapshot lists two rows of ${e.entityType} with the key ${e.key}.`,
					'Postgres does not allow two such entities with one name, so the SQL of this folder cannot run. Give '
						+ 'them different names in the schema, delete the migrations folder and generate the migrations again.',
				);
			}
			throw historyError((e as Error).message, reportIssueHint);
		}

		// `written` parses `snapshotTexts` back, so the checks below see the same JSON that is written to disk.
		const written = snapshotTexts.map((it) => JSON.parse(it) as PostgresSnapshot);
		const byId = new Map(written.map((it) => [it.id, it]));
		for (const [idx, { path, folder, name, snapshot }] of files.entries()) {
			if (snapshot.version === '9') continue;
			const { errors } = snapshotValidator.parse(written[idx]);
			if (errors) {
				throw conversionError(name, `the new snapshot is not valid (${errors.join('; ')})`, reportIssueHint, {
					kind: 'invalid_snapshot',
					snapshot: path,
				});
			}
			const state = reconstruct(byId, snapshot.id);
			const entity = stateDifference(fromEntities(withStateKeyNames(snapshot.ddl, state)), state);
			if (entity !== undefined) {
				throw conversionError(
					name,
					`its reconstructed state differs from the format 8 state at ${entity}`,
					reportIssueHint,
					{
						kind: 'state_mismatch',
						snapshot: path,
						entity,
					},
				);
			}
			converted.push({ path: join(out, folder, 'snapshot.json'), text: snapshotTexts[idx] });
		}
	}

	if (moves) applyFoldersV3(out, moves);
	for (const { path, text } of converted) {
		writeFileSync(path, text);
		if (outputFormat() === 'text') console.log(`[${chalk.green('✓')}] ${path}`);
	}

	if (outputFormat() === 'text') console.log("Everything's fine 🐶🔥");

	return converted.map((it) => it.path);
};
