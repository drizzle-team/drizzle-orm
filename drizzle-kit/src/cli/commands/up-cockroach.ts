import chalk from 'chalk';
import { readFileSync, writeFileSync } from 'fs';
import { basename, dirname, join } from 'path';
import { fromEntities } from '../../dialects/cockroach/ddl';
import { sortsAfter } from '../../dialects/cockroach/folder';
import {
	type CockroachSnapshot,
	type CockroachSnapshotV1,
	snapshotValidator,
	snapshotValidatorV1,
} from '../../dialects/cockroach/snapshot';
import { upToV2 } from '../../dialects/cockroach/versions';
import { UnsupportedMergeError } from '../../folder/convert';
import { stateDifference } from '../../folder/delta-format';
import { folderOrderError } from '../../folder/history';
import { reconstruct } from '../../folder/reconstruct';
import { originUUID } from '../../utils';
import { assertSnapshotStatus, prepareOutFolder, validatorForDialect } from '../../utils/utils-node';
import { outputFormat } from '../context';
import { CommandOutputCliError, DrizzleCliError, UnsupportedSnapshotVersionCliError } from '../errors';
import { journalOrderError } from './up-postgres';
import { applyFoldersV3, planFoldersV3 } from './utils';

const reportIssueHint =
	'Keep the current snapshot files and report this issue at https://github.com/drizzle-team/drizzle-orm/issues.';

const conversionError = (name: string, reason: string, next: string, meta: Record<string, string>) =>
	new CommandOutputCliError(
		'up',
		`Cannot convert migration ${name} to snapshot format 2: ${reason}. No snapshot was converted. ${next}`,
		meta,
	);

// Reports a migration history that `up` cannot convert. `reason` and `fix` must be full sentences with a final
// period, because the message joins them with no punctuation.
const historyError = (reason: string, fix: string, meta: Record<string, string> = {}) =>
	new CommandOutputCliError(
		'up',
		`Cannot convert the migrations folder to snapshot format 2: ${reason} No file was changed. ${fix}`,
		{ kind: 'history', ...meta },
	);

// Converts the snapshots of the migrations folder `out` to format 2 and returns the paths of the written files.
// It moves and writes files only after every snapshot is converted and checked, so a failure leaves the folder
// as it was. A journal folder (the drizzle-kit 0.x layout) is read in place and moved last.
export const upCockroachHandler = async (out: string): Promise<string[]> => {
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

	const validate = validatorForDialect('cockroach');
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

	// A folder that holds only format 2 snapshots needs no conversion. `check` validates such a folder, so `up`
	// does not validate it here.
	const converted: { path: string; text: string }[] = [];
	if (sources.some((it) => it.status === 'nonLatest')) {
		const files = sources.map(({ raw, ...it }) => {
			const parsed = snapshotValidatorV1.parse(raw);
			const snapshot: CockroachSnapshotV1 | CockroachSnapshot = raw.version === '1' && parsed.success
				? parsed.data
				: raw;
			return { ...it, snapshot };
		}).sort((a, b) => (a.folder < b.folder ? -1 : 1));
		const malformedFile = files.find(({ status }) => status === 'malformed');
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

		// `upToV2` turns each snapshot with no parent into a base snapshot. A folder can hold one base snapshot,
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
			snapshotTexts = (await upToV2(files)).map((it) => JSON.stringify(it, null, 2));
		} catch (e) {
			if (e instanceof DrizzleCliError) throw e;
			if (e instanceof UnsupportedMergeError) {
				const snapshot = files.find((it) => it.folder === e.folder)!.path;
				throw historyError(
					e.message,
					`Snapshot format 2 does not support a merge of such branches. Delete the merge migration ${e.folder}, `
						+ 'every later migration, and the migrations of one of its branches after the fork point. After that, '
						+ 'run drizzle-kit up again, and then run drizzle-kit generate. A database that ran a deleted migration '
						+ 'must be reset.',
					{ snapshot },
				);
			}
			throw historyError((e as Error).message, reportIssueHint);
		}

		// `written` parses `snapshotTexts` back, so the checks below see the same JSON that is written to disk.
		const written = snapshotTexts.map((it) => JSON.parse(it) as CockroachSnapshot);
		const byId = new Map(written.map((it) => [it.id, it]));
		for (const [idx, { path, folder, name, snapshot }] of files.entries()) {
			if (snapshot.version === '2') continue;
			const { errors } = snapshotValidator.parse(written[idx]);
			if (errors) {
				throw conversionError(name, `the new snapshot is not valid (${errors.join('; ')})`, reportIssueHint, {
					kind: 'invalid_snapshot',
					snapshot: path,
				});
			}
			const state = reconstruct(byId, snapshot.id, fromEntities);
			const entity = stateDifference(fromEntities(snapshot.ddl), state);
			if (entity !== undefined) {
				throw conversionError(
					name,
					`its reconstructed state differs from the format 1 state at ${entity}`,
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
