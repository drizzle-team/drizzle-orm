import { toCamelCase } from 'drizzle-orm/casing';
import { plural, singular } from 'pluralize';
import { paramNameFor } from '../../dialects/postgres/typescript';
import { assertUnreachable } from '../../utils';
import type { Casing } from '../validations/common';

const withCasing = (value: string, casing: Casing) => {
	if (casing === 'preserve') {
		return value;
	}
	if (casing === 'camel') {
		return toCamelCase(value);
	}

	assertUnreachable(casing);
};

export type SchemaForPull = {
	schema?: string;
	foreignKeys: {
		schema?: string;
		table: string;
		nameExplicit: boolean;
		columns: string[];
		schemaTo?: string;
		tableTo: string;
		columnsTo: string[];
		onUpdate?: 'NO ACTION' | 'RESTRICT' | 'SET NULL' | 'CASCADE' | 'SET DEFAULT' | string | null;
		onDelete?: 'NO ACTION' | 'RESTRICT' | 'SET NULL' | 'CASCADE' | 'SET DEFAULT' | string | null;
		name: string;
		entityType: 'fks';
	}[];
	columns?: { name: string }[];
	// both unique constraints and unique indexes
	uniques: {
		columns: string[];
	}[];
}[];

function prepareNameFor(name: string, tableColumns: string[]) {
	return tableColumns.includes(name) ? `${name}Relation` : name;
}

