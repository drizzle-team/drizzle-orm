import { plural, singular } from 'pluralize';
import { MysqlEntities } from 'src/dialects/mysql/ddl';
import { PostgresEntities } from 'src/dialects/postgres/ddl';
import { SqliteEntities } from 'src/dialects/sqlite/ddl';
import { paramNameFor } from '../../dialects/postgres/typescript';
import { assertUnreachable } from '../../global';
import type { Casing } from '../validations/common';

const withCasing = (value: string, casing: Casing) => {
	if (casing === 'preserve') {
		return value;
	}
	if (casing === 'camel') {
		return value.camelCase();
	}

	assertUnreachable(casing);
};

export const relationsToTypeScript = (
	fks: (PostgresEntities['fks'] | SqliteEntities['fks'] | MysqlEntities['fks'])[],
	casing: Casing,
) => {
	const imports: string[] = [];
	const tableRelations: Record<
		string,
		{
			name: string;
			type: 'one' | 'many';
			tableFrom: string;
			schemaFrom?: string;
			columnFrom: string;
			tableTo: string;
			schemaTo?: string;
			columnTo: string;
			relationName?: string;
		}[]
	> = {};
	for (const fk of fks) {
		const tableNameFrom = paramNameFor(fk.table, 'schema' in fk ? fk.schema : null);
		const tableNameTo = paramNameFor(fk.tableTo, 'schemaTo' in fk ? fk.schemaTo : null);
		const tableFrom = withCasing(tableNameFrom, casing);
		const tableTo = withCasing(tableNameTo, casing);
		// TODO: [0]?! =/
		const columnFrom = withCasing(fk.columns[0], casing);
		const columnTo = withCasing(fk.columnsTo[0], casing);

		imports.push(tableTo, tableFrom);

		// const keyFrom = `${schemaFrom}.${tableFrom}`;
		const keyFrom = tableFrom;

		if (!tableRelations[keyFrom]) {
			tableRelations[keyFrom] = [];
		}

		tableRelations[keyFrom].push({
			name: singular(tableTo),
			type: 'one',
			tableFrom,
			columnFrom,
			tableTo,
			columnTo,
		});

		// const keyTo = `${schemaTo}.${tableTo}`;
		const keyTo = tableTo;

		if (!tableRelations[keyTo]) {
			tableRelations[keyTo] = [];
		}

		tableRelations[keyTo].push({
			name: plural(tableFrom),
			type: 'many',
			tableFrom: tableTo,
			columnFrom: columnTo,
			tableTo: tableFrom,
			columnTo: columnFrom,
		});
	}

	const uniqueImports = [...new Set(imports)];

	const importsTs = `import { relations } from "drizzle-orm/relations";\nimport { ${
		uniqueImports.join(
			', ',
		)
	} } from "./schema";\n\n`;

	const relationStatements = Object.entries(tableRelations).map(
		([table, relations]) => {
			const hasOne = relations.some((it) => it.type === 'one');
			const hasMany = relations.some((it) => it.type === 'many');

			// * change relation names if they are duplicated or if there are multiple relations between two tables
			const preparedRelations = relations.map(
				(relation, relationIndex, originArray) => {
					let name = relation.name;
					let relationName;
					const hasMultipleRelations = originArray.some(
						(it, originIndex) => relationIndex !== originIndex && it.tableTo === relation.tableTo,
					);
					if (hasMultipleRelations) {
						relationName = relation.type === 'one'
							? `${relation.tableFrom}_${relation.columnFrom}_${relation.tableTo}_${relation.columnTo}`
							: `${relation.tableTo}_${relation.columnTo}_${relation.tableFrom}_${relation.columnFrom}`;
					}
					const hasDuplicatedRelation = originArray.some(
						(it, originIndex) => relationIndex !== originIndex && it.name === relation.name,
					);
					if (hasDuplicatedRelation) {
						name = `${relation.name}_${relation.type === 'one' ? relation.columnFrom : relation.columnTo}`;
					}
					return {
						...relation,
						name,
						relationName,
					};
				},
			);

			const fields = preparedRelations.map((relation) => {
				if (relation.type === 'one') {
					return `\t${relation.name}: one(${relation.tableTo}, {\n\t\tfields: [${relation.tableFrom}.${relation.columnFrom}],\n\t\treferences: [${relation.tableTo}.${relation.columnTo}]${
						relation.relationName
							? `,\n\t\trelationName: "${relation.relationName}"`
							: ''
					}\n\t}),`;
				} else {
					return `\t${relation.name}: many(${relation.tableTo}${
						relation.relationName
							? `, {\n\t\trelationName: "${relation.relationName}"\n\t}`
							: ''
					}),`;
				}
			});

			return `export const ${table}Relations = relations(${table}, ({${hasOne ? 'one' : ''}${
				hasOne && hasMany ? ', ' : ''
			}${hasMany ? 'many' : ''}}) => ({\n${fields.join('\n')}\n}));`;
		},
	);

	return {
		file: importsTs + relationStatements.join('\n\n'),
	};
};
