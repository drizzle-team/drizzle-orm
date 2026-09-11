import type { Column, RelationWithReferences } from './types/tables';

export const isRelationCyclic = (
	startRel: RelationWithReferences,
) => {
	// self relation
	if (startRel.table === startRel.refTable) return false;

	// DFS
	const targetTable = startRel.table;
	const queue = [startRel];
	let path: string[] = [];
	while (queue.length !== 0) {
		const currRel = queue.shift();

		if (path.includes(currRel!.table)) {
			const idx = path.indexOf(currRel!.table);
			path = path.slice(0, idx);
		}
		path.push(currRel!.table);

		for (const rel of currRel!.refTableRels) {
			// self relation
			if (rel.table === rel.refTable) continue;

			if (rel.refTable === targetTable) return true;

			// found cycle, but not the one we are looking for
			if (path.includes(rel.refTable)) continue;
			queue.unshift(rel);
		}
	}

	return false;
};

// the integer family postgres attaches a sequence to when a column is declared serial or as an identity
const postgresSequenceBackedColumnTypes = new Set([
	'smallint',
	'integer',
	'bigint',
	'smallserial',
	'serial',
	'bigserial',
]);

/**
 * Whether writing a value into this column may leave the table's sequence behind it. Only a column the database fills
 * on its own has a sequence to fall behind - serial, identity, or an explicit `nextval` default - and every one of
 * those reports a default.
 */
export const isSequenceBackedColumn = (column: Column) =>
	(column.typeParams.dimensions ?? 0) === 0
	&& postgresSequenceBackedColumnTypes.has(column.columnType)
	&& (column.hasDefault === true || column.generatedIdentityType !== undefined);

export const equalSets = (set1: Set<any>, set2: Set<any>) => {
	return set1.size === set2.size && [...set1].every((si) => set2.has(si));
};

export const intMax = (args: (number | bigint)[]) => args.reduce((m, e) => e > m ? e : m);
