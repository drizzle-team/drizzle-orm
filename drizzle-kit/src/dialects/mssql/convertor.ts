import { Simplify } from '../../utils';
import { defaultNameForPK, defaultToSQL } from './grammar';
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
	const { name, schema, columns, pk, checks, indexes, fks, uniques } = st.table;

	const uniqueIndexes = indexes.filter((it) => it.isUnique);

	let statement = '';

	const key = schema !== 'dbo' ? `[${schema}].[${name}]` : `[${name}]`;
	statement += `CREATE TABLE ${key} (\n`;

	for (let i = 0; i < columns.length; i++) {
		const column = columns[i];

		const isPK = pk && pk.columns.length === 1 && pk.columns[0] === column.name
			&& pk.name === defaultNameForPK(column.table);

		const identity = column.identity;
		const identityStatement = identity ? ` IDENTITY(${identity.seed}, ${identity.increment})` : '';
		const notNullStatement = isPK ? '' : column.notNull && !column.identity ? ' NOT NULL' : '';

		const def = defaultToSQL(column.default);
		const defaultStatement = def ? ` DEFAULT ${def}` : '';

		const generatedStatement = column.generated
			? ` AS (${column.generated?.as}) ${column.generated?.type.toUpperCase()}`
			: '';

		statement += '\t'
			+ `[${column.name}] ${column.type}${identityStatement}${generatedStatement}${notNullStatement}${defaultStatement}`;
		statement += i === columns.length - 1 ? '' : ',\n';
	}

	if (pk) {
		statement += ',\n';
		statement += `\tCONSTRAINT [${pk.name}] PRIMARY KEY([${pk.columns.join(`],[`)}])`;
	}

	for (const unique of uniques) {
		statement += ',\n';
		const uniqueString = unique.columns.join(',');

		statement += `\tCONSTRAINT [${unique.name}] UNIQUE([${uniqueString}])`;
	}

	for (const fk of fks) {
		statement += ',\n';
		statement += `\tCONSTRAINT [${fk.name}] FOREIGN KEY ([${fk.columns.join('],[')}]) REFERENCES [${fk.tableTo}]([${
			fk.columnsTo.join('],[')
		}])`;
	}

	for (const check of checks) {
		statement += ',\n';
		statement += `\tCONSTRAINT [${check.name}] CHECK (${check.value})`;
	}

	statement += `\n);`;
	statement += `\n`;
	return statement;
});

const dropTable = convertor('drop_table', (st) => {
	return `DROP TABLE [${st.table.name}];`;
});

const renameTable = convertor('rename_table', (st) => {
	return `EXEC sp_rename '[${st.from}]', [${st.to}];`;
});

const addColumn = convertor('add_column', (st) => {
	const { column, isPK } = st;
	const {
		name,
		type,
		notNull,
		table,
		generated,
		identity,
	} = column;

	const def = defaultToSQL(column.default);
	const defaultStatement = def ? ` DEFAULT ${def}` : '';

	const notNullStatement = `${notNull ? ' NOT NULL' : ''}`;
	// const primaryKeyStatement = `${isPK ? ' PRIMARY KEY' : ''}`; // TODO should it be here? not sure, because of the names for constraints
	const identityStatement = identity ? ` IDENTITY(${identity.seed}, ${identity.increment})` : '';

	const generatedStatement = generated
		? ` AS (${generated?.as}) ${generated?.type.toUpperCase()}`
		: '';

	let statement = `ALTER TABLE [${table}] ADD [${name}]`;
	if (!generated) statement += ` ${type}`;
	statement += `${identityStatement}${defaultStatement}${generatedStatement}${notNullStatement};`;

	return statement;
});

const dropColumn = convertor('drop_column', (st) => {
	return `ALTER TABLE [${st.column.table}] DROP COLUMN [${st.column.name}];`;
});

const renameColumn = convertor('rename_column', (st) => {
	const { table: tableFrom, name: columnFrom } = st.from;
	const { name: columnTo } = st.to;
	return `EXEC sp_rename '[${tableFrom}].[${columnFrom}]', [${columnTo}], 'COLUMN';`;
});

