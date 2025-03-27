import { getTableName, is } from 'drizzle-orm';
import { AnyPgTable } from 'drizzle-orm/pg-core';
import {
	createTableRelationsHelpers,
	extractTablesRelationalConfig,
	Many,
	One,
	Relation,
	Relations,
} from 'drizzle-orm/relations';
import './@types/utils';
import { toCamelCase } from 'drizzle-orm/casing';
import { Casing } from './cli/validations/common';
import { assertUnreachable } from './global';
import {
	CheckConstraint,
	Column,
	ForeignKey,
	Index,
	PgKitInternals,
	PgSchemaInternal,
	Policy,
	PrimaryKey,
	UniqueConstraint,
} from './serializer/pgSchema';
import { indexName } from './serializer/pgSerializer';
import { unescapeSingleQuotes } from './utils';

const pgImportsList = new Set([
	'pgTable',
	'pgEnum',
	'smallint',
	'integer',
	'bigint',
	'boolean',
	'text',
	'varchar',
	'char',
	'serial',
	'smallserial',
	'bigserial',
	'decimal',
	'numeric',
	'real',
	'json',
	'jsonb',
	'time',
	'timestamp',
	'date',
	'interval',
	'cidr',
	'inet',
	'macaddr',
	'macaddr8',
	'bigint',
	'doublePrecision',
	'uuid',
	'vector',
	'point',
	'line',
	'geometry',
]);

const objToStatement2 = (json: { [s: string]: unknown }) => {
	json = Object.fromEntries(Object.entries(json).filter((it) => it[1]));

	const keys = Object.keys(json);
	if (keys.length === 0) return;

	let statement = '{ ';
	statement += keys.map((it) => `${it}: "${json[it]}"`).join(', '); // no "" for keys
	statement += ' }';
	return statement;
};

const timeConfig = (json: { [s: string]: unknown }) => {
	json = Object.fromEntries(Object.entries(json).filter((it) => it[1]));

	const keys = Object.keys(json);
	if (keys.length === 0) return;

	let statement = '{ ';
	statement += keys.map((it) => `${it}: ${json[it]}`).join(', ');
	statement += ' }';
	return statement;
};

const possibleIntervals = [
	'year',
	'month',
	'day',
	'hour',
	'minute',
	'second',
	'year to month',
	'day to hour',
	'day to minute',
	'day to second',
	'hour to minute',
	'hour to second',
	'minute to second',
];

const intervalStrToObj = (str: string) => {
	if (str.startsWith('interval(')) {
		return {
			precision: Number(str.substring('interval('.length, str.length - 1)),
		};
	}
	const splitted = str.split(' ');
	if (splitted.length === 1) {
		return {};
	}
	const rest = splitted.slice(1, splitted.length).join(' ');
	if (possibleIntervals.includes(rest)) {
		return { fields: `"${rest}"` };
	}

	for (const s of possibleIntervals) {
		if (rest.startsWith(`${s}(`)) {
			return {
				fields: `"${s}"`,
				precision: Number(rest.substring(s.length + 1, rest.length - 1)),
			};
		}
	}
	return {};
};

const intervalConfig = (str: string) => {
	const json = intervalStrToObj(str);
	// json = Object.fromEntries(Object.entries(json).filter((it) => it[1]));

	const keys = Object.keys(json);
	if (keys.length === 0) return;

	let statement = '{ ';
	statement += keys.map((it: keyof typeof json) => `${it}: ${json[it]}`).join(', ');
	statement += ' }';
	return statement;
};

const mapColumnDefault = (defaultValue: any, isExpression?: boolean) => {
	if (isExpression) {
		return `sql\`${defaultValue}\``;
	}

	return defaultValue;
};

const importsPatch = {
	'double precision': 'doublePrecision',
	'timestamp without time zone': 'timestamp',
	'timestamp with time zone': 'timestamp',
	'time without time zone': 'time',
	'time with time zone': 'time',
} as Record<string, string>;

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
		return escapeColumnKey(value.camelCase());
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

export const relationsToTypeScriptForStudio = (
	schema: Record<string, Record<string, AnyPgTable<{}>>>,
	relations: Record<string, Relations<string, Record<string, Relation<string>>>>,
) => {
	const relationalSchema: Record<string, unknown> = {
		...Object.fromEntries(
			Object.entries(schema)
				.map(([key, val]) => {
					// have unique keys across schemas
					const mappedTableEntries = Object.entries(val).map((tableEntry) => {
						return [`__${key}__.${tableEntry[0]}`, tableEntry[1]];
					});

					return mappedTableEntries;
				})
				.flat(),
		),
		...relations,
	};

	const relationsConfig = extractTablesRelationalConfig(relationalSchema, createTableRelationsHelpers);

	let result = '';

	function findColumnKey(table: AnyPgTable, columnName: string) {
		for (const tableEntry of Object.entries(table)) {
			const key = tableEntry[0];
			const value = tableEntry[1];

			if (value.name === columnName) {
				return key;
			}
		}
	}

	Object.values(relationsConfig.tables).forEach((table) => {
		const tableName = table.tsName.split('.')[1];
		const relations = table.relations;
		let hasRelations = false;
		let relationsObjAsStr = '';
		let hasOne = false;
		let hasMany = false;

		Object.values(relations).forEach((relation) => {
			hasRelations = true;

			if (is(relation, Many)) {
				hasMany = true;
				relationsObjAsStr += `\t\t${relation.fieldName}: many(${
					relationsConfig.tableNamesMap[relation.referencedTableName].split('.')[1]
				}${typeof relation.relationName !== 'undefined' ? `, { relationName: "${relation.relationName}"}` : ''}),`;
			}

			if (is(relation, One)) {
				hasOne = true;
				relationsObjAsStr += `\t\t${relation.fieldName}: one(${
					relationsConfig.tableNamesMap[relation.referencedTableName].split('.')[1]
				}, { fields: [${
					relation.config?.fields.map(
						(c) =>
							`${relationsConfig.tableNamesMap[getTableName(relation.sourceTable)].split('.')[1]}.${
								findColumnKey(relation.sourceTable, c.name)
							}`,
					)
				}], references: [${
					relation.config?.references.map(
						(c) =>
							`${relationsConfig.tableNamesMap[getTableName(relation.referencedTable)].split('.')[1]}.${
								findColumnKey(relation.referencedTable, c.name)
							}`,
					)
				}]${typeof relation.relationName !== 'undefined' ? `, relationName: "${relation.relationName}"` : ''}}),`;
			}
		});

		if (hasRelations) {
			result += `export const ${tableName}Relation = relations(${tableName}, ({${hasOne ? 'one' : ''}${
				hasOne && hasMany ? ', ' : ''
			}${hasMany ? 'many' : ''}}) => ({
        ${relationsObjAsStr}
      }));\n`;
		}
	});

	return result;
};

