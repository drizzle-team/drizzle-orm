import type { Simplify } from '../../utils';
import type { JsonStatement } from './statements';

export const convertor = <TType extends JsonStatement['type'], TStatement extends Extract<JsonStatement, { type: TType }>>(
	type: TType,
	convertor: (statement: Simplify<Omit<TStatement, 'type'>>) => string | string[],
) => {
	return {
		type,
		can: (st: JsonStatement) => {
			return st.type === type;
		},
		convert: convertor,
	};
};

const createTable = convertor('create_table', (st) => {
	const {
		name: tableName,
		columns,
		fks: referenceData,
		pk,
		uniques: uniqueConstraints,
		checks: checkConstraints,
	} = st.table;

	let statement = '';
	statement += `CREATE TABLE \`${tableName}\` (\n`;
	for (let i = 0; i < columns.length; i++) {
		const column = columns[i];

		/*
			https://www.sqlite.org/lang_createtable.html#the_generated_always_as_clause

			According to the SQL standard, PRIMARY KEY should always imply NOT NULL.
			Unfortunately, due to a bug in some early versions, this is not the case in SQLite.
			Unless the column is an INTEGER PRIMARY KEY or the table is a WITHOUT ROWID table
			or a STRICT table or the column is declared NOT NULL,
			SQLite allows NULL values in a PRIMARY KEY column.
			SQLite could be fixed to conform to the standard, but doing so
			might break legacy applications. Hence, it has been decided to merely document the fact
			that SQLite allows NULLs in most PRIMARY KEY columns.
		 */
		const omitNotNull = column.primaryKey && column.type.toLowerCase().startsWith('int');

		// pk check is needed
		const primaryKeyStatement =
			column.primaryKey || (pk && pk.columns.length === 1 && pk.columns[0] === column.name)
				? ' PRIMARY KEY'
				: '';
		const notNullStatement = column.notNull && !omitNotNull ? ' NOT NULL' : '';

		// in SQLite we escape single quote by doubling it, `'`->`''`, but we don't do it here
		// because it is handled by drizzle orm serialization or on drizzle studio side
		const defaultStatement = column.default
			? ` DEFAULT ${
				column.default.isExpression ? column.default.value : `'${column.default.value.replace(/'/g, "''")}'`
			}`
			: '';

		const autoincrementStatement = column.autoincrement
			? ' AUTOINCREMENT'
			: '';

		const generatedStatement = column.generated
			? ` GENERATED ALWAYS AS ${column.generated.as} ${column.generated.type.toUpperCase()}`
			: '';

		const uniqueStatement = column.unique ? column.unique.name ? ` UNIQUE(\`${column.unique.name}\`)` : ' UNIQUE' : '';

		statement += '\t';
		statement +=
			`\`${column.name}\` ${column.type}${primaryKeyStatement}${autoincrementStatement}${defaultStatement}${generatedStatement}${notNullStatement}${uniqueStatement}`;

		statement += i === columns.length - 1 ? '' : ',\n';
	}

	if (pk && pk.columns.length > 1) {
		statement += ',\n\t';
		statement += `PRIMARY KEY(${pk.columns.map((it) => `\`${it}\``).join(', ')})`;
	}

	for (let i = 0; i < referenceData.length; i++) {
		const {
			name,
			tableFrom,
			tableTo,
			columnsFrom,
			columnsTo,
			onDelete,
			onUpdate,
		} = referenceData[i];

		const onDeleteStatement = onDelete ? ` ON DELETE ${onDelete}` : '';
		const onUpdateStatement = onUpdate ? ` ON UPDATE ${onUpdate}` : '';
		const fromColumnsString = columnsFrom.map((it) => `\`${it}\``).join(',');
		const toColumnsString = columnsTo.map((it) => `\`${it}\``).join(',');

		statement += ',';
		statement += '\n\t';
		statement +=
			`FOREIGN KEY (${fromColumnsString}) REFERENCES \`${tableTo}\`(${toColumnsString})${onUpdateStatement}${onDeleteStatement}`;
	}
	
	if (
		typeof uniqueConstraints !== 'undefined'
		&& uniqueConstraints.length > 0
	) {
		for (const uniqueConstraint of uniqueConstraints) {
			statement += ',\n';
			statement += `\tCONSTRAINT ${uniqueConstraint.name} UNIQUE(\`${uniqueConstraint.columns.join(`\`,\``)}\`)`;
		}
	}

	if (
		typeof checkConstraints !== 'undefined'
		&& checkConstraints.length > 0
	) {
		for (const check of checkConstraints) {
			statement += ',\n';
			statement += `\tCONSTRAINT "${check.name}" CHECK(${check.value})`;
		}
	}

	statement += `\n`;
	statement += `);`;
	statement += `\n`;
	return statement;
});

const dropTable = convertor('drop_table', (st) => {
	return `DROP TABLE \`${st.tableName}\`;`;
});

