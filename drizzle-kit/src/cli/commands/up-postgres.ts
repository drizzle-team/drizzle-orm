import chalk from 'chalk';
import { writeFileSync } from 'fs';
import { basename, dirname } from 'path';
import type { Resolver } from '../../dialects/common';
import { normalizeDDL } from '../../dialects/ddl-canonical';
import { copyDDL, delta } from '../../dialects/dialect';
import { fromEntities } from '../../dialects/postgres/ddl';
import { ddlDiff } from '../../dialects/postgres/diff';
import {
	type PostgresSnapshot,
	type PostgresSnapshotV8,
	reconstruct,
	snapshotValidator,
	startingState,
} from '../../dialects/postgres/snapshot';
import { upToV8 } from '../../dialects/postgres/versions';
import { originUUID } from '../../utils';
import { mockResolver } from '../../utils/mocks';
import { prepareOutFolder, validateWithReport } from '../../utils/utils-node';
import { outputFormat } from '../context';
import { CommandOutputCliError } from '../errors';
import { migrateToFoldersV3 } from './utils';

// A format 8 rename string does not say which kind of entity it renames, so every resolver gets all of
// them. A resolver keeps only the strings whose old name is among its dropped rows and whose new name
// is among its created rows, because mockResolver throws when it finds the old name without the new one.
const renamesResolver = (renames: string[]) =>
<T extends { name: string; table?: string; schema?: string }>(
	it: Parameters<Resolver<T>>[0],
): ReturnType<Resolver<T>> => {
	const nameOf = (row: T) => [row.schema, row.table, row.name].filter(Boolean).join('.');
	const deleted = new Set(it.deleted.map(nameOf));
	const created = new Set(it.created.map(nameOf));
	const own = renames.filter((rename) => {
		const [from, to] = rename.split('->');
		return deleted.has(from) && created.has(to);
	});
	return mockResolver<T>(new Set(own))(it);
};

// This step is not in versions.ts, because the programmatic API imports versions.ts and must not load
// snapshot.ts. `files` must be in folder-name order.
const upToV9 = async (
	files: { folder: string; snapshot: PostgresSnapshotV8 | PostgresSnapshot }[],
): Promise<PostgresSnapshot[]> => {
	const folderOf = new Map(files.map((it) => [it.snapshot.id, it.folder]));
	const converted = new Map<string, PostgresSnapshot>();
	for (const { snapshot } of files) {
		if (snapshot.version === '9') {
			converted.set(snapshot.id, snapshot);
			continue;
		}
		const header = { version: '9', dialect: 'postgres', id: snapshot.id } as const;
		const parents = snapshot.prevIds.filter((id) => id && id !== originUUID);
		if (parents.length === 0) {
			const ddl = fromEntities(snapshot.ddl).entities.list();
			converted.set(snapshot.id, { type: 'base', ...header, prevIds: [originUUID], ddl });
			continue;
		}
		// The first parent of a merge is the one with the newest folder name.
		const prevIds = [...parents].sort((a, b) => (folderOf.get(a)! > folderOf.get(b)! ? -1 : 1));
		// ddlDiff changes both states that it gets, so neither may share rows with a file.
		const from = copyDDL(startingState(converted, prevIds));
		const to = fromEntities(structuredClone(snapshot.ddl));
		const resolve = renamesResolver(snapshot.renames ?? []);
		const { deltas } = await ddlDiff(
			from,
			to,
			resolve,
			resolve,
			resolve,
			resolve,
			resolve,
			resolve,
			resolve,
			resolve,
			resolve,
			resolve,
			resolve,
			resolve,
			resolve,
			'default',
		);
		// ddlDiff gives a constraint with a generated name the name that it has in the starting state. A
		// format 5-8 file can store another generated name, for example after a table rename or in a merge.
		// Drops and creates at the end restore the stored names.
		deltas.push(...delta(to, fromEntities(snapshot.ddl)));
		converted.set(snapshot.id, { type: 'diff', ...header, prevIds, deltas });
	}
	return files.map((it) => converted.get(it.snapshot.id)!);
};

const entityName = (json: string) => {
	const row = JSON.parse(json);
	return `${row.entityType} ${[row.schema, row.table, row.name].filter(Boolean).join('.')}`;
};

const reportIssueHint =
	'Keep the current snapshot files and report this issue at https://github.com/drizzle-team/drizzle-orm/issues.';

const conversionError = (folder: string, reason: string, next: string, meta: Record<string, string>) =>
	new CommandOutputCliError(
		'up',
		`Cannot convert migration ${folder} to snapshot format 9: ${reason}. No snapshot was converted. ${next}`,
		meta,
	);

export const upPgHandler = async (out: string): Promise<string[]> => {
	migrateToFoldersV3(out);

	const { snapshots } = prepareOutFolder(out);
	const report = validateWithReport(snapshots, 'postgresql');

	if (report.nonLatest.length > 0) {
		const files = snapshots.map((path) => {
			const raw = report.rawMap[path];
			return { path, folder: basename(dirname(path)), snapshot: Number(raw.version) < 8 ? upToV8(raw).snapshot : raw };
		});
		// The loader validates only format 9 files.
		const malformedFile = files.find(({ path, snapshot }) =>
			report.malformed.includes(path)
			|| (snapshot.version === '8' && !(Array.isArray(snapshot.ddl) && Array.isArray(snapshot.prevIds)))
		);
		if (malformedFile) {
			throw conversionError(
				malformedFile.folder,
				'its snapshot.json is malformed',
				`Restore ${malformedFile.path} from git, then run drizzle-kit up again.`,
				{ kind: 'malformed', snapshot: malformedFile.path },
			);
		}
		const snapshotTexts = (await upToV9(files)).map((it) => JSON.stringify(it, null, 2));

		// The files are checked in the form that is written to disk.
		const written = snapshotTexts.map((it) => JSON.parse(it) as PostgresSnapshot);
		const byId = new Map(written.map((it) => [it.id, it]));
		for (const [idx, { path, folder, snapshot }] of files.entries()) {
			if (snapshot.version === '9') continue;
			const { errors } = snapshotValidator.parse(written[idx]);
			if (errors) {
				throw conversionError(folder, `the new snapshot is not valid (${errors.join('; ')})`, reportIssueHint, {
					kind: 'invalid_snapshot',
					snapshot: path,
				});
			}
			const expected = normalizeDDL(fromEntities(snapshot.ddl).entities.list());
			const rebuilt = normalizeDDL(reconstruct(byId, snapshot.id).entities.list());
			const expectedSet = new Set(expected);
			const rebuiltSet = new Set(rebuilt);
			const differing = expected.find((it) => !rebuiltSet.has(it)) ?? rebuilt.find((it) => !expectedSet.has(it));
			if (differing) {
				const entity = entityName(differing);
				throw conversionError(
					folder,
					`its rebuilt state differs from the format 8 state at ${entity}`,
					reportIssueHint,
					{
						kind: 'state_mismatch',
						snapshot: path,
						entity,
					},
				);
			}
		}

		for (const [idx, { path, snapshot }] of files.entries()) {
			if (snapshot.version === '9') continue;
			writeFileSync(path, snapshotTexts[idx]);
			if (outputFormat() === 'text') console.log(`[${chalk.green('✓')}] ${path}`);
		}
	}

	if (outputFormat() === 'text') console.log("Everything's fine 🐶🔥");

	return report.nonLatest;
};
