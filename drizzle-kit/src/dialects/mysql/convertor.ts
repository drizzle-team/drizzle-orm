import { Simplify } from '../../utils';
import { defaultToSQL } from './grammar';
import { JsonStatement } from './statements';

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
	const { name, columns, pk, checks, indexes, fks } = st.table;

	const uniqueIndexes = indexes.filter((it) => it.isUnique);

	let statement = '';
	statement += `CREATE TABLE \`${name}\` (\n`;

	for (let i = 0; i < columns.length; i++) {
		const column = columns[i];

		const isPK = pk && !pk.nameExplicit && pk.columns.length === 1 && pk.columns[0] === column.name;
		const primaryKeyStatement = isPK ? ' PRIMARY KEY' : '';
		const notNullStatement = column.notNull && !isPK ? ' NOT NULL' : '';
		const def = defaultToSQL(column.default);
		const defaultStatement = def ? ` DEFAULT ${def}` : '';

		const onUpdateStatement = column.onUpdateNow
			? ` ON UPDATE CURRENT_TIMESTAMP`
			: '';

		const autoincrementStatement = column.autoIncrement && column.type !== 'serial'
			? ' AUTO_INCREMENT'
			: '';

		const generatedStatement = column.generated
			? ` GENERATED ALWAYS AS (${column.generated?.as}) ${column.generated?.type.toUpperCase()}`
			: '';

		statement += '\t'
			+ `\`${column.name}\` ${column.type}${autoincrementStatement}${primaryKeyStatement}${generatedStatement}${notNullStatement}${defaultStatement}${onUpdateStatement}`;
		statement += i === columns.length - 1 ? '' : ',\n';
	}

	if (pk && (pk.columns.length > 1 || pk.nameExplicit)) {
		statement += ',\n';
		statement += `\tCONSTRAINT \`${pk.name}\` PRIMARY KEY(\`${pk.columns.join(`\`,\``)}\`)`;
	}

	for (const unique of uniqueIndexes) {
		statement += ',\n';
		const uniqueString = unique.columns
			.map((it) => it.isExpression ? `${it.value}` : `\`${it.value}\``)
			.join(',');

		statement += `\tCONSTRAINT \`${unique.name}\` UNIQUE(${uniqueString})`;
	}

	// TODO remove from create_table
	for (const fk of fks) {
		statement += ',\n';
		statement += `\tCONSTRAINT \`${fk.name}\` FOREIGN KEY (\`${
			fk.columns.join('`,`')
		}\`) REFERENCES \`${fk.tableTo}\`(\`${fk.columnsTo.join('`,`')}\`)`;
	}

	for (const check of checks) {
		statement += ',\n';
		statement += `\tCONSTRAINT \`${check.name}\` CHECK(${check.value})`;
	}

	statement += `\n);`;
	statement += `\n`;
	return statement;
});

const dropTable = convertor('drop_table', (st) => {
	return `DROP TABLE \`${st.table}\`;`;
});

const renameTable = convertor('rename_table', (st) => {
	return `RENAME TABLE \`${st.from}\` TO \`${st.to}\`;`;
});

const addColumn = convertor('add_column', (st) => {
	const { column, isPK } = st;
	const {
		name,
		type,
		notNull,
		table,
		onUpdateNow,
		autoIncrement,
		generated,
	} = column;

	const def = defaultToSQL(column.default);
	const defaultStatement = def ? ` DEFAULT ${def}` : '';

	const notNullStatement = `${notNull ? ' NOT NULL' : ''}`;
	const primaryKeyStatement = `${isPK ? ' PRIMARY KEY' : ''}`;
	const autoincrementStatement = `${autoIncrement ? ' AUTO_INCREMENT' : ''}`;
	const onUpdateStatement = `${onUpdateNow ? ' ON UPDATE CURRENT_TIMESTAMP' : ''}`;

	const generatedStatement = generated
		? ` GENERATED ALWAYS AS (${generated?.as}) ${generated?.type.toUpperCase()}`
		: '';

	return `ALTER TABLE \`${table}\` ADD \`${name}\` ${type}${primaryKeyStatement}${autoincrementStatement}${defaultStatement}${generatedStatement}${notNullStatement}${onUpdateStatement};`;
});

const dropColumn = convertor('drop_column', (st) => {
	return `ALTER TABLE \`${st.column.table}\` DROP COLUMN \`${st.column.name}\`;`;
});

const renameColumn = convertor('rename_column', (st) => {
	return `ALTER TABLE \`${st.table}\` RENAME COLUMN \`${st.from}\` TO \`${st.to}\`;`;
});

const alterColumn = convertor('alter_column', (st) => {
	const { diff, column, isPK } = st;

	const def = defaultToSQL(column.default);
	const defaultStatement = def ? ` DEFAULT ${def}` : '';

	const notNullStatement = `${column.notNull ? ' NOT NULL' : ''}`;
	const primaryKeyStatement = `${isPK ? ' PRIMARY KEY' : ''}`;
	const autoincrementStatement = `${column.autoIncrement ? ' AUTO_INCREMENT' : ''}`;
	const onUpdateStatement = `${column.onUpdateNow ? ' ON UPDATE CURRENT_TIMESTAMP' : ''}`;

	const generatedStatement = column.generated
		? ` GENERATED ALWAYS AS (${column.generated.as}) ${column.generated.type.toUpperCase()}`
		: '';

	return `ALTER TABLE \`${column.table}\` MODIFY COLUMN \`${column.name}\` ${column.type}${primaryKeyStatement}${autoincrementStatement}${defaultStatement}${generatedStatement}${notNullStatement}${onUpdateStatement};`;
});

