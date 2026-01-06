import '../../@types/utils';
import { toCamelCase } from 'drizzle-orm/casing';
import { assertUnreachable } from 'src/utils';
import type { Casing } from '../../cli/validations/common';
import type {
	CheckConstraint,
	Column,
	DefaultConstraint,
	ForeignKey,
	Index,
	MssqlDDL,
	PrimaryKey,
	UniqueConstraint,
	ViewColumn,
} from './ddl';
import { fullTableFromDDL } from './ddl';
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
	'customType',
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

		if (x.entityType === 'fks') imports.add('foreignKey');

		if (x.entityType === 'pks') imports.add('primaryKey');
		if (x.entityType === 'uniques') imports.add('unique');
		if (x.entityType === 'checks') imports.add('check');
		if (x.entityType === 'views' && x.schema === 'dbo') imports.add('mssqlView');

		if (x.entityType === 'columns' || x.entityType === 'viewColumns') {
			const grammarType = typeFor(x.type);
			imports.add(grammarType.drizzleImport());
			if (mssqlImportsList.has(x.type)) imports.add(x.type);
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

const column = (
	type: string,
	name: string,
	casing: Casing,
	def: DefaultConstraint['default'],
) => {
	const lowered = type.toLowerCase();

	const grammarType = typeFor(lowered);
	const key = withCasing(name, casing);
	const { default: defToSet, options: optionsToSet, customType } = grammarType.toTs(type, def);
	const columnName = dbColumnName({ name, casing, withMode: Boolean(optionsToSet) });
	const drizzleType = grammarType.drizzleImport();

	let res = `${key}: ${drizzleType}${customType ? `({ dataType: () => '${customType}' })` : ''}(${columnName}${
		inspect(optionsToSet)
	})`;
	res += defToSet ? defToSet.startsWith('.') ? defToSet : `.default(${defToSet})` : '';
	return res;
};

const createViewColumns = (
	columns: ViewColumn[],
	casing: Casing,
) => {
	let statement = '';

	columns.forEach((it) => {
		const columnStatement = column(
			it.type,
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

		const name = it.name;
		// const escapedIndexName = indexGeneratedName === it.name ? '' : `"${it.name}"`;

		statement += it.isUnique ? '\tuniqueIndex(' : '\tindex(';
		statement += name ? `"${name}")` : ')';

		statement += `.on(${
			it.columns
				.map((it) => {
					if (it.isExpression) {
						return `sql\`${it.value}\``;
					} else {
						return `table.${withCasing(it.value, casing)}`;
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
