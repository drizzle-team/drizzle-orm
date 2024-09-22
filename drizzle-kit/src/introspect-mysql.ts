/* eslint-disable @typescript-eslint/no-unsafe-argument */
import { toCamelCase } from 'drizzle-orm/casing';
import './@types/utils';
import type { Casing } from './cli/validations/common';
import { assertUnreachable } from './global';
import {
	Column,
	ForeignKey,
	Index,
	MySqlSchema,
	MySqlSchemaInternal,
	PrimaryKey,
	UniqueConstraint,
} from './serializer/mysqlSchema';
import { indexName } from './serializer/mysqlSerializer';

// time precision to fsp
// {mode: "string"} for timestamp by default

const mysqlImportsList = new Set([
	'mysqlTable',
	'mysqlEnum',
	'bigint',
	'binary',
	'boolean',
	'char',
	'date',
	'datetime',
	'decimal',
	'double',
	'float',
	'int',
	'json',
	'mediumint',
	'real',
	'serial',
	'smallint',
	'text',
	'tinytext',
	'mediumtext',
	'longtext',
	'time',
	'timestamp',
	'tinyint',
	'varbinary',
	'varchar',
	'year',
	'enum',
]);

const objToStatement = (json: any) => {
	json = Object.fromEntries(Object.entries(json).filter((it) => it[1]));

	const keys = Object.keys(json);
	if (keys.length === 0) return;

	let statement = '{ ';
	statement += keys.map((it) => `"${it}": "${json[it]}"`).join(', ');
	statement += ' }';
	return statement;
};

const objToStatement2 = (json: any) => {
	json = Object.fromEntries(Object.entries(json).filter((it) => it[1]));

	const keys = Object.keys(json);
	if (keys.length === 0) return;

	let statement = '{ ';
	statement += keys.map((it) => `${it}: "${json[it]}"`).join(', '); // no "" for keys
	statement += ' }';
	return statement;
};

const timeConfig = (json: any) => {
	json = Object.fromEntries(Object.entries(json).filter((it) => it[1]));

	const keys = Object.keys(json);
	if (keys.length === 0) return;

	let statement = '{ ';
	statement += keys.map((it) => `${it}: ${json[it]}`).join(', ');
	statement += ' }';
	return statement;
};

const binaryConfig = (json: any) => {
	json = Object.fromEntries(Object.entries(json).filter((it) => it[1]));

	const keys = Object.keys(json);
	if (keys.length === 0) return;

	let statement = '{ ';
	statement += keys.map((it) => `${it}: ${json[it]}`).join(', ');
	statement += ' }';
	return statement;
};

const importsPatch = {
	'double precision': 'doublePrecision',
	'timestamp without time zone': 'timestamp',
} as Record<string, string>;

const relations = new Set<string>();

const escapeColumnKey = (value: string) => {
	if (/^(?![a-zA-Z_$][a-zA-Z0-9_$]*$).+$/.test(value)) {
		return `"${value}"`;
	}
	return value;
};

