import '../../@types/utils';
import { toCamelCase } from 'drizzle-orm/casing';
import type { Casing } from '../../cli/validations/common';
import { assertUnreachable, trimChar } from '../../utils';
import { inspect } from '../utils';
import type { CheckConstraint, CockroachDDL, Column, ForeignKey, Index, Policy, PrimaryKey, ViewColumn } from './ddl';
import { tableFromDDL } from './ddl';
import { defaults, typeFor } from './grammar';

// TODO: omit defaults opclass...
const imports = [
	'cockroachEnum',
	'int2',
	'int4',
	'int8',
	'bool',
	'varchar',
	'char',
	'decimal',
	'real',
	'json',
	'jsonb',
	'time',
	'timestamp',
	'date',
	'interval',
	'inet',
	'uuid',
	'vector',
	'bit',
	'geometry',
	'float',
	'string',
	'text',
	'varbit',
	'customType',
] as const;
export type Import = (typeof imports)[number];

const cockroachImportsList = new Set(['cockroachTable', ...imports]);

const objToStatement2 = (json: { [s: string]: unknown }) => {
	json = Object.fromEntries(Object.entries(json).filter((it) => it[1]));

	const keys = Object.keys(json);
	if (keys.length === 0) return;

	let statement = '{ ';
	statement += keys.map((it) => `${it}: "${json[it]}"`).join(', '); // no "" for keys
	statement += ' }';
	return statement;
};

// const intervalStrToObj = (str: string) => {
// 	if (str.startsWith('interval(')) {
// 		return {
// 			precision: Number(str.substring('interval('.length, str.length - 1)),
// 		};
// 	}
// 	const splitted = str.split(' ');
// 	if (splitted.length === 1) {
// 		return {};
// 	}
// 	const rest = splitted.slice(1, splitted.length).join(' ');
// 	if (possibleIntervals.includes(rest)) {
// 		return { fields: `"${rest}"` };
// 	}

// 	for (const s of possibleIntervals) {
// 		if (rest.startsWith(`${s}(`)) {
// 			return {
// 				fields: `"${s}"`,
// 				precision: Number(rest.substring(s.length + 1, rest.length - 1)),
// 			};
// 		}
// 	}
// 	return {};
// };

const relations = new Set<string>();

const escapeColumnKey = (value: string) => {
	if (/^(?![a-zA-Z_$][a-zA-Z0-9_$]*$).+$/.test(value)) {
		return `"${value}"`;
	}
	return value;
};

const withCasing = (value: string, casing: Casing) => {
	if (casing === 'preserve') {
		return escapeColumnKey(value);
	}
	if (casing === 'camel') {
		return escapeColumnKey(toCamelCase(value));
	}

	assertUnreachable(casing);
};

const dbColumnName = ({ name, casing, withMode = false }: { name: string; casing: Casing; withMode?: boolean }) => {
	if (casing === 'preserve') {
		return '';
	}
	if (casing === 'camel') {
		return toCamelCase(name) === name ? '' : withMode ? `"${name}", ` : `"${name}"`;
	}

	assertUnreachable(casing);
};

// export const relationsToTypeScriptForStudio = (
// 	schema: Record<string, Record<string, AnyCockroachTable<{}>>>,
// 	relations: Record<string, Relations<string, Relations<string, Record<string, Relation<string>>>>>,
// ) => {
// 	const relationalSchema: Record<string, unknown> = {
// 		...Object.fromEntries(
// 			Object.entries(schema)
// 				.map(([key, val]) => {
// 					// have unique keys across schemas
// 					const mappedTableEntries = Object.entries(val).map((tableEntry) => {
// 						return [`__${key}__.${tableEntry[0]}`, tableEntry[1]];
// 					});

// 					return mappedTableEntries;
// 				})
// 				.flat(),
// 		),
// 		...relations,
// 	};

// 	const relationsConfig = extractTablesRelationalConfig(relationalSchema, createTableRelationsHelpers);

// 	let result = '';

// 	function findColumnKey(table: AnyCockroachTable, columnName: string) {
// 		for (const tableEntry of Object.entries(table)) {
// 			const key = tableEntry[0];
// 			const value = tableEntry[1];

// 			if (value.name === columnName) {
// 				return key;
// 			}
// 		}
// 	}

