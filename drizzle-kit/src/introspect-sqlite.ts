/* eslint-disable @typescript-eslint/no-unsafe-argument */
import { toCamelCase } from 'drizzle-orm/casing';
import './@types/utils';
import type { Casing } from './cli/validations/common';
import { assertUnreachable } from './global';
import { CheckConstraint } from './serializer/mysqlSchema';
import type {
	Column,
	ForeignKey,
	Index,
	PrimaryKey,
	SQLiteSchema,
	SQLiteSchemaInternal,
	UniqueConstraint,
} from './serializer/sqliteSchema';

const sqliteImportsList = new Set([
	'sqliteTable',
	'integer',
	'real',
	'text',
	'numeric',
	'blob',
]);

export const indexName = (tableName: string, columns: string[]) => {
	return `${tableName}_${columns.join('_')}_index`;
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

export const schemaToTypeScript = (
	schema: SQLiteSchemaInternal,
	casing: Casing,
) => {
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
			const checkImports = Object.values(it.checkConstraints).map(
				(it) => 'check',
			);

			res.sqlite.push(...idxImports);
			res.sqlite.push(...fkImpots);
			res.sqlite.push(...pkImports);
			res.sqlite.push(...uniqueImports);
			res.sqlite.push(...checkImports);

			const columnImports = Object.values(it.columns)
				.map((col) => {
					return col.type;
				})
				.filter((type) => {
					return sqliteImportsList.has(type);
				});

			res.sqlite.push(...columnImports);
			return res;
		},
		{ sqlite: [] as string[] },
	);

	Object.values(schema.views).forEach((it) => {
		imports.sqlite.push('sqliteView');

		const columnImports = Object.values(it.columns)
			.map((col) => {
				return col.type;
			})
			.filter((type) => {
				return sqliteImportsList.has(type);
			});

		imports.sqlite.push(...columnImports);
	});

	const tableStatements = Object.values(schema.tables).map((table) => {
		const func = 'sqliteTable';
		let statement = '';
		if (imports.sqlite.includes(withCasing(table.name, casing))) {
			statement = `// Table name is in conflict with ${
				withCasing(
					table.name,
					casing,
				)
			} import.\n// Please change to any other name, that is not in imports list\n`;
		}
		statement += `export const ${withCasing(table.name, casing)} = ${func}("${table.name}", {\n`;
		statement += createTableColumns(
			Object.values(table.columns),
			Object.values(table.foreignKeys),
			casing,
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
			|| Object.keys(table.checkConstraints).length > 0
		) {
			statement += ',\n';
			statement += '(table) => [';
			statement += createTableIndexes(
				table.name,
				Object.values(table.indexes),
				casing,
			);
			statement += createTableFKs(Object.values(filteredFKs), casing);
			statement += createTablePKs(
				Object.values(table.compositePrimaryKeys),
				casing,
			);
			statement += createTableUniques(
				Object.values(table.uniqueConstraints),
				casing,
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

	const viewsStatements = Object.values(schema.views).map((view) => {
		const func = 'sqliteView';

		let statement = '';
		if (imports.sqlite.includes(withCasing(view.name, casing))) {
			statement = `// Table name is in conflict with ${
				withCasing(
					view.name,
					casing,
				)
			} import.\n// Please change to any other name, that is not in imports list\n`;
		}
		statement += `export const ${withCasing(view.name, casing)} = ${func}("${view.name}", {\n`;
		statement += createTableColumns(
			Object.values(view.columns),
			[],
			casing,
		);
		statement += '})';
		statement += `.as(sql\`${view.definition?.replaceAll('`', '\\`')}\`);`;

		return statement;
	});

	const uniqueSqliteImports = [
		'sqliteTable',
		'AnySQLiteColumn',
		...new Set(imports.sqlite),
	];

	const importsTs = `import { ${
		uniqueSqliteImports.join(
			', ',
		)
	} } from "drizzle-orm/sqlite-core"
  import { sql } from "drizzle-orm"\n\n`;

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
	const key = `${fk.tableFrom}-${fk.tableTo}`;
	const reverse = `${fk.tableTo}-${fk.tableFrom}`;
	return relations.has(key) && relations.has(reverse);
};

const isSelf = (fk: ForeignKey) => {
	return fk.tableFrom === fk.tableTo;
};

const mapColumnDefault = (defaultValue: any) => {
	if (
		typeof defaultValue === 'string'
		&& defaultValue.startsWith('(')
		&& defaultValue.endsWith(')')
	) {
		return `sql\`${defaultValue}\``;
	}
	// If default value is NULL as string it will come back from db as "'NULL'" and not just "NULL"
	if (defaultValue === 'NULL') {
		return `sql\`NULL\``;
	}

	if (
		typeof defaultValue === 'string'
	) {
		return defaultValue.substring(1, defaultValue.length - 1).replaceAll('"', '\\"').replaceAll("''", "'");
	}

	return defaultValue;
};

const column = (
	type: string,
	name: string,
	defaultValue?: any,
	autoincrement?: boolean,
	casing?: Casing,
) => {
	let lowered = type;
	casing = casing!;

	if (lowered === 'integer') {
		let out = `${withCasing(name, casing)}: integer(${dbColumnName({ name, casing })})`;
		// out += autoincrement ? `.autoincrement()` : "";
		out += typeof defaultValue !== 'undefined'
			? `.default(${mapColumnDefault(defaultValue)})`
			: '';
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
	casing: Casing,
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
		statement += column(it.type, it.name, it.default, it.autoincrement, casing);
		statement += it.primaryKey
			? `.primaryKey(${it.autoincrement ? '{ autoIncrement: true }' : ''})`
			: '';
		statement += it.notNull ? '.notNull()' : '';

		statement += it.generated
			? `.generatedAlwaysAs(sql\`${
				it.generated.as
					.replace(/`/g, '\\`')
					.slice(1, -1)
			}\`, { mode: "${it.generated.type}" })`
			: '';

		const fks = fkByColumnName[it.name];
		if (fks) {
			const fksStatement = fks
				.map((it) => {
					const onDelete = it.onDelete && it.onDelete !== 'no action' ? it.onDelete : null;
					const onUpdate = it.onUpdate && it.onUpdate !== 'no action' ? it.onUpdate : null;
					const params = { onDelete, onUpdate };

					const typeSuffix = isCyclic(it) ? ': AnySQLiteColumn' : '';

					const paramsStr = objToStatement2(params);
					if (paramsStr) {
						return `.references(()${typeSuffix} => ${
							withCasing(
								it.tableTo,
								casing,
							)
						}.${withCasing(it.columnsTo[0], casing)}, ${paramsStr} )`;
					}
					return `.references(()${typeSuffix} => ${
						withCasing(
							it.tableTo,
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
		let idxKey = it.name.startsWith(tableName) && it.name !== tableName
			? it.name.slice(tableName.length + 1)
			: it.name;
		idxKey = idxKey.endsWith('_index')
			? idxKey.slice(0, -'_index'.length) + '_idx'
			: idxKey;

		idxKey = withCasing(idxKey, casing);

		const indexGeneratedName = indexName(tableName, it.columns);
		const escapedIndexName = indexGeneratedName === it.name ? '' : `"${it.name}"`;

		statement += `\n\t`;
		statement += it.isUnique ? 'uniqueIndex(' : 'index(';
		statement += `${escapedIndexName})`;
		statement += `.on(${
			it.columns
				.map((it) => `table.${withCasing(it, casing)}`)
				.join(', ')
		}),`;
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

		statement += `\n\t`;
		statement += 'unique(';
		statement += `"${it.name}")`;
		statement += `.on(${
			it.columns
				.map((it) => `table.${withCasing(it, casing)}`)
				.join(', ')
		}),`;
	});

	return statement;
};
const createTableChecks = (
	checks: CheckConstraint[],
	casing: Casing,
): string => {
	let statement = '';

	checks.forEach((it) => {
		statement += `\n\t`;
		statement += 'check(';
		statement += `"${it.name}", `;
		statement += `sql\`${it.value}\`)`;
		statement += `,`;
	});

	return statement;
};

const createTablePKs = (pks: PrimaryKey[], casing: Casing): string => {
	let statement = '';

	pks.forEach((it, i) => {
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
	});

	return statement;
};

const createTableFKs = (fks: ForeignKey[], casing: Casing): string => {
	let statement = '';

	fks.forEach((it) => {
		const isSelf = it.tableTo === it.tableFrom;
		const tableTo = isSelf ? 'table' : `${withCasing(it.tableTo, casing)}`;
		statement += `\n\t`;
		statement += `foreignKey(() => ({\n`;
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
		statement += `\t\t}))`;

		statement += it.onUpdate && it.onUpdate !== 'no action'
			? `.onUpdate("${it.onUpdate}")`
			: '';

		statement += it.onDelete && it.onDelete !== 'no action'
			? `.onDelete("${it.onDelete}")`
			: '';

		statement += `,`;
	});

	return statement;
};
