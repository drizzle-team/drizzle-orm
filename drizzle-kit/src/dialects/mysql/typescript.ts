/* eslint-disable @typescript-eslint/no-unsafe-argument */
import { toCamelCase } from 'drizzle-orm/casing';
import { Casing } from 'src/cli/validations/common';
import { unescapeSingleQuotes } from 'src/utils';
import { assertUnreachable } from '../../utils';
import { CheckConstraint, Column, ForeignKey, Index, MysqlDDL, PrimaryKey, ViewColumn } from './ddl';
import { parseEnum, typeFor } from './grammar';

export const imports = [
	'boolean',
	'tinyint',
	'smallint',
	'mediumint',
	'int',
	'bigint',
	'binary',
	'char',
	'date',
	'datetime',
	'decimal',
	'double',
	'float',
	'json',
	'real',
	'serial',
	'text',
	'tinytext',
	'mediumtext',
	'longtext',
	'time',
	'timestamp',
	'varbinary',
	'varchar',
	'year',
	'enum',
] as const;
export type Import = typeof imports[number];

const mysqlImportsList = new Set([
	'mysqlTable',
	'mysqlEnum',
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

export const ddlToTypeScript = (
	ddl: MysqlDDL,
	viewColumns: ViewColumn[],
	casing: Casing,
) => {
	const withCasing = prepareCasing(casing);

	for (const fk of ddl.fks.list()) {
		const relation = `${fk.table}-${fk.tableTo}`;
		relations.add(relation);
	}

	const imports = new Set<string>([
		'mysqlTable',
		'mysqlSchema',
		'AnyMySqlColumn',
	]);

	const viewEntities = viewColumns.map((it) => {
		return {
			entityType: 'viewColumn',
			...it,
		} as const;
	});
	for (const it of [...ddl.entities.list(), ...viewEntities]) {
		if (it.entityType === 'indexes') imports.add(it.isUnique ? 'uniqueIndex' : 'index');
		if (it.entityType === 'fks') imports.add('foreignKey');
		if (it.entityType === 'pks' && (it.columns.length > 1 || it.nameExplicit)) imports.add('primaryKey');
		if (it.entityType === 'checks') imports.add('check');
		if (it.entityType === 'views') imports.add('mysqlView');

		if (it.entityType === 'columns' || it.entityType === 'viewColumn') {
			let patched = it.type;
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
			patched = patched.startsWith('double unsigned') ? 'double' : patched;
			patched = patched.startsWith('float(') ? 'float' : patched;
			patched = patched.startsWith('float unsigned') ? 'float' : patched;
			patched = patched.startsWith('int unsigned') ? 'int' : patched;
			patched = patched === 'tinyint(1)' ? 'boolean' : patched;
			patched = patched.startsWith('tinyint(') ? 'tinyint' : patched;
			patched = patched.startsWith('tinyint unsigned') ? 'tinyint' : patched;
			patched = patched.startsWith('smallint unsigned') ? 'smallint' : patched;
			patched = patched.startsWith('mediumint unsigned') ? 'mediumint' : patched;
			patched = patched.startsWith('bigint unsigned') ? 'bigint' : patched;
			patched = patched.startsWith('time(') ? 'time' : patched;
			patched = patched.startsWith('timestamp(') ? 'timestamp' : patched;

			if (mysqlImportsList.has(patched)) imports.add(patched);
		}
	}

	const tableStatements = [] as string[];
	for (const table of ddl.tables.list()) {
		let statement = `export const ${withCasing(table.name)} = mysqlTable("${table.name}", {\n`;
		statement += createTableColumns(
			ddl.columns.list({ table: table.name }),
			ddl.pks.one({ table: table.name }),
			ddl.fks.list({ table: table.name }),
			withCasing,
			casing,
		);
		statement += '}';

		const fks = ddl.fks.list({ table: table.name });
		const indexes = ddl.indexes.list({ table: table.name });
		const checks = ddl.checks.list({ table: table.name });
		const pk = ddl.pks.one({ table: table.name });

		// more than 2 fields or self reference or cyclic
		const filteredFKs = fks.filter((it) => {
			return it.columns.length > 1 || isSelf(it) || isCyclic(it);
		});

		const hasIndexes = indexes.length > 0;
		const hasFKs = filteredFKs.length > 0;
		const hasPK = pk && pk.columns.length > 1;
		const hasChecks = checks.length > 0;
		const hasCallbackParams = hasIndexes || hasFKs || hasPK || hasChecks;

		if (hasCallbackParams) {
			statement += ',\n';
			statement += '(table) => [\n';
			statement += hasPK ? createTablePK(pk, withCasing) : '';
			statement += createTableIndexes(indexes, withCasing);
			statement += createTableFKs(filteredFKs, withCasing);
			statement += createTableChecks(checks);
			statement += ']';
		}

		statement += ');';

		tableStatements.push(statement);
	}

	const viewsStatements = [] as string[];
	for (const view of ddl.views.list()) {
		const { name, algorithm, definition, sqlSecurity, withCheckOption } = view;
		const columns = viewColumns.filter((x) => x.view === view.name);

		let statement = '';
		statement += `export const ${withCasing(name)} = mysqlView("${name}", {\n`;
		statement += createViewColumns(columns, withCasing, casing);
		statement += '})';

		statement += algorithm ? `.algorithm("${algorithm}")` : '';
		statement += sqlSecurity ? `.sqlSecurity("${sqlSecurity}")` : '';
		statement += withCheckOption ? `.withCheckOption("${withCheckOption}")` : '';
		statement += `.as(sql\`${definition?.replaceAll('`', '\\`')}\`);`;

		viewsStatements.push(statement);
	}

	const importsTs = `import { ${
		[...imports].join(
			', ',
		)
	} } from "drizzle-orm/mysql-core"\nimport { sql } from "drizzle-orm"\n\n`;

	let decalrations = '';
	decalrations += tableStatements.join('\n\n');
	decalrations += '\n';
	decalrations += viewsStatements.join('\n\n');

	const file = importsTs + decalrations;

	const schemaEntry = `
    {
      ${
		Object.values(ddl.tables)
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
	const key = `${fk.table}-${fk.tableTo}`;
	const reverse = `${fk.tableTo}-${fk.table}`;
	return relations.has(key) && relations.has(reverse);
};

const isSelf = (fk: ForeignKey) => {
	return fk.table === fk.tableTo;
};

const mapColumnDefault = (type: string, it: NonNullable<Column['default']>) => {
	if (it.type === 'unknown') {
		return `sql\`${it.value}\``;
	}

	if (it.type === 'json') {
		return it.value;
	}

	if (it.type === 'bigint') {
		return `${it.value}n`;
	}
	if (it.type === 'number' || it.type === 'boolean') {
		return it.value;
	}

	return `"${it.value.replace(/'/g, "\\'").replaceAll('"', '\\"')}"`;
};

const column = (
	type: string,
	name: string,
	casing: (value: string) => string,
	rawCasing: Casing,
	defaultValue: Column['default'],
	autoincrement: boolean,
	onUpdate: boolean,
) => {
	let lowered = type.startsWith('enum(') ? type : type.toLowerCase();

	const grammarType = typeFor(lowered);
	if (grammarType) {
		const key = casing(name);
		const columnName = dbColumnName({ name, casing: rawCasing });
		const { default: def, options } = grammarType.toTs(lowered, defaultValue);
		const drizzleType = grammarType.drizzleImport();

		let res = `${key}: ${drizzleType}(${columnName}${inspect(options)})`;
		res += autoincrement ? `.autoincrement()` : '';
		res += def ? `.default(${def})` : '';
		return res;
	}

	if (lowered === 'serial') {
		return `${casing(name)}: serial(${dbColumnName({ name, casing: rawCasing })})`;
	}

	if (lowered.startsWith('int')) {
		const isUnsigned = lowered.startsWith('int unsigned');
		const columnName = dbColumnName({ name, casing: rawCasing, withMode: isUnsigned });
		let out = `${casing(name)}: int(${columnName}${isUnsigned ? '{ unsigned: true }' : ''})`;
		out += autoincrement ? `.autoincrement()` : '';
		out += defaultValue
			? `.default(${mapColumnDefault(lowered, defaultValue)})`
			: '';
		return out;
	}

	if (lowered.startsWith('tinyint') && lowered !== 'tinyint(1)') {
		const isUnsigned = lowered.startsWith('tinyint unsigned');
		const columnName = dbColumnName({ name, casing: rawCasing, withMode: isUnsigned });
		// let out = `${name.camelCase()}: tinyint("${name}")`;
		let out: string = `${casing(name)}: tinyint(${columnName}${isUnsigned ? '{ unsigned: true }' : ''})`;
		out += autoincrement ? `.autoincrement()` : '';
		out += defaultValue ? `.default(${mapColumnDefault(lowered, defaultValue)})` : '';
		return out;
	}

	if (lowered.startsWith('smallint')) {
		const isUnsigned = lowered.startsWith('smallint unsigned');
		const columnName = dbColumnName({ name, casing: rawCasing, withMode: isUnsigned });
		let out = `${casing(name)}: smallint(${columnName}${isUnsigned ? '{ unsigned: true }' : ''})`;
		out += autoincrement ? `.autoincrement()` : '';
		out += defaultValue ? `.default(${mapColumnDefault(lowered, defaultValue)})` : '';
		return out;
	}

	if (lowered.startsWith('mediumint')) {
		const isUnsigned = lowered.startsWith('mediumint unsigned');
		const columnName = dbColumnName({ name, casing: rawCasing, withMode: isUnsigned });
		let out = `${casing(name)}: mediumint(${columnName}${isUnsigned ? '{ unsigned: true }' : ''})`;
		out += autoincrement ? `.autoincrement()` : '';
		out += defaultValue ? `.default(${mapColumnDefault(lowered, defaultValue)})` : '';
		return out;
	}

	if (lowered.startsWith('bigint')) {
		const isUnsigned = lowered.startsWith('bigint unsigned');
		let out = `${casing(name)}: bigint(${dbColumnName({ name, casing: rawCasing, withMode: true })}{ mode: "number"${
			isUnsigned ? ', unsigned: true' : ''
		} })`;
		out += autoincrement ? `.autoincrement()` : '';
		out += defaultValue ? `.default(${mapColumnDefault(lowered, defaultValue)})` : '';
		return out;
	}

	if (lowered === 'boolean' || lowered === 'tinyint(1)') {
		let out = `${casing(name)}: boolean(${dbColumnName({ name, casing: rawCasing })})`;
		out += defaultValue ? `.default(${mapColumnDefault(lowered, defaultValue)})` : '';
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
			? `${casing(name)}: double(${
				dbColumnName({ name, casing: rawCasing, withMode: timeConfigParams !== undefined })
			}${timeConfig(params)})`
			: `${casing(name)}: double(${dbColumnName({ name, casing: rawCasing })})`;

		// let out = `${name.camelCase()}: double("${name}")`;
		out += defaultValue
			? `.default(${mapColumnDefault(lowered, defaultValue)})`
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

		let out = `${casing(name)}: float(${dbColumnName({ name, casing: rawCasing })}${params ? timeConfig(params) : ''})`;
		out += defaultValue
			? `.default(${mapColumnDefault(lowered, defaultValue)})`
			: '';
		return out;
	}

	if (lowered === 'real') {
		let out = `${casing(name)}: real(${dbColumnName({ name, casing: rawCasing })})`;
		out += defaultValue
			? `.default(${mapColumnDefault(lowered, defaultValue)})`
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
		out += defaultValue?.value === 'now()' || defaultValue?.value === '(CURRENT_TIMESTAMP)'
			? '.defaultNow()'
			: defaultValue
			? `.default(${mapColumnDefault(lowered, defaultValue)})`
			: '';

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

		out += defaultValue?.value === 'now()'
			? '.defaultNow()'
			: defaultValue
			? `.default(${mapColumnDefault(lowered, defaultValue)})`
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
			? `.default(${mapColumnDefault(lowered, defaultValue)})`
			: '';

		return out;
	}

	// in mysql text can't have default value. Will leave it in case smth ;)
	if (lowered === 'text') {
		let out = `${casing(name)}: text(${dbColumnName({ name, casing: rawCasing })})`;
		out += defaultValue
			? `.default(${mapColumnDefault(lowered, defaultValue)})`
			: '';
		return out;
	}

	// in mysql text can't have default value. Will leave it in case smth ;)
	if (lowered === 'tinytext') {
		let out = `${casing(name)}: tinytext(${dbColumnName({ name, casing: rawCasing })})`;
		out += defaultValue
			? `.default(${mapColumnDefault(lowered, defaultValue)})`
			: '';
		return out;
	}

	// in mysql text can't have default value. Will leave it in case smth ;)
	if (lowered === 'mediumtext') {
		let out = `${casing(name)}: mediumtext(${dbColumnName({ name, casing: rawCasing })})`;
		out += defaultValue
			? `.default(${mapColumnDefault(lowered, defaultValue)})`
			: '';
		return out;
	}

	// in mysql text can't have default value. Will leave it in case smth ;)
	if (lowered === 'longtext') {
		let out = `${casing(name)}: longtext(${dbColumnName({ name, casing: rawCasing })})`;
		out += defaultValue
			? `.default(${mapColumnDefault(lowered, defaultValue)})`
			: '';
		return out;
	}

	if (lowered === 'year') {
		let out = `${casing(name)}: year(${dbColumnName({ name, casing: rawCasing })})`;
		out += defaultValue
			? `.default(${mapColumnDefault(lowered, defaultValue)})`
			: '';
		return out;
	}

	// in mysql json can't have default value. Will leave it in case smth ;)
	if (lowered === 'json') {
		let out = `${casing(name)}: json(${dbColumnName({ name, casing: rawCasing })})`;

		out += defaultValue
			? `.default(${mapColumnDefault(lowered, defaultValue)})`
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
			? `.default('${unescapeSingleQuotes(defaultValue.value, true)}')`
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
			? `.default(${mapColumnDefault(lowered, defaultValue)})`
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

		out += defaultValue?.value === 'now()'
			? '.defaultNow()'
			: defaultValue
			? `.default(${mapColumnDefault(lowered, defaultValue)})`
			: '';

		defaultValue;
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
			? `${casing(name)}: decimal(${
				dbColumnName({ name, casing: rawCasing, withMode: timeConfigParams !== undefined })
			}${timeConfigParams})`
			: `${casing(name)}: decimal(${dbColumnName({ name, casing: rawCasing })})`;

		out += defaultValue
			? `.default(${mapColumnDefault(lowered, defaultValue)})`
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
			? `${casing(name)}: binary(${dbColumnName({ name, casing: rawCasing, withMode: params !== undefined })}${params})`
			: `${casing(name)}: binary(${dbColumnName({ name, casing: rawCasing })})`;

		out += defaultValue
			? `.default(${mapColumnDefault(lowered, defaultValue)})`
			: '';

		return out;
	}

	if (lowered.startsWith('enum')) {
		const values = parseEnum(lowered).map((it) => `"${it.replaceAll("''", "'").replaceAll('"', '\\"')}"`).join(',');
		let out = `${casing(name)}: mysqlEnum(${dbColumnName({ name, casing: rawCasing, withMode: true })}[${values}])`;
		out += defaultValue
			? `.default('${unescapeSingleQuotes(defaultValue.value, true)}')`
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

		out += defaultValue
			? `.default(${mapColumnDefault(lowered, defaultValue)})`
			: '';

		return out;
	}

	console.log('uknown', type);
	return `// Warning: Can't parse ${type} from database\n\t// ${type}Type: ${type}("${name}")`;
};

const createTableColumns = (
	columns: Column[],
	pk: PrimaryKey | null,
	fks: ForeignKey[],
	casing: (val: string) => string,
	rawCasing: Casing,
): string => {
	let statement = '';

	for (const it of columns) {
		const isPK = pk && pk.columns.length === 1 && pk.columns[0] === it.name;

		statement += '\t';
		statement += column(it.type, it.name, casing, rawCasing, it.default, it.autoIncrement, it.onUpdateNow);

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

		const columnFKs = fks.filter((x) => x.columns.length > 1 && x.columns[0] === it.name);
		for (const fk of columnFKs) {
			const onDelete = fk.onDelete !== 'NO ACTION' ? fk.onDelete : null;
			const onUpdate = fk.onUpdate !== 'NO ACTION' ? fk.onUpdate : null;
			const params = { onDelete, onUpdate };

			const typeSuffix = isCyclic(fk) ? ': AnyMySqlColumn' : '';

			const paramsStr = objToStatement2(params);
			if (paramsStr) {
				statement += `.references(()${typeSuffix} => ${
					casing(
						fk.tableTo,
					)
				}.${casing(fk.columnsTo[0])}, ${paramsStr} )`;
			} else {
				statement += `.references(()${typeSuffix} => ${casing(fk.tableTo)}.${
					casing(
						fk.columnsTo[0],
					)
				})`;
			}
		}
		statement += ',\n';
	}

	return statement;
};

const createViewColumns = (columns: ViewColumn[], casing: (value: string) => string, rawCasing: Casing) => {
	let statement = '';

	for (const it of columns) {
		statement += '\n';
		statement += column(it.type, it.name, casing, rawCasing, null, false, false);
		statement += it.notNull ? '.notNull()' : '';
		statement += ',\n';
	}
	return statement;
};

const createTableIndexes = (
	idxs: Index[],
	casing: (value: string) => string,
): string => {
	let statement = '';
	for (const it of idxs) {
		const columns = it.columns.map((x) => x.isExpression ? `sql\`${x.value}\`` : `table.${casing(x.value)}`).join(', ');
		statement += it.isUnique ? '\tuniqueIndex(' : '\tindex(';
		statement += `"${it.name}")`;
		statement += `.on(${columns}),\n`;
	}
	return statement;
};

const createTableChecks = (
	checks: CheckConstraint[],
): string => {
	let statement = '';

	for (const it of checks) {
		statement += `\tcheck("${it.name}", sql\`${it.value.replace(/`/g, '\\`')}\`),\n`;
	}

	return statement;
};