// 	Object.values(relationsConfig.tables).forEach((table) => {
// 		const tableName = table.tsName.split('.')[1];
// 		const relations = table.relations;
// 		let hasRelations = false;
// 		let relationsObjAsStr = '';
// 		let hasOne = false;
// 		let hasMany = false;

// 		Object.values(relations).forEach((relation) => {
// 			hasRelations = true;

// 			if (is(relation, Many)) {
// 				hasMany = true;
// 				relationsObjAsStr += `\t\t${relation.fieldName}: many(${
// 					relationsConfig.tableNamesMap[relation.referencedTableName].split('.')[1]
// 				}${typeof relation.relationName !== 'undefined' ? `, { relationName: "${relation.relationName}"}` : ''}),`;
// 			}

// 			if (is(relation, One)) {
// 				hasOne = true;
// 				relationsObjAsStr += `\t\t${relation.fieldName}: one(${
// 					relationsConfig.tableNamesMap[relation.referencedTableName].split('.')[1]
// 				}, { fields: [${
// 					relation.config?.fields.map(
// 						(c) =>
// 							`${relationsConfig.tableNamesMap[getTableName(relation.sourceTable)].split('.')[1]}.${
// 								findColumnKey(relation.sourceTable, c.name)
// 							}`,
// 					)
// 				}], references: [${
// 					relation.config?.references.map(
// 						(c) =>
// 							`${relationsConfig.tableNamesMap[getTableName(relation.referencedTable)].split('.')[1]}.${
// 								findColumnKey(relation.referencedTable, c.name)
// 							}`,
// 					)
// 				}]${typeof relation.relationName !== 'undefined' ? `, relationName: "${relation.relationName}"` : ''}}),`;
// 			}
// 		});

// 		if (hasRelations) {
// 			result += `export const ${tableName}Relation = relations(${tableName}, ({${hasOne ? 'one' : ''}${
// 				hasOne && hasMany ? ', ' : ''
// 			}${hasMany ? 'many' : ''}}) => ({
//         ${relationsObjAsStr}
//       }));\n`;
// 		}
// 	});

// 	return result;
// };

function generateIdentityParams(column: Column) {
	if (column.identity === null) return '';
	const identity = column.identity;

	const tuples = [];

	if (identity.startWith && defaults.identity.startWith !== identity.startWith) {
		tuples.push(['startWith', identity.startWith]);
	}
	if (identity.increment && defaults.identity.increment !== identity.increment) {
		tuples.push(['increment', identity.increment]);
	}
	if (identity.minValue && defaults.identity.min !== identity.minValue) tuples.push(['minValue', identity.minValue]);
	if (identity.maxValue && defaults.identity.maxFor(column.type) !== identity.maxValue) {
		tuples.push(['maxValue', identity.maxValue]);
	}
	if (identity.cache && defaults.identity.cache !== identity.cache) tuples.push(['cache', identity.cache]);

	const params = tuples.length > 0 ? `{ ${tuples.map((x) => `${x[0]}: ${x[1]}`).join(' ,')} }` : '';

	if (identity?.type === 'always') {
		return `.generatedAlwaysAsIdentity(${params})`;
	}
	return `.generatedByDefaultAsIdentity(${params})`;
}

export const paramNameFor = (name: string, schema: string | null) => {
	const schemaSuffix = schema && schema !== 'public' ? `In${schema.capitalise()}` : '';
	return `${name}${schemaSuffix}`;
};

