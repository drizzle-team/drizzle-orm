import { getTableName, is } from 'drizzle-orm';
import { AnyGelTable } from 'drizzle-orm/gel-core';
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
	GelKitInternals,
	GelSchemaInternal,
	Index,
	Policy,
	PrimaryKey,
	UniqueConstraint,
} from './serializer/gelSchema';
import { indexName } from './serializer/gelSerializer';
import { unescapeSingleQuotes } from './utils';

const gelImportsList = new Set([
	'gelTable',
	'smallint',
	'integer',
	'bigint',
	'bigintT',
	'boolean',
	'bytes',
	'dateDuration',
	'decimal',
	'doublePrecision',
	'duration',
	'json',
	'localDate',
	'localTime',
	'real',
	'relDuration',
	'text',
	'timestamp',
	'timestamptz',
	'uuid',
	'time',
]);

const mapColumnDefault = (defaultValue: any, isExpression?: boolean) => {
	if (isExpression) {
		return `sql\`${defaultValue}\``;
	}

	return defaultValue;
};

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

// export const relationsToTypeScriptForStudio = (
// 	schema: Record<string, Record<string, AnyGelTable<{}>>>,
// 	relations: Record<string, Relations<string, Record<string, Relation<string>>>>,
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

// 	function findColumnKey(table: AnyGelTable, columnName: string) {
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