const prepareCasing = (casing?: Casing) => (value: string) => {
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

export const schemaToTypeScript = (
	schema: MySqlSchemaInternal,
	casing: Casing,
) => {
	const withCasing = prepareCasing(casing);
	// collectFKs
	Object.values(schema.tables).forEach((table) => {
		Object.values(table.foreignKeys).forEach((fk) => {
			const relation = `${fk.tableFrom}-${fk.tableTo}`;
			relations.add(relation);
		});
	});

	const imports = Object.values(schema.tables).reduce(
		(res, it) => {
			const idxImports = Object.values(it.indexes).map((idx) => idx.isUnique ? 'uniqueIndex' : 'index');
			const fkImpots = Object.values(it.foreignKeys).map((it) => 'foreignKey');
			const pkImports = Object.values(it.compositePrimaryKeys).map(
				(it) => 'primaryKey',
			);
			const uniqueImports = Object.values(it.uniqueConstraints).map(
				(it) => 'unique',
			);

			res.mysql.push(...idxImports);
			res.mysql.push(...fkImpots);
			res.mysql.push(...pkImports);
			res.mysql.push(...uniqueImports);

			const columnImports = Object.values(it.columns)
				.map((col) => {
					let patched = importsPatch[col.type] ?? col.type;
					patched = patched.startsWith('varchar(') ? 'varchar' : patched;
					patched = patched.startsWith('char(') ? 'char' : patched;
					patched = patched.startsWith('binary(') ? 'binary' : patched;
					patched = patched.startsWith('decimal(') ? 'decimal' : patched;
					patched = patched.startsWith('smallint(') ? 'smallint' : patched;
					patched = patched.startsWith('enum(') ? 'mysqlEnum' : patched;
					patched = patched.startsWith('datetime(') ? 'datetime' : patched;
					patched = patched.startsWith('varbinary(') ? 'varbinary' : patched;
					patched = patched.startsWith('int(') ? 'int' : patched;
					patched = patched.startsWith('double(') ? 'double' : patched;
					return patched;
				})
				.filter((type) => {
					return mysqlImportsList.has(type);
				});

			res.mysql.push(...columnImports);
			return res;
		},
		{ mysql: [] as string[] },
	);

	const tableStatements = Object.values(schema.tables).map((table) => {
		const func = 'mysqlTable';
		let statement = '';
		if (imports.mysql.includes(withCasing(table.name))) {
			statement = `// Table name is in conflict with ${
				withCasing(
					table.name,
				)
			} import.\n// Please change to any other name, that is not in imports list\n`;
		}
		statement += `export const ${withCasing(table.name)} = ${func}("${table.name}", {\n`;
		statement += createTableColumns(
			Object.values(table.columns),
			Object.values(table.foreignKeys),
			withCasing,
			casing,
			table.name,
			schema,
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
				withCasing,
			);
			statement += createTableFKs(Object.values(filteredFKs), withCasing);
			statement += createTablePKs(
				Object.values(table.compositePrimaryKeys),
				withCasing,
			);
			statement += createTableUniques(
				Object.values(table.uniqueConstraints),
				withCasing,
			);
			statement += '\t}\n';
			statement += '}';
		}

		statement += ');';
		return statement;
	});

	const uniqueMySqlImports = [
		'mysqlTable',
		'mysqlSchema',
		'AnyMySqlColumn',
		...new Set(imports.mysql),
	];
	const importsTs = `import { ${
		uniqueMySqlImports.join(
			', ',
		)
	} } from "drizzle-orm/mysql-core"\nimport { sql } from "drizzle-orm"\n\n`;

	let decalrations = '';
	decalrations += tableStatements.join('\n\n');

	const file = importsTs + decalrations;

	const schemaEntry = `
    {
      ${
		Object.values(schema.tables)
			.map((it) => withCasing(it.name))
			.join(',')
	}
    }
  `;

	return {
		file, // backward compatible, print to file
		imports: importsTs,
		decalrations,
		schemaEntry,
	};
};

const isCyclic = (fk: ForeignKey) => {
	const key = `${fk.tableFrom}-${fk.tableTo}`;
	const reverse = `${fk.tableTo}-${fk.tableFrom}`;
	return relations.has(key) && relations.has(reverse);
};

const isSelf = (fk: ForeignKey) => {
	return fk.tableFrom === fk.tableTo;
};

const mapColumnDefault = (defaultValue: any, isExpression?: boolean) => {
	if (isExpression) {
		return `sql\`${defaultValue}\``;
	}

	return defaultValue;
};

const mapColumnDefaultForJson = (defaultValue: any) => {
	if (
		typeof defaultValue === 'string'
		&& defaultValue.startsWith("('")
		&& defaultValue.endsWith("')")
	) {
		return defaultValue.substring(2, defaultValue.length - 2);
	}

	return defaultValue;
};

