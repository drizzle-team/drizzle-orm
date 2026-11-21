/* eslint-disable @typescript-eslint/no-unsafe-argument */
import { toCamelCase } from 'drizzle-orm/casing';
import './@types/utils';
import type { Casing } from './cli/validations/common';
import { assertUnreachable } from './global';
import type {
	CheckConstraint,
	Column,
	FirebirdSchemaInternal,
	ForeignKey,
	Index,
	PrimaryKey,
	UniqueConstraint,
} from './serializer/firebirdSchema';
import { unescapeSingleQuotes } from './utils';

const firebirdImportsList = new Set([
	'firebirdTable',
	'firebirdView',
	'integer',
	'smallint',
	'bigint',
	'boolean',
	'varchar',
	'char',
	'text',
	'real',
	'doublePrecision',
	'numeric',
	'date',
	'time',
	'timestamp',
	'blob',
]);

const importsPatch = {
	'double precision': 'doublePrecision',
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

const dbColumnName = ({ name, casing, withConfig = false }: { name: string; casing: Casing; withConfig?: boolean }) => {
	if (casing === 'preserve') {
		return '';
	}
	if (casing === 'camel') {
		return toCamelCase(name) === name ? '' : withConfig ? `"${name}", ` : `"${name}"`;
	}

	assertUnreachable(casing);
};

const callColumn = (
	fn: string,
	name: string,
	casing: Casing,
	config?: string,
) => {
	const dbName = dbColumnName({ name, casing, withConfig: config !== undefined });
	if (dbName) {
		return `${fn}(${dbName}${config ?? ''})`;
	}
	if (config !== undefined) {
		return `${fn}(${config})`;
	}
	return `${fn}()`;
};

const collectTypeImport = (type: string): string | undefined => {
	let patched = importsPatch[type] ?? type;
	patched = patched.startsWith('varchar(') ? 'varchar' : patched;
	patched = patched.startsWith('char(') ? 'char' : patched;
	patched = patched.startsWith('numeric(') ? 'numeric' : patched;
	patched = patched.startsWith('decimal(') ? 'numeric' : patched;
	patched = patched.startsWith('time(') ? 'time' : patched;
	patched = patched.startsWith('timestamp(') ? 'timestamp' : patched;
	patched = patched.endsWith(' with time zone') ? patched.replace(/(?:\(\d+\))? with time zone$/, '') : patched;
	return firebirdImportsList.has(patched) ? patched : undefined;
};

export const schemaToTypeScript = (
	schema: FirebirdSchemaInternal,
	casing: Casing,
) => {
	const withCasing = prepareCasing(casing);
	const relations = new Set<string>();

	Object.values(schema.tables).forEach((table) => {
		Object.values(table.foreignKeys).forEach((fk) => {
			relations.add(`${fk.tableFrom}-${fk.tableTo}`);
		});
	});

	const imports = Object.values(schema.tables).reduce(
		(res, it) => {
			const idxImports = Object.values(it.indexes).map((idx) => idx.isUnique ? 'uniqueIndex' : 'index');
			const fkImports = Object.values(it.foreignKeys).map(() => 'foreignKey');
			const pkImports = Object.values(it.compositePrimaryKeys).map(() => 'primaryKey');
			const uniqueImports = Object.values(it.uniqueConstraints).map(() => 'unique');
			const checkImports = Object.values(it.checkConstraints).map(() => 'check');

			res.firebird.push(...idxImports);
			res.firebird.push(...fkImports);
			res.firebird.push(...pkImports);
			res.firebird.push(...uniqueImports);
			res.firebird.push(...checkImports);

			const columnImports = Object.values(it.columns)
				.map((col) => collectTypeImport(col.type))
				.filter((type): type is string => Boolean(type));

			res.firebird.push(...columnImports);
			return res;
		},
		{ firebird: [] as string[] },
	);

	Object.values(schema.views).forEach((it) => {
		imports.firebird.push('firebirdView');

		const columnImports = Object.values(it.columns)
			.map((col) => collectTypeImport(col.type))
			.filter((type): type is string => Boolean(type));

		imports.firebird.push(...columnImports);
	});

	const tableStatements = Object.values(schema.tables).map((table) => {
		let statement = '';
		if (imports.firebird.includes(withCasing(table.name))) {
			statement = `// Table name is in conflict with ${
				withCasing(
					table.name,
				)
			} import.\n// Please change to any other name, that is not in imports list\n`;
		}
		statement += `export const ${withCasing(table.name)} = firebirdTable("${table.name}", {\n`;
		statement += createTableColumns(
			Object.values(table.columns),
			Object.values(table.foreignKeys),
			withCasing,
			casing,
			relations,
		);
		statement += '}';

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
				Object.values(table.indexes),
				withCasing,
				schema,
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
			statement += createTableChecks(
				Object.values(table.checkConstraints),
			);
			statement += '\n]';
		}

		statement += ');';
		return statement;
	});

	const viewsStatements = Object.values(schema.views).map((view) => {
		let statement = '';
		if (imports.firebird.includes(withCasing(view.name))) {
			statement = `// View name is in conflict with ${
				withCasing(
					view.name,
				)
			} import.\n// Please change to any other name, that is not in imports list\n`;
		}
		statement += `export const ${withCasing(view.name)} = firebirdView("${view.name}", {\n`;
		statement += createTableColumns(
			Object.values(view.columns),
			[],
			withCasing,
			casing,
			relations,
		);
		statement += '})';
		statement += view.definition
			? `.as(sql\`${view.definition.replaceAll('`', '\\`')}\`);`
			: '.existing();';

		return statement;
	});

	const uniqueFirebirdImports = [
		'firebirdTable',
		'AnyFirebirdColumn',
		...new Set(imports.firebird),
	];

	const importsTs = `import { ${
		uniqueFirebirdImports.join(
			', ',
		)
	} } from "drizzle-orm/firebird-core"\nimport { sql } from "drizzle-orm"\n\n`;

	let declarations = tableStatements.join('\n\n');
	declarations += '\n\n';
	declarations += viewsStatements.join('\n\n');

	const file = importsTs + declarations;

	const schemaEntry = `
    {
      ${
		Object.values(schema.tables)
			.map((it) => withCasing(it.name))
			.join(',')
	}
    }
  `;

	return { file, imports: importsTs, decalrations: declarations, schemaEntry };
};