export const ddlToTypeScript = (ddl: CockroachDDL, columnsForViews: ViewColumn[], casing: Casing) => {
	const tableFn = `cockroachTable`;
	for (const fk of ddl.fks.list()) {
		relations.add(`${fk.table}-${fk.tableTo}`);
	}

	const schemas = Object.fromEntries(
		ddl.schemas
			.list()
			.filter((it) => it.name !== 'public')
			.map((it) => {
				return [it.name, withCasing(it.name, casing)];
			}),
	);

	const enumTypes = new Set(ddl.enums.list().map((x) => `${x.schema}.${x.name}`));

	const imports = new Set<string>();
	const vcs = columnsForViews.map((it) => ({ entityType: 'viewColumns' as const, ...it }));
	const entities = [...ddl.entities.list(), ...vcs];
	for (const x of entities) {
		if (x.entityType === 'schemas' && x.name !== 'public') imports.add('cockroachSchema');
		if (x.entityType === 'enums' && x.schema === 'public') imports.add('cockroachEnum');
		if (x.entityType === 'tables') imports.add(tableFn);

		if (x.entityType === 'indexes') {
			if (x.isUnique) imports.add('uniqueIndex');
			else imports.add('index');
		}

		if (x.entityType === 'fks') {
			imports.add('foreignKey');

			if (isCyclic(x) && !isSelf(x)) imports.add('type AnyCockroachColumn');
		}
		if (x.entityType === 'pks') imports.add('primaryKey');
		if (x.entityType === 'checks') imports.add('check');
		if (x.entityType === 'views' && x.schema === 'public') {
			if (x.materialized) imports.add('cockroachMaterializedView');
			else imports.add('cockroachView');
		}

		if (x.entityType === 'columns' || x.entityType === 'viewColumns') {
			let patched = x.type.replace('[]', '');
			const isEnum = Boolean(x.typeSchema);
			const grammarType = typeFor(x.type, isEnum);
			if (grammarType) imports.add(grammarType.drizzleImport());
			if (cockroachImportsList.has(patched)) imports.add(patched);
		}

		if (x.entityType === 'sequences' && x.schema === 'public') imports.add('cockroachSequence');
		if (x.entityType === 'enums' && x.schema === 'public') imports.add('cockroachEnum');
		if (x.entityType === 'policies') imports.add('cockroachPolicy');
		if (x.entityType === 'roles') imports.add('cockroachRole');
	}

	const enumStatements = ddl.enums
		.list()
		.map((it) => {
			const enumSchema = schemas[it.schema];
			// const func = schema || schema === "public" ? "cockroachTable" : schema;
			const paramName = paramNameFor(it.name, enumSchema);

			const func = enumSchema ? `${enumSchema}.enum` : 'cockroachEnum';

			const values = Object.values(it.values)
				.map((it) => {
					return `\`${it.replaceAll('\\', '\\\\').replace('`', '\\`')}\``;
				})
				.join(', ');
			return `export const ${withCasing(paramName, casing)} = ${func}("${it.name}", [${values}])\n`;
		})
		.join('')
		.concat('\n');

	const sequencesStatements = ddl.sequences
		.list()
		.map((it) => {
			const seqSchema = schemas[it.schema];
			const paramName = paramNameFor(it.name, seqSchema);

			const func = seqSchema ? `${seqSchema}.sequence` : 'cockroachSequence';

			let params = '';
			if (it.startWith) params += `, startWith: "${it.startWith}"`;
			if (it.incrementBy) params += `, increment: "${it.incrementBy}"`;
			if (it.minValue) params += `, minValue: "${it.minValue}"`;
			if (it.maxValue) params += `, maxValue: "${it.maxValue}"`;
			if (it.cacheSize) params += `, cache: "${it.cacheSize}"`;
			else params += `, cycle: false`;

			params = params ? `, { ${trimChar(params, ',')} }` : '';

			return `export const ${withCasing(paramName, casing)} = ${func}("${it.name}"${params})\n`;
		})
		.join('')
		.concat('');

	const schemaStatements = Object.entries(schemas)
		.map((it) => {
			return `export const ${it[1]} = cockroachSchema("${it[0]}");\n`;
		})
		.join('');

	const rolesNameToTsKey: Record<string, string> = {};
	const rolesStatements = ddl.roles.list().map((it) => {
		const identifier = withCasing(it.name, casing);
		rolesNameToTsKey[it.name] = identifier;
		const params = {
			...(it.createDb ? { createDb: true } : {}),
			...(it.createRole ? { createRole: true } : {}),
		};
		const paramsString = inspect(params);
		const comma = paramsString ? ', ' : '';

		return `export const ${identifier} = cockroachRole("${it.name}"${comma}${paramsString});\n`;
	})
		.join('');

	const tableStatements = ddl.tables.list().map((it) => {
		const tableSchema = schemas[it.schema];
		const paramName = paramNameFor(it.name, tableSchema);
		const table = tableFromDDL(it, ddl);
		const columns = ddl.columns.list({ schema: table.schema, table: table.name });
		const fks = ddl.fks.list({ schema: table.schema, table: table.name });

		let func = tableSchema ? `${tableSchema}.table` : tableFn;
		func += table.isRlsEnabled ? '.withRLS' : '';
		let statement = `export const ${withCasing(paramName, casing)} = ${func}("${table.name}", {\n`;
		statement += createTableColumns(columns, table.pk, fks, enumTypes, schemas, casing);
		statement += '}';

		// copied from pg
		const filteredFKs = table.fks.filter((it) => {
			return it.columns.length > 1 || isSelf(it);
		});

		const hasCallback = table.indexes.length > 0 || filteredFKs.length > 0 || table.policies.length > 0
			|| (table.pk && table.pk.columns.length > 1) || table.checks.length > 0;

		if (hasCallback) {
			statement += ', ';
			statement += '(table) => [\n';
			// TODO: or pk has non-default name
			statement += table.pk && table.pk.columns.length > 1 ? createTablePK(table.pk, casing) : '';
			statement += createTableFKs(filteredFKs, schemas, casing);
			statement += createTableIndexes(table.name, table.indexes, casing);
			statement += createTablePolicies(table.policies, casing, rolesNameToTsKey);
			statement += createTableChecks(table.checks, casing);
			statement += ']';
		}
		statement += ');';
		return statement;
	});

	const viewsStatements = Object.values(ddl.views.list())
		.map((it) => {
			const viewSchema = schemas[it.schema];
			const paramName = paramNameFor(it.name, viewSchema);

			// TODO: casing?
			const func = it.schema !== 'public'
				? (it.materialized ? `${viewSchema}.materializedView` : `${viewSchema}.view`)
				: it.materialized
				? 'cockroachMaterializedView'
				: 'cockroachView';

			const as = `sql\`${it.definition}\``;

			const viewColumns = columnsForViews.filter((x) => x.schema === it.schema && x.view === it.name);

			const columns = createViewColumns(viewColumns, enumTypes, casing);

			let statement = `export const ${withCasing(paramName, casing)} = ${func}("${it.name}", {${columns}})`;
			statement += `.as(${as});`;

			return statement;
		})
		.join('\n\n');

	const uniqueCockroachImports = [...imports];

	const importsTs = `import { ${uniqueCockroachImports.join(', ')} } from "drizzle-orm/cockroach-core"
import { sql } from "drizzle-orm"\n\n`;

	let decalrations = schemaStatements;
	decalrations += rolesStatements;
	decalrations += enumStatements;
	decalrations += sequencesStatements;
	decalrations += '\n';
	decalrations += tableStatements.join('\n\n');
	decalrations += '\n';
	decalrations += viewsStatements;

	const file = importsTs + decalrations;

	// for drizzle studio query runner
	const schemaEntry = `
    {
      ${
		Object.values(ddl.tables)
			.map((it) => withCasing(it.name, casing))
			.join(',\n')
	}
    }
  `;

	return { file, imports: importsTs, decalrations, schemaEntry };
};