const column = (
	type: string,
	name: string,
	casing: (value: string) => string,
	rawCasing: Casing,
	defaultValue?: any,
	autoincrement?: boolean,
	onUpdate?: boolean,
	isExpression?: boolean,
) => {
	let lowered = type;
	if (!type.startsWith('enum(')) {
		lowered = type.toLowerCase();
	}

	if (lowered === 'serial') {
		return `${casing(name)}: serial(${dbColumnName({ name, casing: rawCasing })})`;
	}

	if (lowered.startsWith('int')) {
		const isUnsigned = lowered.startsWith('int unsigned');
		let out = `${casing(name)}: int(${dbColumnName({ name, casing: rawCasing, withMode: isUnsigned })}${
			isUnsigned ? '{ unsigned: true }' : ''
		})`;
		out += autoincrement ? `.autoincrement()` : '';
		out += typeof defaultValue !== 'undefined'
			? `.default(${mapColumnDefault(defaultValue, isExpression)})`
			: '';
		return out;
	}

	if (lowered.startsWith('tinyint')) {
		const isUnsigned = lowered.startsWith('tinyint unsigned');
		// let out = `${name.camelCase()}: tinyint("${name}")`;
		let out: string = `${casing(name)}: tinyint(${dbColumnName({ name, casing: rawCasing, withMode: isUnsigned })}${
			isUnsigned ? ', { unsigned: true }' : ''
		})`;
		out += autoincrement ? `.autoincrement()` : '';
		out += typeof defaultValue !== 'undefined'
			? `.default(${mapColumnDefault(defaultValue, isExpression)})`
			: '';
		return out;
	}

	if (lowered.startsWith('smallint')) {
		const isUnsigned = lowered.startsWith('smallint unsigned');
		let out = `${casing(name)}: smallint(${dbColumnName({ name, casing: rawCasing, withMode: isUnsigned })}${
			isUnsigned ? ', { unsigned: true }' : ''
		})`;
		out += autoincrement ? `.autoincrement()` : '';
		out += defaultValue
			? `.default(${mapColumnDefault(defaultValue, isExpression)})`
			: '';
		return out;
	}

	if (lowered.startsWith('mediumint')) {
		const isUnsigned = lowered.startsWith('mediumint unsigned');
		let out = `${casing(name)}: mediumint(${dbColumnName({ name, casing: rawCasing, withMode: isUnsigned })}${
			isUnsigned ? ', { unsigned: true }' : ''
		})`;
		out += autoincrement ? `.autoincrement()` : '';
		out += defaultValue
			? `.default(${mapColumnDefault(defaultValue, isExpression)})`
			: '';
		return out;
	}

	if (lowered.startsWith('bigint')) {
		const isUnsigned = lowered.startsWith('bigint unsigned');
		let out = `${casing(name)}: bigint(${dbColumnName({ name, casing: rawCasing, withMode: true })}{ mode: "number"${
			isUnsigned ? ', unsigned: true' : ''
		} })`;
		out += autoincrement ? `.autoincrement()` : '';
		out += defaultValue
			? `.default(${mapColumnDefault(defaultValue, isExpression)})`
			: '';
		return out;
	}

	if (lowered === 'boolean') {
		let out = `${casing(name)}: boolean(${dbColumnName({ name, casing: rawCasing })})`;
		out += defaultValue
			? `.default(${mapColumnDefault(defaultValue, isExpression)})`
			: '';
		return out;
	}

	if (lowered.startsWith('double')) {
		let params:
			| { precision: string | undefined; scale: string | undefined }
			| undefined;

		if (lowered.length > 6) {
			const [precision, scale] = lowered
				.slice(7, lowered.length - 1)
				.split(',');
			params = { precision, scale };
		}

		const timeConfigParams = params ? timeConfig(params) : undefined;

		let out = params
			? `${casing(name)}: double(${
				dbColumnName({ name, casing: rawCasing, withMode: timeConfigParams !== undefined })
			}${timeConfig(params)})`
			: `${casing(name)}: double(${dbColumnName({ name, casing: rawCasing })})`;

		// let out = `${name.camelCase()}: double("${name}")`;
		out += defaultValue
			? `.default(${mapColumnDefault(defaultValue, isExpression)})`
			: '';
		return out;
	}

	if (lowered === 'float') {
		let out = `${casing(name)}: float(${dbColumnName({ name, casing: rawCasing })})`;
		out += defaultValue
			? `.default(${mapColumnDefault(defaultValue, isExpression)})`
			: '';
		return out;
	}

	if (lowered === 'real') {
		let out = `${casing(name)}: real(${dbColumnName({ name, casing: rawCasing })})`;
		out += defaultValue
			? `.default(${mapColumnDefault(defaultValue, isExpression)})`
			: '';
		return out;
	}

	if (lowered.startsWith('timestamp')) {
		const keyLength = 'timestamp'.length + 1;
		let fsp = lowered.length > keyLength
			? Number(lowered.substring(keyLength, lowered.length - 1))
			: null;
		fsp = fsp ? fsp : null;

		const params = timeConfig({ fsp, mode: "'string'" });

		let out = params
			? `${casing(name)}: timestamp(${
				dbColumnName({ name, casing: rawCasing, withMode: params !== undefined })
			}${params})`
			: `${casing(name)}: timestamp(${dbColumnName({ name, casing: rawCasing })})`;

		// mysql has only CURRENT_TIMESTAMP, as I found from docs. But will leave now() for just a case
		defaultValue = defaultValue === 'now()' || defaultValue === '(CURRENT_TIMESTAMP)'
			? '.defaultNow()'
			: defaultValue
			? `.default(${mapColumnDefault(defaultValue, isExpression)})`
			: '';

		out += defaultValue;

		let onUpdateNow = onUpdate ? '.onUpdateNow()' : '';
		out += onUpdateNow;

		return out;
	}

	if (lowered.startsWith('time')) {
		const keyLength = 'time'.length + 1;
		let fsp = lowered.length > keyLength
			? Number(lowered.substring(keyLength, lowered.length - 1))
			: null;
		fsp = fsp ? fsp : null;

		const params = timeConfig({ fsp });

		let out = params
			? `${casing(name)}: time(${dbColumnName({ name, casing: rawCasing, withMode: params !== undefined })}${params})`
			: `${casing(name)}: time(${dbColumnName({ name, casing: rawCasing })})`;

		defaultValue = defaultValue === 'now()'
			? '.defaultNow()'
			: defaultValue
			? `.default(${mapColumnDefault(defaultValue, isExpression)})`
			: '';

		out += defaultValue;
		return out;
	}

	if (lowered === 'date') {
		let out = `// you can use { mode: 'date' }, if you want to have Date as type for this column\n\t${
			casing(
				name,
			)
		}: date(${dbColumnName({ name, casing: rawCasing, withMode: true })}{ mode: 'string' })`;

		defaultValue = defaultValue === 'now()'
			? '.defaultNow()'
			: defaultValue
			? `.default(${mapColumnDefault(defaultValue, isExpression)})`
			: '';

		out += defaultValue;
		return out;
	}

	// in mysql text can't have default value. Will leave it in case smth ;)
	if (lowered === 'text') {
		let out = `${casing(name)}: text(${dbColumnName({ name, casing: rawCasing })})`;
		out += defaultValue
			? `.default(${mapColumnDefault(defaultValue, isExpression)})`
			: '';
		return out;
	}

	// in mysql text can't have default value. Will leave it in case smth ;)
	if (lowered === 'tinytext') {
		let out = `${casing(name)}: tinytext(${dbColumnName({ name, casing: rawCasing })})`;
		out += defaultValue
			? `.default(${mapColumnDefault(defaultValue, isExpression)})`
			: '';
		return out;
	}

	// in mysql text can't have default value. Will leave it in case smth ;)
	if (lowered === 'mediumtext') {
		let out = `${casing(name)}: mediumtext(${dbColumnName({ name, casing: rawCasing })})`;
		out += defaultValue
			? `.default(${mapColumnDefault(defaultValue, isExpression)})`
			: '';
		return out;
	}

	// in mysql text can't have default value. Will leave it in case smth ;)
	if (lowered === 'longtext') {
		let out = `${casing(name)}: longtext(${dbColumnName({ name, casing: rawCasing })})`;
		out += defaultValue
			? `.default(${mapColumnDefault(defaultValue, isExpression)})`
			: '';
		return out;
	}

	if (lowered === 'year') {
		let out = `${casing(name)}: year(${dbColumnName({ name, casing: rawCasing })})`;
		out += defaultValue
			? `.default(${mapColumnDefault(defaultValue, isExpression)})`
			: '';
		return out;
	}

	// in mysql json can't have default value. Will leave it in case smth ;)
	if (lowered === 'json') {
		let out = `${casing(name)}: json(${dbColumnName({ name, casing: rawCasing })})`;

		out += defaultValue
			? `.default(${mapColumnDefaultForJson(defaultValue)})`
			: '';

		return out;
	}

	if (lowered.startsWith('varchar')) {
		let out: string = `${
			casing(
				name,
			)
		}: varchar(${dbColumnName({ name, casing: rawCasing, withMode: true })}{ length: ${
			lowered.substring(
				'varchar'.length + 1,
				lowered.length - 1,
			)
		} })`;

		out += defaultValue
			? `.default(${mapColumnDefault(defaultValue, isExpression)})`
			: '';
		return out;
	}

	if (lowered.startsWith('char')) {
		let out: string = `${
			casing(
				name,
			)
		}: char(${dbColumnName({ name, casing: rawCasing, withMode: true })}{ length: ${
			lowered.substring(
				'char'.length + 1,
				lowered.length - 1,
			)
		} })`;

		out += defaultValue
			? `.default(${mapColumnDefault(defaultValue, isExpression)})`
			: '';
		return out;
	}

	if (lowered.startsWith('datetime')) {
		let out = `// you can use { mode: 'date' }, if you want to have Date as type for this column\n\t`;

		const fsp = lowered.startsWith('datetime(')
			? lowered.substring('datetime'.length + 1, lowered.length - 1)
			: undefined;

		out = fsp
			? `${
				casing(
					name,
				)
			}: datetime(${dbColumnName({ name, casing: rawCasing, withMode: true })}{ mode: 'string', fsp: ${
				lowered.substring(
					'datetime'.length + 1,
					lowered.length - 1,
				)
			} })`
			: `${casing(name)}: datetime(${dbColumnName({ name, casing: rawCasing, withMode: true })}{ mode: 'string'})`;

		defaultValue = defaultValue === 'now()'
			? '.defaultNow()'
			: defaultValue
			? `.default(${mapColumnDefault(defaultValue, isExpression)})`
			: '';

		out += defaultValue;
		return out;
	}

	if (lowered.startsWith('decimal')) {
		let params:
			| { precision: string | undefined; scale: string | undefined }
			| undefined;

		if (lowered.length > 7) {
			const [precision, scale] = lowered
				.slice(8, lowered.length - 1)
				.split(',');
			params = { precision, scale };
		}

		const timeConfigParams = params ? timeConfig(params) : undefined;

		let out = params
			? `${casing(name)}: decimal(${
				dbColumnName({ name, casing: rawCasing, withMode: timeConfigParams !== undefined })
			}${timeConfigParams})`
			: `${casing(name)}: decimal(${dbColumnName({ name, casing: rawCasing })})`;

		defaultValue = typeof defaultValue !== 'undefined'
			? `.default(${mapColumnDefault(defaultValue, isExpression)})`
			: '';

		out += defaultValue;
		return out;
	}

	if (lowered.startsWith('binary')) {
		const keyLength = 'binary'.length + 1;
		let length = lowered.length > keyLength
			? Number(lowered.substring(keyLength, lowered.length - 1))
			: null;
		length = length ? length : null;

		const params = binaryConfig({ length });

		let out = params
			? `${casing(name)}: binary(${dbColumnName({ name, casing: rawCasing, withMode: params !== undefined })}${params})`
			: `${casing(name)}: binary(${dbColumnName({ name, casing: rawCasing })})`;

		defaultValue = defaultValue
			? `.default(${mapColumnDefault(defaultValue, isExpression)})`
			: '';

		out += defaultValue;
		return out;
	}

	if (lowered.startsWith('enum')) {
		const values = lowered.substring('enum'.length + 1, lowered.length - 1);
		let out = `${casing(name)}: mysqlEnum(${dbColumnName({ name, casing: rawCasing, withMode: true })}[${values}])`;
		out += defaultValue
			? `.default(${mapColumnDefault(defaultValue, isExpression)})`
			: '';
		return out;
	}

	if (lowered.startsWith('varbinary')) {
		const keyLength = 'varbinary'.length + 1;
		let length = lowered.length > keyLength
			? Number(lowered.substring(keyLength, lowered.length - 1))
			: null;
		length = length ? length : null;

		const params = binaryConfig({ length });

		let out = params
			? `${casing(name)}: varbinary(${
				dbColumnName({ name, casing: rawCasing, withMode: params !== undefined })
			}${params})`
			: `${casing(name)}: varbinary(${dbColumnName({ name, casing: rawCasing })})`;

		defaultValue = defaultValue
			? `.default(${mapColumnDefault(defaultValue, isExpression)})`
			: '';

		out += defaultValue;
		return out;
	}

	console.log('uknown', type);
	return `// Warning: Can't parse ${type} from database\n\t// ${type}Type: ${type}("${name}")`;
};