const alterColumn = convertor('alter_column', (st) => {
	const { diff, column, isPK } = st;

	const def = defaultToSQL(column.default);
	const defaultStatement = def ? ` DEFAULT ${def}` : '';

	const identity = column.identity;

	const notNullStatement = `${column.notNull ? ' NOT NULL' : ''}`;
	const primaryKeyStatement = `${isPK ? ' PRIMARY KEY' : ''}`;
	const identityStatement = identity ? ` IDENTITY(${identity.seed}, ${identity.increment})` : '';

	const generatedStatement = column.generated
		? ` AS (${column.generated.as}) ${column.generated.type.toUpperCase()}`
		: '';

	return `ALTER TABLE [${column.table}] ALTER COLUMN [${column.name}] ${column.type}${primaryKeyStatement}${identityStatement}${defaultStatement}${generatedStatement}${notNullStatement};`;
});

const recreateColumn = convertor('recreate_column', (st) => {
	return [dropColumn.convert(st) as string, addColumn.convert(st) as string];
});

const createIndex = convertor('create_index', (st) => {
	// TODO: handle everything?
	const { name, table, columns, isUnique, where } = st.index;
	const indexPart = isUnique ? 'UNIQUE INDEX' : 'INDEX';

	const uniqueString = columns
		.map((it) => it.isExpression ? `${it.value}` : `[${it.value}]`)
		.join(',');

	const whereClause = where ? ` WHERE ${where}` : '';

	return `CREATE ${indexPart} [${name}] ON [${table}] (${uniqueString})${whereClause};`;
});

const dropIndex = convertor('drop_index', (st) => {
	return `DROP INDEX [${st.index.name}] ON [${st.index.table}];`;
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
	const fromColumnsString = columns.map((it) => `[${it}]`).join(',');
	const toColumnsString = columnsTo.map((it) => `[${it}]`).join(',');

	return `ALTER TABLE [${table}] ADD CONSTRAINT [${name}] FOREIGN KEY (${fromColumnsString}) REFERENCES [${tableTo}](${toColumnsString})${onDeleteStatement}${onUpdateStatement};`;
});

{
	// alter generated for column -> recreate
}

const createPK = convertor('create_pk', (st) => {
	const { name } = st.pk;
	return `ALTER TABLE [${st.pk.table}] ADD CONSTRAINT [${name}] PRIMARY KEY ([${st.pk.columns.join('],[')}]);`;
});

const createCheck = convertor('create_check', (st) => {
	return `ALTER TABLE [${st.check.table}] ADD CONSTRAINT [${st.check.name}] CHECK (${st.check.value});`;
});

const dropConstraint = convertor('drop_constraint', (st) => {
	return `ALTER TABLE [${st.table}] DROP CONSTRAINT [${st.constraint}];`;
});

const createView = convertor('create_view', (st) => {
	const { definition, name, checkOption, encryption, schemaBinding, viewMetadata, schema } = st.view;

	let statement = `CREATE `;

	const key = schema === 'dbo' ? `[${name}]` : `[${schema}].[${name}]`;
	statement += `VIEW ${key}`;

	if (encryption || schemaBinding || viewMetadata) {
		const options: string[] = [];
		statement += `\nWITH`;

		if (encryption) options.push(`ENCRYPTION`);
		if (schemaBinding) options.push(`SCHEMABINDING`);
		if (viewMetadata) options.push(`VIEW_METADATA`);

		statement += ` ${options.join(', ')}`;
	}
	statement += ` AS (${definition})`;
	statement += checkOption ? `\nWITH CHECK OPTION` : '';

	statement += ';';

	return statement;
});

const dropView = convertor('drop_view', (st) => {
	const { schema, name } = st.view;
	const key = schema === 'dbo' ? `[${name}]` : `[${schema}].[${name}]`;

	return `DROP VIEW ${key};`;
});

const renameView = convertor('rename_view', (st) => {
	const { schema, name } = st.from;
	const key = schema === 'dbo' ? `[${name}]` : `[${schema}].[${name}]`;

	return `EXEC sp_rename '${key}', [${st.to.name}];`;
});

