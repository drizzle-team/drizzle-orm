/* eslint-disable @typescript-eslint/no-unsafe-argument */
import { toCamelCase } from 'drizzle-orm/casing';
import '../../@types/utils';
import type { Casing } from '../../cli/validations/common';
import { assertUnreachable } from '../../utils';
import type {
	CheckConstraint,
	Column,
	ForeignKey,
	Index,
	PrimaryKey,
	SQLiteDDL,
	UniqueConstraint,
	View,
	ViewColumn,
} from './ddl';

const sqliteImportsList = new Set([
	'sqliteTable',
	'integer',
	'real',
	'text',
	'numeric',
	'blob',
]);

const objToStatement2 = (json: any) => {
	json = Object.fromEntries(Object.entries(json).filter((it) => it[1]));

	const keys = Object.keys(json);
	if (keys.length === 0) return;

	let statement = '{ ';
	statement += keys.map((it) => `${it}: "${json[it]}"`).join(', '); // no "" for keys
	statement += ' }';
	return statement;
};

const relations = new Set<string>();

const escapeColumnKey = (value: string) => {
	if (/^(?![a-zA-Z_$][a-zA-Z0-9_$]*$).+$/.test(value)) {
		return `"${value}"`;
	}
	return value;
};

const withCasing = (value: string, casing?: Casing) => {
	if (casing === 'preserve') {
		return escapeColumnKey(value);
	}
	if (casing === 'camel') {
		return escapeColumnKey(value.camelCase());
	}

	return value;
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

export const ddlToTypescript = (
	schema: SQLiteDDL,
	casing: Casing,
	viewColumns: Record<string, ViewColumn[]>,
	type: 'sqlite' | 'libsql',
) => {
	for (const fk of schema.fks.list()) {
		const relation = `${fk.table}-${fk.tableTo}`;
		relations.add(relation);
	}

	const imports = new Set<string>();

	for (const it of schema.entities.list()) {
		if (it.entityType === 'indexes') imports.add(it.isUnique ? 'uniqueIndex' : 'index');
		if (it.entityType === 'pks' && it.columns.length > 1) imports.add('primaryKey');
		if (it.entityType === 'uniques' && it.columns.length > 1) imports.add('unique');
		if (it.entityType === 'checks') imports.add('check');
		if (it.entityType === 'columns' && sqliteImportsList.has(it.type)) imports.add(it.type);
		if (it.entityType === 'views') imports.add('sqliteView');
		if (it.entityType === 'tables') imports.add('sqliteTable');
		if (it.entityType === 'fks') {
			imports.add('foreignKey');
			if (it.columns.length > 1 || isCyclic(it) || isSelf(it)) imports.add('AnySQLiteColumn');
		}
	}

	for (const it of Object.values(viewColumns).flat()) {
		if (sqliteImportsList.has(it.type)) imports.add(it.type);
	}

	const tableStatements = [] as string[];
	for (const table of schema.tables.list()) {
		const columns = schema.columns.list({ table: table.name });
		const fks = schema.fks.list({ table: table.name });
		const pk = schema.pks.one({ table: table.name });
		const indexes = schema.indexes.list({ table: table.name });
		const uniqies = schema.uniques.list({ table: table.name });
		const checks = schema.checks.list({ table: table.name });

		let statement = `export const ${withCasing(table.name, casing)} = sqliteTable("${table.name}", {\n`;

		statement += createTableColumns(
			columns,
			fks,
			pk,
			casing,
		);

		statement += '}';

		// more than 2 fields or self reference or cyclic
		const filteredFKs = fks.filter((it) => {
			return it.columns.length > 1 || isSelf(it) || isCyclic(it);
		});

		if (
			indexes.length > 0
			|| filteredFKs.length > 0
			|| pk && pk.columns.length > 1
			|| uniqies.length > 0
			|| checks.length > 0
		) {
			statement += ',\n(table) => [';
			statement += createTableIndexes(table.name, indexes, casing);
			statement += createTableFKs(Object.values(filteredFKs), casing);
			statement += pk && pk.columns.length > 1 ? createTablePK(pk, casing) : '';
			statement += createTableUniques(uniqies, casing);
			statement += createTableChecks(checks, casing);
			statement += ']';
		}
		statement += ');';

		tableStatements.push(statement);
	}

	const viewsStatements = schema.views.list().map((view) => {
		let statement = `export const ${withCasing(view.name, casing)} = sqliteView("${view.name}", {\n`;
		const columns = viewColumns[view.name] || [];
		statement += createViewColumns(view, columns, casing);
		statement += '})';
		statement += `.as(sql\`${view.definition?.replaceAll('`', '\\`')}\`);`;

		return statement;
	});

	const importsTs = `import { ${
		[...imports].join(', ')
	} } from "drizzle-orm/sqlite-core"\nimport { sql } from "drizzle-orm"\n\n`;

	let decalrations = tableStatements.join('\n\n');
	decalrations += '\n\n';
	decalrations += viewsStatements.join('\n\n');

	const file = importsTs + decalrations;

	// for drizzle studio query runner
	const schemaEntry = `
    {
      ${
		Object.values(schema.tables)
			.map((it) => withCasing(it.name, casing))
			.join(',')
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

const mapColumnDefault = (def: NonNullable<Column['default']>) => {
	const it = def.value;

	if (
		typeof it === 'string'
		&& it.startsWith('(')
		&& it.endsWith(')')
	) {
		return `sql\`${it}\``;
	}
	// If default value is NULL as string it will come back from db as "'NULL'" and not just "NULL"
	if (it === 'NULL') {
		return `sql\`NULL\``;
	}

	if (typeof it === 'string') {
		return it.replaceAll('"', '\\"').replaceAll("''", "'");
	}

	return it;
};

