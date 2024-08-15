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
import { plural, singular } from 'pluralize';
import './@types/utils';
import { Casing } from './cli/validations/common';
import { vectorOps } from './extensions/vector';
import { assertUnreachable } from './global';
import {
	Column,
	ForeignKey,
	Index,
	PgKitInternals,
	PgSchemaInternal,
	PrimaryKey,
	UniqueConstraint,
} from './serializer/pgSchema';
import { indexName } from './serializer/pgSerializer';
import { isPgArrayType } from './utils';

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
	statement += keys
		.map((it: keyof typeof json) => `${it}: ${json[it]}`)
		.join(', ');
	statement += ' }';
	return statement;
};

const importsPatch = {
	'double precision': 'doublePrecision',
	'timestamp without time zone': 'timestamp',
	'timestamp with time zone': 'timestamp',
	'time without time zone': 'time',
	'time with time zone': 'time',
} as Record<string, string>;

const relations = new Set<string>();

const withCasing = (value: string, casing: Casing) => {
	if (casing === 'preserve') {
		return value;
	}
	if (casing === 'camel') {
		return value.camelCase();
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

	const relationsConfig = extractTablesRelationalConfig(
		relationalSchema,
		createTableRelationsHelpers,
	);

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
					relationsConfig.tableNamesMap[relation.referencedTableName].split(
						'.',
					)[1]
				}${
					typeof relation.relationName !== 'undefined'
						? `, { relationName: "${relation.relationName}"}`
						: ''
				}),`;
			}

			if (is(relation, One)) {
				hasOne = true;
				relationsObjAsStr += `\t\t${relation.fieldName}: one(${
					relationsConfig.tableNamesMap[relation.referencedTableName].split(
						'.',
					)[1]
				}, { fields: [${
					relation.config?.fields.map(
						(c) =>
							`${
								relationsConfig.tableNamesMap[
									getTableName(relation.sourceTable)
								].split('.')[1]
							}.${findColumnKey(relation.sourceTable, c.name)}`,
					)
				}], references: [${
					relation.config?.references.map(
						(c) =>
							`${
								relationsConfig.tableNamesMap[
									getTableName(relation.referencedTable)
								].split('.')[1]
							}.${findColumnKey(relation.referencedTable, c.name)}`,
					)
				}]${
					typeof relation.relationName !== 'undefined'
						? `, relationName: "${relation.relationName}"`
						: ''
				}}),`;
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

export const paramNameFor = (name: string, schema?: string) => {
	const schemaSuffix = schema && schema !== 'public' ? `In${schema.capitalise()}` : '';
	return `${name}${schemaSuffix}`;
};

export const schemaToTypeScript = (
	schema: PgSchemaInternal,
	casing: Casing,
) => {
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

	const enumTypes = new Set(Object.values(schema.enums).map((it) => it.name));

	const imports = Object.values(schema.tables).reduce(
		(res, it) => {
			const idxImports = Object.values(it.indexes).map((idx) => idx.isUnique ? 'uniqueIndex' : 'index');
			const fkImpots = Object.values(it.foreignKeys).map((it) => 'foreignKey');
			if (
				Object.values(it.foreignKeys).some((it) => isCyclic(it) && !isSelf(it))
			) {
				res.pg.push('type AnyPgColumn');
			}
			const pkImports = Object.values(it.compositePrimaryKeys).map(
				(it) => 'primaryKey',
			);
			const uniqueImports = Object.values(it.uniqueConstraints).map(
				(it) => 'unique',
			);

			if (it.schema && it.schema !== 'public' && it.schema !== '') {
				res.pg.push('pgSchema');
			}

			res.pg.push(...idxImports);
			res.pg.push(...fkImpots);
			res.pg.push(...pkImports);
			res.pg.push(...uniqueImports);

			if (enumTypes.size > 0) {
				res.pg.push('pgEnum');
			}

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

	const enumStatements = Object.values(schema.enums)
		.map((it) => {
			const enumSchema = schemas[it.schema];
			// const func = schema || schema === "public" ? "pgTable" : schema;
			const paramName = paramNameFor(it.name, enumSchema);

			const func = enumSchema ? `${enumSchema}.enum` : 'pgEnum';

			const values = Object.values(it.values)
				.map((it) => `'${it}'`)
				.join(', ');
			return `export const ${withCasing(paramName, casing)} = ${func}("${it.name}", [${values}])\n`;
		})
		.join('')
		.concat('\n');

	const schemaStatements = Object.entries(schemas)
		// .filter((it) => it[0] !== "public")
		.map((it) => {
			return `export const ${it[1]} = pgSchema("${it[0]}");\n`;
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
		const filteredFKs = Object.values(table.foreignKeys).filter((it) => {
			return it.columnsFrom.length > 1 || isSelf(it);
		});

		if (
			Object.keys(table.indexes).length > 0
			|| filteredFKs.length > 0
			|| Object.keys(table.compositePrimaryKeys).length > 0
			|| Object.keys(table.uniqueConstraints).length > 0
		) {
			statement += ',\n';
			statement += '(table) => {\n';
			statement += '\treturn {\n';
			statement += createTableIndexes(
				table.name,
				Object.values(table.indexes),
				casing,
			);
			statement += createTableFKs(Object.values(filteredFKs), schemas, casing);
			statement += createTablePKs(
				Object.values(table.compositePrimaryKeys),
				casing,
			);
			statement += createTableUniques(
				Object.values(table.uniqueConstraints),
				casing,
			);
			statement += '\t}\n';
			statement += '}';
		}

		statement += ');';
		return statement;
	});

	const uniquePgImports = ['pgTable', ...new Set(imports.pg)];

	const importsTs = `import { ${
		uniquePgImports.join(
			', ',
		)
	} } from "drizzle-orm/pg-core"
  import { sql } from "drizzle-orm"\n\n`;

	let decalrations = schemaStatements;
	decalrations += enumStatements;
	decalrations += '\n';
	decalrations += tableStatements.join('\n\n');

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

type ColumnMapperConfig = {
	sqlType: string;
	name: string;
	columnKey: string;
	defaultValue: any;
}

const stripCasting = (defaultValue: any, possibleCastings: string[]): any => {
	if (typeof defaultValue === 'undefined') {
		return undefined;
	}
	if (typeof defaultValue !== 'string') {
		return defaultValue;
	}

	const casting = possibleCastings.find((it) => defaultValue.includes(it));
	if (casting) {
		defaultValue = defaultValue.substring(
			0,
			defaultValue.indexOf(casting)
		);
		return defaultValue.startsWith('(') && defaultValue.endsWith(')') ? defaultValue.substring(1, defaultValue.length - 1) : defaultValue;
	}
	return defaultValue;
}

const buildDefaultValue = (defaultValue: any, isTSDefault: boolean) => {
	return typeof defaultValue === 'undefined' || defaultValue === null || (typeof defaultValue === 'string' && defaultValue.toLowerCase() === 'null')
		? ''
		: isTSDefault
			? `.default(${defaultValue})`
			: `.default(sql\`${defaultValue}\`)`;
}