const isCyclic = (fk: ForeignKey) => {
	const key = `${fk.table}-${fk.tableTo}`;
	const reverse = `${fk.tableTo}-${fk.table}`;
	return relations.has(key) && relations.has(reverse);
};

const isSelf = (fk: ForeignKey) => {
	return fk.table === fk.tableTo;
};

const column = (
	type: string,
	dimensions: number,
	name: string,
	typeSchema: string | null,
	casing: Casing,
	def: Column['default'],
) => {
	const isEnum = Boolean(typeSchema);
	const grammarType = typeFor(type, isEnum);

	const { options, default: defaultValue, customType } = dimensions > 0
		? grammarType.toArrayTs(type, def ?? null)
		: grammarType.toTs(type, def ?? null);

	const dbName = dbColumnName({ name, casing });
	const opts = inspect(options);
	const comma = (dbName && opts) ? ', ' : '';

	let columnStatement = `${withCasing(name, casing)}: ${
		isEnum ? withCasing(paramNameFor(type, typeSchema), casing) : grammarType.drizzleImport()
	}${customType ? `({ dataType: () => '${customType}' })` : ''}(${dbName}${comma}${opts})`;
	columnStatement += '.array()'.repeat(dimensions);

	if (defaultValue) columnStatement += `.default(${defaultValue})`;
	return columnStatement;
};

