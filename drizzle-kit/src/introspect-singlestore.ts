/* eslint-disable @typescript-eslint/no-unsafe-argument */
import './@types/utils';
import type { Casing } from './cli/validations/common';
import { Column, Index, PrimaryKey, SingleStoreSchemaInternal, UniqueConstraint } from './serializer/singlestoreSchema';
import { indexName } from './serializer/singlestoreSerializer';

// time precision to fsp
// {mode: "string"} for timestamp by default

const singlestoreImportsList = new Set([
	'singlestoreTable',
	'singlestoreEnum',
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
	// TODO: add new type BSON
	// TODO: add new type Blob
	// TODO: add new type UUID
	// TODO: add new type GUID
	// TODO: add new type Vector
	// TODO: add new type GeoPoint
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

const prepareCasing = (casing?: Casing) => (value: string) => {
	if (typeof casing === 'undefined') {
		return value;
	}
	if (casing === 'camel') {
		return value.camelCase();
	}

	return value;
};

export const schemaToTypeScript = (
	schema: SingleStoreSchemaInternal,
	casing: Casing,
) => {
	const withCasing = prepareCasing(casing);

	const imports = Object.values(schema.tables).reduce(
		(res, it) => {
			const idxImports = Object.values(it.indexes).map((idx) => idx.isUnique ? 'uniqueIndex' : 'index');
			const pkImports = Object.values(it.compositePrimaryKeys).map(
				(it) => 'primaryKey',
			);
			const uniqueImports = Object.values(it.uniqueConstraints).map(
				(it) => 'unique',
			);

			res.singlestore.push(...idxImports);
			res.singlestore.push(...pkImports);
			res.singlestore.push(...uniqueImports);

			const columnImports = Object.values(it.columns)
				.map((col) => {
					let patched = importsPatch[col.type] ?? col.type;
					patched = patched.startsWith('varchar(') ? 'varchar' : patched;
					patched = patched.startsWith('char(') ? 'char' : patched;
					patched = patched.startsWith('binary(') ? 'binary' : patched;
					patched = patched.startsWith('decimal(') ? 'decimal' : patched;
					patched = patched.startsWith('smallint(') ? 'smallint' : patched;
					patched = patched.startsWith('enum(') ? 'singlestoreEnum' : patched;
					patched = patched.startsWith('datetime(') ? 'datetime' : patched;
					patched = patched.startsWith('varbinary(') ? 'varbinary' : patched;
					patched = patched.startsWith('int(') ? 'int' : patched;
					return patched;
				})
				.filter((type) => {
					return singlestoreImportsList.has(type);
				});

			res.singlestore.push(...columnImports);
			return res;
		},
		{ singlestore: [] as string[] },
	);

	const tableStatements = Object.values(schema.tables).map((table) => {
		const func = 'singlestoreTable';
		let statement = '';
		if (imports.singlestore.includes(withCasing(table.name))) {
			statement = `// Table name is in conflict with ${
				withCasing(
					table.name,
				)
			} import.\n// Please change to any other name, that is not in imports list\n`;
		}
		statement += `export const ${withCasing(table.name)} = ${func}("${table.name}", {\n`;
		statement += createTableColumns(
			Object.values(table.columns),
			withCasing,
			table.name,
			schema,
		);
		statement += '}';

		if (
			Object.keys(table.indexes).length > 0
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

	const uniqueSingleStoreImports = [
		'singlestoreTable',
		'singlestoreSchema',
		'AnySingleStoreColumn',
		...new Set(imports.singlestore),
	];
	const importsTs = `import { ${
		uniqueSingleStoreImports.join(
			', ',
		)
	} } from "drizzle-orm/singlestore-core"\nimport { sql } from "drizzle-orm"\n\n`;

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
		return `${casing(name)}: serial("${name}")`;
	}

	if (lowered.startsWith('int')) {
		const isUnsigned = lowered.startsWith('int unsigned');
		let out = `${casing(name)}: int("${name}"${isUnsigned ? ', { unsigned: true }' : ''})`;
		out += autoincrement ? `.autoincrement()` : '';
		out += typeof defaultValue !== 'undefined'
			? `.default(${mapColumnDefault(defaultValue, isExpression)})`
			: '';
		return out;
	}

	if (lowered.startsWith('tinyint')) {
		const isUnsigned = lowered.startsWith('tinyint unsigned');
		// let out = `${name.camelCase()}: tinyint("${name}")`;
		let out: string = `${casing(name)}: tinyint("${name}"${isUnsigned ? ', { unsigned: true }' : ''})`;
		out += autoincrement ? `.autoincrement()` : '';
		out += typeof defaultValue !== 'undefined'
			? `.default(${mapColumnDefault(defaultValue, isExpression)})`
			: '';
		return out;
	}

	if (lowered.startsWith('smallint')) {
		const isUnsigned = lowered.startsWith('smallint unsigned');
		let out = `${casing(name)}: smallint("${name}"${isUnsigned ? ', { unsigned: true }' : ''})`;
		out += autoincrement ? `.autoincrement()` : '';
		out += defaultValue
			? `.default(${mapColumnDefault(defaultValue, isExpression)})`
			: '';
		return out;
	}

	if (lowered.startsWith('mediumint')) {
		const isUnsigned = lowered.startsWith('mediumint unsigned');
		let out = `${casing(name)}: mediumint("${name}"${isUnsigned ? ', { unsigned: true }' : ''})`;
		out += autoincrement ? `.autoincrement()` : '';
		out += defaultValue
			? `.default(${mapColumnDefault(defaultValue, isExpression)})`
			: '';
		return out;
	}

	if (lowered.startsWith('bigint')) {
		const isUnsigned = lowered.startsWith('bigint unsigned');
		let out = `${casing(name)}: bigint("${name}", { mode: "number"${isUnsigned ? ', unsigned: true' : ''} })`;
		out += autoincrement ? `.autoincrement()` : '';
		out += defaultValue
			? `.default(${mapColumnDefault(defaultValue, isExpression)})`
			: '';
		return out;
	}

	if (lowered === 'boolean') {
		let out = `${casing(name)}: boolean("${name}")`;
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

		let out = params
			? `${casing(name)}: double("${name}", ${timeConfig(params)})`
			: `${casing(name)}: double("${name}")`;

		// let out = `${name.camelCase()}: double("${name}")`;
		out += defaultValue
			? `.default(${mapColumnDefault(defaultValue, isExpression)})`
			: '';
		return out;
	}

	if (lowered === 'float') {
		let out = `${casing(name)}: float("${name}")`;
		out += defaultValue
			? `.default(${mapColumnDefault(defaultValue, isExpression)})`
			: '';
		return out;
	}

	if (lowered === 'real') {
		let out = `${casing(name)}: real("${name}")`;
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
			? `${casing(name)}: timestamp("${name}", ${params})`
			: `${casing(name)}: timestamp("${name}")`;

		// TODO: check if SingleStore has defaultNow() or now()
		defaultValue = defaultValue === 'now()' || defaultValue === '(CURRENT_TIMESTAMP)'
			? '.defaultNow()'
			: defaultValue
			? `.default(${mapColumnDefault(defaultValue, isExpression)})`
			: '';

		out += defaultValue;

		// TODO: check if SingleStore has onUpdateNow()
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
			? `${casing(name)}: time("${name}", ${params})`
			: `${casing(name)}: time("${name}")`;

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
		}: date("${name}", { mode: 'string' })`;

		defaultValue = defaultValue === 'now()'
			? '.defaultNow()'
			: defaultValue
			? `.default(${mapColumnDefault(defaultValue, isExpression)})`
			: '';

		out += defaultValue;
		return out;
	}

	// in mysql text can't have default value. Will leave it in case smth ;)
	// TODO: check if SingleStore has text can't have default value
	if (lowered === 'text') {
		let out = `${casing(name)}: text("${name}")`;
		out += defaultValue
			? `.default(${mapColumnDefault(defaultValue, isExpression)})`
			: '';
		return out;
	}

	// in mysql text can't have default value. Will leave it in case smth ;)
	// TODO: check if SingleStore has tinytext can't have default value
	if (lowered === 'tinytext') {
		let out = `${casing(name)}: tinytext("${name}")`;
		out += defaultValue
			? `.default(${mapColumnDefault(defaultValue, isExpression)})`
			: '';
		return out;
	}

	// in mysql text can't have default value. Will leave it in case smth ;)
	// TODO: check if SingleStore has mediumtext can't have default value
	if (lowered === 'mediumtext') {
		let out = `${casing(name)}: mediumtext("${name}")`;
		out += defaultValue
			? `.default(${mapColumnDefault(defaultValue, isExpression)})`
			: '';
		return out;
	}

	// in mysql text can't have default value. Will leave it in case smth ;)
	// TODO: check if SingleStore has longtext can't have default value
	if (lowered === 'longtext') {
		let out = `${casing(name)}: longtext("${name}")`;
		out += defaultValue
			? `.default(${mapColumnDefault(defaultValue, isExpression)})`
			: '';
		return out;
	}

	if (lowered === 'year') {
		let out = `${casing(name)}: year("${name}")`;
		out += defaultValue
			? `.default(${mapColumnDefault(defaultValue, isExpression)})`
			: '';
		return out;
	}

	// in mysql json can't have default value. Will leave it in case smth ;)
	// TODO: check if SingleStore has json can't have default value
	if (lowered === 'json') {
		let out = `${casing(name)}: json("${name}")`;

		out += defaultValue
			? `.default(${mapColumnDefaultForJson(defaultValue)})`
			: '';

		return out;
	}

	// TODO: add new type BSON

	// TODO: add new type Blob

	// TODO: add new type UUID

	// TODO: add new type GUID

	// TODO: add new type Vector

	// TODO: add new type GeoPoint

	if (lowered.startsWith('varchar')) {
		let out: string = `${
			casing(
				name,
			)
		}: varchar("${name}", { length: ${
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
		}: char("${name}", { length: ${
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
			}: datetime("${name}", { mode: 'string', fsp: ${
				lowered.substring(
					'datetime'.length + 1,
					lowered.length - 1,
				)
			} })`
			: `${casing(name)}: datetime("${name}", { mode: 'string'})`;

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

		let out = params
			? `${casing(name)}: decimal("${name}", ${timeConfig(params)})`
			: `${casing(name)}: decimal("${name}")`;

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
			? `${casing(name)}: binary("${name}", ${params})`
			: `${casing(name)}: binary("${name}")`;

		defaultValue = defaultValue
			? `.default(${mapColumnDefault(defaultValue, isExpression)})`
			: '';

		out += defaultValue;
		return out;
	}

	if (lowered.startsWith('enum')) {
		const values = lowered.substring('enum'.length + 1, lowered.length - 1);
		let out = `${casing(name)}: singlestoreEnum("${name}", [${values}])`;
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
			? `${casing(name)}: varbinary("${name}", ${params})`
			: `${casing(name)}: varbinary("${name}")`;

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
	casing: (val: string) => string,
	tableName: string,
	schema: SingleStoreSchemaInternal,
): string => {
	let statement = '';

	columns.forEach((it) => {
		statement += '\t';
		statement += column(
			it.type,
			it.name,
			casing,
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