const column = (
	type: string,
	name: string,
	defaultValue: Column['default'],
	casing: Casing,
) => {
	let lowered = type;
	casing = casing!;

	if (lowered === 'integer') {
		let out = `${withCasing(name, casing)}: integer(${dbColumnName({ name, casing })})`;
		// out += autoincrement ? `.autoincrement()` : "";
		out += defaultValue ? `.default(${mapColumnDefault(defaultValue)})` : '';
		return out;
	}

	if (lowered === 'real') {
		let out = `${withCasing(name, casing)}: real(${dbColumnName({ name, casing })})`;
		out += defaultValue ? `.default(${mapColumnDefault(defaultValue)})` : '';
		return out;
	}

	if (lowered.startsWith('text')) {
		const match = lowered.match(/\d+/);
		let out: string;

		if (match) {
			out = `${withCasing(name, casing)}: text(${dbColumnName({ name, casing, withMode: true })}{ length: ${
				match[0]
			} })`;
		} else {
			out = `${withCasing(name, casing)}: text(${dbColumnName({ name, casing })})`;
		}

		out += defaultValue ? `.default("${mapColumnDefault(defaultValue)}")` : '';
		return out;
	}

	if (lowered === 'blob') {
		let out = `${withCasing(name, casing)}: blob(${dbColumnName({ name, casing })})`;
		out += defaultValue ? `.default(${mapColumnDefault(defaultValue)})` : '';
		return out;
	}

	if (lowered === 'numeric') {
		let out = `${withCasing(name, casing)}: numeric(${dbColumnName({ name, casing })})`;
		out += defaultValue ? `.default(${mapColumnDefault(defaultValue)})` : '';
		return out;
	}

	//   console.log("uknown", type);
	return `// Warning: Can't parse ${type} from database\n\t// ${type}Type: ${type}("${name}")`;
};