const recreateColumn = convertor('recreate_column', (st) => {
	return [dropColumn.convert(st) as string, addColumn.convert(st) as string];
});

const createIndex = convertor('create_index', (st) => {
	// TODO: handle everything?
	const { name, table, columns, isUnique, algorithm, entityType, lock, using } = st.index;
	const indexPart = isUnique ? 'UNIQUE INDEX' : 'INDEX';

	const uniqueString = columns
		.map((it) => it.isExpression ? `${it.value}` : `\`${it.value}\``)
		.join(',');

	return `CREATE ${indexPart} \`${name}\` ON \`${table}\` (${uniqueString});`;
});

const dropIndex = convertor('drop_index', (st) => {
	return `DROP INDEX \`${st.index.name}\` ON \`${st.index.table}\`;`;
});

const createFK = convertor('create_fk', (st) => {
	const {
		name,
		table,
		columns,
		tableTo,
		columnsTo,
		onDelete,
		onUpdate,
	} = st.fk;
	const onDeleteStatement = onDelete !== 'NO ACTION' ? ` ON DELETE ${onDelete}` : '';
	const onUpdateStatement = onUpdate !== 'NO ACTION' ? ` ON UPDATE ${onUpdate}` : '';
	const fromColumnsString = columns.map((it) => `\`${it}\``).join(',');
	const toColumnsString = columnsTo.map((it) => `\`${it}\``).join(',');

	return `ALTER TABLE \`${table}\` ADD CONSTRAINT \`${name}\` FOREIGN KEY (${fromColumnsString}) REFERENCES \`${tableTo}\`(${toColumnsString})${onDeleteStatement}${onUpdateStatement};`;
});

{
	// alter generated for column -> recreate
}

const createPK = convertor('create_pk', (st) => {
	return `ALTER TABLE \`${st.pk.table}\` ADD PRIMARY KEY (\`${st.pk.columns.join('`,`')}\`);`;
});

const dropPK = convertor('drop_pk', (st) => {
	return `ALTER TABLE \`${st.pk.table}\` DROP PRIMARY KEY;`;
});

const recreatePK = convertor('recreate_pk', (st) => {
	return `ALTER TABLE \`${st.pk.table}\` DROP PRIMARY KEY, ADD PRIMARY KEY(\`${st.pk.columns.join('`,`')}\`);`;
});

const createCheck = convertor('create_check', (st) => {
	return `ALTER TABLE \`${st.check.table}\` ADD CONSTRAINT \`${st.check.name}\` CHECK (${st.check.value});`;
});

const dropConstraint = convertor('drop_constraint', (st) => {
	return `ALTER TABLE \`${st.table}\` DROP CONSTRAINT \`${st.constraint}\`;`;
});

const createView = convertor('create_view', (st) => {
	const { definition, name, algorithm, sqlSecurity, withCheckOption } = st.view;

	let statement = `CREATE `;
	statement += st.replace ? `OR REPLACE ` : ''; // NO replace was in the code
	statement += algorithm ? `ALGORITHM = ${algorithm} ` : '';
	statement += sqlSecurity ? `SQL SECURITY ${sqlSecurity} ` : '';
	statement += `VIEW \`${name}\` AS (${definition})`;
	statement += withCheckOption ? ` WITH ${withCheckOption} CHECK OPTION` : '';

	statement += ';';

	return statement;
});

const dropView = convertor('drop_view', (st) => {
	return `DROP VIEW \`${st.name}\`;`;
});

const renameView = convertor('rename_view', (st) => {
	return `RENAME TABLE \`${st.from}\` TO \`${st.to}\`;`;
});

const alterView = convertor('alter_view', (st) => {
	const { name, definition, withCheckOption, algorithm, sqlSecurity } = st.view;

	let statement = `ALTER `;
	statement += `ALGORITHM = ${algorithm} `;
	statement += `SQL SECURITY ${sqlSecurity} `;
	statement += `VIEW \`${name}\` AS ${definition}`;
	statement += withCheckOption ? ` WITH ${withCheckOption} CHECK OPTION` : '';
	statement += ';';

	return statement;
});

const convertors = [
	createTable,
	dropTable,
	renameTable,
	addColumn,
	dropColumn,
	renameColumn,
	alterColumn,
	recreateColumn,
	createIndex,
	dropIndex,
	createFK,
	createPK,
	dropPK,
	recreatePK,
	createCheck,
	dropConstraint,
	createView,
	dropView,
	renameView,
	alterView,
];

export function fromJson(
	statements: JsonStatement[],
) {
	const grouped = statements
		.map((statement) => {
			const filtered = convertors.filter((it) => {
				return it.can(statement);
			});

			const convertor = filtered.length === 1 ? filtered[0] : undefined;
			if (!convertor) {
				console.error('cant:', statement.type);
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