const createTableColumns = (
	columns: Column[],
	fks: ForeignKey[],
	casing: (val: string) => string,
	rawCasing: Casing,
	tableName: string,
	schema: MySqlSchemaInternal,
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
		statement += '\t';
		statement += column(
			it.type,
			it.name,
			casing,
			rawCasing,
			it.default,
			it.autoincrement,
			it.onUpdate,
			schema.internal?.tables![tableName]?.columns[it.name]
				?.isDefaultAnExpression ?? false,
		);
		statement += it.primaryKey ? '.primaryKey()' : '';
		statement += it.notNull ? '.notNull()' : '';

		statement += it.generated
			? `.generatedAlwaysAs(sql\`${
				it.generated.as.replace(
					/`/g,
					'\\`',
				)
			}\`, { mode: "${it.generated.type}" })`
			: '';

		const fks = fkByColumnName[it.name];
		if (fks) {
			const fksStatement = fks
				.map((it) => {
					const onDelete = it.onDelete && it.onDelete !== 'no action' ? it.onDelete : null;
					const onUpdate = it.onUpdate && it.onUpdate !== 'no action' ? it.onUpdate : null;
					const params = { onDelete, onUpdate };

					const typeSuffix = isCyclic(it) ? ': AnyMySqlColumn' : '';

					const paramsStr = objToStatement2(params);
					if (paramsStr) {
						return `.references(()${typeSuffix} => ${
							casing(
								it.tableTo,
							)
						}.${casing(it.columnsTo[0])}, ${paramsStr} )`;
					}
					return `.references(()${typeSuffix} => ${casing(it.tableTo)}.${
						casing(
							it.columnsTo[0],
						)
					})`;
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
	casing: (value: string) => string,
): string => {
	let statement = '';

	idxs.forEach((it) => {
		let idxKey = it.name.startsWith(tableName) && it.name !== tableName
			? it.name.slice(tableName.length + 1)
			: it.name;
		idxKey = idxKey.endsWith('_index')
			? idxKey.slice(0, -'_index'.length) + '_idx'
			: idxKey;

		idxKey = casing(idxKey);

		const indexGeneratedName = indexName(tableName, it.columns);
		const escapedIndexName = indexGeneratedName === it.name ? '' : `"${it.name}"`;

		statement += `\t\t${idxKey}: `;
		statement += it.isUnique ? 'uniqueIndex(' : 'index(';
		statement += `${escapedIndexName})`;
		statement += `.on(${
			it.columns
				.map((it) => `table.${casing(it)}`)
				.join(', ')
		}),`;
		statement += `\n`;
	});

	return statement;
};

const createTableUniques = (
	unqs: UniqueConstraint[],
	casing: (value: string) => string,
): string => {
	let statement = '';

	unqs.forEach((it) => {
		const idxKey = casing(it.name);

		statement += `\t\t${idxKey}: `;
		statement += 'unique(';
		statement += `"${it.name}")`;
		statement += `.on(${
			it.columns
				.map((it) => `table.${casing(it)}`)
				.join(', ')
		}),`;
		statement += `\n`;
	});

	return statement;
};

const createTablePKs = (
	pks: PrimaryKey[],
	casing: (value: string) => string,
): string => {
	let statement = '';

	pks.forEach((it) => {
		let idxKey = casing(it.name);

		statement += `\t\t${idxKey}: `;
		statement += 'primaryKey({ columns: [';
		statement += `${
			it.columns
				.map((c) => {
					return `table.${casing(c)}`;
				})
				.join(', ')
		}]${it.name ? `, name: "${it.name}"` : ''}}`;
		statement += '),';
		statement += `\n`;
	});

	return statement;
};

const createTableFKs = (
	fks: ForeignKey[],
	casing: (value: string) => string,
): string => {
	let statement = '';

	fks.forEach((it) => {
		const isSelf = it.tableTo === it.tableFrom;
		const tableTo = isSelf ? 'table' : `${casing(it.tableTo)}`;
		statement += `\t\t${casing(it.name)}: foreignKey({\n`;
		statement += `\t\t\tcolumns: [${
			it.columnsFrom
				.map((i) => `table.${casing(i)}`)
				.join(', ')
		}],\n`;
		statement += `\t\t\tforeignColumns: [${
			it.columnsTo
				.map((i) => `${tableTo}.${casing(i)}`)
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