const createViewColumns = (columns: ViewColumn[], enumTypes: Set<string>, casing: Casing) => {
	let statement = '';

	columns.forEach((it) => {
		const columnStatement = column(it.type, it.dimensions, it.name, it.typeSchema, casing, null);
		statement += '\t';
		statement += columnStatement;
		// Provide just this in column function
		statement += '.array()'.repeat(it.dimensions);
		statement += it.notNull ? '.notNull()' : '';
		statement += ',\n';
	});
	return statement;
};

const createTableColumns = (
	columns: Column[],
	primaryKey: PrimaryKey | null,
	fks: ForeignKey[],
	enumTypes: Set<string>,
	schemas: Record<string, string>,
	casing: Casing,
): string => {
	let statement = '';

	// no self refs and no cyclic
	const oneColumnsFKs = Object.values(fks)
		.filter((it) => {
			return !isSelf(it);
		})
		.filter((it) => it.columns.length === 1);

	const fkByColumnName = oneColumnsFKs.reduce(
		(res, it) => {
			const arr = res[it.columns[0]] || [];
			arr.push(it);
			res[it.columns[0]] = arr;
			return res;
		},
		{} as Record<string, ForeignKey[]>,
	);

	for (const it of columns) {
		const { name, type, dimensions, default: def, identity, generated, typeSchema } = it;
		const stripped = type.replaceAll('[]', '');
		const isEnum = Boolean(typeSchema);
		const grammarType = typeFor(stripped, isEnum);

		const { options, default: defaultValue, customType } = dimensions > 0
			? grammarType.toArrayTs(type, def ?? null)
			: grammarType.toTs(type, def ?? null);

		const dbName = dbColumnName({ name, casing });
		const opts = inspect(options);
		const comma = (dbName && opts) ? ', ' : '';

		const pk = primaryKey && primaryKey.columns.length === 1 && primaryKey.columns[0] === it.name
			? primaryKey
			: null;

		let columnStatement = `${withCasing(name, casing)}: ${
			isEnum ? withCasing(paramNameFor(type, typeSchema), casing) : grammarType.drizzleImport()
		}${customType ? `({ dataType: () => '${customType}' })` : ''}(${dbName}${comma}${opts})`;
		columnStatement += '.array()'.repeat(dimensions);
		if (defaultValue) columnStatement += defaultValue.startsWith('.') ? defaultValue : `.default(${defaultValue})`;
		if (pk) columnStatement += '.primaryKey()';
		if (it.notNull && !it.identity && !pk) columnStatement += '.notNull()';
		if (identity) columnStatement += generateIdentityParams(it);
		if (generated) columnStatement += `.generatedAlwaysAs(sql\`${generated.as}\`)`;

		statement += '\t';
		statement += columnStatement;
		// Provide just this in column function

		const fks = fkByColumnName[it.name];
		// Andrii: I switched it off until we will get a custom naem setting in references
		if (fks) {
			const fksStatement = fks
				.map((it) => {
					const onDelete = it.onDelete && it.onDelete !== 'NO ACTION' ? it.onDelete.toLowerCase() : null;
					const onUpdate = it.onUpdate && it.onUpdate !== 'NO ACTION' ? it.onUpdate.toLowerCase() : null;
					const params = { onDelete, onUpdate };

					const typeSuffix = isCyclic(it) ? ': AnyCockroachColumn' : '';

					const paramsStr = objToStatement2(params);
					const tableSchema = schemas[it.schemaTo || ''];
					const paramName = paramNameFor(it.tableTo, tableSchema);
					if (paramsStr) {
						return `.references(()${typeSuffix} => ${
							withCasing(
								paramName,
								casing,
							)
						}.${withCasing(it.columnsTo[0], casing)}, ${paramsStr} )`;
					}
					return `.references(()${typeSuffix} => ${
						withCasing(
							paramName,
							casing,
						)
					}.${withCasing(it.columnsTo[0], casing)})`;
				})
				.join('');
			statement += fksStatement;
		}

		statement += ',\n';
	}

	return statement;
};