const isCyclic = (fk: ForeignKey, relations: Set<string>) => {
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
		return `sql\`${defaultValue.slice(1, -1).replaceAll('`', '\\`')}\``;
	}

	if (defaultValue === 'NULL') {
		return `sql\`NULL\``;
	}

	if (typeof defaultValue === 'string') {
		if (defaultValue.startsWith("'") && defaultValue.endsWith("'")) {
			return unescapeSingleQuotes(defaultValue, true);
		}
		return `sql\`${defaultValue.replaceAll('`', '\\`')}\``;
	}

	return String(defaultValue);
};

const column = (
	type: string,
	name: string,
	defaultValue: any,
	casing: Casing,
) => {
	const lowered = type.toLowerCase();

	const withDefault = (out: string) => {
		return out + (defaultValue !== undefined ? `.default(${mapColumnDefault(defaultValue)})` : '');
	};

	if (lowered === 'integer') {
		return withDefault(`${withCasingForColumn(name, casing)}: ${callColumn('integer', name, casing)}`);
	}

	if (lowered === 'smallint') {
		return withDefault(`${withCasingForColumn(name, casing)}: ${callColumn('smallint', name, casing)}`);
	}

	if (lowered === 'bigint') {
		return withDefault(`${withCasingForColumn(name, casing)}: ${callColumn('bigint', name, casing, '{ mode: "bigint" }')}`);
	}

	if (lowered === 'boolean') {
		return withDefault(`${withCasingForColumn(name, casing)}: ${callColumn('boolean', name, casing)}`);
	}

	if (lowered === 'real') {
		return withDefault(`${withCasingForColumn(name, casing)}: ${callColumn('real', name, casing)}`);
	}

	if (lowered === 'double precision') {
		return withDefault(`${withCasingForColumn(name, casing)}: ${callColumn('doublePrecision', name, casing)}`);
	}

	if (lowered.startsWith('varchar')) {
		const length = lowered.match(/^varchar\((\d+)\)$/)?.[1];
		const config = length ? `{ length: ${length} }` : undefined;
		return withDefault(`${withCasingForColumn(name, casing)}: ${callColumn('varchar', name, casing, config)}`);
	}

	if (lowered.startsWith('char')) {
		const length = lowered.match(/^char\((\d+)\)$/)?.[1];
		const config = length ? `{ length: ${length} }` : undefined;
		return withDefault(`${withCasingForColumn(name, casing)}: ${callColumn('char', name, casing, config)}`);
	}

	if (lowered.startsWith('numeric') || lowered.startsWith('decimal')) {
		const match = lowered.match(/^(?:numeric|decimal)\((\d+)(?:,\s*(\d+))?\)$/);
		const config = match
			? `{ precision: ${match[1]}${match[2] ? `, scale: ${match[2]}` : ''} }`
			: undefined;
		return withDefault(`${withCasingForColumn(name, casing)}: ${callColumn('numeric', name, casing, config)}`);
	}

	if (lowered === 'date') {
		return withDefault(`${withCasingForColumn(name, casing)}: ${callColumn('date', name, casing)}`);
	}

	if (lowered.startsWith('timestamp')) {
		const withTimezone = lowered.includes('with time zone');
		const precision = lowered.match(/^timestamp\((\d+)\)/)?.[1];
		const configEntries = [
			precision ? `precision: ${precision}` : undefined,
			withTimezone ? 'withTimezone: true' : undefined,
		].filter(Boolean);
		const config = configEntries.length > 0 ? `{ ${configEntries.join(', ')} }` : undefined;
		return withDefault(`${withCasingForColumn(name, casing)}: ${callColumn('timestamp', name, casing, config)}`);
	}

	if (lowered.startsWith('time')) {
		const withTimezone = lowered.includes('with time zone');
		const precision = lowered.match(/^time\((\d+)\)/)?.[1];
		const configEntries = [
			precision ? `precision: ${precision}` : undefined,
			withTimezone ? 'withTimezone: true' : undefined,
		].filter(Boolean);
		const config = configEntries.length > 0 ? `{ ${configEntries.join(', ')} }` : undefined;
		return withDefault(`${withCasingForColumn(name, casing)}: ${callColumn('time', name, casing, config)}`);
	}

	if (lowered === 'blob') {
		return withDefault(`${withCasingForColumn(name, casing)}: ${callColumn('blob', name, casing, '{ mode: "buffer" }')}`);
	}

	return `// Warning: Can't parse ${type} from database\n\t// ${type}Type: ${type}("${name}")`;
};

