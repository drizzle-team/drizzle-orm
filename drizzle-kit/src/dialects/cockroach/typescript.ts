import { getTableName, is } from 'drizzle-orm';
import { AnyCockroachTable } from 'drizzle-orm/cockroach-core';
import {
	createTableRelationsHelpers,
	extractTablesRelationalConfig,
	Many,
	One,
	Relation,
	Relations,
} from 'drizzle-orm/relations';
import '../../@types/utils';
import { toCamelCase } from 'drizzle-orm/casing';
import { parseArray } from 'src/utils/parse-pgarray';
import { Casing } from '../../cli/validations/common';
import { assertUnreachable, stringifyArray, trimChar } from '../../utils';
import {
	CheckConstraint,
	CockroachDDL,
	Column,
	ForeignKey,
	Index,
	Policy,
	PrimaryKey,
	tableFromDDL,
	ViewColumn,
} from './ddl';
import { defaults } from './grammar';

// TODO: omit defaults opclass...
const cockroachImportsList = new Set([
	'cockroachTable',
	'cockroachEnum',
	'int2',
	'int4',
	'int8',
	'boolean',
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

const mapColumnDefault = (def: Exclude<Column['default'], null>) => {
	if (def.type === 'unknown' || def.type === 'func') {
		return `sql\`${def.value}\``;
	}
	if (def.type === 'bigint') {
		return `${def.value}n`;
	}
	if (def.type === 'string') {
		return `"${def.value.replaceAll("''", "'").replaceAll('"', '\\"')}"`;
	}

	return def.value;
};

const importsPatch = {
	'timestamp without time zone': 'timestamp',
	'timestamp with time zone': 'timestamp',
	'time without time zone': 'time',
	'time with time zone': 'time',
	'character varying': 'varchar',
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

export const relationsToTypeScriptForStudio = (
	schema: Record<string, Record<string, AnyCockroachTable<{}>>>,
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

	function findColumnKey(table: AnyCockroachTable, columnName: string) {
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

// prev: schemaToTypeScript
export const ddlToTypeScript = (
	ddl: CockroachDDL,
	columnsForViews: ViewColumn[],
	casing: Casing,
) => {
	const tableFn = `cockroachTable`;
	for (const fk of ddl.fks.list()) {
		relations.add(`${fk.table}-${fk.tableTo}`);
	}

	const schemas = Object.fromEntries(
		ddl.schemas.list().filter((it) => it.name !== 'public').map((it) => {
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
			patched = importsPatch[patched] || patched;

			patched = patched.startsWith('varchar(') ? 'varchar' : patched;
			patched = patched.startsWith('character varying(') ? 'varchar' : patched;
			patched = patched.startsWith('character(') ? 'char' : patched;
			patched = patched.startsWith('char(') ? 'char' : patched;
			patched = patched.startsWith('decimal(') ? 'decimal' : patched;
			patched = patched.startsWith('time(') ? 'time' : patched;
			patched = patched.startsWith('timestamp(') ? 'timestamp' : patched;
			patched = patched.startsWith('vector(') ? 'vector' : patched;
			patched = patched.startsWith('geometry(') ? 'geometry' : patched;
			patched = patched.startsWith('interval') ? 'interval' : patched;

			if (cockroachImportsList.has(patched)) imports.add(patched);
		}

		if (x.entityType === 'sequences' && x.schema === 'public') imports.add('cockroachSequence');
		if (x.entityType === 'enums' && x.schema === 'public') imports.add('cockroachEnum');
		if (x.entityType === 'policies') imports.add('cockroachPolicy');
		if (x.entityType === 'roles') imports.add('cockroachRole');
	}

	const enumStatements = ddl.enums.list().map((it) => {
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

	const sequencesStatements = ddl.sequences.list().map((it) => {
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

	const schemaStatements = Object.entries(schemas).map((it) => {
		return `export const ${it[1]} = cockroachSchema("${it[0]}");\n`;
	}).join('');

	const rolesNameToTsKey: Record<string, string> = {};
	const rolesStatements = ddl.roles.list().map((it) => {
		const identifier = withCasing(it.name, casing);
		rolesNameToTsKey[it.name] = identifier;

		const params = !it.createDb && !it.createRole
			? ''
			: `${
				trimChar(`, { ${it.createDb ? `createDb: true,` : ''}${it.createRole ? ` createRole: true,` : ''}`, ',')
			}	}`;

		return `export const ${identifier} = cockroachRole("${it.name}", ${params});\n`;
	})
		.join('');

	const tableStatements = ddl.tables.list().map((it) => {
		const tableSchema = schemas[it.schema];
		const paramName = paramNameFor(it.name, tableSchema);
		const table = tableFromDDL(it, ddl);
		const columns = ddl.columns.list({ schema: table.schema, table: table.name });
		const fks = ddl.fks.list({ schema: table.schema, table: table.name });

		const func = tableSchema ? `${tableSchema}.table` : tableFn;
		let statement = `export const ${withCasing(paramName, casing)} = ${func}("${table.name}", {\n`;
		statement += createTableColumns(
			columns,
			table.pk,
			fks,
			enumTypes,
			schemas,
			casing,
		);
		statement += '}';

		// more than 2 fields or self reference or cyclic
		// Andrii: I switched this one off until we will get custom names in .references()
		const filteredFKs = table.fks.filter((it) => {
			return it.columns.length > 1 || isSelf(it);
		});

		const hasCallback = table.indexes.length > 0
			|| filteredFKs.length > 0
			|| table.policies.length > 0
			|| (table.pk && table.pk.columns.length > 1)
			|| table.checks.length > 0;

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
		statement += table.isRlsEnabled ? ').enableRLS();' : ');';
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

			const columns = createViewColumns(
				viewColumns,
				enumTypes,
				casing,
			);

			let statement = `export const ${withCasing(paramName, casing)} = ${func}("${it.name}", {${columns}})`;
			statement += `.as(${as});`;

			return statement;
		})
		.join('\n\n');

	const uniqueCockroachImports = [...imports];

	const importsTs = `import { ${
		uniqueCockroachImports.join(
			', ',
		)
	} } from "drizzle-orm/cockroach-core"
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

const mapDefault = (
	type: string,
	enumTypes: Set<string>,
	typeSchema: string,
	dimensions: number,
	def: Column['default'],
) => {
	if (!def) return '';

	const lowered = type.toLowerCase().replace('[]', '');

	if (enumTypes.has(`${typeSchema}.${type.replace('[]', '')}`)) {
		if (dimensions > 0) {
			const arr = parseArray(def.value);
			if (arr.flat(5).length === 0) return `.default([])`;
			const res = stringifyArray(arr, 'ts', (x) => `'${x.replaceAll("'", "\\'")}'`);
			return `.default(${res})`;
		}
		return `.default(${mapColumnDefault(def)})`;
	}

	const parsed = dimensions > 0 ? parseArray(def.value) : def.value;
	if (lowered === 'uuid') {
		if (def.value === 'gen_random_uuid()') return '.defaultRandom()';
		const res = stringifyArray(parsed, 'ts', (x) => {
			return `'${x}'`;
		});
		return `.default(${res})`;
	}

	if (lowered.startsWith('timestamp')) {
		if (def.value === 'now()') return '.defaultNow()';
		const res = stringifyArray(parsed, 'ts', (x) => {
			// Matches YYYY-MM-DD HH:MI:SS, YYYY-MM-DD HH:MI:SS.FFFFFF, YYYY-MM-DD HH:MI:SS+TZ, YYYY-MM-DD HH:MI:SS.FFFFFF+TZ and YYYY-MM-DD HH:MI:SS+HH:MI
			return /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d+)?([+-]\d{2}(:\d{2})?)?$/.test(x) ? `'${x}'` : `sql\`${x}\``;
		});

		return `.default(${res})`;
	}

	if (lowered.startsWith('time')) {
		if (def.value === 'now()') return '.defaultNow()';
		const res = stringifyArray(parsed, 'ts', (x) => {
			return /^\d{2}:\d{2}(:\d{2})?(\.\d+)?$/.test(x) ? `'${x}'` : `sql\`${x}\``; // Matches HH:MI, HH:MI:SS and HH:MI:SS.FFFFFF
		});

		return `.default(${res})`;
	}

	if (lowered === 'date') {
		if (def.value === 'now()') return '.defaultNow()';
		const res = stringifyArray(parsed, 'ts', (x) => {
			return /^\d{4}-\d{2}-\d{2}$/.test(x) ? `'${x}'` : `sql\`${x}\``; // Matches YYYY-MM-DD
		});
		return `.default(${res})`;
	}

	if (lowered === 'jsonb') {
		if (!def.value) return '';
		const res = stringifyArray(parsed, 'ts', (x) => {
			return String(x);
		});
		return `.default(${res})`;
	}

	const mapper = lowered === 'char'
			|| lowered === 'varchar'
			|| lowered === 'string'
			|| lowered === 'inet'
		? (x: string) => {
			x = x.replaceAll('\\', '\\\\');
			if (dimensions === 0) {
				return `\`${x.replaceAll('`', '\\`').replaceAll("''", "'")}\``;
			}

			return `\`${x.replaceAll('`', '\\`')}\``;
		}
		: lowered === 'int8'
		? (x: string) => {
			const value = Number(x);
			return value > Number.MAX_SAFE_INTEGER || value < Number.MIN_SAFE_INTEGER ? `${x}n` : `${x}`;
		}
		: lowered.startsWith('decimal')
		? (x: string) => {
			const value = Number(x);
			return value > Number.MAX_SAFE_INTEGER || value < Number.MIN_SAFE_INTEGER ? `${x}n` : `${x}`;
		}
		: lowered.startsWith('interval')
		? (x: string) => `'${x}'`
		: lowered.startsWith('boolean')
		? (x: string) => x === 't' || x === 'true' ? 'true' : 'false'
		: (x: string) => `${x}`;

	if (dimensions > 0) {
		const arr = parseArray(def.value);
		if (arr.flat(5).length === 0) return `.default([])`;

		const res = stringifyArray(arr, 'ts', (x) => {
			const res = mapper(x);
			return res;
		});
		return `.default(${res})`;
	}

	return `.default(${mapper(def.value)})`;
};

const column = (
	type: string,
	options: string | null,
	name: string,
	enumTypes: Set<string>,
	typeSchema: string,
	casing: Casing,
	def: Column['default'],
) => {
	const lowered = type.toLowerCase().replace('[]', '');

	if (enumTypes.has(`${typeSchema}.${type.replace('[]', '')}`)) {
		let out = `${withCasing(name, casing)}: ${withCasing(paramNameFor(type.replace('[]', ''), typeSchema), casing)}(${
			dbColumnName({ name, casing })
		})`;
		return out;
	}

	if (lowered.startsWith('int4')) {
		let out = `${withCasing(name, casing)}: int4(${dbColumnName({ name, casing })})`;
		return out;
	}

	if (lowered.startsWith('int2')) {
		let out = `${withCasing(name, casing)}: int2(${dbColumnName({ name, casing })})`;
		return out;
	}

	if (lowered.startsWith('int8')) {
		let out = `// You can use { mode: "bigint" } if numbers are exceeding js number limitations\n\t`;
		const mode = def && def.type === 'bigint' ? 'bigint' : 'number';
		out += `${withCasing(name, casing)}: int8(${dbColumnName({ name, casing, withMode: true })}{ mode: "${mode}" })`;
		return out;
	}

	if (lowered.startsWith('boolean')) {
		let out = `${withCasing(name, casing)}: boolean(${dbColumnName({ name, casing })})`;
		return out;
	}

	if (lowered === 'float') {
		let out = `${withCasing(name, casing)}: float(${dbColumnName({ name, casing })})`;
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

	if (lowered === 'decimal') {
		let params: { precision?: number; scale?: number; mode?: any } = {};

		if (options) {
			const [p, s] = options.split(',');
			if (p) params['precision'] = Number(p);
			if (s) params['scale'] = Number(s);
		}

		let mode = def !== null && def.type === 'bigint'
			? 'bigint'
			: def !== null && def.type === 'string'
			? 'string'
			: 'number';

		if (mode) params['mode'] = mode;

		let out = `// You can use { mode: "bigint" } if numbers are exceeding js number limitations\n\t`;
		out += Object.keys(params).length > 0
			? `${withCasing(name, casing)}: decimal(${dbColumnName({ name, casing, withMode: true })}${
				JSON.stringify(params)
			})`
			: `${withCasing(name, casing)}: decimal(${dbColumnName({ name, casing })})`;

		return out;
	}

	if (lowered.startsWith('timestamp')) {
		const withTimezone = lowered.includes('with time zone');

		const precision = options
			? Number(options)
			: null;

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

		let precision = options
			? Number(options)
			: null;

		const params = timeConfig({ precision, withTimezone });

		let out = params
			? `${withCasing(name, casing)}: time(${dbColumnName({ name, casing, withMode: true })}${params})`
			: `${withCasing(name, casing)}: time(${dbColumnName({ name, casing })})`;

		return out;
	}

	if (lowered.startsWith('interval')) {
		const suffix = options ? `(${options})` : '';
		const params = intervalConfig(`${lowered}${suffix}`);
		let out = options
			? `${withCasing(name, casing)}: interval(${dbColumnName({ name, casing, withMode: true })}${params})`
			: `${withCasing(name, casing)}: interval(${dbColumnName({ name, casing })})`;

		return out;
	}

	if (lowered === 'date') {
		let out = `${withCasing(name, casing)}: date(${dbColumnName({ name, casing })})`;

		return out;
	}

	if (lowered.startsWith('string')) {
		let out: string;
		if (options) { // size
			out = `${withCasing(name, casing)}: string(${
				dbColumnName({ name, casing, withMode: true })
			}{ length: ${options} })`;
		} else {
			out = `${withCasing(name, casing)}: string(${dbColumnName({ name, casing })})`;
		}
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

	if (lowered === 'varchar') {
		let out: string;
		if (options) { // size
			out = `${withCasing(name, casing)}: varchar(${
				dbColumnName({ name, casing, withMode: true })
			}{ length: ${options} })`;
		} else {
			out = `${withCasing(name, casing)}: varchar(${dbColumnName({ name, casing })})`;
		}

		return out;
	}

	if (lowered === 'geometry') {
		let out: string = '';

		let isGeoUnknown = false;

		if (lowered.length !== 8) {
			const geometryOptions = options ? options.split(',') : [];
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

	if (lowered === 'vector') {
		let out: string;
		if (options) {
			out = `${withCasing(name, casing)}: vector(${
				dbColumnName({ name, casing, withMode: true })
			}{ dimensions: ${options} })`;
		} else {
			out = `${withCasing(name, casing)}: vector(${dbColumnName({ name, casing })})`;
		}

		return out;
	}

	if (lowered === 'bit') {
		let out: string;
		if (options) {
			out = `${withCasing(name, casing)}: bit(${
				dbColumnName({ name, casing, withMode: true })
			}{ dimensions: ${options} })`;
		} else {
			out = `${withCasing(name, casing)}: bit(${dbColumnName({ name, casing })})`;
		}

		return out;
	}

	if (lowered === 'char') {
		let out: string;
		if (options) {
			out = `${withCasing(name, casing)}: char(${
				dbColumnName({ name, casing, withMode: true })
			}{ length: ${options} })`;
		} else {
			out = `${withCasing(name, casing)}: char(${dbColumnName({ name, casing })})`;
		}

		return out;
	}

	let unknown = `// TODO: failed to parse database type '${type}'\n`;
	unknown += `\t${withCasing(name, casing)}: unknown("${name}")`;
	return unknown;
};
const repeat = (it: string, times: number) => {
	return Array(times + 1).join(it);
};

const createViewColumns = (
	columns: ViewColumn[],
	enumTypes: Set<string>,
	casing: Casing,
) => {
	let statement = '';

	columns.forEach((it) => {
		const columnStatement = column(
			it.type,
			null,
			it.name,
			enumTypes,
			it.typeSchema ?? 'public',
			casing,
			null,
		);
		statement += '\t';
		statement += columnStatement;
		// Provide just this in column function
		statement += repeat('.array()', it.dimensions);
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

	const fkByColumnName = oneColumnsFKs.reduce((res, it) => {
		const arr = res[it.columns[0]] || [];
		arr.push(it);
		res[it.columns[0]] = arr;
		return res;
	}, {} as Record<string, ForeignKey[]>);

	columns.forEach((it) => {
		const columnStatement = column(
			it.type,
			it.options,
			it.name,
			enumTypes,
			it.typeSchema ?? 'public',
			casing,
			it.default,
		);
		const pk = primaryKey && primaryKey.columns.length === 1 && primaryKey.columns[0] === it.name
			? primaryKey
			: null;

		statement += '\t';
		statement += columnStatement;
		// Provide just this in column function
		statement += repeat('.array()', it.dimensions);
		statement += mapDefault(it.type, enumTypes, it.typeSchema ?? 'public', it.dimensions, it.default);
		statement += pk ? '.primaryKey()' : '';
		statement += it.notNull && !it.identity && !pk ? '.notNull()' : '';

		statement += it.identity ? generateIdentityParams(it) : '';

		statement += it.generated ? `.generatedAlwaysAs(sql\`${it.generated.as}\`)` : '';

		const fks = fkByColumnName[it.name];
		// Andrii: I switched it off until we will get a custom naem setting in references
		if (fks) {
			const fksStatement = fks
				.map((it) => {
					const onDelete = it.onDelete && it.onDelete !== 'NO ACTION' ? it.onDelete : null;
					const onUpdate = it.onUpdate && it.onUpdate !== 'NO ACTION' ? it.onUpdate : null;
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
	});

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
						return `sql\`${it.isExpression}\``;
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
			tuples.push([
				'to',
				`[${mappedItTo.map((x) => `${x}`).join(', ')}]`,
			]);
		}
		if (it.using !== null) tuples.push(['using', `sql\`${it.using}\``]);
		if (it.withCheck !== null) tuples.push(['withCheck', `sql\`${it.withCheck}\``]);
		const opts = tuples.length > 0 ? `, { ${tuples.map((x) => `${x[0]}: ${x[1]}`).join(', ')} }` : '';
		statement += `\tcockroachPolicy("${it.name}"${opts}),\n`;
	});

	return statement;
};

const createTableChecks = (
	checkConstraints: CheckConstraint[],
	casing: Casing,
) => {
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

		statement += it.onUpdate && it.onUpdate !== 'NO ACTION' ? `.onUpdate("${it.onUpdate}")` : '';
		statement += it.onDelete && it.onDelete !== 'NO ACTION' ? `.onDelete("${it.onDelete}")` : '';
		statement += `,\n`;
	});
	return statement;
};
