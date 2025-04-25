import { table } from 'console';
import { Simplify } from '../../utils';
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
	const { name, columns, pk, uniques, checks } = st.table;

	let statement = '';
	statement += `CREATE TABLE \`${name}\` (\n`;
	for (let i = 0; i < columns.length; i++) {
		const column = columns[i];

		const isPK = pk && !pk.nameExplicit && pk.columns.length === 1 && pk.columns[0] === column.name;
		const primaryKeyStatement = isPK ? ' PRIMARY KEY' : '';
		const notNullStatement = column.notNull && !isPK ? ' NOT NULL' : '';
		const defaultStatement = column.default ? ` DEFAULT ${column.default.value}` : '';

		const onUpdateStatement = column.onUpdateNow
			? ` ON UPDATE CURRENT_TIMESTAMP`
			: '';

		const autoincrementStatement = column.autoIncrement
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

	for (const unique of uniques.filter((it) => it.columns.length > 1 || it.nameExplicit)) {
		statement += ',\n';
		const uniqueString = unique.columns
			.map((it) => it.expression ? `${it.value}` : `\`${it.value}\``)
			.join(',');

		statement += `\tCONSTRAINT \`${unique.name}\` UNIQUE(${uniqueString})`;
	}

	for (const check of checks) {
		statement += ',\n';
		statement += `\tCONSTRAINT \`${check.name}\` CHECK(${check.value})`;
	}

	statement += `\n);`;
	statement += `\n`;
	return statement;
});

const createIndex = convertor('create_index', (st) => {
	// TODO: handle everything?
	const { name, table, columns, unique, algorithm, entityType, lock, nameExplicit, using } = st.index;
	const indexPart = unique ? 'UNIQUE INDEX' : 'INDEX';

	const uniqueString = columns
		.map((it) => it.isExpression ? `${it.value}` : `\`${it}\``)
		.join(',');

	return `CREATE ${indexPart} \`${name}\` ON \`${table}\` (${uniqueString});`;
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
	const onDeleteStatement = onDelete ? ` ON DELETE ${onDelete}` : '';
	const onUpdateStatement = onUpdate ? ` ON UPDATE ${onUpdate}` : '';
	const fromColumnsString = columns.map((it) => `\`${it}\``).join(',');
	const toColumnsString = columnsTo.map((it) => `\`${it}\``).join(',');

	return `ALTER TABLE \`${table}\` ADD CONSTRAINT \`${name}\` FOREIGN KEY (${fromColumnsString}) REFERENCES \`${tableTo}\`(${toColumnsString})${onDeleteStatement}${onUpdateStatement};`;
});

const convertors = [
	createTable,
	createIndex,
	createFK,
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
