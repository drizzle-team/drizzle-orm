import '../../@types/utils';
import { toCamelCase } from 'drizzle-orm/casing';
import { assertUnreachable } from 'src/utils';
import { Casing } from '../../cli/validations/common';
import {
	CheckConstraint,
	Column,
	DefaultConstraint,
	ForeignKey,
	fullTableFromDDL,
	Index,
	MssqlDDL,
	PrimaryKey,
	UniqueConstraint,
	ViewColumn,
} from './ddl';
import { typeFor } from './grammar';

const imports = [
	'bigint',
	'binary',
	'bit',
	'char',
	'nchar',
	'varchar',
	'nvarchar',
	'date',
	'datetime',
	'datetime2',
	'datetimeoffset',
	'decimal',
	'float',
	'int',
	'numeric',
	'real',
	'smallint',
	'text',
	'ntext',
	'json',
	'time',
	'tinyint',
	'varbinary',
	'tinyint',
] as const;
export type Import = (typeof imports)[number];

const mssqlImportsList = new Set([
	'mssqlTable',
	...imports,
]);

function inspect(it: any): string {
	if (!it) return '';

	const keys = Object.keys(it);
	if (keys.length === 0) return '{}';

	const pairs = keys.map((key) => {
		const formattedKey = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(key)
			? key
			: `'${key}'`;

		const value = it[key];
		const formattedValue = typeof value === 'string' ? `'${value}'` : String(value);

		return `${formattedKey}: ${formattedValue}`;
	});

	return `{ ${pairs.join(', ')} }`;
}

const objToStatement2 = (json: { [s: string]: unknown }, mode: 'string' | 'number' = 'string') => {
	json = Object.fromEntries(Object.entries(json).filter((it) => it[1]));

	const keys = Object.keys(json);
	if (keys.length === 0) return;

	let statement = '{ ';
	statement += keys.map((it) => `${it}: ${mode === 'string' ? `"${json[it]}"` : json[it]}`).join(', '); // no "" for keys
	statement += ' }';
	return statement;
};

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

function generateIdentityParams(column: Column) {
	if (column.identity === null) return '';
	const identity = column.identity;

	const tuples = [];
	if (identity.seed) {
		tuples.push(['seed', identity.seed]);
	}
	if (identity.increment) {
		tuples.push(['increment', identity.increment]);
	}

	const params = tuples.length > 0 ? `{ ${tuples.map((x) => `${x[0]}: ${x[1]}`).join(' ,')} }` : '';

	return `.identity(${params})`;
}

export const paramNameFor = (name: string, schema: string | null) => {
	const schemaSuffix = schema && schema !== 'dbo' ? `In${schema.capitalise()}` : '';
	return `${name}${schemaSuffix}`;
};