export const relationsToTypeScript = (
	schema: SchemaForPull,
	casing: Casing,
	schemaPath?: string, // for tests purposes
) => {
	const imports: string[] = [];
	const tableRelations: Record<
		string,
		{
			name: string;
			type: 'one' | 'many' | 'through' | 'many-through' | 'one-one';
			tableFrom: string;
			schemaFrom?: string;
			columnsFrom: string[];
			tableTo: string;
			schemaTo?: string;
			columnsTo: string[];
			relationName?: string;
			tableThrough?: string;
			columnsThroughFrom?: string[];
			columnsThroughTo?: string[];
		}[]
	> = {};

	// Process all foreign keys as before.
	schema.forEach((table) => {
		const fks = Object.values(table.foreignKeys);
		const tableColumns = table.columns?.map((it) => withCasing(it.name, casing)) ?? [];

		if (fks.length === 2) {
			const [fk1, fk2] = fks;
			// reference to different tables, means it can be through many-many
			const toTable1 = withCasing(paramNameFor(fk1.tableTo, fk1.schemaTo), casing);
			const columnsTo1 = fk1.columnsTo.map((it) => withCasing(it, casing));

			const toTable2 = withCasing(paramNameFor(fk2.tableTo, fk2.schemaTo), casing);
			const columnsTo2 = fk2.columnsTo.map((it) => withCasing(it, casing));

			const tableThrough = withCasing(paramNameFor(fk1.table, table.schema), casing);
			// const tableFrom2 = withCasing(paramNameFor(fk2.table, table.schema), casing);
			const columnsThroughFrom = fk1.columns.map((it) => withCasing(it, casing));
			const columnsThroughTo = fk2.columns.map((it) => withCasing(it, casing));

			if (
				toTable1 !== toTable2
			) {
				if (!tableRelations[toTable1]) {
					tableRelations[toTable1] = [];
				}

				tableRelations[toTable1].push({
					name: prepareNameFor(plural(toTable2), tableColumns),
					type: 'through',
					tableFrom: toTable1,
					columnsFrom: columnsTo1,
					tableTo: toTable2,
					columnsTo: columnsTo2,
					tableThrough,
					columnsThroughFrom,
					columnsThroughTo,
				});

				if (!tableRelations[toTable2]) {
					tableRelations[toTable2] = [];
				}

				tableRelations[toTable2].push({
					name: prepareNameFor(plural(toTable1), tableColumns),
					// this type is used for .many() side of relation, when another side has .through() with from and to fields
					type: 'many-through',
					tableFrom: toTable2,
					columnsFrom: fk2.columnsTo,
					tableTo: toTable1,
					columnsTo: columnsTo2,
					tableThrough,
					columnsThroughFrom,
					columnsThroughTo,
				});
			}
		} else {
			fks.forEach((fk) => {
				const tableNameFrom = paramNameFor(fk.table, table.schema);
				const tableNameTo = paramNameFor(fk.tableTo, fk.schemaTo);
				const tableFrom = withCasing(tableNameFrom.replace(/:+/g, ''), casing);
				const tableTo = withCasing(tableNameTo.replace(/:+/g, ''), casing);
				const columnsFrom = fk.columns.map((it) => withCasing(it, casing));
				const columnsTo = fk.columnsTo.map((it) => withCasing(it, casing));

				imports.push(tableTo, tableFrom);

				const keyFrom = tableFrom;
				if (!tableRelations[keyFrom]) {
					tableRelations[keyFrom] = [];
				}

				tableRelations[keyFrom].push({
					name: prepareNameFor(singular(tableTo), tableColumns),
					type: 'one',
					tableFrom,
					columnsFrom,
					tableTo,
					columnsTo,
				});

				const keyTo = tableTo;
				if (!tableRelations[keyTo]) {
					tableRelations[keyTo] = [];
				}

				// if this table has a unique on a column, that is used for 1-m, then we can assume that it's 1-1 relation
				// we will check that all of the fk columns are unique, so we can assume it's 1-1
				// not matter if it's 1 column, 2 columns or more
				if (
					table.uniques.find((constraint) =>
						constraint.columns.length === columnsFrom.length
						&& constraint.columns.every((col, i) => col === columnsFrom[i])
					)
				) {
					// the difference between one and one-one is that one-one won't contain from and to
					// maybe it can be done by introducing some sort of flag or just not providing columnsFrom and columnsTo
					// but I decided just to have a different type field here
					tableRelations[keyTo].push({
						name: prepareNameFor(plural(tableFrom), tableColumns),
						type: 'one-one',
						tableFrom: tableTo,
						columnsFrom: columnsTo,
						tableTo: tableFrom,
						columnsTo: columnsFrom,
					});
				} else {
					tableRelations[keyTo].push({
						name: prepareNameFor(plural(tableFrom), tableColumns),
						type: 'many',
						tableFrom: tableTo,
						columnsFrom: columnsTo,
						tableTo: tableFrom,
						columnsTo: columnsFrom,
					});
				}
			});
		}
	});

	const importsTs = `import { defineRelations } from "drizzle-orm";\nimport * as schema from "${
		schemaPath ?? './schema'
	}";\n\n`;

	let relationString = `export const relations = defineRelations(schema, (r) => ({`;

	Object.entries(tableRelations).forEach(([table, relations]) => {
		// Adjust duplicate names if needed.
		const preparedRelations = relations.map(
			(relation, relationIndex, originArray) => {
				let name = relation.name;
				let relationName;
				const hasMultipleRelations = originArray.some(
					(it, originIndex) => relationIndex !== originIndex && it.tableTo === relation.tableTo,
				);
				if (hasMultipleRelations) {
					// if one relation - we need to name a relation from this table to "many" table
					if (relation.type === 'one') {
						relationName = `${relation.tableFrom}_${relation.columnsFrom.join('_')}_${relation.tableTo}_${
							relation.columnsTo.join('_')
						}`;
						// if many relation - name in in different order, so alias names will match
					} else if (relation.type === 'many' || relation.type === 'one-one') {
						relationName = `${relation.tableTo}_${relation.columnsTo.join('_')}_${relation.tableFrom}_${
							relation.columnsFrom.join('_')
						}`;
						// if through relation - we need to name a relation from this table to "many" table and include "via"
					} else if (relation.type === 'through') {
						relationName = `${relation.tableFrom}_${relation.columnsFrom.join('_')}_${relation.tableTo}_${
							relation.columnsTo.join('_')
						}_via_${relation.tableThrough}`;
						// else is for many-through, meaning we need to reverse the order for tables and columns, but leave "via" the same
					} else {
						relationName = `${relation.tableTo}_${relation.columnsTo.join('_')}_${relation.tableFrom}_${
							relation.columnsFrom.join('_')
						}_via_${relation.tableThrough}`;
					}
				}
				const hasDuplicatedRelation = originArray.some(
					(it, originIndex) => relationIndex !== originIndex && it.name === relation.name,
				);
				if (hasDuplicatedRelation) {
					name = `${relation.name}_${
						relation.type === 'through'
							? `via_${relation.tableThrough}`
							: relation.type === 'many-through'
							? `via_${relation.tableThrough}`
							: relation.type === 'one'
							? relation.columnsFrom.join('_')
							: relation.columnsTo.join('_')
					}`;
				}
				return {
					...relation,
					name: withCasing(name, casing),
					relationName,
				};
			},
		);

		relationString += `\n\t${table}: {`;
		preparedRelations.forEach((relation) => {
			if (relation.type === 'one') {
				const from = relation.columnsFrom.length === 1
					? `r.${relation.tableFrom}.${relation.columnsFrom[0]}`
					: `[${
						relation.columnsFrom
							.map((it) => `r.${relation.tableFrom}.${it}`)
							.join(', ')
					}]`;
				const to = relation.columnsTo.length === 1
					? `r.${relation.tableTo}.${relation.columnsTo[0]}`
					: `[${
						relation.columnsTo
							.map((it) => `r.${relation.tableTo}.${it}`)
							.join(', ')
					}]`;

				relationString += `\n\t\t${relation.name}: r.one.${relation.tableTo}({\n\t\t\tfrom: ${from},\n\t\t\tto: ${to}`
					+ (relation.relationName ? `,\n\t\t\talias: "${relation.relationName}"` : '')
					+ `\n\t\t}),`;
			} else if (relation.type === 'many' || relation.type === 'many-through') {
				relationString += `\n\t\t${relation.name}: r.many.${relation.tableTo}(`
					+ (relation.relationName ? `{\n\t\t\talias: "${relation.relationName}"\n\t\t}` : '')
					+ `),`;
			} else if (relation.type === 'one-one') {
				relationString += `\n\t\t${relation.name}: r.one.${relation.tableTo}(`
					+ (relation.relationName ? `{\n\t\t\talias: "${relation.relationName}"\n\t\t}` : '')
					+ `),`;
			} else {
				const from = relation.columnsThroughFrom!.length === 1
					? `r.${relation.tableFrom}.${relation.columnsFrom[0]}.through(r.${relation.tableThrough}.${
						relation.columnsThroughFrom![0]
					})`
					: `[${
						relation.columnsThroughFrom!
							.map((it) => `r.${relation.tableFrom}.${it}.through(${relation.tableThrough}.${it})`)
							.join(', ')
					}]`;
				const to = relation.columnsThroughTo!.length === 1
					? `r.${relation.tableTo}.${relation.columnsTo![0]}.through(r.${relation.tableThrough}.${
						relation.columnsThroughTo![0]
					})`
					: `[${
						relation.columnsThroughTo!
							.map((it) => `r.${relation.tableTo}.${it}.through(${relation.tableThrough}.${it})`)
							.join(', ')
					}]`;

				relationString += `\n\t\t${relation.name}: r.many.${relation.tableTo}({\n\t\t\tfrom: ${from},\n\t\t\tto: ${to}`
					+ (relation.relationName ? `,\n\t\t\talias: "${relation.relationName}"` : '')
					+ `\n\t\t}),`;
			}
		});
		relationString += `\n\t},`;
	});

	relationString += `\n}))`;

	return {
		file: importsTs + relationString,
	};
};