const alterView = convertor('alter_view', (st) => {
	const { definition, name, checkOption, encryption, schemaBinding, viewMetadata } = st.view;

	let statement = `ALTER `;
	statement += `VIEW [${name}]`;

	if (encryption || schemaBinding || viewMetadata) {
		const options: string[] = [];
		statement += `\nWITH`;

		if (encryption) options.push(`ENCRYPTION`);
		if (schemaBinding) options.push(`SCHEMABINDING`);
		if (viewMetadata) options.push(`VIEW_METADATA`);

		statement += ` ${options.join(', ')}`;
	}
	statement += ` AS (${definition})`;
	statement += checkOption ? `\nWITH CHECK OPTION` : '';

	statement += ';';

	return statement;
});

const createSchema = convertor('create_schema', (st) => {
	return `CREATE SCHEMA [${st.name}];\n`;
});

const dropSchema = convertor('drop_schema', (st) => {
	return `DROP SCHEMA [${st.name}];\n`;
});

const renameSchema = convertor('rename_schema', (st) => {
	return `/**
 * ⚠️ Renaming schemas is not supported in SQL Server (MSSQL),
 * and therefore is not supported in Drizzle ORM at this time
 * 
 * SQL Server does not provide a built-in command to rename a schema directly.
 * Workarounds involve creating a new schema and migrating objects manually
 */`;
});

const moveTable = convertor('move_table', (st) => {
	return `ALTER SCHEMA [${st.to}] TRANSFER [${st.from}].[${st.name}];\n`;
});

const moveView = convertor('move_view', (st) => {
	const { fromSchema, toSchema, view } = st;
	const from = fromSchema === 'dbo' ? `[${view.name}]` : `[${fromSchema}].[${view.name}]`;

	return `ALTER SCHEMA [${toSchema}] TRANSFER ${from};`;
});

const addUniqueConvertor = convertor('add_unique', (st) => {
	const { unique } = st;
	const tableNameWithSchema = unique.schema !== 'dbo'
		? `[${unique.schema}].[${unique.table}]`
		: `[${unique.table}]`;

	return `ALTER TABLE ${tableNameWithSchema} ADD CONSTRAINT [${unique.name}] UNIQUE([${unique.columns.join('],[')}]);`;
});

const dropPK = convertor('drop_pk', (st) => {
	const pk = st.pk;
	const key = pk.schema !== 'dbo'
		? `[${pk.schema}].[${pk.table}]`
		: `[${pk.table}]`;

	return `ALTER TABLE ${key} DROP CONSTRAINT [${pk.name}];`;
});

const recreatePK = convertor('alter_pk', (it) => {
	const drop = dropPK.convert({ pk: it.pk }) as string;
	const create = createPK.convert({ pk: it.pk }) as string;
	return [drop, create];
});

const recreateView = convertor('recreate_view', (st) => {
	const drop = dropView.convert({ view: st.from }) as string;
	const create = createView.convert({ view: st.to }) as string;
	return [drop, create];
});

const addCheck = convertor('add_check', (st) => {
	const { check } = st;
	const tableNameWithSchema = check.schema !== 'dbo'
		? `[${check.schema}].[${check.table}]`
		: `[${check.table}]`;

	return `ALTER TABLE ${tableNameWithSchema} ADD CONSTRAINT [${check.name}] CHECK (${check.value});`;
});

const dropCheck = convertor('drop_check', (st) => {
	const { check } = st;
	const tableNameWithSchema = check.schema !== 'dbo'
		? `[${check.schema}].[${check.table}]`
		: `[${check.table}]`;

	return `ALTER TABLE ${tableNameWithSchema} DROP CONSTRAINT [${check.name}];`;
});

const alterCheck = convertor('alter_check', (st) => {
	const check = st.diff;

	const dropObj = {
		entityType: check.entityType,
		name: check.name,
		schema: check.schema,
		nameExplicit: true, // we always get name from orm
		table: check.table,
		value: check.value!.from,
	};
	const createObj = {
		entityType: check.entityType,
		name: check.name,
		nameExplicit: true, // we always get name from orm
		schema: check.schema,
		table: check.table,
		value: check.value!.to,
	};

	const drop = dropCheck.convert({ check: dropObj }) as string;
	const create = addCheck.convert({ check: createObj }) as string;

	return [drop, create];
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
	createSchema,
	dropSchema,
	moveTable,
	moveView,
	recreateView,
	addCheck,
	dropCheck,
	alterCheck,
	renameSchema,
	addUniqueConvertor,
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