const isIntStr = (defaultValue: any) => {
	return Number.isInteger(Number(defaultValue));
}

const isNumberStr = (defaultValue: any) => {
	return !Number.isNaN(Number(defaultValue));
}

const isBigIntStr = (defaultValue: any) => {
	try {
		BigInt(defaultValue);
		return true;
	} catch {
		return false;
	}
}

const isBoolStr = (defaultValue: any) => {
	if (typeof defaultValue !== 'string') return false;
	defaultValue = defaultValue.toLowerCase();
	return defaultValue === 'true' || defaultValue === 'false';
}

const isJsonStr = (defaultValue: any) => {
	try {
		JSON.parse(defaultValue);
		return true;
	} catch {
		return false;
	}
}

const columnMappers: Record<string, (config: ColumnMapperConfig) => string> = {
	serial: ({ name, columnKey }: ColumnMapperConfig) => {
		return `${columnKey}: serial("${name}")`;
	},

	smallserial: ({ name, columnKey }: ColumnMapperConfig) => {
		return `${columnKey}: smallserial("${name}")`;
	},

	bigserial: ({ name, columnKey }: ColumnMapperConfig) => {
		return `${columnKey}: bigserial("${name}", { mode: "bigint" })`;
	},

	integer: ({ name, columnKey, defaultValue }: ColumnMapperConfig) => {
		let out = `${columnKey}: integer("${name}")`;
		const tsDefault = typeof defaultValue === 'number' || isIntStr(defaultValue);
		if (tsDefault) {
			defaultValue = stripCasting(defaultValue, ['::integer', '::int', '::int4']);
		}
		out += buildDefaultValue(defaultValue, tsDefault);
		return out;
	},

	smallint: ({ name, columnKey, defaultValue }: ColumnMapperConfig) => {
		let out = `${columnKey}: smallint("${name}")`;
		const tsDefault = typeof defaultValue === 'number' || isIntStr(defaultValue);
		if (tsDefault) {
			defaultValue = stripCasting(defaultValue, ['::smallint', '::int2']);
		}
		out += buildDefaultValue(defaultValue, tsDefault);
		return out;
	},

	bigint: ({ name, columnKey, defaultValue }: ColumnMapperConfig) => {
		let out = `// You can use { mode: "bigint" } if numbers are exceeding js number limitations\n\t`;
		out += `${columnKey}: bigint("${name}", { mode: "number" })`;
		const tsDefault = typeof defaultValue === 'number' || typeof defaultValue === 'bigint' || isBigIntStr(defaultValue);
		if (tsDefault) {
			defaultValue = stripCasting(defaultValue, ['::bigint', '::int8']);
		}
		out += buildDefaultValue(
			defaultValue,
			tsDefault
		);
		return out;
	},

	boolean: ({ name, columnKey, defaultValue }: ColumnMapperConfig) => {
		let out = `${columnKey}: boolean("${name}")`;
		const tsDefault = typeof defaultValue === 'boolean' || isBoolStr(defaultValue);
		if (tsDefault) {
			defaultValue = stripCasting(defaultValue, ['::boolean']);
		}
		out += buildDefaultValue(
			defaultValue,
			tsDefault
		);
		return out;
	},

	'double precision': ({ name, columnKey, defaultValue }: ColumnMapperConfig) => {
		let out = `${columnKey}: doublePrecision("${name}")`;
		const tsDefault = typeof defaultValue === 'number' || isNumberStr(defaultValue);
		if (tsDefault) {
			defaultValue = stripCasting(defaultValue, ['::double precision', '::float8', '::float']);
		}
		out += buildDefaultValue(
			defaultValue,
			tsDefault
		);
		return out;
	},

	real: ({ name, columnKey, defaultValue }: ColumnMapperConfig) => {
		let out = `${columnKey}: real("${name}")`;
		const tsDefault = typeof defaultValue === 'number' || isNumberStr(defaultValue);
		if (tsDefault) {
			defaultValue = stripCasting(defaultValue, ['::real', '::float4']);
		}
		out += buildDefaultValue(
			defaultValue,
			tsDefault
		);
		return out;
	},

	uuid: ({ name, columnKey, defaultValue }: ColumnMapperConfig) => {
		let out = `${columnKey}: uuid("${name}")`;
		const tsDefault = typeof defaultValue === 'string' && defaultValue.startsWith('\'');
		if (tsDefault) {
			defaultValue = stripCasting(defaultValue, ['::uuid']);
		}
		out += defaultValue === 'gen_random_uuid()'
			? '.defaultRandom()'
			: buildDefaultValue(
				defaultValue,
				tsDefault
			);
		return out;
	},

	numeric: ({ name, columnKey, defaultValue, sqlType }: ColumnMapperConfig) => {
		let params:
			| { precision: string | undefined; scale: string | undefined }
			| undefined;

		if (sqlType.length > 7) {
			const [precision, scale] = sqlType
				.slice(8, sqlType.length - 1)
				.split(',');
			params = { precision, scale };
		}

		let out = params
			? `${columnKey}: numeric("${name}", ${timeConfig(params)})`
			: `${columnKey}: numeric("${name}")`;

		const isNumber = typeof defaultValue === 'number' || isNumberStr(defaultValue);
		const tsDefault = isNumber || (typeof defaultValue === 'string' && defaultValue.startsWith('\''));
		if (tsDefault) {
			defaultValue = stripCasting(defaultValue, ['::numeric']);
		}
		out += buildDefaultValue(
			isNumber ? `'${defaultValue}'` : defaultValue,
			tsDefault
		);

		return out;
	},

	timestamp: ({ name, columnKey, defaultValue, sqlType }: ColumnMapperConfig) => {
		const withTimezone = sqlType.includes('with time zone');
		let precision = sqlType.startsWith('timestamp(')
			? Number(
				sqlType
					.split(' ')[0]
					.substring('timestamp('.length, sqlType.split(' ')[0].length - 1),
			)
			: null;
		precision = precision ? precision : null;

		const params = timeConfig({
			precision,
			withTimezone,
			mode: "'string'",
		});

		let out = params
			? `${columnKey}: timestamp("${name}", ${params})`
			: `${columnKey}: timestamp("${name}")`;

		const tsDefault = typeof defaultValue === 'string' && defaultValue.startsWith('\'');
		if (tsDefault) {
			defaultValue = stripCasting(defaultValue, ['::timestamp', '::timestamptz', '::timestamp with time zone', '::timestampt without time zone']);
		}
		defaultValue = defaultValue === 'now()' || defaultValue === 'CURRENT_TIMESTAMP'
			? '.defaultNow()'
			: buildDefaultValue(
				defaultValue,
				tsDefault
			);

		out += defaultValue;
		return out;
	},

	time: ({ name, columnKey, defaultValue, sqlType }: ColumnMapperConfig) => {
		const withTimezone = sqlType.includes('with time zone');

		let precision = sqlType.startsWith('time(')
			? Number(
				sqlType
					.split(' ')[0]
					.substring('time('.length, sqlType.split(' ')[0].length - 1),
			)
			: null;
		precision = precision ? precision : null;

		const params = timeConfig({ precision, withTimezone });

		let out = params
			? `${columnKey}: time("${name}", ${params})`
			: `${columnKey}: time("${name}")`;

		const tsDefault = typeof defaultValue === 'string' && defaultValue.startsWith('\'');
		if (tsDefault) {
			defaultValue = stripCasting(defaultValue, ['::time', '::timetz', '::time with time zone', '::time without time zone']);
		}
		defaultValue = defaultValue === 'now()'
			? '.defaultNow()'
			: buildDefaultValue(
				defaultValue,
				tsDefault
			);

		out += defaultValue;
		return out;
	},

	interval: ({ name, columnKey, defaultValue, sqlType }: ColumnMapperConfig) => {
		const params = intervalConfig(sqlType);

		let out = params
			? `${columnKey}: interval("${name}", ${params})`
			: `${columnKey}: interval("${name}")`;

		const tsDefault = typeof defaultValue === 'string' && defaultValue.startsWith('\'');
		if (tsDefault) {
			defaultValue = stripCasting(defaultValue, ['::interval']);
		}
		out += buildDefaultValue(
			defaultValue,
			tsDefault
		);
		return out;
	},

	date: ({ name, columnKey, defaultValue }: ColumnMapperConfig) => {
		let out = `${columnKey}: date("${name}")`;

		const tsDefault = typeof defaultValue === 'string' && defaultValue.startsWith('\'');
		if (tsDefault) {
			defaultValue = stripCasting(defaultValue, ['::date']);
		}
		defaultValue = defaultValue === 'now()'
			? '.defaultNow()'
			: buildDefaultValue(
				defaultValue,
				tsDefault
			);

		out += defaultValue;
		return out;
	},

	text: ({ name, columnKey, defaultValue }: ColumnMapperConfig) => {
		let out = `${columnKey}: text("${name}")`;
		const tsDefault = typeof defaultValue === 'string' && defaultValue.startsWith('\'');
		if (tsDefault) {
			defaultValue = stripCasting(defaultValue, ['::text']);
		}
		out += buildDefaultValue(
			defaultValue,
			tsDefault
		);
		return out;
	},

	json: ({ name, columnKey, defaultValue }: ColumnMapperConfig) => {
		let out = `${columnKey}: json("${name}")`;
		const stripped = stripCasting(defaultValue, ['::json']);
		const jsonDefault = typeof stripped === 'string' ? stripped.substring(1, stripped.length - 1) : undefined;
		const tsDefault = isJsonStr(jsonDefault);
		out += buildDefaultValue(
			tsDefault ? jsonDefault : stripped,
			tsDefault
		);
		return out;
	},

	jsonb: ({ name, columnKey, defaultValue }: ColumnMapperConfig) => {
		let out = `${columnKey}: jsonb("${name}")`;
		const stripped = stripCasting(defaultValue, ['::jsonb']);
		const jsonDefault = typeof stripped === 'string' ? stripped.substring(1, stripped.length - 1) : undefined;
		const tsDefault = isJsonStr(jsonDefault);
		out += buildDefaultValue(
			tsDefault ? jsonDefault : stripped,
			tsDefault
		);
		return out;
	},

	inet: ({ name, columnKey, defaultValue }: ColumnMapperConfig) => {
		let out = `${columnKey}: inet("${name}")`;
		const tsDefault = typeof defaultValue === 'string' && defaultValue.startsWith('\'');
		if (tsDefault) {
			defaultValue = stripCasting(defaultValue, ['::inet']);
		}
		out += buildDefaultValue(
			defaultValue,
			tsDefault
		);
		return out;
	},

	cidr: ({ name, columnKey, defaultValue }: ColumnMapperConfig) => {
		let out = `${columnKey}: cidr("${name}")`;
		const tsDefault = typeof defaultValue === 'string' && defaultValue.startsWith('\'');
		if (tsDefault) {
			defaultValue = stripCasting(defaultValue, ['::cidr']);
		}
		out += buildDefaultValue(
			defaultValue,
			tsDefault
		);
		return out;
	},

	macaddr: ({ name, columnKey, defaultValue }: ColumnMapperConfig) => {
		let out = `${columnKey}: macaddr("${name}")`;
		const tsDefault = typeof defaultValue === 'string' && defaultValue.startsWith('\'');
		if (tsDefault) {
			defaultValue = stripCasting(defaultValue, ['::macaddr']);
		}
		out += buildDefaultValue(
			defaultValue,
			tsDefault
		);
		return out;
	},

	macaddr8: ({ name, columnKey, defaultValue }: ColumnMapperConfig) => {
		let out = `${columnKey}: macaddr8("${name}")`;
		const tsDefault = typeof defaultValue === 'string' && defaultValue.startsWith('\'');
		if (tsDefault) {
			defaultValue = stripCasting(defaultValue, ['::macaddr8']);
		}
		out += buildDefaultValue(
			defaultValue,
			tsDefault
		);
		return out;
	},

	varchar: ({ name, columnKey, defaultValue, sqlType }: ColumnMapperConfig) => {
		let out: string;
		if (sqlType.length !== 7) {
			out = `${columnKey}: varchar("${name}", { length: ${
				sqlType.substring(
					8,
					sqlType.length - 1,
				)
			} })`;
		} else {
			out = `${columnKey}: varchar("${name}")`;
		}

		const tsDefault = typeof defaultValue === 'string' && defaultValue.startsWith('\'');
		if (tsDefault) {
			defaultValue = stripCasting(defaultValue, ['::varchar', '::character varying']);
		}
		out += buildDefaultValue(
			defaultValue,
			tsDefault
		);
		return out;
	},

	point: ({ name, columnKey, defaultValue }: ColumnMapperConfig) => {
		let out: string = `${columnKey}: point("${name}")`;
		out += typeof defaultValue !== 'undefined' ? `.default(${defaultValue})` : '';
		defaultValue = stripCasting(defaultValue, ['::point']);
		out += buildDefaultValue(defaultValue, false);
		return out;
	},

	line: ({ name, columnKey, defaultValue }: ColumnMapperConfig) => {
		let out: string = `${columnKey}: point("${name}")`;
		defaultValue = stripCasting(defaultValue, ['::line']);
		out += buildDefaultValue(defaultValue, false);
		return out;
	},

	geometry: ({ name, columnKey, defaultValue, sqlType }: ColumnMapperConfig) => {
		let out: string = '';

		let isGeoUnknown = false;

		if (sqlType.length !== 8) {
			const geometryOptions = sqlType.slice(9, -1).split(',');
			if (geometryOptions.length === 1 && geometryOptions[0] !== '') {
				out = `${columnKey}: geometry("${name}", { type: "${geometryOptions[0]}" })`;
			} else if (geometryOptions.length === 2) {
				out = `${columnKey}: geometry("${name}", { type: "${geometryOptions[0]}", srid: ${
					geometryOptions[1]
				} })`;
			} else {
				isGeoUnknown = true;
			}
		} else {
			out = `${columnKey}: geometry("${name}")`;
		}

		defaultValue = stripCasting(defaultValue, ['::geometry']);
		out += buildDefaultValue(defaultValue, false);

		if (isGeoUnknown) {
			let unknown =
				`// TODO: failed to parse geometry type because found more than 2 options inside geometry function '${sqlType}'\n// Introspect is currently supporting only type and srid options\n`;
			unknown += `\t${columnKey}: unknown("${name}")`;
			return unknown;
		}
		return out;
	},

	vector: ({ name, columnKey, defaultValue, sqlType }: ColumnMapperConfig) => {
		let out: string;
		if (sqlType.length !== 6) {
			out = `${columnKey}: vector("${name}", { dimensions: ${
				sqlType.substring(
					7,
					sqlType.length - 1,
				)
			} })`;
		} else {
			out = `${columnKey}: vector("${name}")`;
		}

		defaultValue = stripCasting(defaultValue, ['::vector']);
		out += buildDefaultValue(defaultValue, false);
		return out;
	},

	char: ({ name, columnKey, defaultValue, sqlType }: ColumnMapperConfig) => {
		let out: string;
		if (sqlType.length !== 4) {
			out = `${columnKey}: char("${name}", { length: ${
				sqlType.substring(
					5,
					sqlType.length - 1,
				)
			} })`;
		} else {
			out = `${columnKey}: char("${name}")`;
		}

		const tsDefault = typeof defaultValue === 'string' && defaultValue.startsWith('\'');
		if (tsDefault) {
			defaultValue = stripCasting(defaultValue, ['::char', '::character', '::bpchar']);
		}
		out += buildDefaultValue(
			defaultValue,
			tsDefault
		);
		return out;
	},
};