// prev: schemaToTypeScript
export const ddlToTypeScript = (
	ddl: MssqlDDL,
	columnsForViews: ViewColumn[],
	casing: Casing,
) => {
	const tableFn = `mssqlTable`;

	const schemas = Object.fromEntries(
		ddl.schemas.list().filter((it) => it.name !== 'dbo').map((it) => {
			return [it.name, withCasing(it.name, casing)];
		}),
	);

	const imports = new Set<string>();
	const vcs = columnsForViews.map((it) => ({ entityType: 'viewColumns' as const, ...it }));
	const entities = [...ddl.entities.list(), ...vcs];
	for (const x of entities) {
		if (x.entityType === 'schemas' && x.name !== 'dbo') imports.add('mssqlSchema');
		if (x.entityType === 'tables') imports.add(tableFn);

		if (x.entityType === 'indexes') {
			if (x.isUnique) imports.add('uniqueIndex');
			else imports.add('index');
		}

		if (x.entityType === 'fks') {
			imports.add('foreignKey');

			// if (isCyclic(x) && !isSelf(x)) imports.add('type AnyMssqlColumn');
		}
		if (x.entityType === 'pks') imports.add('primaryKey');
		if (x.entityType === 'uniques') imports.add('unique');
		if (x.entityType === 'checks') imports.add('check');
		if (x.entityType === 'views' && x.schema === 'dbo') {
			imports.add('mssqlView');
		}

		if (x.entityType === 'columns' || x.entityType === 'viewColumns') {
			let patched = x.type.replace('[]', '');

			patched = patched.startsWith('nvarchar(') ? 'nvarchar' : patched;
			patched = patched.startsWith('varchar(') ? 'varchar' : patched;
			patched = patched.startsWith('nchar(') ? 'nchar' : patched;
			patched = patched.startsWith('char(') ? 'char' : patched;
			patched = patched.startsWith('varbinary(') ? 'varbinary' : patched;
			patched = patched.startsWith('binary(') ? 'binary' : patched;
			patched = patched.startsWith('float(') ? 'float' : patched;
			patched = patched.startsWith('datetimeoffset(') ? 'datetimeOffset' : patched;
			patched = patched.startsWith('datetime2(') ? 'datetime2' : patched;
			patched = patched.startsWith('time(') ? 'time' : patched;
			patched = patched.startsWith('decimal(') ? 'decimal' : patched;
			patched = patched.startsWith('numeric(') ? 'numeric' : patched;

			if (mssqlImportsList.has(patched)) imports.add(patched);
		}
	}

	const schemaStatements = Object.entries(schemas).map((it) => {
		return `export const ${it[1]} = mssqlSchema("${it[0]}");\n`;
	}).join('');

	const tableStatements = ddl.tables.list().map((it) => {
		const tableSchema = schemas[it.schema];
		const paramName = paramNameFor(it.name, tableSchema);
		const table = fullTableFromDDL(it, ddl);
		const columns = ddl.columns.list({ schema: table.schema, table: table.name });
		const fks = ddl.fks.list({ schema: table.schema, table: table.name });

		const func = tableSchema ? `${tableSchema}.table` : tableFn;
		let statement = `export const ${withCasing(paramName, casing)} = ${func}("${table.name}", {\n`;
		statement += createTableColumns(
			columns,
			table.pk,
			fks,
			schemas,
			ddl.defaults.list({ schema: table.schema, table: table.name }),
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
			|| table.pk
			|| table.uniques.length > 0
			|| table.checks.length > 0;

		if (hasCallback) {
			statement += ', ';
			statement += '(table) => [\n';
			statement += table.pk ? createTablePK(table.pk, casing) : '';
			statement += createTableFKs(filteredFKs, schemas, casing);
			statement += createTableIndexes(table.name, table.indexes, casing);
			statement += createTableUniques(table.uniques, casing);
			statement += createTableChecks(table.checks);
			statement += ']';
		}

		statement += ');';
		return statement;
	});

	const viewsStatements = Object.values(ddl.views.list())
		.map((it) => {
			const viewSchema = schemas[it.schema];
			const paramName = paramNameFor(it.name, viewSchema);

			const func = it.schema !== 'dbo'
				? `${viewSchema}.view`
				: 'mssqlView';

			const as = `sql\`${it.definition}\``;

			const viewColumns = columnsForViews.filter((x) => x.schema === it.schema && x.view === it.name);

			const columns = createViewColumns(
				viewColumns,
				casing,
			);

			const viewOptions = {
				encryption: it.encryption,
				schemaBinding: it.schemaBinding,
				viewMetadata: it.viewMetadata,
				checkOption: it.checkOption,
			};

			let statement = `export const ${withCasing(paramName, casing)} = ${func}("${it.name}", {${columns}})`;
			statement += Object.keys(viewOptions).length > 0 ? `.with(${JSON.stringify(viewOptions)})` : '';
			statement += `.as(${as});`;

			return statement;
		})
		.join('\n\n');

	const uniqueMssqlImports = [...imports];

	const importsTs = `import { ${
		uniqueMssqlImports.join(
			', ',
		)
	} } from "drizzle-orm/mssql-core"
import { sql } from "drizzle-orm"\n\n`;

	let decalrations = schemaStatements;
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

// const isCyclic = (fk: ForeignKey) => {
// 	const key = `${fk.table}-${fk.tableTo}`;
// 	const reverse = `${fk.tableTo}-${fk.table}`;
// 	return relations.has(key) && relations.has(reverse);
// };

const isSelf = (fk: ForeignKey) => {
	return fk.table === fk.tableTo;
};

const mapDefault = (
	type: string,
	def: DefaultConstraint['default'],
) => {
	if (!def) return '';

	const lowered = type.toLowerCase();

	if (lowered === 'datetime' || lowered === 'datetime2') {
		return def.value === 'getdate()'
			? '.defaultGetDate()'
			: `.default('${def.value}')`;
	}

	if (lowered.startsWith('time')) {
		return def.value === 'getdate()'
			? '.defaultGetDate()'
			: /^\d{2}:\d{2}(:\d{2})?(\.\d+)?$/.test(def.value) // Matches HH:MI, HH:MI:SS and HH:MI:SS.FFFFFF
			? `.default('${def.value}')`
			: `.default(sql\`${def.value}\`)`;
	}

	if (lowered === 'datetimeoffset') {
		return def.value === 'getdate()'
			? '.defaultGetDate()'
			: `.default('${def.value}')`;
	}

	if (lowered === 'date') {
		return def.value === 'getdate()'
			? '.defaultGetDate()'
			: /^\d{4}-\d{2}-\d{2}$/.test(def.value) // Matches YYYY-MM-DD
			? `.default('${def.value}')`
			: `.default(sql\`${def.value}\`)`;
	}

	if (lowered === 'binary' || lowered === 'varbinary') {
		return `.default(sql\`${def.value}\`)`;
	}

	const mapper = lowered === 'char'
			|| lowered === 'nchar'
			|| lowered === 'varchar'
			|| lowered === 'nvarchar'
			|| lowered === 'text'
			|| lowered === 'ntext'
		? (x: string) => {
			return `\`${x.replaceAll('`', '\\`').replaceAll("''", "'")}\``;
		}
		: lowered === 'bigint'
		? (x: string) => {
			const value = Number(x);
			return value > Number.MAX_SAFE_INTEGER || value < Number.MIN_SAFE_INTEGER ? `${x}n` : `${x}`;
		}
		: lowered.startsWith('decimal') || lowered.startsWith('numeric')
		? (x: string) => {
			const value = Number(x);
			return value > Number.MAX_SAFE_INTEGER || value < Number.MIN_SAFE_INTEGER ? `${x}n` : `${x}`;
		}
		: lowered === 'bit'
		? (x: string) => {
			return x === '1' ? 'true' : 'false';
		}
		: (x: string) => `${x}`;

	return `.default(${mapper(def.value)})`;
};

const column = (
	type: string,
	options: string | null,
	name: string,
	casing: Casing,
	def: DefaultConstraint['default'],
) => {
	const lowered = type.toLowerCase();

	const grammarType = typeFor(lowered);
	if (grammarType) {
		const key = withCasing(name, casing);
		const columnName = dbColumnName({ name, casing });
		const { default: defToSet, options: optionsToSet, raw } = grammarType.toTs(options, def);
		const drizzleType = grammarType.drizzleImport();

		let res = `${key}: ${drizzleType}(${columnName}${inspect(optionsToSet)})`;
		res += defToSet
			? raw
				? defToSet
				: `.default(${defToSet})`
			: '';
		return res;
	}

	if (lowered.startsWith('bigint')) {
		const mode = def && def.type === 'bigint' ? 'bigint' : 'number';
		return `${withCasing(name, casing)}: bigint(${dbColumnName({ name, casing, withMode: true })}{ mode: "${mode}" })`;
	}

	if (lowered === 'binary') {
		let out: string;
		if (options) {
			out = `${withCasing(name, casing)}: binary(${
				dbColumnName({ name, casing, withMode: true })
			}{ length: ${options} })`;
		} else {
			out = `${withCasing(name, casing)}: binary(${dbColumnName({ name, casing })})`;
		}

		return out;
	}

	if (lowered.startsWith('bit')) {
		return `${withCasing(name, casing)}: bit(${dbColumnName({ name, casing })})`;
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

	if (lowered === 'nchar') {
		let out: string;
		if (options) {
			out = `${withCasing(name, casing)}: nchar(${
				dbColumnName({ name, casing, withMode: true })
			}{ length: ${options} })`;
		} else {
			out = `${withCasing(name, casing)}: nchar(${dbColumnName({ name, casing })})`;
		}

		return out;
	}

	if (lowered === 'varchar') {
		let out: string;
		if (options) {
			out = `${withCasing(name, casing)}: varchar(${
				dbColumnName({ name, casing, withMode: true })
			}{ length: ${options} })`;
		} else {
			out = `${withCasing(name, casing)}: varchar(${dbColumnName({ name, casing })})`;
		}

		return out;
	}

	if (lowered === 'nvarchar') {
		let out: string;
		if (options) {
			out = `${withCasing(name, casing)}: nvarchar(${
				dbColumnName({ name, casing, withMode: true })
			}{ length: ${options} })`;
		} else {
			out = `${withCasing(name, casing)}: nvarchar(${dbColumnName({ name, casing })})`;
		}

		return out;
	}

	if (lowered === 'datetime2') {
		const mode = JSON.stringify({ mode: 'string' });

		let out: string;
		if (options) {
			out = `${withCasing(name, casing)}: datetime2(${
				dbColumnName({ name, casing, withMode: true })
			}{ precision: ${options}, mode: "string" })`;
		} else {
			out = `${withCasing(name, casing)}: datetime2(${dbColumnName({ name, casing, withMode: true })}${mode})`;
		}

		return out;
	}

	if (lowered === 'datetimeoffset') {
		const mode = JSON.stringify({ mode: 'string' });

		let out: string;
		if (options) {
			out = `${withCasing(name, casing)}: datetimeoffset(${
				dbColumnName({ name, casing, withMode: true })
			}{ precision: ${options}, mode: "string" })`;
		} else {
			out = `${withCasing(name, casing)}: datetimeoffset(${dbColumnName({ name, casing, withMode: true })}${mode})`;
		}

		return out;
	}

	if (lowered === 'datetime') {
		const mode = JSON.stringify({ mode: 'string' });
		return `${withCasing(name, casing)}: datetime(${dbColumnName({ name, casing, withMode: true })}${mode})`;
	}

	if (lowered === 'date') {
		const mode = JSON.stringify({ mode: 'string' });
		let out = `${withCasing(name, casing)}: date(${dbColumnName({ name, casing, withMode: true })}${mode})`;
		return out;
	}

	if (lowered === 'float') {
		let params: { precision?: number } = {};

		if (options) {
			params['precision'] = Number(options);
		}

		let out = Object.keys(params).length > 0
			? `${withCasing(name, casing)}: float(${dbColumnName({ name, casing, withMode: true })}${JSON.stringify(params)})`
			: `${withCasing(name, casing)}: float(${dbColumnName({ name, casing })})`;

		return out;
	}

	if (lowered === 'int') {
		let out = `${withCasing(name, casing)}: int(${dbColumnName({ name, casing })})`;

		return out;
	}

	if (lowered.startsWith('decimal')) {
		let params: { precision?: number; scale?: number; mode?: any } = {};

		if (options) {
			const [p, s] = options.split(',');
			if (p) params['precision'] = Number(p);
			if (s) params['scale'] = Number(s);
		}

		let mode = def && def.type === 'bigint'
			? 'bigint'
			: def && def.type === 'string'
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

	if (lowered.startsWith('numeric')) {
		let params: { precision?: number; scale?: number; mode?: any } = {};

		if (options) {
			const [p, s] = options.split(',');
			if (p) params['precision'] = Number(p);
			if (s) params['scale'] = Number(s);
		}

		let mode = def && def.type === 'bigint'
			? 'bigint'
			: def && def.type === 'string'
			? 'string'
			: 'number';

		if (mode) params['mode'] = mode;

		let out = `// You can use { mode: "bigint" } if numbers are exceeding js number limitations\n\t`;
		out += Object.keys(params).length > 0
			? `${withCasing(name, casing)}: numeric(${dbColumnName({ name, casing, withMode: true })}${
				JSON.stringify(params)
			})`
			: `${withCasing(name, casing)}: numeric(${dbColumnName({ name, casing })})`;

		return out;
	}

	if (lowered.startsWith('real')) {
		let out = `${withCasing(name, casing)}: real(${dbColumnName({ name, casing })})`;
		return out;
	}

	if (lowered.startsWith('smallint')) {
		let out = `${withCasing(name, casing)}: smallint(${dbColumnName({ name, casing })})`;
		return out;
	}

	if (lowered === 'text') {
		let out = `${withCasing(name, casing)}: text(${dbColumnName({ name, casing })})`;
		return out;
	}

	if (lowered === 'ntext') {
		let out = `${withCasing(name, casing)}: ntext(${dbColumnName({ name, casing })})`;
		return out;
	}

	if (lowered === 'time') {
		let params: { precision?: number; mode?: any } = {};

		if (options) {
			params['precision'] = Number(options);
		}

		params['mode'] = 'string';

		let out = Object.keys(params).length > 0
			? `${withCasing(name, casing)}: time(${dbColumnName({ name, casing, withMode: true })}${JSON.stringify(params)})`
			: `${withCasing(name, casing)}: time(${dbColumnName({ name, casing })})`;

		return out;
	}

	if (lowered === 'tinyint') {
		let out = `${withCasing(name, casing)}: tinyint(${dbColumnName({ name, casing })})`;
		return out;
	}

	if (lowered === 'varbinary') {
		let out: string;
		if (options) {
			out = `${withCasing(name, casing)}: varbinary(${dbColumnName({ name, casing, withMode: true })}{ length: ${
				options === 'max' ? "'max'" : options
			} })`;
		} else {
			out = `${withCasing(name, casing)}: varbinary(${dbColumnName({ name, casing })})`;
		}

		return out;
	}

	let unknown = `// TODO: failed to parse database type '${type}'\n`;
	unknown += `\t${withCasing(name, casing)}: unknown("${name}")`;
	return unknown;
};

const createViewColumns = (
	columns: ViewColumn[],
	casing: Casing,
) => {
	let statement = '';

	columns.forEach((it) => {
		const columnStatement = column(
			it.type,
			null,
			it.name,
			casing,
			null,
		);
		statement += '\t';
		statement += columnStatement;
		// Provide just this in column function
		statement += it.notNull ? '.notNull()' : '';
		statement += ',\n';
	});
	return statement;
};

const createTableColumns = (
	columns: Column[],
	primaryKey: PrimaryKey | null,
	fks: ForeignKey[],
	schemas: Record<string, string>,
	defaults: DefaultConstraint[],
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
		const def = defaults.find((def) => def.column === it.name && def.schema === it.schema);

		const columnStatement = column(
			it.type,
			it.options,
			it.name,
			casing,
			def ? def.default : null,
		);
		const pk = primaryKey && primaryKey.columns.length === 1 && primaryKey.columns[0] === it.name
			? primaryKey
			: null;

		statement += '\t';
		statement += columnStatement;
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
					const params = { onDelete: onDelete?.toLowerCase(), onUpdate: onUpdate?.toLowerCase() };

					const paramsStr = objToStatement2(params);
					const tableSchema = schemas[it.schemaTo || ''];
					const paramName = paramNameFor(it.tableTo, tableSchema);
					if (paramsStr) {
						return `.references(() => ${
							withCasing(
								paramName,
								casing,
							)
						}.${withCasing(it.columnsTo[0], casing)}, ${paramsStr} )`;
					}
					return `.references(() => ${
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

		statement += `.on(${
			it.columns
				.map((it) => {
					return `table.${withCasing(it, casing)}`;
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

const createTableUniques = (
	unqs: UniqueConstraint[],
	casing: Casing,
): string => {
	let statement = '';

	unqs.forEach((it, index) => {
		statement += '\tunique(';
		statement += it.nameExplicit ? `"${it.name}")` : ')';
		statement += `.on(${it.columns.map((it) => `table.${withCasing(it, casing)}`).join(', ')})`;
		statement += index === unqs.length - 1 ? `\n` : ',\n';
	});

	return statement;
};

const createTableChecks = (
	checkConstraints: CheckConstraint[],
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
