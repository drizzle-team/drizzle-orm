import { assertUnreachable } from 'src/utils';
import { createDDL, createDDLV2, createDDLV3 } from './ddl';
import type { MssqlSnapshot, MssqlSnapshotV1, MssqlSnapshotV2, MssqlSnapshotV3 } from './snapshot';

export const upToV2 = (it: Record<string, any>): { snapshot: MssqlSnapshotV2; hints: string[] } => {
	const snapshot = it as MssqlSnapshotV1;
	const ddlV1 = snapshot.ddl;

	const hints = [] as string[];

	const ddl = createDDLV2();
	for (const entry of ddlV1) {
		if (entry.entityType === 'checks') ddl.checks.push(entry);
		else if (entry.entityType === 'columns') ddl.columns.push(entry);
		else if (entry.entityType === 'defaults') ddl.defaults.push(entry);
		else if (entry.entityType === 'fks') ddl.fks.push(entry);
		else if (entry.entityType === 'pks') ddl.pks.push(entry);
		else if (entry.entityType === 'schemas') ddl.schemas.push(entry);
		else if (entry.entityType === 'tables') ddl.tables.push(entry);
		else if (entry.entityType === 'uniques') ddl.uniques.push(entry);
		else if (entry.entityType === 'views') ddl.views.push(entry);
		else if (entry.entityType === 'indexes') {
			const newColumns = entry.columns.map((it) => ({ isExpression: false, value: it }));
			const newIndex = { ...entry, columns: newColumns };
			ddl.indexes.push(newIndex);
		} else {
			assertUnreachable(entry);
		}
	}

	return {
		snapshot: {
			id: snapshot.id,
			prevIds: snapshot.prevIds,
			version: '2',
			dialect: 'mssql',
			ddl: ddl.entities.list(),
			renames: snapshot.renames,
		},
		hints,
	};
};

const updateUpToV3 = (snapshot: MssqlSnapshotV2): MssqlSnapshotV3 => {
	const ddlV2 = snapshot.ddl;
	const ddl = createDDLV3();
	for (const entry of ddlV2) {
		if (entry.entityType === 'indexes') {
			ddl.indexes.push({
				...entry,
				columns: entry.columns.map((it) => ({ ...it, asc: true })),
				include: [],
				with: null,
			});
		} else {
			ddl.entities.push(entry);
		}
	}

	return {
		id: snapshot.id,
		prevIds: snapshot.prevIds,
		version: '3',
		dialect: 'mssql',
		ddl: ddl.entities.list(),
		renames: snapshot.renames,
	};
};

export const upToV3 = (it: Record<string, any>): { snapshot: MssqlSnapshotV3; hints: string[] } => {
	const updated = it.version === '1' ? upToV2(it) : { snapshot: it as MssqlSnapshotV2, hints: [] };
	return {
		snapshot: updateUpToV3(updated.snapshot),
		hints: updated.hints,
	};
};

const updateUpToV4 = (snapshot: MssqlSnapshotV3): MssqlSnapshot => {
	const ddlV3 = snapshot.ddl;
	const ddl = createDDL();
	for (const entry of ddlV3) {
		if (entry.entityType === 'indexes') {
			ddl.indexes.push({
				...entry,
				kind: 'btree',
				fulltext: null,
			});
		} else {
			ddl.entities.push(entry);
		}
	}

	return {
		id: snapshot.id,
		prevIds: snapshot.prevIds,
		version: '4',
		dialect: 'mssql',
		ddl: ddl.entities.list(),
		renames: snapshot.renames,
	};
};

export const upToV4 = (it: Record<string, any>): { snapshot: MssqlSnapshot; hints: string[] } => {
	if (it.version === '4') {
		return { snapshot: it as MssqlSnapshot, hints: [] };
	}

	const updated = it.version === '1' ? upToV2(it) : { snapshot: it as MssqlSnapshotV2 | MssqlSnapshotV3, hints: [] };
	const snapshot = updated.snapshot.version === '3'
		? updated.snapshot
		: updateUpToV3(updated.snapshot);

	return {
		snapshot: updateUpToV4(snapshot),
		hints: updated.hints,
	};
};

export const extractBaseTypeAndDimensions = (it: string): [string, number] => {
	const dimensionRegex = /\[[^\]]*\]/g; // matches any [something], including []
	const count = (it.match(dimensionRegex) || []).length;
	const baseType = it.replace(dimensionRegex, '');
	return [baseType, count];
};