const createTablePK = (pk: PrimaryKey, casing: (value: string) => string): string => {
	const columns = pk.columns.map((x) => `table.${casing(x)}`).join(', ');
	let statement = `\tprimaryKey({ columns: [${columns}]`;
	statement += `${pk.nameExplicit ? `, name: "${pk.name}"` : ''}}),\n`;
	return statement;
};

const createTableFKs = (
	fks: ForeignKey[],
	casing: (value: string) => string,
): string => {
	let statement = '';

	for (const it of fks) {
		const tableTo = isSelf(it) ? 'table' : `${casing(it.tableTo)}`;
		const columnsFrom = it.columns.map((x) => `table.${casing(x)}`).join(', ');
		const columnsTo = it.columns.map((x) => `${tableTo}.${casing(x)}`).join(', ');
		statement += `\tforeignKey({\n`;
		statement += `\t\tcolumns: [${columnsFrom}],\n`;
		statement += `\t\tforeignColumns: [${columnsTo}],\n`;
		statement += `\t\tname: "${it.name}"\n`;
		statement += `\t})`;
		statement += it.onUpdate !== 'NO ACTION' ? `.onUpdate("${it.onUpdate}")` : '';
		statement += it.onDelete !== 'NO ACTION' ? `.onDelete("${it.onDelete}")` : '';
		statement += `,\n`;
	}

	return statement;
};