function generateIdentityParams(identity: Column['identity']) {
	let paramsObj = `{ name: "${identity!.name}"`;
	if (identity?.startWith) {
		paramsObj += `, startWith: ${identity.startWith}`;
	}
	if (identity?.increment) {
		paramsObj += `, increment: ${identity.increment}`;
	}
	if (identity?.minValue) {
		paramsObj += `, minValue: ${identity.minValue}`;
	}
	if (identity?.maxValue) {
		paramsObj += `, maxValue: ${identity.maxValue}`;
	}
	if (identity?.cache) {
		paramsObj += `, cache: ${identity.cache}`;
	}
	if (identity?.cycle) {
		paramsObj += `, cycle: true`;
	}
	paramsObj += ' }';
	if (identity?.type === 'always') {
		return `.generatedAlwaysAsIdentity(${paramsObj})`;
	}
	return `.generatedByDefaultAsIdentity(${paramsObj})`;
}

export const paramNameFor = (name: string, schema?: string) => {
	const schemaSuffix = schema && schema !== 'public' ? `In${schema.capitalise()}` : '';
	return `${name}${schemaSuffix}`;
};

export const schemaToTypeScript = (schema: PgSchemaInternal, casing: Casing) => {
	// collectFKs
	Object.values(schema.tables).forEach((table) => {
		Object.values(table.foreignKeys).forEach((fk) => {
			const relation = `${fk.tableFrom}-${fk.tableTo}`;
			relations.add(relation);
		});
	});

	const schemas = Object.fromEntries(
		Object.entries(schema.schemas).map((it) => {
			return [it[0], withCasing(it[1], casing)];
		}),
	);

	const enumTypes = Object.values(schema.enums).reduce((acc, cur) => {
		acc.add(`${cur.schema}.${cur.name}`);
		return acc;
	}, new Set<string>());

	const imports = Object.values(schema.tables).reduce(
		(res, it) => {
			const idxImports = Object.values(it.indexes).map((idx) => (idx.isUnique ? 'uniqueIndex' : 'index'));
			const fkImpots = Object.values(it.foreignKeys).map((it) => 'foreignKey');
			if (Object.values(it.foreignKeys).some((it) => isCyclic(it) && !isSelf(it))) {
				res.pg.push('type AnyPgColumn');
			}
			const pkImports = Object.values(it.compositePrimaryKeys).map((it) => 'primaryKey');
			const uniqueImports = Object.values(it.uniqueConstraints).map((it) => 'unique');

			const checkImports = Object.values(it.checkConstraints).map(
				(it) => 'check',
			);

			const policiesImports = Object.values(it.policies).map(
				(it) => 'pgPolicy',
			);

			if (it.schema && it.schema !== 'public' && it.schema !== '') {
				res.pg.push('pgSchema');
			}

			res.pg.push(...idxImports);
			res.pg.push(...fkImpots);
			res.pg.push(...pkImports);
			res.pg.push(...uniqueImports);
			res.pg.push(...policiesImports);
			res.pg.push(...checkImports);

			const columnImports = Object.values(it.columns)
				.map((col) => {
					let patched: string = (importsPatch[col.type] || col.type).replace('[]', '');
					patched = patched === 'double precision' ? 'doublePrecision' : patched;
					patched = patched.startsWith('varchar(') ? 'varchar' : patched;
					patched = patched.startsWith('char(') ? 'char' : patched;
					patched = patched.startsWith('numeric(') ? 'numeric' : patched;
					patched = patched.startsWith('time(') ? 'time' : patched;
					patched = patched.startsWith('timestamp(') ? 'timestamp' : patched;
					patched = patched.startsWith('vector(') ? 'vector' : patched;
					patched = patched.startsWith('geometry(') ? 'geometry' : patched;
					return patched;
				})
				.filter((type) => {
					return pgImportsList.has(type);
				});

			res.pg.push(...columnImports);
			return res;
		},
		{ pg: [] as string[] },
	);

	Object.values(schema.views).forEach((it) => {
		if (it.schema && it.schema !== 'public' && it.schema !== '') {
			imports.pg.push('pgSchema');
		} else if (it.schema === 'public') {
			it.materialized ? imports.pg.push('pgMaterializedView') : imports.pg.push('pgView');
		}

		Object.values(it.columns).forEach(() => {
			const columnImports = Object.values(it.columns)
				.map((col) => {
					let patched: string = (importsPatch[col.type] || col.type).replace('[]', '');
					patched = patched === 'double precision' ? 'doublePrecision' : patched;
					patched = patched.startsWith('varchar(') ? 'varchar' : patched;
					patched = patched.startsWith('char(') ? 'char' : patched;
					patched = patched.startsWith('numeric(') ? 'numeric' : patched;
					patched = patched.startsWith('time(') ? 'time' : patched;
					patched = patched.startsWith('timestamp(') ? 'timestamp' : patched;
					patched = patched.startsWith('vector(') ? 'vector' : patched;
					patched = patched.startsWith('geometry(') ? 'geometry' : patched;
					return patched;
				})
				.filter((type) => {
					return pgImportsList.has(type);
				});

			imports.pg.push(...columnImports);
		});
	});

	Object.values(schema.sequences).forEach((it) => {
		if (it.schema && it.schema !== 'public' && it.schema !== '') {
			imports.pg.push('pgSchema');
		} else if (it.schema === 'public') {
			imports.pg.push('pgSequence');
		}
	});

	Object.values(schema.enums).forEach((it) => {
		if (it.schema && it.schema !== 'public' && it.schema !== '') {
			imports.pg.push('pgSchema');
		} else if (it.schema === 'public') {
			imports.pg.push('pgEnum');
		}
	});

	if (Object.keys(schema.roles).length > 0) {
		imports.pg.push('pgRole');
	}

	const enumStatements = Object.values(schema.enums)
		.map((it) => {
			const enumSchema = schemas[it.schema];
			// const func = schema || schema === "public" ? "pgTable" : schema;
			const paramName = paramNameFor(it.name, enumSchema);

			const func = enumSchema ? `${enumSchema}.enum` : 'pgEnum';

			const values = Object.values(it.values)
				.map((it) => `'${unescapeSingleQuotes(it, false)}'`)
				.join(', ');
			return `export const ${withCasing(paramName, casing)} = ${func}("${it.name}", [${values}])\n`;
		})
		.join('')
		.concat('\n');

	const sequencesStatements = Object.values(schema.sequences)
		.map((it) => {
			const seqSchema = schemas[it.schema];
			const paramName = paramNameFor(it.name, seqSchema);

			const func = seqSchema ? `${seqSchema}.sequence` : 'pgSequence';

			let params = '';

			if (it.startWith) {
				params += `, startWith: "${it.startWith}"`;
			}
			if (it.increment) {
				params += `, increment: "${it.increment}"`;
			}
			if (it.minValue) {
				params += `, minValue: "${it.minValue}"`;
			}
			if (it.maxValue) {
				params += `, maxValue: "${it.maxValue}"`;
			}
			if (it.cache) {
				params += `, cache: "${it.cache}"`;
			}
			if (it.cycle) {
				params += `, cycle: true`;
			} else {
				params += `, cycle: false`;
			}

			return `export const ${withCasing(paramName, casing)} = ${func}("${it.name}"${
				params ? `, { ${params.trimChar(',')} }` : ''
			})\n`;
		})
		.join('')
		.concat('');

	const schemaStatements = Object.entries(schemas)
		// .filter((it) => it[0] !== "public")
		.map((it) => {
			return `export const ${it[1]} = pgSchema("${it[0]}");\n`;
		})
		.join('');

	const rolesNameToTsKey: Record<string, string> = {};

	const rolesStatements = Object.entries(schema.roles)
		.map((it) => {
			const fields = it[1];
			rolesNameToTsKey[fields.name] = it[0];
			return `export const ${withCasing(it[0], casing)} = pgRole("${fields.name}", ${
				!fields.createDb && !fields.createRole && fields.inherit
					? ''
					: `${
						`, { ${fields.createDb ? `createDb: true,` : ''}${fields.createRole ? ` createRole: true,` : ''}${
							!fields.inherit ? ` inherit: false ` : ''
						}`.trimChar(',')
					}}`
			} );\n`;
		})
		.join('');

	const tableStatements = Object.values(schema.tables).map((table) => {
		const tableSchema = schemas[table.schema];
		const paramName = paramNameFor(table.name, tableSchema);

		const func = tableSchema ? `${tableSchema}.table` : 'pgTable';
		let statement = `export const ${withCasing(paramName, casing)} = ${func}("${table.name}", {\n`;
		statement += createTableColumns(
			table.name,
			Object.values(table.columns),
			Object.values(table.foreignKeys),
			enumTypes,
			schemas,
			casing,
			schema.internal,
		);
		statement += '}';

		// more than 2 fields or self reference or cyclic
		// Andrii: I switched this one off until we will get custom names in .references()
		// const filteredFKs = Object.values(table.foreignKeys).filter((it) => {
		// 	return it.columnsFrom.length > 1 || isSelf(it);
		// });

		if (
			Object.keys(table.indexes).length > 0
			|| Object.values(table.foreignKeys).length > 0
			|| Object.values(table.policies).length > 0
			|| Object.keys(table.compositePrimaryKeys).length > 0
			|| Object.keys(table.uniqueConstraints).length > 0
			|| Object.keys(table.checkConstraints).length > 0
		) {
			statement += ', ';
			statement += '(table) => [';
			statement += createTableIndexes(table.name, Object.values(table.indexes), casing);
			statement += createTableFKs(Object.values(table.foreignKeys), schemas, casing);
			statement += createTablePKs(
				Object.values(table.compositePrimaryKeys),
				casing,
			);
			statement += createTableUniques(
				Object.values(table.uniqueConstraints),
				casing,
			);
			statement += createTablePolicies(
				Object.values(table.policies),
				casing,
				rolesNameToTsKey,
			);
			statement += createTableChecks(
				Object.values(table.checkConstraints),
				casing,
			);
			statement += '\n]';
		}

		statement += ');';
		return statement;
	});

	const viewsStatements = Object.values(schema.views)
		.map((it) => {
			const viewSchema = schemas[it.schema];

			const paramName = paramNameFor(it.name, viewSchema);

			const func = viewSchema
				? (it.materialized ? `${viewSchema}.materializedView` : `${viewSchema}.view`)
				: it.materialized
				? 'pgMaterializedView'
				: 'pgView';

			const withOption = it.with ?? '';

			const as = `sql\`${it.definition}\``;

			const tablespace = it.tablespace ?? '';

			const columns = createTableColumns(
				'',
				Object.values(it.columns),
				[],
				enumTypes,
				schemas,
				casing,
				schema.internal,
			);

			let statement = `export const ${withCasing(paramName, casing)} = ${func}("${it.name}", {${columns}})`;
			statement += tablespace ? `.tablespace("${tablespace}")` : '';
			statement += withOption ? `.with(${JSON.stringify(withOption)})` : '';
			statement += `.as(${as});`;

			return statement;
		})
		.join('\n\n');

	const uniquePgImports = ['pgTable', ...new Set(imports.pg)];

	const importsTs = `import { ${
		uniquePgImports.join(
			', ',
		)
	} } from "drizzle-orm/pg-core"
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
		Object.values(schema.tables)
			.map((it) => withCasing(it.name, casing))
			.join(',\n')
	}
    }
  `;

	return { file, imports: importsTs, decalrations, schemaEntry };
};

