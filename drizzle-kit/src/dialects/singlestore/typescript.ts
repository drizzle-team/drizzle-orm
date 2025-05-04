/* eslint-disable @typescript-eslint/no-unsafe-argument */
import { toCamelCase } from 'drizzle-orm/casing';
import '../../@types/utils';
import { singlestoreTable } from 'drizzle-orm/singlestore-core';
import type { Casing } from '../../cli/validations/common';
import { assertUnreachable } from '../../global';
import { Column, Index, MysqlDDL, PrimaryKey } from '../mysql/ddl';
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
	ddl: MysqlDDL,
	casing: Casing,
) => {
	const withCasing = prepareCasing(casing);

	const imports = new Set<string>([
		'singlestoreTable',
		'singlestoreSchema',
		'AnySingleStoreColumn',
	]);
	for (const it of ddl.entities.list()) {
		if (it.entityType === 'indexes') imports.add(it.unique ? 'uniqueIndex' : 'index');
		if (it.entityType === 'pks' && it.columns.length > 1) imports.add('primaryKey');

		if (it.entityType === 'columns') {
			let patched = importsPatch[it.type] ?? it.type;
			patched = patched.startsWith('varchar(') ? 'varchar' : patched;
			patched = patched.startsWith('char(') ? 'char' : patched;
			patched = patched.startsWith('binary(') ? 'binary' : patched;
			patched = patched.startsWith('decimal(') ? 'decimal' : patched;
			patched = patched.startsWith('smallint(') ? 'smallint' : patched;
			patched = patched.startsWith('enum(') ? 'singlestoreEnum' : patched;
			patched = patched.startsWith('datetime(') ? 'datetime' : patched;
			patched = patched.startsWith('varbinary(') ? 'varbinary' : patched;
			patched = patched.startsWith('int(') ? 'int' : patched;
			patched = patched.startsWith('double(') ? 'double' : patched;
			patched = patched.startsWith('float(') ? 'float' : patched;
			patched = patched.startsWith('int unsigned') ? 'int' : patched;
			patched = patched.startsWith('tinyint(') ? 'tinyint' : patched;
			patched = patched.startsWith('mediumint(') ? 'mediumint' : patched;
			patched = patched.startsWith('bigint(') ? 'bigint' : patched;
			patched = patched.startsWith('tinyint unsigned') ? 'tinyint' : patched;
			patched = patched.startsWith('smallint unsigned') ? 'smallint' : patched;
			patched = patched.startsWith('mediumint unsigned') ? 'mediumint' : patched;
			patched = patched.startsWith('bigint unsigned') ? 'bigint' : patched;

			if (singlestoreImportsList.has(patched)) imports.add(patched);
		}
	}
	let tableStatements: string[] = [];
	for (const it of ddl.tables.list()) {
		const columns = ddl.columns.list({ table: it.name });
		const pk = ddl.pks.one({ table: it.name });

		let statement = `export const ${withCasing(it.name)} = singlestoreTable("${it.name}", {\n`;

		for (const it of columns) {
			const isPK = pk && pk.columns.length === 1 && !pk.nameExplicit && pk.columns[0] === it.name;

			statement += '\t';
			statement += column(it, withCasing, casing);
			statement += isPK ? '.primaryKey()' : '';
			statement += it.notNull && !isPK ? '.notNull()' : '';

			statement += it.generated
				? `.generatedAlwaysAs(sql\`${
					it.generated.as.replace(
						/`/g,
						'\\`',
					)
				}\`, { mode: "${it.generated.type}" })`
				: '';

			statement += ',\n';
		}
		statement += '}';

		const indexes = ddl.indexes.list();

		if (
			indexes.length > 0
			|| pk && (pk.columns.length > 1 || pk.nameExplicit)
		) {
			statement += ',\n';
			statement += '(table) => {\n';
			statement += '\treturn {\n';
			statement += pk ? createTablePK(pk, withCasing) : '';
			statement += createTableIndexes(Object.values(indexes), withCasing);
			statement += '\t}\n';
			statement += '}';
		}

		statement += ');';
		tableStatements.push(statement);
	}

	const importsTs = `import { ${
		[...imports].join(', ')
	} } from "drizzle-orm/singlestore-core"\nimport { sql } from "drizzle-orm"\n\n`;

	let decalrations = '';
	decalrations += tableStatements.join('\n\n');
	decalrations += '\n';
	/* decalrations += viewsStatements.join('\n\n'); */

	const file = importsTs + decalrations;

	const schemaEntry = `
    {
      ${
		Object.values(ddl.tables.list())
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

const mapColumnDefault = (it: NonNullable<Column['default']>) => {
	if (it.type === 'unknown') {
		return `sql\`${it.value}\``;
	}

	return it.value.replace("'", "\\'");
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
	column: Column,
	casing: (value: string) => string,
	rawCasing: Casing,
) => {
	const { type, name, default: defaultValue, autoIncrement, onUpdateNow } = column;
	let lowered = column.type;
	const key = casing(name);

	if (!type.startsWith('enum(')) {
		lowered = type.toLowerCase();
	}

	if (lowered === 'serial') {
		return `${key}: serial(${dbColumnName({ name, casing: rawCasing })})`;
	}

	if (lowered.startsWith('int')) {
		const isUnsigned = lowered.includes('unsigned');
		const columnName = dbColumnName({ name, casing: rawCasing, withMode: isUnsigned });
		let out = `${key}: int(${columnName}${isUnsigned ? `${columnName.length > 0 ? ', ' : ''}{ unsigned: true }` : ''})`;
		out += autoIncrement ? `.autoincrement()` : '';
		out += defaultValue
			? `.default(${mapColumnDefault(defaultValue)})`
			: '';
		return out;
	}

	if (lowered.startsWith('tinyint')) {
		const isUnsigned = lowered.includes('unsigned');
		const columnName = dbColumnName({ name, casing: rawCasing, withMode: isUnsigned });
		// let out = `${name.camelCase()}: tinyint("${name}")`;
		let out: string = `${key}: tinyint(${columnName}${
			isUnsigned ? `${columnName.length > 0 ? ', ' : ''}{ unsigned: true }` : ''
		})`;
		out += autoIncrement ? `.autoincrement()` : '';
		out += defaultValue
			? `.default(${mapColumnDefault(defaultValue)})`
			: '';
		return out;
	}

	if (lowered.startsWith('smallint')) {
		const isUnsigned = lowered.includes('unsigned');
		const columnName = dbColumnName({ name, casing: rawCasing, withMode: isUnsigned });
		let out = `${key}: smallint(${columnName}${
			isUnsigned ? `${columnName.length > 0 ? ', ' : ''}{ unsigned: true }` : ''
		})`;
		out += autoIncrement ? `.autoincrement()` : '';
		out += defaultValue
			? `.default(${mapColumnDefault(defaultValue)})`
			: '';
		return out;
	}

	if (lowered.startsWith('mediumint')) {
		const isUnsigned = lowered.includes('unsigned');
		const columnName = dbColumnName({ name, casing: rawCasing, withMode: isUnsigned });
		let out = `${key}: mediumint(${columnName}${
			isUnsigned ? `${columnName.length > 0 ? ', ' : ''}{ unsigned: true }` : ''
		})`;
		out += autoIncrement ? `.autoincrement()` : '';
		out += defaultValue
			? `.default(${mapColumnDefault(defaultValue)})`
			: '';
		return out;
	}

	if (lowered.startsWith('bigint')) {
		const isUnsigned = lowered.includes('unsigned');
		let out = `${key}: bigint(${dbColumnName({ name, casing: rawCasing, withMode: true })}{ mode: "number"${
			isUnsigned ? ', unsigned: true' : ''
		} })`;
		out += autoIncrement ? `.autoincrement()` : '';
		out += defaultValue
			? `.default(${mapColumnDefault(defaultValue)})`
			: '';
		return out;
	}

	if (lowered === 'boolean') {
		let out = `${key}: boolean(${dbColumnName({ name, casing: rawCasing })})`;
		out += defaultValue
			? `.default(${mapColumnDefault(defaultValue)})`
			: '';
		return out;
	}

	if (lowered.startsWith('double')) {
		let params:
			| { precision?: string; scale?: string; unsigned?: boolean }
			| undefined;

		if (lowered.length > (lowered.includes('unsigned') ? 15 : 6)) {
			const [precision, scale] = lowered
				.slice(7, lowered.length - (1 + (lowered.includes('unsigned') ? 9 : 0)))
				.split(',');
			params = { precision, scale };
		}

		if (lowered.includes('unsigned')) {
			params = { ...(params ?? {}), unsigned: true };
		}

		const timeConfigParams = params ? timeConfig(params) : undefined;

		let out = params
			? `${key}: double(${dbColumnName({ name, casing: rawCasing, withMode: timeConfigParams !== undefined })}${
				timeConfig(params)
			})`
			: `${key}: double(${dbColumnName({ name, casing: rawCasing })})`;

		// let out = `${name.camelCase()}: double("${name}")`;
		out += defaultValue
			? `.default(${mapColumnDefault(defaultValue)})`
			: '';
		return out;
	}

	if (lowered.startsWith('float')) {
		let params:
			| { precision?: string; scale?: string; unsigned?: boolean }
			| undefined;

		if (lowered.length > (lowered.includes('unsigned') ? 14 : 5)) {
			const [precision, scale] = lowered
				.slice(6, lowered.length - (1 + (lowered.includes('unsigned') ? 9 : 0)))
				.split(',');
			params = { precision, scale };
		}

		if (lowered.includes('unsigned')) {
			params = { ...(params ?? {}), unsigned: true };
		}

		let out = `${key}: float(${dbColumnName({ name, casing: rawCasing })}${params ? timeConfig(params) : ''})`;
		out += defaultValue
			? `.default(${mapColumnDefault(defaultValue)})`
			: '';
		return out;
	}

	if (lowered === 'real') {
		let out = `${key}: real(${dbColumnName({ name, casing: rawCasing })})`;
		out += defaultValue
			? `.default(${mapColumnDefault(defaultValue)})`
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
			? `${key}: timestamp(${dbColumnName({ name, casing: rawCasing, withMode: params !== undefined })}${params})`
			: `${key}: timestamp(${dbColumnName({ name, casing: rawCasing })})`;

		// singlestore has only CURRENT_TIMESTAMP, as I found from docs. But will leave now() for just a case
		out += defaultValue?.value === 'now()' || defaultValue?.value === 'CURRENT_TIMESTAMP'
			? '.defaultNow()'
			: defaultValue
			? `.default(${mapColumnDefault(defaultValue)})`
			: '';

		out += onUpdateNow ? '.onUpdateNow()' : '';

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
			? `${key}: time(${dbColumnName({ name, casing: rawCasing, withMode: params !== undefined })}${params})`
			: `${key}: time(${dbColumnName({ name, casing: rawCasing })})`;

		out += defaultValue?.value === 'now()'
			? '.defaultNow()'
			: defaultValue
			? `.default(${mapColumnDefault(defaultValue)})`
			: '';

		return out;
	}

	if (lowered === 'date') {
		let out = `// you can use { mode: 'date' }, if you want to have Date as type for this column\n\t${
			casing(
				name,
			)
		}: date(${dbColumnName({ name, casing: rawCasing, withMode: true })}{ mode: 'string' })`;

		out += defaultValue?.value === 'now()'
			? '.defaultNow()'
			: defaultValue
			? `.default(${mapColumnDefault(defaultValue)})`
			: '';

		return out;
	}

	// in singlestore text can't have default value. Will leave it in case smth ;)
	if (lowered === 'text') {
		let out = `${key}: text(${dbColumnName({ name, casing: rawCasing })})`;
		out += defaultValue
			? `.default(${mapColumnDefault(defaultValue)})`
			: '';
		return out;
	}

	// in singlestore text can't have default value. Will leave it in case smth ;)
	if (lowered === 'tinytext') {
		let out = `${key}: tinytext(${dbColumnName({ name, casing: rawCasing })})`;
		out += defaultValue
			? `.default(${mapColumnDefault(defaultValue)})`
			: '';
		return out;
	}

	// in singlestore text can't have default value. Will leave it in case smth ;)
	if (lowered === 'mediumtext') {
		let out = `${key}: mediumtext(${dbColumnName({ name, casing: rawCasing })})`;
		out += defaultValue
			? `.default(${mapColumnDefault(defaultValue)})`
			: '';
		return out;
	}

	// in singlestore text can't have default value. Will leave it in case smth ;)
	if (lowered === 'longtext') {
		let out = `${key}: longtext(${dbColumnName({ name, casing: rawCasing })})`;
		out += defaultValue
			? `.default(${mapColumnDefault(defaultValue)})`
			: '';
		return out;
	}

	if (lowered === 'year') {
		let out = `${key}: year(${dbColumnName({ name, casing: rawCasing })})`;
		out += defaultValue
			? `.default(${mapColumnDefault(defaultValue)})`
			: '';
		return out;
	}

	// in singlestore json can't have default value. Will leave it in case smth ;)
	if (lowered === 'json') {
		let out = `${key}: json(${dbColumnName({ name, casing: rawCasing })})`;

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
			? `.default(${mapColumnDefault(defaultValue)})`
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
			? `.default(${mapColumnDefault(defaultValue)})`
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
			: `${key}: datetime(${dbColumnName({ name, casing: rawCasing, withMode: true })}{ mode: 'string'})`;

		out += defaultValue?.value === 'now()'
			? '.defaultNow()'
			: defaultValue
			? `.default(${mapColumnDefault(defaultValue)})`
			: '';

		return out;
	}

	if (lowered.startsWith('decimal')) {
		let params:
			| { precision?: string; scale?: string; unsigned?: boolean }
			| undefined;

		if (lowered.length > (lowered.includes('unsigned') ? 16 : 7)) {
			const [precision, scale] = lowered
				.slice(8, lowered.length - (1 + (lowered.includes('unsigned') ? 9 : 0)))
				.split(',');
			params = { precision, scale };
		}

		if (lowered.includes('unsigned')) {
			params = { ...(params ?? {}), unsigned: true };
		}

		const timeConfigParams = params ? timeConfig(params) : undefined;

		let out = params
			? `${key}: decimal(${
				dbColumnName({ name, casing: rawCasing, withMode: timeConfigParams !== undefined })
			}${timeConfigParams})`
			: `${key}: decimal(${dbColumnName({ name, casing: rawCasing })})`;

		out += defaultValue
			? `.default(${mapColumnDefault(defaultValue)})`
			: '';

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
			? `${key}: binary(${dbColumnName({ name, casing: rawCasing, withMode: params !== undefined })}${params})`
			: `${key}: binary(${dbColumnName({ name, casing: rawCasing })})`;

		out += defaultValue
			? `.default(${mapColumnDefault(defaultValue)})`
			: '';
		return out;
	}

	if (lowered.startsWith('enum')) {
		const values = lowered.substring('enum'.length + 1, lowered.length - 1);
		let out = `${key}: singlestoreEnum(${dbColumnName({ name, casing: rawCasing, withMode: true })}[${values}])`;
		out += defaultValue
			? `.default(${mapColumnDefault(defaultValue)})`
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
			? `${key}: varbinary(${dbColumnName({ name, casing: rawCasing, withMode: params !== undefined })}${params})`
			: `${key}: varbinary(${dbColumnName({ name, casing: rawCasing })})`;

		out += defaultValue
			? `.default(${mapColumnDefault(defaultValue)})`
			: '';
		return out;
	}

	console.log('uknown', type);
	return `// Warning: Can't parse ${type} from database\n\t// ${type}Type: ${type}("${name}")`;
};

const createTableIndexes = (
	idxs: Index[],
	casing: (value: string) => string,
): string => {
	let statement = '';
	for (const it of idxs) {
		const columns = it.columns.filter((x) => !x.isExpression).map((it) => `table.${casing(it.value)}`).join(', ');
		statement += `\t\t${it.unique ? 'uniqueIndex(' : 'index('}`;
		statement += `"${it.name})"`;
		statement += `.on(${columns}),\n`;
	}
	return statement;
};

const createTablePK = (
	pk: PrimaryKey,
	casing: (value: string) => string,
): string => {
	const columns = pk.columns.map((c) => `table.${casing(c)}`);
	let statement = `\t\tprimaryKey({ columns: [${columns.join(',')}]`;
	statement += pk.name ? `, name: "${pk.name}" }` : ' }';
	statement += '),\n';
	return statement;
};