const createTableColumns = (
	columns: Column[],
	fks: ForeignKey[],
	pk: PrimaryKey | null,
	casing: Casing,
): string => {
	let statement = '';
	for (const it of columns) {
		const isPrimary = pk && pk.columns.length === 1 && pk.columns[0] === it.name;

		statement += '\t';
		statement += column(it.type, it.name, it.default, casing);
		statement += isPrimary ? `.primaryKey(${it.autoincrement ? '{ autoIncrement: true }' : ''})` : '';
		statement += it.notNull && !isPrimary ? '.notNull()' : '';
		statement += it.generated
			? `.generatedAlwaysAs(sql\`${
				it.generated.as.replace(/`/g, '\\`').slice(1, -1)
			}\`, { mode: "${it.generated.type}" })`
			: '';

		const references = fks.filter((fk) => fk.columns.length === 1 && fk.columns[0] === it.name);

		for (const fk of references) {
			statement += `.references(() => ${withCasing(fk.tableTo, casing)}.${withCasing(fk.columnsTo[0], casing)})`;

			const onDelete = fk.onDelete && fk.onDelete !== 'no action' ? fk.onDelete : null;
			const onUpdate = fk.onUpdate && fk.onUpdate !== 'no action' ? fk.onUpdate : null;
			const params = { onDelete, onUpdate };

			const typeSuffix = isCyclic(fk) ? ': AnySQLiteColumn' : '';

			const paramsStr = objToStatement2(params);
			if (paramsStr) {
				statement += `.references(()${typeSuffix} => ${withCasing(fk.tableTo, casing)}.${
					withCasing(fk.columnsTo[0], casing)
				}, ${paramsStr} )`;
			} else {
				statement += `.references(()${typeSuffix} => ${
					withCasing(
						fk.tableTo,
						casing,
					)
				}.${withCasing(fk.columnsTo[0], casing)})`;
			}
		}
		statement += ',\n';
	}

	return statement;
};

const createViewColumns = (view: View, columns: ViewColumn[], casing: Casing) => {
	let statement = '';

	for (const it of columns) {
		const key = withCasing(it.name, casing);
		statement += `${key}: ${it.type}()`;
		statement += it.notNull ? '.notNull()' : '';
		statement += ',\n';
	}

	return statement;
};

const createTableIndexes = (
	tableName: string,
	idxs: Index[],
	casing: Casing,
): string => {
	let statement = '';

	for (const it of idxs) {
		let idxKey = it.name.startsWith(tableName) && it.name !== tableName
			? it.name.slice(tableName.length + 1)
			: it.name;
		idxKey = idxKey.endsWith('_index')
			? idxKey.slice(0, -'_index'.length) + '_idx'
			: idxKey;
		idxKey = withCasing(idxKey, casing);

		const columnNames = it.columns.filter((c) => !c.isExpression).map((c) => c.value);
		const indexGeneratedName = `${tableName}_${columnNames.join('_')}_index`;
		const escapedIndexName = indexGeneratedName === it.name ? '' : `"${it.name}"`;

		statement += `\t\t${idxKey}: `;
		statement += it.isUnique ? 'uniqueIndex(' : 'index(';
		statement += `${escapedIndexName})`;
		statement += `.on(${
			it.columns
				.map((it) => `table.${withCasing(it.value, casing)}`)
				.join(', ')
		}),`;
		statement += `\n`;
	}

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
		}),`;
		statement += `\n`;
	});

	return statement;
};

const createTableChecks = (
	checks: CheckConstraint[],
	casing: Casing,
): string => {
	let statement = '';

	checks.forEach((it) => {
		statement += 'check(';
		statement += `"${it.name}", `;
		statement += `sql\`${it.value}\`)`;
		statement += `,\n`;
	});

	return statement;
};

const createTablePK = (pk: PrimaryKey, casing: Casing): string => {
	let statement = 'primaryKey({ columns: [';
	statement += `${
		pk.columns.map((c) => {
			return `table.${withCasing(c, casing)}`;
		}).join(', ')
	}]`;

	statement += `${pk.name ? `, name: "${pk.name}"` : ''}}`;
	statement += ')';
	statement += `\n`;
	return statement;
};

const createTableFKs = (fks: ForeignKey[], casing: Casing): string => {
	let statement = '';

	fks.forEach((it) => {
		const isSelf = it.tableTo === it.table;
		const tableTo = isSelf ? 'table' : `${withCasing(it.tableTo, casing)}`;
		statement += `\t\t${withCasing(it.name, casing)}: foreignKey(() => ({\n`;
		statement += `\t\t\tcolumns: [${
			it.columns
				.map((i) => `table.${withCasing(i, casing)}`)
				.join(', ')
		}],\n`;
		statement += `\t\t\tforeignColumns: [${
			it.columnsTo
				.map((i) => `${tableTo}.${withCasing(i, casing)}`)
				.join(', ')
		}],\n`;
		statement += `\t\t\tname: "${it.name}"\n`;
		statement += `\t\t}))`;

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