const isCyclic = (fk: ForeignKey) => {
	const key = `${fk.tableFrom}-${fk.tableTo}`;
	const reverse = `${fk.tableTo}-${fk.tableFrom}`;
	return relations.has(key) && relations.has(reverse);
};

const isSelf = (fk: ForeignKey) => {
	return fk.tableFrom === fk.tableTo;
};

const buildArrayDefault = (defaultValue: string, typeName: string): string => {
	if (typeof defaultValue === 'string' && !(defaultValue.startsWith('{') || defaultValue.startsWith("'{"))) {
		return `sql\`${defaultValue}\``;
	}
	defaultValue = defaultValue.substring(2, defaultValue.length - 2);
	return `[${
		defaultValue
			.split(/\s*,\s*/g)
			.map((value) => {
				// 	if (['integer', 'smallint', 'bigint', 'double precision', 'real'].includes(typeName)) {
				// 		return value;
				// 	} else if (typeName === 'interval') {
				// 		return value.replaceAll('"', "'");
				// 	} else if (typeName === 'boolean') {
				// 		return value === 't' ? 'true' : 'false';
				if (typeName === 'json' || typeName === 'jsonb') {
					return value.substring(1, value.length - 1).replaceAll('\\', '');
				}
				return value;
				// 	}
			})
			.join(', ')
	}]`;
};