const withCasingForColumn = (value: string, casing: Casing) => {
	if (casing === 'preserve') {
		return escapeColumnKey(value);
	}
	if (casing === 'camel') {
		return escapeColumnKey(value.camelCase());
	}

	assertUnreachable(casing);
};

const createTableColumns = (
	columns: Column[],
	fks: ForeignKey[],
	withCasing: (value: string) => string,
	casing: Casing,
	relations: Set<string>,
): string => {
	let statement = '';

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
		statement += column(it.type, it.name, it.default, casing);
		statement += it.primaryKey ? '.primaryKey()' : '';
		statement += it.identity
			? `.${it.identity.type === 'always' ? 'generatedAlwaysAsIdentity' : 'generatedByDefaultAsIdentity'}(${
				it.identity.name ? `{ name: "${it.identity.name}" }` : ''
			})`
			: '';
		statement += it.notNull && !it.identity ? '.notNull()' : '';

		statement += it.generated
			? `.generatedAlwaysAs(sql\`${
				it.generated.as
					.replace(/`/g, '\\`')
					.replace(/^\(([\s\S]*)\)$/, '$1')
			}\`, { mode: "${it.generated.type}" })`
			: '';

		const fks = fkByColumnName[it.name];
		if (fks) {
			const fksStatement = fks
				.map((it) => {
					const onDelete = it.onDelete && it.onDelete !== 'no action' ? it.onDelete : null;
					const onUpdate = it.onUpdate && it.onUpdate !== 'no action' ? it.onUpdate : null;
					const params = objToStatement({ onDelete, onUpdate });

					const typeSuffix = isCyclic(it, relations) ? ': AnyFirebirdColumn' : '';

					if (params) {
						return `.references(()${typeSuffix} => ${
							withCasing(
								it.tableTo,
							)
						}.${withCasing(it.columnsTo[0])}, ${params})`;
					}
					return `.references(()${typeSuffix} => ${
						withCasing(
							it.tableTo,
						)
					}.${withCasing(it.columnsTo[0])})`;
				})
				.join('');
			statement += fksStatement;
		}

		statement += ',\n';
	});

	return statement;
};