export const schemaToTypeScript = (schema: GelSchemaInternal, casing: Casing) => {
	// collectFKs
	Object.values(schema.tables).forEach((table) => {
		Object.values(table.foreignKeys).forEach((fk) => {
			const relation = `${fk.tableFrom}-${fk.tableTo}`;
			relations.add(relation);
		});
	});

	const schemas = Object.fromEntries(
		Object.entries(schema.schemas).map((it) => {
			return [it[0], withCasing(it[1].replace('::', ''), casing)];
		}),
	);

	// const enumTypes = Object.values(schema.enums).reduce((acc, cur) => {
	// 	acc.add(`${cur.schema}.${cur.name}`);
	// 	return acc;
	// }, new Set<string>());

	const imports = Object.values(schema.tables).reduce(
		(res, it) => {
			const idxImports = Object.values(it.indexes).map((idx) => (idx.isUnique ? 'uniqueIndex' : 'index'));
			const fkImpots = Object.values(it.foreignKeys).map((it) => 'foreignKey');
			if (Object.values(it.foreignKeys).some((it) => isCyclic(it) && !isSelf(it))) {
				res.gel.push('type AnyGelColumn');
			}
			const pkImports = Object.values(it.compositePrimaryKeys).map((it) => 'primaryKey');
			const uniqueImports = Object.values(it.uniqueConstraints).map((it) => 'unique');

			const checkImports = Object.values(it.checkConstraints).map(
				(it) => 'check',
			);

			const policiesImports = Object.values(it.policies).map(
				(it) => 'gelPolicy',
			);

			if (it.schema && it.schema !== 'public' && it.schema !== '') {
				res.gel.push('gelSchema');
			}

			res.gel.push(...idxImports);
			res.gel.push(...fkImpots);
			res.gel.push(...pkImports);
			res.gel.push(...uniqueImports);
			res.gel.push(...policiesImports);
			res.gel.push(...checkImports);

			const columnImports = Object.values(it.columns)
				.map((col) => {
					let patched: string = col.type?.replace('[]', '') ?? '';
					patched = patched.startsWith('time without time zone') ? 'localTime' : patched;

					patched = patched === 'double precision' ? 'doublePrecision' : patched;
					patched = patched.startsWith('edgedbt.bigint_t') ? 'bigintT' : patched;

					patched = patched.startsWith('jsonb') ? 'json' : patched;
					patched = patched.startsWith('edgedbt.timestamptz_t') ? 'timestamptz' : patched;
					patched = patched.startsWith('edgedbt.timestamp_t') ? 'timestamp' : patched;

					patched = patched.startsWith('edgedbt.relative_duration_t') ? 'relDuration' : patched;
					patched = patched.startsWith('bytea') ? 'bytes' : patched;

					patched = patched.startsWith('numeric') ? 'decimal' : patched;

					patched = patched.startsWith('edgedbt.duration_t') ? 'duration' : patched;
					patched = patched.startsWith('edgedbt.date_t') ? 'localDate' : patched;
					patched = patched.startsWith('edgedbt.date_duration_t') ? 'dateDuration' : patched;

					return patched;
				})
				.filter((type) => {
					return gelImportsList.has(type);
				});

			res.gel.push(...columnImports);
			return res;
		},
		{ gel: [] as string[] },
	);

	// Object.values(schema.sequences).forEach((it) => {
	// 	if (it.schema && it.schema !== 'public' && it.schema !== '') {
	// 		imports.gel.push('gelSchema');
	// 	} else if (it.schema === 'public') {
	// 		imports.gel.push('gelSequence');
	// 	}
	// });

	// Object.values(schema.enums).forEach((it) => {
	// 	if (it.schema && it.schema !== 'public' && it.schema !== '') {
	// 		imports.gel.push('gelSchema');
	// 	} else if (it.schema === 'public') {
	// 		imports.gel.push('gelEnum');
	// 	}
	// });

	if (Object.keys(schema.roles).length > 0) {
		imports.gel.push('gelRole');
	}

	// const enumStatements = Object.values(schema.enums)
	// 	.map((it) => {
	// 		const enumSchema = schemas[it.schema];
	// 		// const func = schema || schema === "public" ? "gelTable" : schema;
	// 		const paramName = paramNameFor(it.name, enumSchema);

	// 		const func = enumSchema ? `${enumSchema}.enum` : 'gelEnum';

	// 		const values = Object.values(it.values)
	// 			.map((it) => `'${unescapeSingleQuotes(it, false)}'`)
	// 			.join(', ');
	// 		return `export const ${withCasing(paramName, casing)} = ${func}("${it.name}", [${values}])\n`;
	// 	})
	// 	.join('')
	// 	.concat('\n');

	// const sequencesStatements = Object.values(schema.sequences)
	// 	.map((it) => {
	// 		const seqSchema = schemas[it.schema];
	// 		const paramName = paramNameFor(it.name, seqSchema);

	// 		const func = seqSchema ? `${seqSchema}.sequence` : 'gelSequence';

	// 		let params = '';

	// 		if (it.startWith) {
	// 			params += `, startWith: "${it.startWith}"`;
	// 		}
	// 		if (it.increment) {
	// 			params += `, increment: "${it.increment}"`;
	// 		}
	// 		if (it.minValue) {
	// 			params += `, minValue: "${it.minValue}"`;
	// 		}
	// 		if (it.maxValue) {
	// 			params += `, maxValue: "${it.maxValue}"`;
	// 		}
	// 		if (it.cache) {
	// 			params += `, cache: "${it.cache}"`;
	// 		}
	// 		if (it.cycle) {
	// 			params += `, cycle: true`;
	// 		} else {
	// 			params += `, cycle: false`;
	// 		}

	// 		return `export const ${withCasing(paramName, casing)} = ${func}("${it.name}"${
	// 			params ? `, { ${params.trimChar(',')} }` : ''
	// 		})\n`;
	// 	})
	// 	.join('')
	// 	.concat('');

	const schemaStatements = Object.entries(schemas)
		.filter((it) => it[0] !== 'public')
		.map((it) => {
			return `export const ${it[1].replace('::', '').camelCase()} = gelSchema("${it[0]}");\n`;
		})
		.join('');

	const rolesNameToTsKey: Record<string, string> = {};

	const rolesStatements = Object.entries(schema.roles)
		.map((it) => {
			const fields = it[1];
			rolesNameToTsKey[fields.name] = it[0];
			return `export const ${withCasing(it[0], casing)} = gelRole("${fields.name}", ${
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

		const func = tableSchema ? `${tableSchema}.table` : 'gelTable';
		let statement = `export const ${withCasing(paramName, casing)} = ${func}("${table.name}", {\n`;
		statement += createTableColumns(
			table.name,
			Object.values(table.columns),
			Object.values(table.foreignKeys),
			// enumTypes,
			new Set(),
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

	// const viewsStatements = Object.values(schema.views)
	// 	.map((it) => {
	// 		const viewSchema = schemas[it.schema];

	// 		const paramName = paramNameFor(it.name, viewSchema);

	// 		const func = viewSchema
	// 			? (it.materialized ? `${viewSchema}.materializedView` : `${viewSchema}.view`)
	// 			: it.materialized
	// 			? 'gelMaterializedView'
	// 			: 'gelView';

	// 		const withOption = it.with ?? '';

	// 		const as = `sql\`${it.definition}\``;

	// 		const tablespace = it.tablespace ?? '';

	// 		const columns = createTableColumns(
	// 			'',
	// 			Object.values(it.columns),
	// 			[],
	// 			enumTypes,
	// 			schemas,
	// 			casing,
	// 			schema.internal,
	// 		);

	// 		let statement = `export const ${withCasing(paramName, casing)} = ${func}("${it.name}", {${columns}})`;
	// 		statement += tablespace ? `.tablespace("${tablespace}")` : '';
	// 		statement += withOption ? `.with(${JSON.stringify(withOption)})` : '';
	// 		statement += `.as(${as});`;

	// 		return statement;
	// 	})
	// 	.join('\n\n');

	const uniqueGelImports = ['gelTable', ...new Set(imports.gel)];

	const importsTs = `import { ${
		uniqueGelImports.join(
			', ',
		)
	} } from "drizzle-orm/gel-core"
import { sql } from "drizzle-orm"\n\n`;

	let decalrations = schemaStatements;
	decalrations += rolesStatements;
	// decalrations += enumStatements;
	// decalrations += sequencesStatements;
	decalrations += '\n';
	decalrations += tableStatements.join('\n\n');
	decalrations += '\n';
	// decalrations += viewsStatements;

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
	if (
		typeof defaultValue === 'string'
		&& !(defaultValue.startsWith('_nullif_array_nulls(ARRAY[') || defaultValue.startsWith('ARRAY['))
	) {
		return `sql\`${defaultValue}\``;
	}

	const regex = /ARRAY\[(.*)\]/;
	const match = defaultValue.match(regex);

	if (!match) {
		return `sql\`${defaultValue}\``;
	}

	defaultValue = match[1];
	return `sql\`[${defaultValue}]\``;
};

const mapDefault = (
	tableName: string,
	type: string,
	name: string,
	enumTypes: Set<string>,
	typeSchema: string,
	defaultValue?: any,
	internals?: GelKitInternals,
) => {
	const isExpression = internals?.tables[tableName]?.columns[name]?.isDefaultAnExpression ?? false;
	const isArray = internals?.tables[tableName]?.columns[name]?.isArray ?? false;
	const lowered = type.toLowerCase().replace('[]', '');

	if (name === 'id') {
		return `.default(sql\`uuid_generate_v4()\`)`;
	}

	if (isArray) {
		return typeof defaultValue !== 'undefined' ? `.default(${buildArrayDefault(defaultValue, lowered)})` : '';
	}

	if (enumTypes.has(`${typeSchema}.${type.replace('[]', '')}`)) {
		return typeof defaultValue !== 'undefined'
			? `.default(${mapColumnDefault(unescapeSingleQuotes(defaultValue, true), isExpression)})`
			: '';
	}

	if (lowered.startsWith('integer')) {
		return typeof defaultValue !== 'undefined'
			? `.default(${mapColumnDefault(defaultValue.replaceAll('(', '').replaceAll(')', ''), isExpression)})`
			: '';
	}

	if (lowered.startsWith('smallint')) {
		return typeof defaultValue !== 'undefined'
			? `.default(${mapColumnDefault(defaultValue.replaceAll('(', '').replaceAll(')', ''), isExpression)})`
			: '';
	}

	if (lowered.startsWith('bigint')) {
		return typeof defaultValue !== 'undefined'
			? `.default(${mapColumnDefault(defaultValue.replaceAll('(', '').replaceAll(')', ''), isExpression)})`
			: '';
	}

	if (lowered.startsWith('edgedbt.bigint_t')) {
		return typeof defaultValue !== 'undefined'
			? `.default(BigInt(${mapColumnDefault(defaultValue.replaceAll('(', '').replaceAll(')', ''), isExpression)}))`
			: '';
	}

	if (lowered.startsWith('boolean')) {
		return typeof defaultValue !== 'undefined' ? `.default(${mapColumnDefault(defaultValue, isExpression)})` : '';
	}

	if (lowered.startsWith('double precision')) {
		return typeof defaultValue !== 'undefined' ? `.default(${mapColumnDefault(defaultValue, isExpression)})` : '';
	}

	if (lowered.startsWith('edgedbt.date_duration_t')) {
		return typeof defaultValue !== 'undefined' ? `.default(${mapColumnDefault(defaultValue, true)})` : '';
	}

	if (lowered.startsWith('real')) {
		return typeof defaultValue !== 'undefined' ? `.default(${mapColumnDefault(defaultValue, isExpression)})` : '';
	}

	if (lowered.startsWith('uuid')) {
		const res = defaultValue === 'gen_random_uuid()'
			? '.defaultRandom()'
			: defaultValue
			? `.default(sql\`${defaultValue}\`)`
			: '';

		return res;
	}

	if (lowered.startsWith('numeric')) {
		defaultValue = defaultValue
			? (defaultValue.startsWith(`'`) && defaultValue.endsWith(`'`)
				? defaultValue.substring(1, defaultValue.length - 1)
				: defaultValue)
			: undefined;
		return defaultValue ? `.default(sql\`${defaultValue}\`)` : '';
	}

	if (lowered.startsWith('edgedbt.timestamptz_t')) {
		return defaultValue === 'now()'
			? '.defaultNow()'
			: /^'\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d+)?([+-]\d{2}(:\d{2})?)?'$/.test(defaultValue) // Matches 'YYYY-MM-DD HH:MI:SS', 'YYYY-MM-DD HH:MI:SS.FFFFFF', 'YYYY-MM-DD HH:MI:SS+TZ', 'YYYY-MM-DD HH:MI:SS.FFFFFF+TZ' and 'YYYY-MM-DD HH:MI:SS+HH:MI'
			? `.default(${mapColumnDefault(defaultValue, isExpression)})`
			: defaultValue
			? `.default(sql\`${defaultValue}\`)`
			: '';
	}

	if (lowered.startsWith('time without time zone')) {
		return defaultValue === 'now()'
			? '.defaultNow()'
			: /^'\d{2}:\d{2}(:\d{2})?(\.\d+)?'$/.test(defaultValue) // Matches 'HH:MI', 'HH:MI:SS' and 'HH:MI:SS.FFFFFF'
			? `.default(${mapColumnDefault(defaultValue, isExpression)})`
			: defaultValue
			? `.default(sql\`${defaultValue}\`)`
			: '';
	}

	if (lowered.startsWith('edgedbt.duration_t')) {
		return defaultValue ? `.default(${mapColumnDefault(defaultValue, true)})` : '';
	}

	if (lowered === 'edgedbt.date_t') {
		return defaultValue === 'now()'
			? '.defaultNow()'
			: /^'\d{4}-\d{2}-\d{2}'$/.test(defaultValue) // Matches 'YYYY-MM-DD'
			? `.default(${defaultValue})`
			: defaultValue
			? `.default(sql\`${defaultValue}\`)`
			: '';
	}

	if (lowered.startsWith('edgedbt.relative_duration_t')) {
		return defaultValue ? `.default(${mapColumnDefault(defaultValue, true)})` : '';
	}

	if (lowered.startsWith('text')) {
		return typeof defaultValue !== 'undefined'
			? `.default(${mapColumnDefault(unescapeSingleQuotes(defaultValue, true), isExpression)})`
			: '';
	}

	if (lowered.startsWith('json')) {
		const def = typeof defaultValue !== 'undefined'
			? defaultValue
			: null;

		return defaultValue ? `.default(sql\`${def}\`)` : '';
	}

	if (lowered.startsWith('bytea')) {
		return typeof defaultValue !== 'undefined'
			? `.default(${mapColumnDefault(defaultValue, true)})`
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
	internals?: GelKitInternals,
) => {
	const isExpression = internals?.tables[tableName]?.columns[name]?.isDefaultAnExpression ?? false;
	const lowered = type.toLowerCase().replace('[]', '');

	if (enumTypes.has(`${typeSchema}.${type.replace('[]', '')}`)) {
		let out = `${withCasing(name, casing)}: ${withCasing(paramNameFor(type.replace('[]', ''), typeSchema), casing)}(${
			dbColumnName({ name, casing })
		})`;
		return out;
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
		let out = `${withCasing(name, casing)}: bigint(${dbColumnName({ name, casing })})`;
		return out;
	}

	if (lowered.startsWith('edgedbt.bigint_t')) {
		let out = `${withCasing(name, casing)}: bigintT(${dbColumnName({ name, casing })})`;
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

	if (lowered.startsWith('edgedbt.date_duration_t')) {
		let out = `${withCasing(name, casing)}: dateDuration(${dbColumnName({ name, casing })})`;
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
		let out = `${withCasing(name, casing)}: decimal(${dbColumnName({ name, casing })})`;

		return out;
	}

	if (lowered.startsWith('edgedbt.timestamptz_t')) {
		let out = `${withCasing(name, casing)}: timestamptz(${dbColumnName({ name, casing })})`;

		return out;
	}

	if (lowered.startsWith('edgedbt.timestamp_t')) {
		let out = `${withCasing(name, casing)}: timestamp(${dbColumnName({ name, casing })})`;

		return out;
	}

	if (lowered.startsWith('edgedbt.date_t')) {
		let out = `${withCasing(name, casing)}: localDate(${dbColumnName({ name, casing })})`;

		return out;
	}

	if (lowered.startsWith('edgedbt.duration_t')) {
		let out = `${withCasing(name, casing)}: duration(${dbColumnName({ name, casing })})`;

		return out;
	}

	if (lowered.startsWith('edgedbt.relative_duration_t')) {
		let out = `${withCasing(name, casing)}: relDuration(${dbColumnName({ name, casing })})`;

		return out;
	}

	if (lowered.startsWith('text')) {
		let out = `${withCasing(name, casing)}: text(${dbColumnName({ name, casing })})`;
		return out;
	}

	if (lowered.startsWith('jsonb')) {
		let out = `${withCasing(name, casing)}: json(${dbColumnName({ name, casing })})`;
		return out;
	}

	if (lowered.startsWith('time without time zone')) {
		let out = `${withCasing(name, casing)}: localTime(${dbColumnName({ name, casing })})`;
		return out;
	}

	if (lowered.startsWith('bytea')) {
		let out = `${withCasing(name, casing)}: bytes(${dbColumnName({ name, casing })})`;
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
	internals: GelKitInternals,
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

		// 			const typeSuffix = isCyclic(it) ? ': AnyGelColumn' : '';

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
		statement += 'gelPolicy(';
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
