import type { Simplify } from '../../utils';
import type { JsonStatement } from './statements';

export const convertor = <
	TType extends JsonStatement['type'],
	TStatement extends Extract<JsonStatement, { type: TType }>,
>(
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
		const isColumnPk = pk && pk.columns.length === 1 && pk.columns[0] === column.name && pk.table === column.table;
		const omitNotNull = isColumnPk && column.type.toLowerCase().startsWith('int');

		const primaryKeyStatement = isColumnPk && !pk.nameExplicit
			? ' PRIMARY KEY'
			: '';
		const notNullStatement = column.notNull && !omitNotNull ? ' NOT NULL' : '';

		const unique = uniqueConstraints.find((u) =>
			u.columns.length === 1 && u.columns[0] === column.name && u.table === column.table
		);
		const unqiueConstraintPrefix = unique
			? unique.nameExplicit ? ` CONSTRAINT \`${unique.name}\` UNIQUE` : ' UNIQUE'
			: '';

		// in SQLite we escape single quote by doubling it, `'`->`''`, but we don't do it here
		// because it is handled by drizzle orm serialization or on drizzle studio side
		const defaultStatement = column.default ? ` DEFAULT ${column.default ?? ''}` : '';

		const autoincrementStatement = column.autoincrement ? ' AUTOINCREMENT' : '';

		const generatedStatement = column.generated
			? ` GENERATED ALWAYS AS ${column.generated.as} ${column.generated.type.toUpperCase()}`
			: '';

		statement += '\t';
		statement +=
			`\`${column.name}\` ${column.type}${primaryKeyStatement}${autoincrementStatement}${defaultStatement}${generatedStatement}${notNullStatement}${unqiueConstraintPrefix}`;

		statement += i === columns.length - 1 ? '' : ',\n';
	}

	if (pk && (pk.columns.length > 1 || pk.nameExplicit)) {
		statement += ',\n\t';
		statement += `CONSTRAINT \`${pk.name}\` PRIMARY KEY(${pk.columns.map((it) => `\`${it}\``).join(', ')})`;
	}

	for (let i = 0; i < referenceData.length; i++) {
		const {
			name,
			tableTo,
			columns,
			columnsTo,
			onDelete,
			onUpdate,
		} = referenceData[i];

		const onDeleteStatement = (onDelete && onDelete !== 'NO ACTION') ? ` ON DELETE ${onDelete}` : '';
		const onUpdateStatement = (onUpdate && onUpdate !== 'NO ACTION') ? ` ON UPDATE ${onUpdate}` : '';
		const fromColumnsString = columns.map((it) => `\`${it}\``).join(',');
		const toColumnsString = columnsTo.map((it) => `\`${it}\``).join(',');

		statement += ',';
		statement += '\n\t';
		statement +=
			`CONSTRAINT \`${name}\` FOREIGN KEY (${fromColumnsString}) REFERENCES \`${tableTo}\`(${toColumnsString})${onUpdateStatement}${onDeleteStatement}`;
	}

	for (const uniqueConstraint of uniqueConstraints.filter((u) => u.columns.length > 1)) {
		statement += ',\n';
		statement += `\tCONSTRAINT \`${uniqueConstraint.name}\` UNIQUE(\`${uniqueConstraint.columns.join(`\`,\``)}\`)`;
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
	const { table: tableName, name, type, notNull, generated } = st.column;

	const defaultStatement = column.default !== null ? ` DEFAULT ${column.default ?? ''}` : '';

	const notNullStatement = `${notNull ? ' NOT NULL' : ''}`;

	const referenceStatement = `${
		fk
			? !fk.nameExplicit
				? ` REFERENCES ${fk.tableTo}(${fk.columnsTo})`
				: ` CONSTRAINT \`${fk.name}\` REFERENCES ${fk.tableTo}(${fk.columnsTo})`
			: ''
	}`;

	const generatedStatement = generated
		? ` GENERATED ALWAYS AS ${generated.as} ${generated.type.toUpperCase()}`
		: '';

	return `ALTER TABLE \`${tableName}\` ADD \`${name}\` ${type}${defaultStatement}${generatedStatement}${notNullStatement}${referenceStatement};`;
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
	return `DROP INDEX IF EXISTS \`${st.index.name}\`;`;
});

const recreateTable = convertor('recreate_table', (st) => {
	const { name } = st.to;
	const { columns: columnsFrom } = st.from;

	const columnNames = columnsFrom.filter((it) => {
		const newColumn = st.to.columns.find((col) => col.name === it.name);
		return !it.generated && newColumn && !newColumn.generated;
	}).map((it) => `\`${it.name}\``).join(', ');
	const newTableName = `__new_${name}`;

	const sqlStatements: string[] = [];

	sqlStatements.push(`PRAGMA foreign_keys=OFF;`);

	const tmpTable = {
		...st.to,
		name: newTableName,
		checks: st.to.checks.map((it) => ({ ...it, table: newTableName })),
	};
	sqlStatements.push(createTable.convert({ table: tmpTable }) as string);

	sqlStatements.push(
		`INSERT INTO \`${newTableName}\`(${columnNames}) SELECT ${columnNames} FROM \`${st.to.name}\`;`,
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