const buildArrayDefault = (defaultValue: string, mapCallback: (value: string) => string): string => {
	defaultValue = defaultValue.substring(2, defaultValue.length - 2);
	return `[${
		defaultValue.startsWith('\'{')
			? buildArrayDefault(defaultValue, mapCallback)
			: defaultValue
				.split(/\s*,\s*/g)
				.map(mapCallback)
				.join(', ')
	}]`;
}

const column = (
	tableName: string,
	type: string,
	name: string,
	enumTypes: Set<string>,
	casing: Casing,
	defaultValue?: any,
	internals?: PgKitInternals,
) => {
	const lowered = type.toLowerCase();
	const typeName = lowered.split(/[\(\[]/)[0];
	let columnKey = withCasing(name, casing);

	if (/^(?![a-zA-Z_$][a-zA-Z0-9_$]*$).+$/.test(columnKey)) {
		columnKey = `"${columnKey}"`;
	}

	if (isPgArrayType(lowered)) {
		let out = '';

		if (Object.keys(columnMappers).includes(typeName)) {
			const mapper = columnMappers[typeName];
			out = `${
				mapper({ name, columnKey, defaultValue: undefined, sqlType: lowered.replace('[]', '') })
			}.array()`;
		} else {
			out = `${columnKey}: ${
				withCasing(
					typeName,
					casing,
				)
			}("${name}").array()`
		}

		if (typeof defaultValue !== 'undefined') {
			defaultValue = defaultValue.split('::')[0];
			let defaultValueStr = '';

			if (typeof defaultValue === 'string' && !(defaultValue.startsWith('{') || defaultValue.startsWith('\'{'))) {
				defaultValueStr = `sql\`${defaultValue}\``;
			} else if (['integer', 'smallint', 'bigint', 'double precision', 'real'].includes(typeName)) {
				defaultValueStr = buildArrayDefault(
					defaultValue,
					(value) => value
				);
			} else if (typeName === 'interval') {
				defaultValueStr = buildArrayDefault(
					defaultValue,
					(value) => value.replaceAll('"', '\'')
				);
			} else if (typeName === 'boolean') {
				defaultValueStr = buildArrayDefault(
					defaultValue,
					(value) => value === 't' ? 'true' : 'false'
				);
			} else if (['json', 'jsonb'].includes(typeName)) {
				defaultValueStr = buildArrayDefault(
					defaultValue,
					(value) => value
						.substring(1, value.length - 1)
						.replaceAll('\\', '')
				);
			} else {
				defaultValueStr = buildArrayDefault(
					defaultValue,
					(value) => `'${value}'`
				);
			}

			out += `.default(${defaultValueStr})`;
		}

		return out;
	} else if (Object.keys(columnMappers).includes(typeName)) {
		const mapper = columnMappers[typeName];
		return mapper({ name, defaultValue, columnKey, sqlType: lowered });
	} else if (enumTypes.has(typeName)) {
		let out = `${columnKey}: ${
			withCasing(
				type,
				casing,
			)
		}("${name}")`;
		defaultValue = stripCasting(defaultValue, [`::${typeName}`]);
		out += buildDefaultValue(
			defaultValue,
			typeof defaultValue === 'string' && defaultValue.startsWith('\'')
		);
		return out;
	}

	let unknown = `// TODO: failed to parse database type '${type}'\n`;
	unknown += `\t${columnKey}: unknown("${name}")`;
	return unknown;
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
			casing,
			it.default,
			internals,
		);
		statement += '\t';
		statement += columnStatement;
		statement += it.primaryKey ? '.primaryKey()' : '';
		statement += it.notNull && !it.identity ? '.notNull()' : '';

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

		statement += it.identity ? generateIdentityParams(it.identity) : '';

		statement += it.generated
			? `.generatedAlwaysAs(sql\`${it.generated.as}\`)`
			: '';

		const fks = fkByColumnName[it.name];
		if (fks) {
			const fksStatement = fks
				.map((it) => {
					const onDelete = it.onDelete && it.onDelete !== 'no action' ? it.onDelete : null;
					const onUpdate = it.onUpdate && it.onUpdate !== 'no action' ? it.onUpdate : null;
					const params = { onDelete, onUpdate };

					const typeSuffix = isCyclic(it) ? ': AnyPgColumn' : '';

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

const createTableIndexes = (
	tableName: string,
	idxs: Index[],
	casing: Casing,
): string => {
	let statement = '';

	idxs.forEach((it) => {
		// we have issue when index is called as table called
		let idxKey = it.name.startsWith(tableName) && it.name !== tableName
			? it.name.slice(tableName.length + 1)
			: it.name;
		idxKey = idxKey.endsWith('_index')
			? idxKey.slice(0, -'_index'.length) + '_idx'
			: idxKey;

		idxKey = withCasing(idxKey, casing);

		const indexGeneratedName = indexName(
			tableName,
			it.columns.map((it) => it.expression),
		);
		const escapedIndexName = indexGeneratedName === it.name ? '' : `"${it.name}"`;

		statement += `\t\t${idxKey}: `;
		statement += it.isUnique ? 'uniqueIndex(' : 'index(';
		statement += `${escapedIndexName})`;
		statement += `${it.concurrently ? `.concurrently()` : ''}`;

		statement += `.using("${it.method}", ${
			it.columns
				.map((it) => {
					if (it.isExpression) {
						return `sql\`${it.expression}\``;
					} else {
						return `table.${withCasing(it.expression, casing)}${
							it.opclass && vectorOps.includes(it.opclass)
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
			reversedString = reversedString.length > 1
				? reversedString.slice(0, reversedString.length - 1)
				: reversedString;
			return `${reversedString}}`;
		}

		statement += it.with && Object.keys(it.with).length > 0
			? `.with(${reverseLogic(it.with)})`
			: '';
		statement += `,\n`;
	});

	return statement;
};

const createTablePKs = (pks: PrimaryKey[], casing: Casing): string => {
	let statement = '';

	pks.forEach((it) => {
		let idxKey = withCasing(it.name, casing);

		statement += `\t\t${idxKey}: `;
		statement += 'primaryKey({ columns: [';
		statement += `${
			it.columns
				.map((c) => {
					return `table.${withCasing(c, casing)}`;
				})
				.join(', ')
		}]${it.name ? `, name: "${it.name}"` : ''}}`;
		statement += ')';
		statement += `,\n`;
	});

	return statement;
};

const createTableUniques = (
	unqs: UniqueConstraint[],
	casing: Casing,
): string => {
	let statement = '';

	unqs.forEach((it) => {
		const idxKey = withCasing(it.name, casing);

		statement += `\t\t${idxKey}: `;
		statement += 'unique(';
		statement += `"${it.name}")`;
		statement += `.on(${
			it.columns
				.map((it) => `table.${withCasing(it, casing)}`)
				.join(', ')
		})`;
		statement += it.nullsNotDistinct ? `.nullsNotDistinct()` : '';
		statement += `,\n`;
	});

	return statement;
};

const createTableFKs = (
	fks: ForeignKey[],
	schemas: Record<string, string>,
	casing: Casing,
): string => {
	let statement = '';

	fks.forEach((it) => {
		const tableSchema = schemas[it.schemaTo || ''];
		const paramName = paramNameFor(it.tableTo, tableSchema);

		const isSelf = it.tableTo === it.tableFrom;
		const tableTo = isSelf ? 'table' : `${withCasing(paramName, casing)}`;
		statement += `\t\t${withCasing(it.name, casing)}: foreignKey({\n`;
		statement += `\t\t\tcolumns: [${
			it.columnsFrom
				.map((i) => `table.${withCasing(i, casing)}`)
				.join(', ')
		}],\n`;
		statement += `\t\t\tforeignColumns: [${
			it.columnsTo
				.map((i) => `${tableTo}.${withCasing(i, casing)}`)
				.join(', ')
		}],\n`;
		statement += `\t\t\tname: "${it.name}"\n`;
		statement += `\t\t})`;

		statement += it.onUpdate && it.onUpdate !== 'no action'
			? `.onUpdate("${it.onUpdate}")`
			: '';

		statement += it.onDelete && it.onDelete !== 'no action'
			? `.onDelete("${it.onDelete}")`
			: '';

		statement += `,\n`;
	});

	return statement;
};