const createTableIndexes = (tableName: string, idxs: Index[], casing: Casing): string => {
	let statement = '';

	idxs.forEach((it) => {
		// TODO: cc: @AndriiSherman we have issue when index is called as table called
		// let idxKey = it.name.startsWith(tableName) && it.name !== tableName ? it.name.slice(tableName.length + 1) : it.name;
		// idxKey = idxKey.endsWith('_index') ? idxKey.slice(0, -'_index'.length) + '_idx' : idxKey;
		// idxKey = withCasing(idxKey, casing);
		// const indexGeneratedName = indexName(
		// 	tableName,
		// 	it.columns.map((it) => it.value),
		// );

		const name = it.nameExplicit ? it.name : '';
		// const escapedIndexName = indexGeneratedName === it.name ? '' : `"${it.name}"`;

		statement += it.isUnique ? '\tuniqueIndex(' : '\tindex(';
		statement += name ? `"${name}")` : ')';

		statement += `.using("${it.method}", ${
			it.columns
				.map((it) => {
					if (it.isExpression) {
						return `sql\`${it.value}\``;
					} else {
						return `table.${withCasing(it.value, casing)}${it.asc ? '.asc()' : '.desc()'}`;
					}
				})
				.join(', ')
		})`;
		statement += it.where ? `.where(sql\`${it.where}\`)` : '';

		statement += `,\n`;
	});

	return statement;
};

const createTablePK = (it: PrimaryKey, casing: Casing): string => {
	let statement = '\tprimaryKey({ columns: [';
	statement += `${
		it.columns
			.map((c) => {
				return `table.${withCasing(c, casing)}`;
			})
			.join(', ')
	}`;
	statement += `]${it.nameExplicit ? `, name: "${it.name}"` : ''}}),\n`;
	return statement;
};

// get a map of db role name to ts key
// if to by key is in this map - no quotes, otherwise - quotes

const createTablePolicies = (
	policies: Policy[],
	casing: Casing,
	rolesNameToTsKey: Record<string, string> = {},
): string => {
	let statement = '';

	policies.forEach((it) => {
		const mappedItTo = it.roles.map((v) => {
			return rolesNameToTsKey[v] ? withCasing(rolesNameToTsKey[v], casing) : `"${v}"`;
		});

		const tuples = [];
		if (it.as === 'RESTRICTIVE') tuples.push(['as', `"${it.as.toLowerCase}"`]);
		if (it.for !== 'ALL') tuples.push(['for', `"${it.for.toLowerCase()}"`]);
		if (!(mappedItTo.length === 1 && mappedItTo[0] === '"public"')) {
			tuples.push(['to', `[${mappedItTo.map((x) => `${x}`).join(', ')}]`]);
		}
		if (it.using !== null) tuples.push(['using', `sql\`${it.using}\``]);
		if (it.withCheck !== null) tuples.push(['withCheck', `sql\`${it.withCheck}\``]);
		const opts = tuples.length > 0 ? `, { ${tuples.map((x) => `${x[0]}: ${x[1]}`).join(', ')} }` : '';
		statement += `\tcockroachPolicy("${it.name}"${opts}),\n`;
	});

	return statement;
};

const createTableChecks = (checkConstraints: CheckConstraint[], _casing: Casing) => {
	let statement = '';

	checkConstraints.forEach((it) => {
		statement += 'check(';
		statement += `"${it.name}", `;
		statement += `sql\`${it.value}\`)`;
		statement += `,`;
	});

	return statement;
};

const createTableFKs = (fks: ForeignKey[], schemas: Record<string, string>, casing: Casing): string => {
	let statement = '';

	fks.forEach((it) => {
		const tableSchema = it.schemaTo === 'public' ? '' : schemas[it.schemaTo];
		const paramName = paramNameFor(it.tableTo, tableSchema);

		const isSelf = it.tableTo === it.table;
		const tableTo = isSelf ? 'table' : `${withCasing(paramName, casing)}`;
		statement += `\tforeignKey({\n`;
		statement += `\t\tcolumns: [${it.columns.map((i) => `table.${withCasing(i, casing)}`).join(', ')}],\n`;
		statement += `\t\tforeignColumns: [${
			it.columnsTo.map((i) => `${tableTo}.${withCasing(i, casing)}`).join(', ')
		}],\n`;
		statement += it.nameExplicit ? `\t\tname: "${it.name}"\n` : '';
		statement += `\t})`;

		statement += it.onUpdate && it.onUpdate !== 'NO ACTION' ? `.onUpdate("${it.onUpdate.toLowerCase()}")` : '';
		statement += it.onDelete && it.onDelete !== 'NO ACTION' ? `.onDelete("${it.onDelete.toLowerCase()}")` : '';
		statement += `,\n`;
	});
	return statement;
};