const renameTable = convertor('rename_table', (st) => {
	return `ALTER TABLE \`${st.from}\` RENAME TO \`${st.to}\`;`;
});

const createView = convertor('create_view', (st) => {
	const { definition, name } = st.view;
	return `CREATE VIEW \`${name}\` AS ${definition};`;
});

const dropView = convertor('drop_view', (st) => {
	return `DROP VIEW \`${st.view.name}\`;`;
});

const alterTableAddColumn = convertor('add_column', (st) => {
	const { fk, column } = st;
	const { table: tableName, name, type, notNull, primaryKey, generated } = st.column;

	const defaultStatement = `${
		column.default
			? ` DEFAULT ${
				column.default.isExpression ? column.default.value : `'${column.default.value.replace(/'/g, "''")}'`
			}`
			: ''
	}`;
	const notNullStatement = `${notNull ? ' NOT NULL' : ''}`;
	const primaryKeyStatement = `${primaryKey ? ' PRIMARY KEY' : ''}`;
	const referenceStatement = `${
		fk
			? ` REFERENCES ${fk.tableTo}(${fk.columnsTo})`
			: ''
	}`;

	const generatedStatement = generated
		? ` GENERATED ALWAYS AS ${generated.as} ${generated.type.toUpperCase()}`
		: '';

	return `ALTER TABLE \`${tableName}\` ADD \`${name}\` ${type}${primaryKeyStatement}${defaultStatement}${generatedStatement}${notNullStatement}${referenceStatement};`;
});

const alterTableRenameColumn = convertor('rename_column', (st) => {
	return `ALTER TABLE \`${st.table}\` RENAME COLUMN \`${st.from}\` TO \`${st.to}\`;`;
});

const alterTableDropColumn = convertor('drop_column', (st) => {
	return `ALTER TABLE \`${st.column.table}\` DROP COLUMN \`${st.column.name}\`;`;
});

const alterTableRecreateColumn = convertor('recreate_column', (st) => {
	const drop = alterTableDropColumn.convert(st) as string;
	const add = alterTableAddColumn.convert(st) as string;

	return [drop, add];
});

const createIndex = convertor('create_index', (st) => {
	const { columns, isUnique, where, name, table } = st.index;

	const idx = isUnique ? 'UNIQUE INDEX' : 'INDEX';
	const onStatement = columns.map((it) => it.isExpression ? it.value : `\`${it.value}\``).join(',');
	const whereStatement = where ? ` WHERE ${where}` : '';

	return `CREATE ${idx} \`${name}\` ON \`${table}\` (${onStatement})${whereStatement};`;
});

const dropIndex = convertor('drop_index', (st) => {
	return `DROP INDEX IF EXISTS \`${st.index}\`;`;
});

const recreateTable = convertor('recreate_table', (st) => {
	const { name, columns } = st.table;

	// TODO: filter out generated columns
	// TODO: test above
	const columnNames = columns.filter((it) => !it.generated).map((it) => `\`${it.name}\``).join(', ');
	const newTableName = `__new_${name}`;

	const sqlStatements: string[] = [];

	sqlStatements.push(`PRAGMA foreign_keys=OFF;`);

	const tmpTable = {
		...st.table,
		name: newTableName,
		checks: st.table.checks.map((it) => ({ ...it, table: newTableName })),
	};
	sqlStatements.push(createTable.convert({ table: tmpTable }) as string);

	// migrate data
	// TODO: columns mismatch?
	sqlStatements.push(
		`INSERT INTO \`${newTableName}\`(${columnNames}) SELECT ${columnNames} FROM \`${st.table.name}\`;`,
	);
	sqlStatements.push(dropTable.convert({ tableName: name }) as string);
	sqlStatements.push(renameTable.convert({ from: newTableName, to: name }) as string);

	sqlStatements.push(`PRAGMA foreign_keys=ON;`);

	return sqlStatements;
});

const convertors = [
	createTable,
	dropTable,
	renameTable,
	createView,
	dropView,
	alterTableAddColumn,
	alterTableRenameColumn,
	alterTableDropColumn,
	alterTableRecreateColumn,
	createIndex,
	dropIndex,
	recreateTable,
];

export function fromJson(statements: JsonStatement[]) {
	const grouped = statements
		.map((statement) => {
			const filtered = convertors.filter((it) => {
				return it.can(statement);
			});

			const convertor = filtered.length === 1 ? filtered[0] : undefined;
			if (!convertor) {
				return null;
			}

			const sqlStatements = convertor.convert(statement as any);
			const statements = typeof sqlStatements === 'string' ? [sqlStatements] : sqlStatements;
			return { jsonStatement: statement, sqlStatements: statements };
		})
		.filter((it) => it !== null);

	const result = {
		sqlStatements: grouped.map((it) => it.sqlStatements).flat(),
		groupedStatements: grouped,
	};
	return result;
}