const objToStatement = (json: Record<string, string | null>) => {
	json = Object.fromEntries(Object.entries(json).filter((it) => it[1]));

	const keys = Object.keys(json);
	if (keys.length === 0) return;

	let statement = '{ ';
	statement += keys.map((it) => `${it}: "${json[it]}"`).join(', ');
	statement += ' }';
	return statement;
};

const createTableIndexes = (
	idxs: Index[],
	withCasing: (value: string) => string,
	schema: FirebirdSchemaInternal,
): string => {
	let statement = '';

	idxs.forEach((it) => {
		const escapedIndexName = `"${it.name}"`;
		statement += `\n\t`;
		statement += it.isUnique ? 'uniqueIndex(' : 'index(';
		statement += `${escapedIndexName})`;
		statement += `.on(${
			it.columns
				.map((column) => {
					const isExpression = schema.internal?.indexes?.[it.name]?.columns[column]?.isExpression;
					return isExpression ? `sql\`${column.replaceAll('`', '\\`')}\`` : `table.${withCasing(column)}`;
				})
				.join(', ')
		})`;
		statement += it.where ? `.where(sql\`${it.where.replaceAll('`', '\\`')}\`)` : '';
		statement += ',';
	});

	return statement;
};

const createTableUniques = (
	unqs: UniqueConstraint[],
	withCasing: (value: string) => string,
): string => {
	let statement = '';

	unqs.forEach((it) => {
		statement += `\n\t`;
		statement += 'unique(';
		statement += `"${it.name}")`;
		statement += `.on(${
			it.columns
				.map((it) => `table.${withCasing(it)}`)
				.join(', ')
		}),`;
	});

	return statement;
};

const createTableChecks = (
	checks: CheckConstraint[],
): string => {
	let statement = '';

	checks.forEach((it) => {
		statement += `\n\t`;
		statement += 'check(';
		statement += `"${it.name}", `;
		statement += `sql\`${it.value.replaceAll('`', '\\`')}\`)`;
		statement += `,`;
	});

	return statement;
};

const createTablePKs = (pks: PrimaryKey[], withCasing: (value: string) => string): string => {
	let statement = '';

	pks.forEach((it) => {
		statement += `\n\t`;
		statement += 'primaryKey({ columns: [';
		statement += `${
			it.columns
				.map((c) => {
					return `table.${withCasing(c)}`;
				})
				.join(', ')
		}]${it.name ? `, name: "${it.name}"` : ''}}`;
		statement += '),';
	});

	return statement;
};

const createTableFKs = (fks: ForeignKey[], withCasing: (value: string) => string): string => {
	let statement = '';

	fks.forEach((it) => {
		const selfReference = it.tableTo === it.tableFrom;
		const tableTo = selfReference ? 'table' : `${withCasing(it.tableTo)}`;
		statement += `\n\t`;
		statement += `foreignKey(() => ({\n`;
		statement += `\t\tcolumns: [${
			it.columnsFrom
				.map((i) => `table.${withCasing(i)}`)
				.join(', ')
		}],\n`;
		statement += `\t\tforeignColumns: [${
			it.columnsTo
				.map((i) => `${tableTo}.${withCasing(i)}`)
				.join(', ')
		}],\n`;
		statement += `\t\tname: "${it.name}"\n`;
		statement += `\t}))`;

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