const mapDefault = (
	tableName: string,
	type: string,
	name: string,
	enumTypes: Set<string>,
	typeSchema: string,
	defaultValue?: any,
	internals?: PgKitInternals,
) => {
	const isExpression = internals?.tables[tableName]?.columns[name]?.isDefaultAnExpression ?? false;
	const isArray = internals?.tables[tableName]?.columns[name]?.isArray ?? false;
	const lowered = type.toLowerCase().replace('[]', '');

	if (isArray) {
		return typeof defaultValue !== 'undefined' ? `.default(${buildArrayDefault(defaultValue, lowered)})` : '';
	}

	if (enumTypes.has(`${typeSchema}.${type.replace('[]', '')}`)) {
		return typeof defaultValue !== 'undefined'
			? `.default(${mapColumnDefault(unescapeSingleQuotes(defaultValue, true), isExpression)})`
			: '';
	}

	if (lowered.startsWith('integer')) {
		return typeof defaultValue !== 'undefined' ? `.default(${mapColumnDefault(defaultValue, isExpression)})` : '';
	}

	if (lowered.startsWith('smallint')) {
		return typeof defaultValue !== 'undefined' ? `.default(${mapColumnDefault(defaultValue, isExpression)})` : '';
	}

	if (lowered.startsWith('bigint')) {
		return typeof defaultValue !== 'undefined' ? `.default(${mapColumnDefault(defaultValue, isExpression)})` : '';
	}

	if (lowered.startsWith('boolean')) {
		return typeof defaultValue !== 'undefined' ? `.default(${mapColumnDefault(defaultValue, isExpression)})` : '';
	}

	if (lowered.startsWith('double precision')) {
		return typeof defaultValue !== 'undefined' ? `.default(${mapColumnDefault(defaultValue, isExpression)})` : '';
	}

	if (lowered.startsWith('real')) {
		return typeof defaultValue !== 'undefined' ? `.default(${mapColumnDefault(defaultValue, isExpression)})` : '';
	}

	if (lowered.startsWith('uuid')) {
		return defaultValue === 'gen_random_uuid()'
			? '.defaultRandom()'
			: defaultValue
			? `.default(sql\`${defaultValue}\`)`
			: '';
	}

	if (lowered.startsWith('numeric')) {
		defaultValue = defaultValue
			? (defaultValue.startsWith(`'`) && defaultValue.endsWith(`'`)
				? defaultValue.substring(1, defaultValue.length - 1)
				: defaultValue)
			: undefined;
		return defaultValue ? `.default('${mapColumnDefault(defaultValue, isExpression)}')` : '';
	}

	if (lowered.startsWith('timestamp')) {
		return defaultValue === 'now()'
			? '.defaultNow()'
			: /^'\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d+)?([+-]\d{2}(:\d{2})?)?'$/.test(defaultValue) // Matches 'YYYY-MM-DD HH:MI:SS', 'YYYY-MM-DD HH:MI:SS.FFFFFF', 'YYYY-MM-DD HH:MI:SS+TZ', 'YYYY-MM-DD HH:MI:SS.FFFFFF+TZ' and 'YYYY-MM-DD HH:MI:SS+HH:MI'
			? `.default(${mapColumnDefault(defaultValue, isExpression)})`
			: defaultValue
			? `.default(sql\`${defaultValue}\`)`
			: '';
	}

	if (lowered.startsWith('time')) {
		return defaultValue === 'now()'
			? '.defaultNow()'
			: /^'\d{2}:\d{2}(:\d{2})?(\.\d+)?'$/.test(defaultValue) // Matches 'HH:MI', 'HH:MI:SS' and 'HH:MI:SS.FFFFFF'
			? `.default(${mapColumnDefault(defaultValue, isExpression)})`
			: defaultValue
			? `.default(sql\`${defaultValue}\`)`
			: '';
	}

	if (lowered.startsWith('interval')) {
		return defaultValue ? `.default(${mapColumnDefault(defaultValue, isExpression)})` : '';
	}

	if (lowered === 'date') {
		return defaultValue === 'now()'
			? '.defaultNow()'
			: /^'\d{4}-\d{2}-\d{2}'$/.test(defaultValue) // Matches 'YYYY-MM-DD'
			? `.default(${defaultValue})`
			: defaultValue
			? `.default(sql\`${defaultValue}\`)`
			: '';
	}

	if (lowered.startsWith('text')) {
		return typeof defaultValue !== 'undefined'
			? `.default(${mapColumnDefault(unescapeSingleQuotes(defaultValue, true), isExpression)})`
			: '';
	}

	if (lowered.startsWith('jsonb')) {
		const def = typeof defaultValue !== 'undefined'
			? defaultValue.replace(/::(.*?)(?<![^\w"])(?=$)/, '').slice(1, -1)
			: null;

		return defaultValue ? `.default(${def})` : '';
	}

	if (lowered.startsWith('json')) {
		const def = defaultValue ? defaultValue.replace(/::(.*?)(?<![^\w"])(?=$)/, '').slice(1, -1) : null;

		return typeof defaultValue !== 'undefined' ? `.default(${def})` : '';
	}

	if (lowered.startsWith('inet')) {
		return typeof defaultValue !== 'undefined' ? `.default(${mapColumnDefault(defaultValue, isExpression)})` : '';
	}

	if (lowered.startsWith('cidr')) {
		return typeof defaultValue !== 'undefined' ? `.default(${mapColumnDefault(defaultValue, isExpression)})` : '';
	}

	if (lowered.startsWith('macaddr8')) {
		return typeof defaultValue !== 'undefined' ? `.default(${mapColumnDefault(defaultValue, isExpression)})` : '';
	}

	if (lowered.startsWith('macaddr')) {
		return typeof defaultValue !== 'undefined' ? `.default(${mapColumnDefault(defaultValue, isExpression)})` : '';
	}

	if (lowered.startsWith('varchar')) {
		return typeof defaultValue !== 'undefined'
			? `.default(${mapColumnDefault(unescapeSingleQuotes(defaultValue, true), isExpression)})`
			: '';
	}

	if (lowered.startsWith('point')) {
		return typeof defaultValue !== 'undefined' ? `.default(${mapColumnDefault(defaultValue, isExpression)})` : '';
	}

	if (lowered.startsWith('line')) {
		return typeof defaultValue !== 'undefined' ? `.default(${mapColumnDefault(defaultValue, isExpression)})` : '';
	}

	if (lowered.startsWith('geometry')) {
		return typeof defaultValue !== 'undefined' ? `.default(${mapColumnDefault(defaultValue, isExpression)})` : '';
	}

	if (lowered.startsWith('vector')) {
		return typeof defaultValue !== 'undefined' ? `.default(${mapColumnDefault(defaultValue, isExpression)})` : '';
	}

	if (lowered.startsWith('char')) {
		return typeof defaultValue !== 'undefined'
			? `.default(${mapColumnDefault(unescapeSingleQuotes(defaultValue, true), isExpression)})`
			: '';
	}

	return '';
};

const column = (
	tableName: string,
	type: string,
	name: string,
	enumTypes: Set<string>,
	typeSchema: string,
	casing: Casing,
	defaultValue?: any,
	internals?: PgKitInternals,
) => {
	const isExpression = internals?.tables[tableName]?.columns[name]?.isDefaultAnExpression ?? false;
	const lowered = type.toLowerCase().replace('[]', '');

	if (enumTypes.has(`${typeSchema}.${type.replace('[]', '')}`)) {
		let out = `${withCasing(name, casing)}: ${withCasing(paramNameFor(type.replace('[]', ''), typeSchema), casing)}(${
			dbColumnName({ name, casing })
		})`;
		return out;
	}

	if (lowered.startsWith('serial')) {
		return `${withCasing(name, casing)}: serial(${dbColumnName({ name, casing })})`;
	}

	if (lowered.startsWith('smallserial')) {
		return `${withCasing(name, casing)}: smallserial(${dbColumnName({ name, casing })})`;
	}

	if (lowered.startsWith('bigserial')) {
		return `${withCasing(name, casing)}: bigserial(${
			dbColumnName({ name, casing, withMode: true })
		}{ mode: "bigint" })`;
	}

	if (lowered.startsWith('integer')) {
		let out = `${withCasing(name, casing)}: integer(${dbColumnName({ name, casing })})`;
		return out;
	}

	if (lowered.startsWith('smallint')) {
		let out = `${withCasing(name, casing)}: smallint(${dbColumnName({ name, casing })})`;
		return out;
	}

	if (lowered.startsWith('bigint')) {
		let out = `// You can use { mode: "bigint" } if numbers are exceeding js number limitations\n\t`;
		out += `${withCasing(name, casing)}: bigint(${dbColumnName({ name, casing, withMode: true })}{ mode: "number" })`;
		return out;
	}

	if (lowered.startsWith('boolean')) {
		let out = `${withCasing(name, casing)}: boolean(${dbColumnName({ name, casing })})`;
		return out;
	}

	if (lowered.startsWith('double precision')) {
		let out = `${withCasing(name, casing)}: doublePrecision(${dbColumnName({ name, casing })})`;
		return out;
	}

	if (lowered.startsWith('real')) {
		let out = `${withCasing(name, casing)}: real(${dbColumnName({ name, casing })})`;
		return out;
	}

	if (lowered.startsWith('uuid')) {
		let out = `${withCasing(name, casing)}: uuid(${dbColumnName({ name, casing })})`;

		return out;
	}

	if (lowered.startsWith('numeric')) {
		let params: { precision: string | undefined; scale: string | undefined } | undefined;

		if (lowered.length > 7) {
			const [precision, scale] = lowered.slice(8, lowered.length - 1).split(',');
			params = { precision, scale };
		}

		let out = params
			? `${withCasing(name, casing)}: numeric(${dbColumnName({ name, casing, withMode: true })}${timeConfig(params)})`
			: `${withCasing(name, casing)}: numeric(${dbColumnName({ name, casing })})`;

		return out;
	}

	if (lowered.startsWith('timestamp')) {
		const withTimezone = lowered.includes('with time zone');
		// const split = lowered.split(" ");
		let precision = lowered.startsWith('timestamp(')
			? Number(lowered.split(' ')[0].substring('timestamp('.length, lowered.split(' ')[0].length - 1))
			: null;
		precision = precision ? precision : null;

		const params = timeConfig({
			precision,
			withTimezone,
			mode: "'string'",
		});

		let out = params
			? `${withCasing(name, casing)}: timestamp(${dbColumnName({ name, casing, withMode: true })}${params})`
			: `${withCasing(name, casing)}: timestamp(${dbColumnName({ name, casing })})`;

		return out;
	}

	if (lowered.startsWith('time')) {
		const withTimezone = lowered.includes('with time zone');

		let precision = lowered.startsWith('time(')
			? Number(lowered.split(' ')[0].substring('time('.length, lowered.split(' ')[0].length - 1))
			: null;
		precision = precision ? precision : null;

		const params = timeConfig({ precision, withTimezone });

		let out = params
			? `${withCasing(name, casing)}: time(${dbColumnName({ name, casing, withMode: true })}${params})`
			: `${withCasing(name, casing)}: time(${dbColumnName({ name, casing })})`;

		return out;
	}

	if (lowered.startsWith('interval')) {
		// const withTimezone = lowered.includes("with time zone");
		// const split = lowered.split(" ");
		// let precision = split.length >= 2 ? Number(split[1].substring(1, 2)) : null;
		// precision = precision ? precision : null;

		const params = intervalConfig(lowered);

		let out = params
			? `${withCasing(name, casing)}: interval(${dbColumnName({ name, casing, withMode: true })}${params})`
			: `${withCasing(name, casing)}: interval(${dbColumnName({ name, casing })})`;

		return out;
	}

	if (lowered === 'date') {
		let out = `${withCasing(name, casing)}: date(${dbColumnName({ name, casing })})`;

		return out;
	}

	if (lowered.startsWith('text')) {
		let out = `${withCasing(name, casing)}: text(${dbColumnName({ name, casing })})`;
		return out;
	}

	if (lowered.startsWith('jsonb')) {
		let out = `${withCasing(name, casing)}: jsonb(${dbColumnName({ name, casing })})`;
		return out;
	}

	if (lowered.startsWith('json')) {
		let out = `${withCasing(name, casing)}: json(${dbColumnName({ name, casing })})`;
		return out;
	}

	if (lowered.startsWith('inet')) {
		let out = `${withCasing(name, casing)}: inet(${dbColumnName({ name, casing })})`;
		return out;
	}

	if (lowered.startsWith('cidr')) {
		let out = `${withCasing(name, casing)}: cidr(${dbColumnName({ name, casing })})`;
		return out;
	}

	if (lowered.startsWith('macaddr8')) {
		let out = `${withCasing(name, casing)}: macaddr8(${dbColumnName({ name, casing })})`;
		return out;
	}

	if (lowered.startsWith('macaddr')) {
		let out = `${withCasing(name, casing)}: macaddr(${dbColumnName({ name, casing })})`;
		return out;
	}

	if (lowered.startsWith('varchar')) {
		let out: string;
		if (lowered.length !== 7) {
			out = `${withCasing(name, casing)}: varchar(${dbColumnName({ name, casing, withMode: true })}{ length: ${
				lowered.substring(8, lowered.length - 1)
			} })`;
		} else {
			out = `${withCasing(name, casing)}: varchar(${dbColumnName({ name, casing })})`;
		}

		return out;
	}

	if (lowered.startsWith('point')) {
		let out: string = `${withCasing(name, casing)}: point(${dbColumnName({ name, casing })})`;
		return out;
	}

	if (lowered.startsWith('line')) {
		let out: string = `${withCasing(name, casing)}: point(${dbColumnName({ name, casing })})`;
		return out;
	}

	if (lowered.startsWith('geometry')) {
		let out: string = '';

		let isGeoUnknown = false;

		if (lowered.length !== 8) {
			const geometryOptions = lowered.slice(9, -1).split(',');
			if (geometryOptions.length === 1 && geometryOptions[0] !== '') {
				out = `${withCasing(name, casing)}: geometry(${dbColumnName({ name, casing, withMode: true })}{ type: "${
					geometryOptions[0]
				}" })`;
			} else if (geometryOptions.length === 2) {
				out = `${withCasing(name, casing)}: geometry(${dbColumnName({ name, casing, withMode: true })}{ type: "${
					geometryOptions[0]
				}", srid: ${geometryOptions[1]} })`;
			} else {
				isGeoUnknown = true;
			}
		} else {
			out = `${withCasing(name, casing)}: geometry(${dbColumnName({ name, casing })})`;
		}

		if (isGeoUnknown) {
			let unknown =
				`// TODO: failed to parse geometry type because found more than 2 options inside geometry function '${type}'\n// Introspect is currently supporting only type and srid options\n`;
			unknown += `\t${withCasing(name, casing)}: unknown("${name}")`;
			return unknown;
		}
		return out;
	}

	if (lowered.startsWith('vector')) {
		let out: string;
		if (lowered.length !== 6) {
			out = `${withCasing(name, casing)}: vector(${dbColumnName({ name, casing, withMode: true })}{ dimensions: ${
				lowered.substring(7, lowered.length - 1)
			} })`;
		} else {
			out = `${withCasing(name, casing)}: vector(${dbColumnName({ name, casing })})`;
		}

		return out;
	}

	if (lowered.startsWith('char')) {
		let out: string;
		if (lowered.length !== 4) {
			out = `${withCasing(name, casing)}: char(${dbColumnName({ name, casing, withMode: true })}{ length: ${
				lowered.substring(5, lowered.length - 1)
			} })`;
		} else {
			out = `${withCasing(name, casing)}: char(${dbColumnName({ name, casing })})`;
		}

		return out;
	}

	let unknown = `// TODO: failed to parse database type '${type}'\n`;
	unknown += `\t${withCasing(name, casing)}: unknown("${name}")`;
	return unknown;
};

const dimensionsInArray = (size?: number): string => {
	let res = '';
	if (typeof size === 'undefined') return res;
	for (let i = 0; i < size; i++) {
		res += '.array()';
	}
	return res;
};

const createTableColumns = (
	tableName: string,
	columns: Column[],
	fks: ForeignKey[],
	enumTypes: Set<string>,
	schemas: Record<string, string>,
	casing: Casing,
	internals: PgKitInternals,
): string => {
	let statement = '';

	// no self refs and no cyclic
	const oneColumnsFKs = Object.values(fks)
		.filter((it) => {
			return !isSelf(it);
		})
		.filter((it) => it.columnsFrom.length === 1);

	const fkByColumnName = oneColumnsFKs.reduce((res, it) => {
		const arr = res[it.columnsFrom[0]] || [];
		arr.push(it);
		res[it.columnsFrom[0]] = arr;
		return res;
	}, {} as Record<string, ForeignKey[]>);

	columns.forEach((it) => {
		const columnStatement = column(
			tableName,
			it.type,
			it.name,
			enumTypes,
			it.typeSchema ?? 'public',
			casing,
			it.default,
			internals,
		);
		statement += '\t';
		statement += columnStatement;
		// Provide just this in column function
		if (internals?.tables[tableName]?.columns[it.name]?.isArray) {
			statement += dimensionsInArray(internals?.tables[tableName]?.columns[it.name]?.dimensions);
		}
		statement += mapDefault(tableName, it.type, it.name, enumTypes, it.typeSchema ?? 'public', it.default, internals);
		statement += it.primaryKey ? '.primaryKey()' : '';
		statement += it.notNull && !it.identity ? '.notNull()' : '';

		statement += it.identity ? generateIdentityParams(it.identity) : '';

		statement += it.generated ? `.generatedAlwaysAs(sql\`${it.generated.as}\`)` : '';

		// const fks = fkByColumnName[it.name];
		// Andrii: I switched it off until we will get a custom naem setting in references
		// if (fks) {
		// 	const fksStatement = fks
		// 		.map((it) => {
		// 			const onDelete = it.onDelete && it.onDelete !== 'no action' ? it.onDelete : null;
		// 			const onUpdate = it.onUpdate && it.onUpdate !== 'no action' ? it.onUpdate : null;
		// 			const params = { onDelete, onUpdate };

		// 			const typeSuffix = isCyclic(it) ? ': AnyPgColumn' : '';

		// 			const paramsStr = objToStatement2(params);
		// 			const tableSchema = schemas[it.schemaTo || ''];
		// 			const paramName = paramNameFor(it.tableTo, tableSchema);
		// 			if (paramsStr) {
		// 				return `.references(()${typeSuffix} => ${
		// 					withCasing(
		// 						paramName,
		// 						casing,
		// 					)
		// 				}.${withCasing(it.columnsTo[0], casing)}, ${paramsStr} )`;
		// 			}
		// 			return `.references(()${typeSuffix} => ${
		// 				withCasing(
		// 					paramName,
		// 					casing,
		// 				)
		// 			}.${withCasing(it.columnsTo[0], casing)})`;
		// 		})
		// 		.join('');
		// 	statement += fksStatement;
		// }

		statement += ',\n';
	});

	return statement;
};

const createTableIndexes = (tableName: string, idxs: Index[], casing: Casing): string => {
	let statement = '';

	idxs.forEach((it) => {
		// we have issue when index is called as table called
		let idxKey = it.name.startsWith(tableName) && it.name !== tableName ? it.name.slice(tableName.length + 1) : it.name;
		idxKey = idxKey.endsWith('_index') ? idxKey.slice(0, -'_index'.length) + '_idx' : idxKey;

		idxKey = withCasing(idxKey, casing);

		const indexGeneratedName = indexName(
			tableName,
			it.columns.map((it) => it.expression),
		);
		const escapedIndexName = indexGeneratedName === it.name ? '' : `"${it.name}"`;

		statement += `\n\t`;
		statement += it.isUnique ? 'uniqueIndex(' : 'index(';
		statement += `${escapedIndexName})`;
		statement += `${it.concurrently ? `.concurrently()` : ''}`;

		statement += `.using("${it.method}", ${
			it.columns
				.map((it) => {
					if (it.isExpression) {
						return `sql\`${it.expression}\``;
					} else {
						return `table.${withCasing(it.expression, casing)}${it.asc ? '.asc()' : '.desc()'}${
							it.nulls === 'first' ? '.nullsFirst()' : '.nullsLast()'
						}${
							it.opclass
								? `.op("${it.opclass}")`
								: ''
						}`;
					}
				})
				.join(', ')
		})`;
		statement += it.where ? `.where(sql\`${it.where}\`)` : '';

		function reverseLogic(mappedWith: Record<string, string>): string {
			let reversedString = '{';
			for (const key in mappedWith) {
				if (mappedWith.hasOwnProperty(key)) {
					reversedString += `${key}: "${mappedWith[key]}",`;
				}
			}
			reversedString = reversedString.length > 1 ? reversedString.slice(0, reversedString.length - 1) : reversedString;
			return `${reversedString}}`;
		}

		statement += it.with && Object.keys(it.with).length > 0 ? `.with(${reverseLogic(it.with)})` : '';
		statement += `,`;
	});

	return statement;
};

const createTablePKs = (pks: PrimaryKey[], casing: Casing): string => {
	let statement = '';

	pks.forEach((it) => {
		statement += `\n\t`;
		statement += 'primaryKey({ columns: [';
		statement += `${
			it.columns
				.map((c) => {
					return `table.${withCasing(c, casing)}`;
				})
				.join(', ')
		}]${it.name ? `, name: "${it.name}"` : ''}}`;
		statement += ')';
		statement += `,`;
	});

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
		const idxKey = withCasing(it.name, casing);

		const mappedItTo = it.to?.map((v) => {
			return rolesNameToTsKey[v] ? withCasing(rolesNameToTsKey[v], casing) : `"${v}"`;
		});

		statement += `\n\t`;
		statement += 'pgPolicy(';
		statement += `"${it.name}", { `;
		statement += `as: "${it.as?.toLowerCase()}", for: "${it.for?.toLowerCase()}", to: [${mappedItTo?.join(', ')}]${
			it.using ? `, using: sql\`${it.using}\`` : ''
		}${it.withCheck ? `, withCheck: sql\`${it.withCheck}\` ` : ''}`;
		statement += ` }),`;
	});

	return statement;
};

const createTableUniques = (
	unqs: UniqueConstraint[],
	casing: Casing,
): string => {
	let statement = '';

	unqs.forEach((it) => {
		statement += `\n\t`;
		statement += 'unique(';
		statement += `"${it.name}")`;
		statement += `.on(${it.columns.map((it) => `table.${withCasing(it, casing)}`).join(', ')})`;
		statement += it.nullsNotDistinct ? `.nullsNotDistinct()` : '';
		statement += `,`;
	});

	return statement;
};

const createTableChecks = (
	checkConstraints: CheckConstraint[],
	casing: Casing,
) => {
	let statement = '';

	checkConstraints.forEach((it) => {
		statement += `\n\t`;
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
		const tableSchema = schemas[it.schemaTo || ''];
		const paramName = paramNameFor(it.tableTo, tableSchema);

		const isSelf = it.tableTo === it.tableFrom;
		const tableTo = isSelf ? 'table' : `${withCasing(paramName, casing)}`;
		statement += `\n\t`;
		statement += `foreignKey({\n`;
		statement += `\t\t\tcolumns: [${it.columnsFrom.map((i) => `table.${withCasing(i, casing)}`).join(', ')}],\n`;
		statement += `\t\t\tforeignColumns: [${
			it.columnsTo.map((i) => `${tableTo}.${withCasing(i, casing)}`).join(', ')
		}],\n`;
		statement += `\t\t\tname: "${it.name}"\n`;
		statement += `\t\t})`;

		statement += it.onUpdate && it.onUpdate !== 'no action' ? `.onUpdate("${it.onUpdate}")` : '';

		statement += it.onDelete && it.onDelete !== 'no action' ? `.onDelete("${it.onDelete}")` : '';

		statement += `,`;
	});

	return statement;
};
