import { assertUnreachable } from 'src/utils';
import { createDDL } from './ddl';
import type { MssqlSnapshot, MssqlSnapshotV1 } from './snapshot';

export const upToV2 = (it: Record<string, any>): { snapshot: MssqlSnapshot; hints: string[] } => {
	const snapshot = it as MssqlSnapshotV1;
	const ddlV1 = snapshot.ddl;

	const hints = [] as string[];

	const ddl = createDDL();
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

export const extractBaseTypeAndDimensions = (it: string): [string, number] => {
	const dimensionRegex = /\[[^\]]*\]/g; // matches any [something], including []
	const count = (it.match(dimensionRegex) || []).length;
	const baseType = it.replace(dimensionRegex, '');
	return [baseType, count];
};
