import { BREAKPOINT } from './cli/commands/migrate';
import {
	JsonAddColumnStatement,
	JsonAddValueToEnumStatement,
	JsonAlterColumnAlterGeneratedStatement,
	JsonAlterColumnAlterIdentityStatement,
	JsonAlterColumnDropAutoincrementStatement,
	JsonAlterColumnDropDefaultStatement,
	JsonAlterColumnDropGeneratedStatement,
	JsonAlterColumnDropIdentityStatement,
	JsonAlterColumnDropNotNullStatement,
	JsonAlterColumnDropOnUpdateStatement,
	JsonAlterColumnDropPrimaryKeyStatement,
	JsonAlterColumnSetAutoincrementStatement,
	JsonAlterColumnSetDefaultStatement,
	JsonAlterColumnSetGeneratedStatement,
	JsonAlterColumnSetIdentityStatement,
	JsonAlterColumnSetNotNullStatement,
	JsonAlterColumnSetOnUpdateStatement,
	JsonAlterColumnSetPrimaryKeyStatement,
	JsonAlterColumnTypeStatement,
	JsonAlterCompositePK,
	JsonAlterReferenceStatement,
	JsonAlterSequenceStatement,
	JsonAlterTableRemoveFromSchema,
	JsonAlterTableSetNewSchema,
	JsonAlterTableSetSchema,
	JsonAlterUniqueConstraint,
	JsonCreateCompositePK,
	JsonCreateEnumStatement,
	JsonCreateIndexStatement,
	JsonCreateReferenceStatement,
	JsonCreateSchema,
	JsonCreateSequenceStatement,
	JsonCreateTableStatement,
	JsonCreateUniqueConstraint,
	JsonDeleteCompositePK,
	JsonDeleteReferenceStatement,
	JsonDeleteUniqueConstraint,
	JsonDropColumnStatement,
	JsonDropIndexStatement,
	JsonDropSequenceStatement,
	JsonDropTableStatement,
	JsonMoveSequenceStatement,
	JsonPgCreateIndexStatement,
	JsonRenameColumnStatement,
	JsonRenameSchema,
	JsonRenameSequenceStatement,
	JsonRenameTableStatement,
	JsonSqliteAddColumnStatement,
	JsonSqliteCreateTableStatement,
	JsonStatement,
} from './jsonStatements';
import { Dialect } from './schemaValidator';
import { MySqlSquasher } from './serializer/mysqlSchema';
import { PgSquasher } from './serializer/pgSchema';
import { SQLiteSquasher } from './serializer/sqliteSchema';

export const pgNativeTypes = new Set([
	'uuid',
	'smallint',
	'integer',
	'bigint',
	'boolean',
	'text',
	'varchar',
	'serial',
	'bigserial',
	'decimal',
	'numeric',
	'real',
	'json',
	'jsonb',
	'time',
	'time with time zone',
	'time without time zone',
	'time',
	'timestamp',
	'timestamp with time zone',
	'timestamp without time zone',
	'date',
	'interval',
	'bigint',
	'bigserial',
	'double precision',
	'interval year',
	'interval month',
	'interval day',
	'interval hour',
	'interval minute',
	'interval second',
	'interval year to month',
	'interval day to hour',
	'interval day to minute',
	'interval day to second',
	'interval hour to minute',
	'interval hour to second',
	'interval minute to second',
]);

const isPgNativeType = (it: string) => {
	if (pgNativeTypes.has(it)) return true;
	const toCheck = it.replace(/ /g, '');
	return (
		toCheck.startsWith('varchar(')
		|| toCheck.startsWith('char(')
		|| toCheck.startsWith('numeric(')
		|| toCheck.startsWith('timestamp(')
		|| toCheck.startsWith('doubleprecision[')
		|| toCheck.startsWith('intervalyear(')
		|| toCheck.startsWith('intervalmonth(')
		|| toCheck.startsWith('intervalday(')
		|| toCheck.startsWith('intervalhour(')
		|| toCheck.startsWith('intervalminute(')
		|| toCheck.startsWith('intervalsecond(')
		|| toCheck.startsWith('intervalyeartomonth(')
		|| toCheck.startsWith('intervaldaytohour(')
		|| toCheck.startsWith('intervaldaytominute(')
		|| toCheck.startsWith('intervaldaytosecond(')
		|| toCheck.startsWith('intervalhourtominute(')
		|| toCheck.startsWith('intervalhourtosecond(')
		|| toCheck.startsWith('intervalminutetosecond(')
		|| toCheck.startsWith('vector(')
		|| toCheck.startsWith('geometry(')
		|| /^(\w+)(\[\d*])+$/.test(it)
	);
};

abstract class Convertor {
	abstract can(statement: JsonStatement, dialect: Dialect): boolean;
	abstract convert(statement: JsonStatement): string | string[];
}

class PgCreateTableConvertor extends Convertor {
	can(statement: JsonStatement, dialect: Dialect): boolean {
		return statement.type === 'create_table' && dialect === 'postgresql';
	}

	convert(st: JsonCreateTableStatement) {
		const { tableName, schema, columns, compositePKs, uniqueConstraints } = st;

		let statement = '';
		const name = schema ? `"${schema}"."${tableName}"` : `"${tableName}"`;

		statement += `CREATE TABLE IF NOT EXISTS ${name} (\n`;
		for (let i = 0; i < columns.length; i++) {
			const column = columns[i];

			const primaryKeyStatement = column.primaryKey ? ' PRIMARY KEY' : '';
			const notNullStatement = column.notNull && !column.identity ? ' NOT NULL' : '';
			const defaultStatement = column.default !== undefined ? ` DEFAULT ${column.default}` : '';

			const uniqueConstraint = column.isUnique
				? ` CONSTRAINT "${column.uniqueName}" UNIQUE${column.nullsNotDistinct ? ' NULLS NOT DISTINCT' : ''}`
				: '';

			const schemaPrefix = column.typeSchema && column.typeSchema !== 'public'
				? `"${column.typeSchema}".`
				: '';

			const type = isPgNativeType(column.type)
				? column.type
				: `${schemaPrefix}"${column.type}"`;
			const generated = column.generated;

			const generatedStatement = generated ? ` GENERATED ALWAYS AS (${generated?.as}) STORED` : '';

			const unsquashedIdentity = column.identity
				? PgSquasher.unsquashIdentity(column.identity)
				: undefined;

			const identityWithSchema = schema
				? `"${schema}"."${unsquashedIdentity?.name}"`
				: `"${unsquashedIdentity?.name}"`;

			const identity = unsquashedIdentity
				? ` GENERATED ${
					unsquashedIdentity.type === 'always' ? 'ALWAYS' : 'BY DEFAULT'
				} AS IDENTITY (sequence name ${identityWithSchema}${
					unsquashedIdentity.increment
						? ` INCREMENT BY ${unsquashedIdentity.increment}`
						: ''
				}${
					unsquashedIdentity.minValue
						? ` MINVALUE ${unsquashedIdentity.minValue}`
						: ''
				}${
					unsquashedIdentity.maxValue
						? ` MAXVALUE ${unsquashedIdentity.maxValue}`
						: ''
				}${
					unsquashedIdentity.startWith
						? ` START WITH ${unsquashedIdentity.startWith}`
						: ''
				}${unsquashedIdentity.cache ? ` CACHE ${unsquashedIdentity.cache}` : ''}${
					unsquashedIdentity.cycle ? ` CYCLE` : ''
				})`
				: '';

			statement += '\t'
				+ `"${column.name}" ${type}${primaryKeyStatement}${defaultStatement}${generatedStatement}${notNullStatement}${uniqueConstraint}${identity}`;
			statement += i === columns.length - 1 ? '' : ',\n';
		}

		if (typeof compositePKs !== 'undefined' && compositePKs.length > 0) {
			statement += ',\n';
			const compositePK = PgSquasher.unsquashPK(compositePKs[0]);
			statement += `\tCONSTRAINT "${st.compositePkName}" PRIMARY KEY(\"${compositePK.columns.join(`","`)}\")`;
			// statement += `\n`;
		}

		if (
			typeof uniqueConstraints !== 'undefined'
			&& uniqueConstraints.length > 0
		) {
			for (const uniqueConstraint of uniqueConstraints) {
				statement += ',\n';
				const unsquashedUnique = PgSquasher.unsquashUnique(uniqueConstraint);
				statement += `\tCONSTRAINT "${unsquashedUnique.name}" UNIQUE${
					unsquashedUnique.nullsNotDistinct ? ' NULLS NOT DISTINCT' : ''
				}(\"${unsquashedUnique.columns.join(`","`)}\")`;
				// statement += `\n`;
			}
		}
		statement += `\n);`;
		statement += `\n`;

		return statement;
	}
}

class MySqlCreateTableConvertor extends Convertor {
	can(statement: JsonStatement, dialect: Dialect): boolean {
		return statement.type === 'create_table' && dialect === 'mysql';
	}

	convert(st: JsonCreateTableStatement) {
		const {
			tableName,
			columns,
			schema,
			compositePKs,
			uniqueConstraints,
			internals,
		} = st;

		let statement = '';
		statement += `CREATE TABLE \`${tableName}\` (\n`;
		for (let i = 0; i < columns.length; i++) {
			const column = columns[i];

			const primaryKeyStatement = column.primaryKey ? ' PRIMARY KEY' : '';
			const notNullStatement = column.notNull ? ' NOT NULL' : '';
			const defaultStatement = column.default !== undefined ? ` DEFAULT ${column.default}` : '';

			const onUpdateStatement = column.onUpdate
				? ` ON UPDATE CURRENT_TIMESTAMP`
				: '';

			const autoincrementStatement = column.autoincrement
				? ' AUTO_INCREMENT'
				: '';

			const generatedStatement = column.generated
				? ` GENERATED ALWAYS AS (${column.generated?.as}) ${column.generated?.type.toUpperCase()}`
				: '';

			statement += '\t'
				+ `\`${column.name}\` ${column.type}${autoincrementStatement}${primaryKeyStatement}${generatedStatement}${notNullStatement}${defaultStatement}${onUpdateStatement}`;
			statement += i === columns.length - 1 ? '' : ',\n';
		}

		if (typeof compositePKs !== 'undefined' && compositePKs.length > 0) {
			statement += ',\n';
			const compositePK = MySqlSquasher.unsquashPK(compositePKs[0]);
			statement += `\tCONSTRAINT \`${st.compositePkName}\` PRIMARY KEY(\`${compositePK.columns.join(`\`,\``)}\`)`;
		}

		if (
			typeof uniqueConstraints !== 'undefined'
			&& uniqueConstraints.length > 0
		) {
			for (const uniqueConstraint of uniqueConstraints) {
				statement += ',\n';
				const unsquashedUnique = MySqlSquasher.unsquashUnique(uniqueConstraint);

				const uniqueString = unsquashedUnique.columns
					.map((it) => {
						return internals?.indexes
							? internals?.indexes[unsquashedUnique.name]?.columns[it]
									?.isExpression
								? it
								: `\`${it}\``
							: `\`${it}\``;
					})
					.join(',');

				statement += `\tCONSTRAINT \`${unsquashedUnique.name}\` UNIQUE(${uniqueString})`;
			}
		}

		statement += `\n);`;
		statement += `\n`;
		return statement;
	}
}

export class SQLiteCreateTableConvertor extends Convertor {
	can(statement: JsonStatement, dialect: Dialect): boolean {
		return statement.type === 'sqlite_create_table' && dialect === 'sqlite';
	}

	convert(st: JsonSqliteCreateTableStatement) {
		const {
			tableName,
			columns,
			referenceData,
			compositePKs,
			uniqueConstraints,
		} = st;

		let statement = '';
		statement += `CREATE TABLE \`${tableName}\` (\n`;
		for (let i = 0; i < columns.length; i++) {
			const column = columns[i];

			const primaryKeyStatement = column.primaryKey ? ' PRIMARY KEY' : '';
			const notNullStatement = column.notNull ? ' NOT NULL' : '';
			const defaultStatement = column.default !== undefined ? ` DEFAULT ${column.default}` : '';

			const autoincrementStatement = column.autoincrement
				? ' AUTOINCREMENT'
				: '';

			const generatedStatement = column.generated
				? ` GENERATED ALWAYS AS ${column.generated.as} ${column.generated.type.toUpperCase()}`
				: '';

			statement += '\t';
			statement +=
				`\`${column.name}\` ${column.type}${primaryKeyStatement}${autoincrementStatement}${defaultStatement}${generatedStatement}${notNullStatement}`;

			statement += i === columns.length - 1 ? '' : ',\n';
		}

		compositePKs.forEach((it) => {
			statement += ',\n\t';
			statement += `PRIMARY KEY(${it.map((it) => `\`${it}\``).join(', ')})`;
		});

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
				const unsquashedUnique = MySqlSquasher.unsquashUnique(uniqueConstraint);
				statement += `\tCONSTRAINT ${unsquashedUnique.name} UNIQUE(\`${unsquashedUnique.columns.join(`\`,\``)}\`)`;
			}
		}

		statement += `\n`;
		statement += `);`;
		statement += `\n`;
		return statement;
	}
}

class PgAlterTableAlterColumnSetGenerated extends Convertor {
	override can(statement: JsonStatement, dialect: Dialect): boolean {
		return (
			statement.type === 'alter_table_alter_column_set_identity'
			&& dialect === 'postgresql'
		);
	}
	override convert(
		statement: JsonAlterColumnSetIdentityStatement,
	): string | string[] {
		const { identity, tableName, columnName, schema } = statement;

		const tableNameWithSchema = schema
			? `"${schema}"."${tableName}"`
			: `"${tableName}"`;

		const unsquashedIdentity = PgSquasher.unsquashIdentity(identity);

		const identityWithSchema = schema
			? `"${schema}"."${unsquashedIdentity?.name}"`
			: `"${unsquashedIdentity?.name}"`;

		const identityStatement = unsquashedIdentity
			? ` GENERATED ${
				unsquashedIdentity.type === 'always' ? 'ALWAYS' : 'BY DEFAULT'
			} AS IDENTITY (sequence name ${identityWithSchema}${
				unsquashedIdentity.increment
					? ` INCREMENT BY ${unsquashedIdentity.increment}`
					: ''
			}${
				unsquashedIdentity.minValue
					? ` MINVALUE ${unsquashedIdentity.minValue}`
					: ''
			}${
				unsquashedIdentity.maxValue
					? ` MAXVALUE ${unsquashedIdentity.maxValue}`
					: ''
			}${
				unsquashedIdentity.startWith
					? ` START WITH ${unsquashedIdentity.startWith}`
					: ''
			}${unsquashedIdentity.cache ? ` CACHE ${unsquashedIdentity.cache}` : ''}${
				unsquashedIdentity.cycle ? ` CYCLE` : ''
			})`
			: '';

		return `ALTER TABLE ${tableNameWithSchema} ALTER COLUMN "${columnName}" ADD${identityStatement};`;
	}
}

class PgAlterTableAlterColumnDropGenerated extends Convertor {
	override can(statement: JsonStatement, dialect: Dialect): boolean {
		return (
			statement.type === 'alter_table_alter_column_drop_identity'
			&& dialect === 'postgresql'
		);
	}
	override convert(
		statement: JsonAlterColumnDropIdentityStatement,
	): string | string[] {
		const { tableName, columnName, schema } = statement;

		const tableNameWithSchema = schema
			? `"${schema}"."${tableName}"`
			: `"${tableName}"`;

		return `ALTER TABLE ${tableNameWithSchema} ALTER COLUMN "${columnName}" DROP IDENTITY;`;
	}
}

class PgAlterTableAlterColumnAlterGenerated extends Convertor {
	override can(statement: JsonStatement, dialect: Dialect): boolean {
		return (
			statement.type === 'alter_table_alter_column_change_identity'
			&& dialect === 'postgresql'
		);
	}
	override convert(
		statement: JsonAlterColumnAlterIdentityStatement,
	): string | string[] {
		const { identity, oldIdentity, tableName, columnName, schema } = statement;

		const tableNameWithSchema = schema
			? `"${schema}"."${tableName}"`
			: `"${tableName}"`;

		const unsquashedIdentity = PgSquasher.unsquashIdentity(identity);
		const unsquashedOldIdentity = PgSquasher.unsquashIdentity(oldIdentity);

		const statementsToReturn: string[] = [];

		if (unsquashedOldIdentity.type !== unsquashedIdentity.type) {
			statementsToReturn.push(
				`ALTER TABLE ${tableNameWithSchema} ALTER COLUMN "${columnName}" SET GENERATED ${
					unsquashedIdentity.type === 'always' ? 'ALWAYS' : 'BY DEFAULT'
				};`,
			);
		}

		if (unsquashedOldIdentity.minValue !== unsquashedIdentity.minValue) {
			statementsToReturn.push(
				`ALTER TABLE ${tableNameWithSchema} ALTER COLUMN "${columnName}" SET MINVALUE ${unsquashedIdentity.minValue};`,
			);
		}

		if (unsquashedOldIdentity.maxValue !== unsquashedIdentity.maxValue) {
			statementsToReturn.push(
				`ALTER TABLE ${tableNameWithSchema} ALTER COLUMN "${columnName}" SET MAXVALUE ${unsquashedIdentity.maxValue};`,
			);
		}

		if (unsquashedOldIdentity.increment !== unsquashedIdentity.increment) {
			statementsToReturn.push(
				`ALTER TABLE ${tableNameWithSchema} ALTER COLUMN "${columnName}" SET INCREMENT BY ${unsquashedIdentity.increment};`,
			);
		}

		if (unsquashedOldIdentity.startWith !== unsquashedIdentity.startWith) {
			statementsToReturn.push(
				`ALTER TABLE ${tableNameWithSchema} ALTER COLUMN "${columnName}" SET START WITH ${unsquashedIdentity.startWith};`,
			);
		}

		if (unsquashedOldIdentity.cache !== unsquashedIdentity.cache) {
			statementsToReturn.push(
				`ALTER TABLE ${tableNameWithSchema} ALTER COLUMN "${columnName}" SET CACHE ${unsquashedIdentity.cache};`,
			);
		}

		if (unsquashedOldIdentity.cycle !== unsquashedIdentity.cycle) {
			statementsToReturn.push(
				`ALTER TABLE ${tableNameWithSchema} ALTER COLUMN "${columnName}" SET ${
					unsquashedIdentity.cycle ? `CYCLE` : 'NO CYCLE'
				};`,
			);
		}

		return statementsToReturn;
	}
}

class PgAlterTableAddUniqueConstraintConvertor extends Convertor {
	can(statement: JsonCreateUniqueConstraint, dialect: Dialect): boolean {
		return (
			statement.type === 'create_unique_constraint' && dialect === 'postgresql'
		);
	}
	convert(statement: JsonCreateUniqueConstraint): string {
		const unsquashed = PgSquasher.unsquashUnique(statement.data);

		const tableNameWithSchema = statement.schema
			? `"${statement.schema}"."${statement.tableName}"`
			: `"${statement.tableName}"`;

		return `ALTER TABLE ${tableNameWithSchema} ADD CONSTRAINT "${unsquashed.name}" UNIQUE${
			unsquashed.nullsNotDistinct ? ' NULLS NOT DISTINCT' : ''
		}("${unsquashed.columns.join('","')}");`;
	}
}

class PgAlterTableDropUniqueConstraintConvertor extends Convertor {
	can(statement: JsonDeleteUniqueConstraint, dialect: Dialect): boolean {
		return (
			statement.type === 'delete_unique_constraint' && dialect === 'postgresql'
		);
	}
	convert(statement: JsonDeleteUniqueConstraint): string {
		const unsquashed = PgSquasher.unsquashUnique(statement.data);

		const tableNameWithSchema = statement.schema
			? `"${statement.schema}"."${statement.tableName}"`
			: `"${statement.tableName}"`;

		return `ALTER TABLE ${tableNameWithSchema} DROP CONSTRAINT "${unsquashed.name}";`;
	}
}

class MySQLAlterTableAddUniqueConstraintConvertor extends Convertor {
	can(statement: JsonCreateUniqueConstraint, dialect: Dialect): boolean {
		return statement.type === 'create_unique_constraint' && dialect === 'mysql';
	}
	convert(statement: JsonCreateUniqueConstraint): string {
		const unsquashed = MySqlSquasher.unsquashUnique(statement.data);

		return `ALTER TABLE \`${statement.tableName}\` ADD CONSTRAINT \`${unsquashed.name}\` UNIQUE(\`${
			unsquashed.columns.join('`,`')
		}\`);`;
	}
}

class MySQLAlterTableDropUniqueConstraintConvertor extends Convertor {
	can(statement: JsonDeleteUniqueConstraint, dialect: Dialect): boolean {
		return statement.type === 'delete_unique_constraint' && dialect === 'mysql';
	}
	convert(statement: JsonDeleteUniqueConstraint): string {
		const unsquashed = MySqlSquasher.unsquashUnique(statement.data);

		return `ALTER TABLE \`${statement.tableName}\` DROP INDEX \`${unsquashed.name}\`;`;
	}
}

class SQLiteAlterTableAddUniqueConstraintConvertor extends Convertor {
	can(statement: JsonCreateUniqueConstraint, dialect: Dialect): boolean {
		return (
			statement.type === 'create_unique_constraint' && dialect === 'sqlite'
		);
	}
	convert(statement: JsonCreateUniqueConstraint): string {
		return (
			'/*\n SQLite does not support "Adding unique constraint to an existing table" out of the box, we do not generate automatic migration for that, so it has to be done manually'
			+ '\n Please refer to: https://www.techonthenet.com/sqlite/unique.php'
			+ "\n\n Due to that we don't generate migration automatically and it has to be done manually"
			+ '\n*/'
		);
	}
}

class SQLiteAlterTableDropUniqueConstraintConvertor extends Convertor {
	can(statement: JsonDeleteUniqueConstraint, dialect: Dialect): boolean {
		return (
			statement.type === 'delete_unique_constraint' && dialect === 'sqlite'
		);
	}
	convert(statement: JsonDeleteUniqueConstraint): string {
		return (
			'/*\n SQLite does not support "Dropping unique constraint from an existing table" out of the box, we do not generate automatic migration for that, so it has to be done manually'
			+ '\n Please refer to: https://www.techonthenet.com/sqlite/unique.php'
			+ "\n\n Due to that we don't generate migration automatically and it has to be done manually"
			+ '\n*/'
		);
	}
}

class CreatePgSequenceConvertor extends Convertor {
	can(statement: JsonStatement, dialect: Dialect): boolean {
		return statement.type === 'create_sequence' && dialect === 'postgresql';
	}

	convert(st: JsonCreateSequenceStatement) {
		const { name, values, schema } = st;

		const sequenceWithSchema = schema ? `"${schema}"."${name}"` : `"${name}"`;

		return `CREATE SEQUENCE ${sequenceWithSchema}${values.increment ? ` INCREMENT BY ${values.increment}` : ''}${
			values.minValue ? ` MINVALUE ${values.minValue}` : ''
		}${values.maxValue ? ` MAXVALUE ${values.maxValue}` : ''}${
			values.startWith ? ` START WITH ${values.startWith}` : ''
		}${values.cache ? ` CACHE ${values.cache}` : ''}${values.cycle ? ` CYCLE` : ''};`;
	}
}

class DropPgSequenceConvertor extends Convertor {
	can(statement: JsonStatement, dialect: Dialect): boolean {
		return statement.type === 'drop_sequence' && dialect === 'postgresql';
	}

	convert(st: JsonDropSequenceStatement) {
		const { name, schema } = st;

		const sequenceWithSchema = schema ? `"${schema}"."${name}"` : `"${name}"`;

		return `DROP SEQUENCE ${sequenceWithSchema};`;
	}
}

class RenamePgSequenceConvertor extends Convertor {
	can(statement: JsonStatement, dialect: Dialect): boolean {
		return statement.type === 'rename_sequence' && dialect === 'postgresql';
	}

	convert(st: JsonRenameSequenceStatement) {
		const { nameFrom, nameTo, schema } = st;

		const sequenceWithSchemaFrom = schema
			? `"${schema}"."${nameFrom}"`
			: `"${nameFrom}"`;
		const sequenceWithSchemaTo = schema
			? `"${schema}"."${nameTo}"`
			: `"${nameTo}"`;

		return `ALTER SEQUENCE ${sequenceWithSchemaFrom} RENAME TO "${nameTo}";`;
	}
}

class MovePgSequenceConvertor extends Convertor {
	can(statement: JsonStatement, dialect: Dialect): boolean {
		return statement.type === 'move_sequence' && dialect === 'postgresql';
	}

	convert(st: JsonMoveSequenceStatement) {
		const { schemaFrom, schemaTo, name } = st;

		const sequenceWithSchema = schemaFrom
			? `"${schemaFrom}"."${name}"`
			: `"${name}"`;

		const seqSchemaTo = schemaTo ? `"${schemaTo}"` : `public`;

		return `ALTER SEQUENCE ${sequenceWithSchema} SET SCHEMA ${seqSchemaTo};`;
	}
}

class AlterPgSequenceConvertor extends Convertor {
	can(statement: JsonStatement, dialect: Dialect): boolean {
		return statement.type === 'alter_sequence' && dialect === 'postgresql';
	}

	convert(st: JsonAlterSequenceStatement) {
		const { name, schema, values } = st;

		const { increment, minValue, maxValue, startWith, cache, cycle } = values;

		const sequenceWithSchema = schema ? `"${schema}"."${name}"` : `"${name}"`;

		return `ALTER SEQUENCE ${sequenceWithSchema}${increment ? ` INCREMENT BY ${increment}` : ''}${
			minValue ? ` MINVALUE ${minValue}` : ''
		}${maxValue ? ` MAXVALUE ${maxValue}` : ''}${startWith ? ` START WITH ${startWith}` : ''}${
			cache ? ` CACHE ${cache}` : ''
		}${cycle ? ` CYCLE` : ''};`;
	}
}

class CreateTypeEnumConvertor extends Convertor {
	can(statement: JsonStatement): boolean {
		return statement.type === 'create_type_enum';
	}

	convert(st: JsonCreateEnumStatement) {
		const { name, values, schema } = st;

		const tableNameWithSchema = schema ? `"${schema}"."${name}"` : `"${name}"`;

		let valuesStatement = '(';
		valuesStatement += values.map((it) => `'${it}'`).join(', ');
		valuesStatement += ')';

		let statement = 'DO $$ BEGIN';
		statement += '\n';
		statement += ` CREATE TYPE ${tableNameWithSchema} AS ENUM${valuesStatement};`;
		statement += '\n';
		statement += 'EXCEPTION';
		statement += '\n';
		statement += ' WHEN duplicate_object THEN null;';
		statement += '\n';
		statement += 'END $$;';
		statement += '\n';
		return statement;
	}
}

class AlterTypeAddValueConvertor extends Convertor {
	can(statement: JsonStatement): boolean {
		return statement.type === 'alter_type_add_value';
	}

	convert(st: JsonAddValueToEnumStatement) {
		const { name, schema, value } = st;
		const schemaPrefix = schema && schema !== 'public' ? `"${schema}".` : '';
		return `ALTER TYPE ${schemaPrefix}"${name}" ADD VALUE '${value}';`;
	}
}

class PgDropTableConvertor extends Convertor {
	can(statement: JsonStatement, dialect: Dialect): boolean {
		return statement.type === 'drop_table' && dialect === 'postgresql';
	}

	convert(statement: JsonDropTableStatement) {
		const { tableName, schema } = statement;

		const tableNameWithSchema = schema
			? `"${schema}"."${tableName}"`
			: `"${tableName}"`;

		return `DROP TABLE ${tableNameWithSchema};`;
	}
}

class MySQLDropTableConvertor extends Convertor {
	can(statement: JsonStatement, dialect: Dialect): boolean {
		return statement.type === 'drop_table' && dialect === 'mysql';
	}

	convert(statement: JsonDropTableStatement) {
		const { tableName } = statement;
		return `DROP TABLE \`${tableName}\`;`;
	}
}

export class SQLiteDropTableConvertor extends Convertor {
	can(statement: JsonStatement, dialect: Dialect): boolean {
		return statement.type === 'drop_table' && dialect === 'sqlite';
	}

	convert(statement: JsonDropTableStatement) {
		const { tableName } = statement;
		return `DROP TABLE \`${tableName}\`;`;
	}
}

class PgRenameTableConvertor extends Convertor {
	can(statement: JsonStatement, dialect: Dialect): boolean {
		return statement.type === 'rename_table' && dialect === 'postgresql';
	}

	convert(statement: JsonRenameTableStatement) {
		const { tableNameFrom, tableNameTo, toSchema, fromSchema } = statement;
		const from = fromSchema
			? `"${fromSchema}"."${tableNameFrom}"`
			: `"${tableNameFrom}"`;
		const to = `"${tableNameTo}"`;
		return `ALTER TABLE ${from} RENAME TO ${to};`;
	}
}

export class SqliteRenameTableConvertor extends Convertor {
	can(statement: JsonStatement, dialect: Dialect): boolean {
		return statement.type === 'rename_table' && dialect === 'sqlite';
	}

	convert(statement: JsonRenameTableStatement) {
		const { tableNameFrom, tableNameTo } = statement;
		return `ALTER TABLE \`${tableNameFrom}\` RENAME TO \`${tableNameTo}\`;`;
	}
}

class MySqlRenameTableConvertor extends Convertor {
	can(statement: JsonStatement, dialect: Dialect): boolean {
		return statement.type === 'rename_table' && dialect === 'mysql';
	}

	convert(statement: JsonRenameTableStatement) {
		const { tableNameFrom, tableNameTo } = statement;
		return `RENAME TABLE \`${tableNameFrom}\` TO \`${tableNameTo}\`;`;
	}
}

class PgAlterTableRenameColumnConvertor extends Convertor {
	can(statement: JsonStatement, dialect: Dialect): boolean {
		return (
			statement.type === 'alter_table_rename_column' && dialect === 'postgresql'
		);
	}

	convert(statement: JsonRenameColumnStatement) {
		const { tableName, oldColumnName, newColumnName, schema } = statement;

		const tableNameWithSchema = schema
			? `"${schema}"."${tableName}"`
			: `"${tableName}"`;

		return `ALTER TABLE ${tableNameWithSchema} RENAME COLUMN "${oldColumnName}" TO "${newColumnName}";`;
	}
}

class MySqlAlterTableRenameColumnConvertor extends Convertor {
	can(statement: JsonStatement, dialect: Dialect): boolean {
		return (
			statement.type === 'alter_table_rename_column' && dialect === 'mysql'
		);
	}

	convert(statement: JsonRenameColumnStatement) {
		const { tableName, oldColumnName, newColumnName } = statement;
		return `ALTER TABLE \`${tableName}\` RENAME COLUMN \`${oldColumnName}\` TO \`${newColumnName}\`;`;
	}
}

class SQLiteAlterTableRenameColumnConvertor extends Convertor {
	can(statement: JsonStatement, dialect: Dialect): boolean {
		return (
			statement.type === 'alter_table_rename_column' && dialect === 'sqlite'
		);
	}

	convert(statement: JsonRenameColumnStatement) {
		const { tableName, oldColumnName, newColumnName } = statement;
		return `ALTER TABLE \`${tableName}\` RENAME COLUMN \`${oldColumnName}\` TO \`${newColumnName}\`;`;
	}
}

class PgAlterTableDropColumnConvertor extends Convertor {
	can(statement: JsonStatement, dialect: Dialect): boolean {
		return (
			statement.type === 'alter_table_drop_column' && dialect === 'postgresql'
		);
	}

	convert(statement: JsonDropColumnStatement) {
		const { tableName, columnName, schema } = statement;

		const tableNameWithSchema = schema
			? `"${schema}"."${tableName}"`
			: `"${tableName}"`;

		return `ALTER TABLE ${tableNameWithSchema} DROP COLUMN IF EXISTS "${columnName}";`;
	}
}

class MySqlAlterTableDropColumnConvertor extends Convertor {
	can(statement: JsonStatement, dialect: Dialect): boolean {
		return statement.type === 'alter_table_drop_column' && dialect === 'mysql';
	}

	convert(statement: JsonDropColumnStatement) {
		const { tableName, columnName } = statement;
		return `ALTER TABLE \`${tableName}\` DROP COLUMN \`${columnName}\`;`;
	}
}

class SQLiteAlterTableDropColumnConvertor extends Convertor {
	can(statement: JsonStatement, dialect: Dialect): boolean {
		return statement.type === 'alter_table_drop_column' && dialect === 'sqlite';
	}

	convert(statement: JsonDropColumnStatement) {
		const { tableName, columnName } = statement;
		return `ALTER TABLE \`${tableName}\` DROP COLUMN \`${columnName}\`;`;
	}
}

class PgAlterTableAddColumnConvertor extends Convertor {
	can(statement: JsonStatement, dialect: Dialect): boolean {
		return (
			statement.type === 'alter_table_add_column' && dialect === 'postgresql'
		);
	}

	convert(statement: JsonAddColumnStatement) {
		const { tableName, column, schema } = statement;
		const { name, type, notNull, generated, primaryKey, identity } = column;

		const primaryKeyStatement = primaryKey ? ' PRIMARY KEY' : '';

		const tableNameWithSchema = schema
			? `"${schema}"."${tableName}"`
			: `"${tableName}"`;

		const defaultStatement = `${column.default !== undefined ? ` DEFAULT ${column.default}` : ''}`;

		const schemaPrefix = column.typeSchema && column.typeSchema !== 'public'
			? `"${column.typeSchema}".`
			: '';

		const fixedType = isPgNativeType(column.type)
			? column.type
			: `${schemaPrefix}"${column.type}"`;

		const notNullStatement = `${notNull ? ' NOT NULL' : ''}`;

		const unsquashedIdentity = identity
			? PgSquasher.unsquashIdentity(identity)
			: undefined;

		const identityWithSchema = schema
			? `"${schema}"."${unsquashedIdentity?.name}"`
			: `"${unsquashedIdentity?.name}"`;

		const identityStatement = unsquashedIdentity
			? ` GENERATED ${
				unsquashedIdentity.type === 'always' ? 'ALWAYS' : 'BY DEFAULT'
			} AS IDENTITY (sequence name ${identityWithSchema}${
				unsquashedIdentity.increment
					? ` INCREMENT BY ${unsquashedIdentity.increment}`
					: ''
			}${
				unsquashedIdentity.minValue
					? ` MINVALUE ${unsquashedIdentity.minValue}`
					: ''
			}${
				unsquashedIdentity.maxValue
					? ` MAXVALUE ${unsquashedIdentity.maxValue}`
					: ''
			}${
				unsquashedIdentity.startWith
					? ` START WITH ${unsquashedIdentity.startWith}`
					: ''
			}${unsquashedIdentity.cache ? ` CACHE ${unsquashedIdentity.cache}` : ''}${
				unsquashedIdentity.cycle ? ` CYCLE` : ''
			})`
			: '';

		const generatedStatement = generated ? ` GENERATED ALWAYS AS (${generated?.as}) STORED` : '';

		return `ALTER TABLE ${tableNameWithSchema} ADD COLUMN "${name}" ${fixedType}${primaryKeyStatement}${defaultStatement}${generatedStatement}${notNullStatement}${identityStatement};`;
	}
}

class MySqlAlterTableAddColumnConvertor extends Convertor {
	can(statement: JsonStatement, dialect: Dialect): boolean {
		return statement.type === 'alter_table_add_column' && dialect === 'mysql';
	}

	convert(statement: JsonAddColumnStatement) {
		const { tableName, column } = statement;
		const {
			name,
			type,
			notNull,
			primaryKey,
			autoincrement,
			onUpdate,
			generated,
		} = column;

		const defaultStatement = `${column.default !== undefined ? ` DEFAULT ${column.default}` : ''}`;
		const notNullStatement = `${notNull ? ' NOT NULL' : ''}`;
		const primaryKeyStatement = `${primaryKey ? ' PRIMARY KEY' : ''}`;
		const autoincrementStatement = `${autoincrement ? ' AUTO_INCREMENT' : ''}`;
		const onUpdateStatement = `${onUpdate ? ' ON UPDATE CURRENT_TIMESTAMP' : ''}`;

		const generatedStatement = generated
			? ` GENERATED ALWAYS AS (${generated?.as}) ${generated?.type.toUpperCase()}`
			: '';

		return `ALTER TABLE \`${tableName}\` ADD \`${name}\` ${type}${primaryKeyStatement}${autoincrementStatement}${defaultStatement}${generatedStatement}${notNullStatement}${onUpdateStatement};`;
	}
}

export class SQLiteAlterTableAddColumnConvertor extends Convertor {
	can(statement: JsonStatement, dialect: Dialect): boolean {
		return (
			statement.type === 'sqlite_alter_table_add_column' && dialect === 'sqlite'
		);
	}

	convert(statement: JsonSqliteAddColumnStatement) {
		const { tableName, column, referenceData } = statement;
		const { name, type, notNull, primaryKey, generated } = column;

		const defaultStatement = `${column.default !== undefined ? ` DEFAULT ${column.default}` : ''}`;
		const notNullStatement = `${notNull ? ' NOT NULL' : ''}`;
		const primaryKeyStatement = `${primaryKey ? ' PRIMARY KEY' : ''}`;
		const referenceAsObject = referenceData
			? SQLiteSquasher.unsquashFK(referenceData)
			: undefined;
		const referenceStatement = `${
			referenceAsObject
				? ` REFERENCES ${referenceAsObject.tableTo}(${referenceAsObject.columnsTo})`
				: ''
		}`;
		// const autoincrementStatement = `${autoincrement ? 'AUTO_INCREMENT' : ''}`
		const generatedStatement = generated
			? ` GENERATED ALWAYS AS ${generated.as} ${generated.type.toUpperCase()}`
			: '';

		return `ALTER TABLE \`${tableName}\` ADD \`${name}\` ${type}${primaryKeyStatement}${defaultStatement}${generatedStatement}${notNullStatement}${referenceStatement};`;
	}
}

class PgAlterTableAlterColumnSetTypeConvertor extends Convertor {
	can(statement: JsonStatement, dialect: Dialect): boolean {
		return (
			statement.type === 'alter_table_alter_column_set_type'
			&& dialect === 'postgresql'
		);
	}

	convert(statement: JsonAlterColumnTypeStatement) {
		const { tableName, columnName, newDataType, schema } = statement;

		const tableNameWithSchema = schema
			? `"${schema}"."${tableName}"`
			: `"${tableName}"`;

		return `ALTER TABLE ${tableNameWithSchema} ALTER COLUMN "${columnName}" SET DATA TYPE ${newDataType};`;
	}
}

class SQLiteAlterTableAlterColumnSetTypeConvertor extends Convertor {
	can(statement: JsonStatement, dialect: Dialect): boolean {
		return (
			statement.type === 'alter_table_alter_column_set_type'
			&& dialect === 'sqlite'
		);
	}

	convert(statement: JsonAlterColumnTypeStatement) {
		return (
			'/*\n SQLite does not support "Changing existing column type" out of the box, we do not generate automatic migration for that, so it has to be done manually'
			+ '\n Please refer to: https://www.techonthenet.com/sqlite/tables/alter_table.php'
			+ '\n                  https://www.sqlite.org/lang_altertable.html'
			+ '\n                  https://stackoverflow.com/questions/2083543/modify-a-columns-type-in-sqlite3'
			+ "\n\n Due to that we don't generate migration automatically and it has to be done manually"
			+ '\n*/'
		);
	}
}

class PgAlterTableAlterColumnSetDefaultConvertor extends Convertor {
	can(statement: JsonStatement, dialect: Dialect): boolean {
		return (
			statement.type === 'alter_table_alter_column_set_default'
			&& dialect === 'postgresql'
		);
	}

	convert(statement: JsonAlterColumnSetDefaultStatement) {
		const { tableName, columnName, schema } = statement;

		const tableNameWithSchema = schema
			? `"${schema}"."${tableName}"`
			: `"${tableName}"`;

		return `ALTER TABLE ${tableNameWithSchema} ALTER COLUMN "${columnName}" SET DEFAULT ${statement.newDefaultValue};`;
	}
}

class SqliteAlterTableAlterColumnSetDefaultConvertor extends Convertor {
	can(statement: JsonStatement, dialect: Dialect): boolean {
		return (
			statement.type === 'alter_table_alter_column_set_default'
			&& dialect === 'sqlite'
		);
	}

	convert(statement: JsonAlterColumnSetDefaultStatement) {
		return (
			'/*\n SQLite does not support "Set default to column" out of the box, we do not generate automatic migration for that, so it has to be done manually'
			+ '\n Please refer to: https://www.techonthenet.com/sqlite/tables/alter_table.php'
			+ '\n                  https://www.sqlite.org/lang_altertable.html'
			+ '\n                  https://stackoverflow.com/questions/2083543/modify-a-columns-type-in-sqlite3'
			+ "\n\n Due to that we don't generate migration automatically and it has to be done manually"
			+ '\n*/'
		);
	}
}

class PgAlterTableAlterColumnDropDefaultConvertor extends Convertor {
	can(statement: JsonStatement, dialect: Dialect): boolean {
		return (
			statement.type === 'alter_table_alter_column_drop_default'
			&& dialect === 'postgresql'
		);
	}

	convert(statement: JsonAlterColumnDropDefaultStatement) {
		const { tableName, columnName, schema } = statement;

		const tableNameWithSchema = schema
			? `"${schema}"."${tableName}"`
			: `"${tableName}"`;

		return `ALTER TABLE ${tableNameWithSchema} ALTER COLUMN "${columnName}" DROP DEFAULT;`;
	}
}

class PgAlterTableAlterColumnDropGeneratedConvertor extends Convertor {
	can(statement: JsonStatement, dialect: Dialect): boolean {
		return (
			statement.type === 'alter_table_alter_column_drop_generated'
			&& dialect === 'postgresql'
		);
	}

	convert(statement: JsonAlterColumnDropGeneratedStatement) {
		const { tableName, columnName, schema } = statement;

		const tableNameWithSchema = schema
			? `"${schema}"."${tableName}"`
			: `"${tableName}"`;

		return `ALTER TABLE ${tableNameWithSchema} ALTER COLUMN "${columnName}" DROP EXPRESSION;`;
	}
}

class PgAlterTableAlterColumnSetExpressionConvertor extends Convertor {
	can(statement: JsonStatement, dialect: Dialect): boolean {
		return (
			statement.type === 'alter_table_alter_column_set_generated'
			&& dialect === 'postgresql'
		);
	}

	convert(statement: JsonAlterColumnSetGeneratedStatement) {
		const {
			tableName,
			columnName,
			schema,
			columnNotNull: notNull,
			columnDefault,
			columnOnUpdate,
			columnAutoIncrement,
			columnPk,
			columnGenerated,
		} = statement;

		const tableNameWithSchema = schema
			? `"${schema}"."${tableName}"`
			: `"${tableName}"`;

		const addColumnStatement = new PgAlterTableAddColumnConvertor().convert({
			schema,
			tableName,
			column: {
				name: columnName,
				type: statement.newDataType,
				notNull,
				default: columnDefault,
				onUpdate: columnOnUpdate,
				autoincrement: columnAutoIncrement,
				primaryKey: columnPk,
				generated: columnGenerated,
			},
			type: 'alter_table_add_column',
		});

		return [
			`ALTER TABLE ${tableNameWithSchema} drop column "${columnName}";`,
			addColumnStatement,
		];
	}
}

class PgAlterTableAlterColumnAlterrGeneratedConvertor extends Convertor {
	can(statement: JsonStatement, dialect: Dialect): boolean {
		return (
			statement.type === 'alter_table_alter_column_alter_generated'
			&& dialect === 'postgresql'
		);
	}

	convert(statement: JsonAlterColumnAlterGeneratedStatement) {
		const {
			tableName,
			columnName,
			schema,
			columnNotNull: notNull,
			columnDefault,
			columnOnUpdate,
			columnAutoIncrement,
			columnPk,
			columnGenerated,
		} = statement;

		const tableNameWithSchema = schema
			? `"${schema}"."${tableName}"`
			: `"${tableName}"`;

		const addColumnStatement = new PgAlterTableAddColumnConvertor().convert({
			schema,
			tableName,
			column: {
				name: columnName,
				type: statement.newDataType,
				notNull,
				default: columnDefault,
				onUpdate: columnOnUpdate,
				autoincrement: columnAutoIncrement,
				primaryKey: columnPk,
				generated: columnGenerated,
			},
			type: 'alter_table_add_column',
		});

		return [
			`ALTER TABLE ${tableNameWithSchema} drop column "${columnName}";`,
			addColumnStatement,
		];
	}
}

////
class SqliteAlterTableAlterColumnDropGeneratedConvertor extends Convertor {
	can(statement: JsonStatement, dialect: Dialect): boolean {
		return (
			statement.type === 'alter_table_alter_column_drop_generated'
			&& dialect === 'sqlite'
		);
	}

	convert(statement: JsonAlterColumnDropGeneratedStatement) {
		const {
			tableName,
			columnName,
			schema,
			columnDefault,
			columnOnUpdate,
			columnAutoIncrement,
			columnPk,
			columnGenerated,
			columnNotNull,
		} = statement;

		const addColumnStatement = new SQLiteAlterTableAddColumnConvertor().convert(
			{
				tableName,
				column: {
					name: columnName,
					type: statement.newDataType,
					notNull: columnNotNull,
					default: columnDefault,
					onUpdate: columnOnUpdate,
					autoincrement: columnAutoIncrement,
					primaryKey: columnPk,
					generated: columnGenerated,
				},
				type: 'sqlite_alter_table_add_column',
			},
		);

		const dropColumnStatement = new SQLiteAlterTableDropColumnConvertor().convert({
			tableName,
			columnName,
			schema,
			type: 'alter_table_drop_column',
		});

		return [dropColumnStatement, addColumnStatement];
	}
}

class SqliteAlterTableAlterColumnSetExpressionConvertor extends Convertor {
	can(statement: JsonStatement, dialect: Dialect): boolean {
		return (
			statement.type === 'alter_table_alter_column_set_generated'
			&& dialect === 'sqlite'
		);
	}

	convert(statement: JsonAlterColumnSetGeneratedStatement) {
		const {
			tableName,
			columnName,
			schema,
			columnNotNull: notNull,
			columnDefault,
			columnOnUpdate,
			columnAutoIncrement,
			columnPk,
			columnGenerated,
		} = statement;

		const addColumnStatement = new SQLiteAlterTableAddColumnConvertor().convert(
			{
				tableName,
				column: {
					name: columnName,
					type: statement.newDataType,
					notNull,
					default: columnDefault,
					onUpdate: columnOnUpdate,
					autoincrement: columnAutoIncrement,
					primaryKey: columnPk,
					generated: columnGenerated,
				},
				type: 'sqlite_alter_table_add_column',
			},
		);

		const dropColumnStatement = new SQLiteAlterTableDropColumnConvertor().convert({
			tableName,
			columnName,
			schema,
			type: 'alter_table_drop_column',
		});

		return [dropColumnStatement, addColumnStatement];
	}
}

class SqliteAlterTableAlterColumnAlterGeneratedConvertor extends Convertor {
	can(statement: JsonStatement, dialect: Dialect): boolean {
		return (
			statement.type === 'alter_table_alter_column_alter_generated'
			&& dialect === 'sqlite'
		);
	}

	convert(statement: JsonAlterColumnAlterGeneratedStatement) {
		const {
			tableName,
			columnName,
			schema,
			columnNotNull,
			columnDefault,
			columnOnUpdate,
			columnAutoIncrement,
			columnPk,
			columnGenerated,
		} = statement;

		const addColumnStatement = new SQLiteAlterTableAddColumnConvertor().convert(
			{
				tableName,
				column: {
					name: columnName,
					type: statement.newDataType,
					notNull: columnNotNull,
					default: columnDefault,
					onUpdate: columnOnUpdate,
					autoincrement: columnAutoIncrement,
					primaryKey: columnPk,
					generated: columnGenerated,
				},
				type: 'sqlite_alter_table_add_column',
			},
		);

		const dropColumnStatement = new SQLiteAlterTableDropColumnConvertor().convert({
			tableName,
			columnName,
			schema,
			type: 'alter_table_drop_column',
		});

		return [dropColumnStatement, addColumnStatement];
	}
}

////

class MySqlAlterTableAlterColumnAlterrGeneratedConvertor extends Convertor {
	can(statement: JsonStatement, dialect: Dialect): boolean {
		return (
			statement.type === 'alter_table_alter_column_alter_generated'
			&& dialect === 'mysql'
		);
	}

	convert(statement: JsonAlterColumnAlterGeneratedStatement) {
		const {
			tableName,
			columnName,
			schema,
			columnNotNull: notNull,
			columnDefault,
			columnOnUpdate,
			columnAutoIncrement,
			columnPk,
			columnGenerated,
		} = statement;

		const tableNameWithSchema = schema
			? `\`${schema}\`.\`${tableName}\``
			: `\`${tableName}\``;

		const addColumnStatement = new MySqlAlterTableAddColumnConvertor().convert({
			schema,
			tableName,
			column: {
				name: columnName,
				type: statement.newDataType,
				notNull,
				default: columnDefault,
				onUpdate: columnOnUpdate,
				autoincrement: columnAutoIncrement,
				primaryKey: columnPk,
				generated: columnGenerated,
			},
			type: 'alter_table_add_column',
		});

		return [
			`ALTER TABLE ${tableNameWithSchema} drop column \`${columnName}\`;`,
			addColumnStatement,
		];
	}
}

class MySqlAlterTableAlterColumnSetDefaultConvertor extends Convertor {
	can(statement: JsonStatement, dialect: Dialect): boolean {
		return (
			statement.type === 'alter_table_alter_column_set_default'
			&& dialect === 'mysql'
		);
	}

	convert(statement: JsonAlterColumnSetDefaultStatement) {
		const { tableName, columnName } = statement;
		return `ALTER TABLE \`${tableName}\` ALTER COLUMN \`${columnName}\` SET DEFAULT ${statement.newDefaultValue};`;
	}
}

class MySqlAlterTableAlterColumnDropDefaultConvertor extends Convertor {
	can(statement: JsonStatement, dialect: Dialect): boolean {
		return (
			statement.type === 'alter_table_alter_column_drop_default'
			&& dialect === 'mysql'
		);
	}

	convert(statement: JsonAlterColumnDropDefaultStatement) {
		const { tableName, columnName } = statement;
		return `ALTER TABLE \`${tableName}\` ALTER COLUMN \`${columnName}\` DROP DEFAULT;`;
	}
}

class MySqlAlterTableAddPk extends Convertor {
	can(statement: JsonStatement, dialect: string): boolean {
		return (
			statement.type === 'alter_table_alter_column_set_pk'
			&& dialect === 'mysql'
		);
	}
	convert(statement: JsonAlterColumnSetPrimaryKeyStatement): string {
		return `ALTER TABLE \`${statement.tableName}\` ADD PRIMARY KEY (\`${statement.columnName}\`);`;
	}
}

class MySqlAlterTableDropPk extends Convertor {
	can(statement: JsonStatement, dialect: string): boolean {
		return (
			statement.type === 'alter_table_alter_column_drop_pk'
			&& dialect === 'mysql'
		);
	}
	convert(statement: JsonAlterColumnDropPrimaryKeyStatement): string {
		return `ALTER TABLE \`${statement.tableName}\` DROP PRIMARY KEY`;
	}
}

type MySqlModifyColumnStatement =
	| JsonAlterColumnDropNotNullStatement
	| JsonAlterColumnSetNotNullStatement
	| JsonAlterColumnTypeStatement
	| JsonAlterColumnDropOnUpdateStatement
	| JsonAlterColumnSetOnUpdateStatement
	| JsonAlterColumnDropAutoincrementStatement
	| JsonAlterColumnSetAutoincrementStatement
	| JsonAlterColumnSetDefaultStatement
	| JsonAlterColumnDropDefaultStatement
	| JsonAlterColumnSetGeneratedStatement
	| JsonAlterColumnDropGeneratedStatement;

class MySqlModifyColumn extends Convertor {
	can(statement: JsonStatement, dialect: Dialect): boolean {
		return (
			(statement.type === 'alter_table_alter_column_set_type'
				|| statement.type === 'alter_table_alter_column_set_notnull'
				|| statement.type === 'alter_table_alter_column_drop_notnull'
				|| statement.type === 'alter_table_alter_column_drop_on_update'
				|| statement.type === 'alter_table_alter_column_set_on_update'
				|| statement.type === 'alter_table_alter_column_set_autoincrement'
				|| statement.type === 'alter_table_alter_column_drop_autoincrement'
				|| statement.type === 'alter_table_alter_column_set_default'
				|| statement.type === 'alter_table_alter_column_drop_default'
				|| statement.type === 'alter_table_alter_column_set_generated'
				|| statement.type === 'alter_table_alter_column_drop_generated')
			&& dialect === 'mysql'
		);
	}

	convert(statement: MySqlModifyColumnStatement) {
		const { tableName, columnName } = statement;
		let columnType = ``;
		let columnDefault: any = '';
		let columnNotNull = '';
		let columnOnUpdate = '';
		let columnAutoincrement = '';
		let primaryKey = statement.columnPk ? ' PRIMARY KEY' : '';
		let columnGenerated = '';

		if (statement.type === 'alter_table_alter_column_drop_notnull') {
			columnType = ` ${statement.newDataType}`;
			columnDefault = statement.columnDefault
				? ` DEFAULT ${statement.columnDefault}`
				: '';
			columnNotNull = statement.columnNotNull ? ` NOT NULL` : '';
			columnOnUpdate = statement.columnOnUpdate
				? ` ON UPDATE CURRENT_TIMESTAMP`
				: '';
			columnAutoincrement = statement.columnAutoIncrement
				? ' AUTO_INCREMENT'
				: '';
		} else if (statement.type === 'alter_table_alter_column_set_notnull') {
			columnNotNull = ` NOT NULL`;
			columnType = ` ${statement.newDataType}`;
			columnDefault = statement.columnDefault
				? ` DEFAULT ${statement.columnDefault}`
				: '';
			columnOnUpdate = statement.columnOnUpdate
				? ` ON UPDATE CURRENT_TIMESTAMP`
				: '';
			columnAutoincrement = statement.columnAutoIncrement
				? ' AUTO_INCREMENT'
				: '';
		} else if (statement.type === 'alter_table_alter_column_drop_on_update') {
			columnNotNull = statement.columnNotNull ? ` NOT NULL` : '';
			columnType = ` ${statement.newDataType}`;
			columnDefault = statement.columnDefault
				? ` DEFAULT ${statement.columnDefault}`
				: '';
			columnOnUpdate = '';
			columnAutoincrement = statement.columnAutoIncrement
				? ' AUTO_INCREMENT'
				: '';
		} else if (statement.type === 'alter_table_alter_column_set_on_update') {
			columnNotNull = statement.columnNotNull ? ` NOT NULL` : '';
			columnOnUpdate = ` ON UPDATE CURRENT_TIMESTAMP`;
			columnType = ` ${statement.newDataType}`;
			columnDefault = statement.columnDefault
				? ` DEFAULT ${statement.columnDefault}`
				: '';
			columnAutoincrement = statement.columnAutoIncrement
				? ' AUTO_INCREMENT'
				: '';
		} else if (
			statement.type === 'alter_table_alter_column_set_autoincrement'
		) {
			columnNotNull = statement.columnNotNull ? ` NOT NULL` : '';
			columnOnUpdate = columnOnUpdate = statement.columnOnUpdate
				? ` ON UPDATE CURRENT_TIMESTAMP`
				: '';
			columnType = ` ${statement.newDataType}`;
			columnDefault = statement.columnDefault
				? ` DEFAULT ${statement.columnDefault}`
				: '';
			columnAutoincrement = ' AUTO_INCREMENT';
		} else if (
			statement.type === 'alter_table_alter_column_drop_autoincrement'
		) {
			columnNotNull = statement.columnNotNull ? ` NOT NULL` : '';
			columnOnUpdate = columnOnUpdate = statement.columnOnUpdate
				? ` ON UPDATE CURRENT_TIMESTAMP`
				: '';
			columnType = ` ${statement.newDataType}`;
			columnDefault = statement.columnDefault
				? ` DEFAULT ${statement.columnDefault}`
				: '';
			columnAutoincrement = '';
		} else if (statement.type === 'alter_table_alter_column_set_default') {
			columnNotNull = statement.columnNotNull ? ` NOT NULL` : '';
			columnOnUpdate = columnOnUpdate = statement.columnOnUpdate
				? ` ON UPDATE CURRENT_TIMESTAMP`
				: '';
			columnType = ` ${statement.newDataType}`;
			columnDefault = ` DEFAULT ${statement.newDefaultValue}`;
			columnAutoincrement = statement.columnAutoIncrement
				? ' AUTO_INCREMENT'
				: '';
		} else if (statement.type === 'alter_table_alter_column_drop_default') {
			columnNotNull = statement.columnNotNull ? ` NOT NULL` : '';
			columnOnUpdate = columnOnUpdate = statement.columnOnUpdate
				? ` ON UPDATE CURRENT_TIMESTAMP`
				: '';
			columnType = ` ${statement.newDataType}`;
			columnDefault = '';
			columnAutoincrement = statement.columnAutoIncrement
				? ' AUTO_INCREMENT'
				: '';
		} else if (statement.type === 'alter_table_alter_column_set_generated') {
			columnType = ` ${statement.newDataType}`;
			columnNotNull = statement.columnNotNull ? ` NOT NULL` : '';
			columnOnUpdate = columnOnUpdate = statement.columnOnUpdate
				? ` ON UPDATE CURRENT_TIMESTAMP`
				: '';
			columnDefault = statement.columnDefault
				? ` DEFAULT ${statement.columnDefault}`
				: '';
			columnAutoincrement = statement.columnAutoIncrement
				? ' AUTO_INCREMENT'
				: '';

			if (statement.columnGenerated?.type === 'virtual') {
				return [
					new MySqlAlterTableDropColumnConvertor().convert({
						type: 'alter_table_drop_column',
						tableName: statement.tableName,
						columnName: statement.columnName,
						schema: statement.schema,
					}),
					new MySqlAlterTableAddColumnConvertor().convert({
						tableName,
						column: {
							name: columnName,
							type: statement.newDataType,
							notNull: statement.columnNotNull,
							default: statement.columnDefault,
							onUpdate: statement.columnOnUpdate,
							autoincrement: statement.columnAutoIncrement,
							primaryKey: statement.columnPk,
							generated: statement.columnGenerated,
						},
						schema: statement.schema,
						type: 'alter_table_add_column',
					}),
				];
			} else {
				columnGenerated = statement.columnGenerated
					? ` GENERATED ALWAYS AS (${statement.columnGenerated?.as}) ${statement.columnGenerated?.type.toUpperCase()}`
					: '';
			}
		} else if (statement.type === 'alter_table_alter_column_drop_generated') {
			columnType = ` ${statement.newDataType}`;
			columnNotNull = statement.columnNotNull ? ` NOT NULL` : '';
			columnOnUpdate = columnOnUpdate = statement.columnOnUpdate
				? ` ON UPDATE CURRENT_TIMESTAMP`
				: '';
			columnDefault = statement.columnDefault
				? ` DEFAULT ${statement.columnDefault}`
				: '';
			columnAutoincrement = statement.columnAutoIncrement
				? ' AUTO_INCREMENT'
				: '';

			if (statement.oldColumn?.generated?.type === 'virtual') {
				return [
					new MySqlAlterTableDropColumnConvertor().convert({
						type: 'alter_table_drop_column',
						tableName: statement.tableName,
						columnName: statement.columnName,
						schema: statement.schema,
					}),
					new MySqlAlterTableAddColumnConvertor().convert({
						tableName,
						column: {
							name: columnName,
							type: statement.newDataType,
							notNull: statement.columnNotNull,
							default: statement.columnDefault,
							onUpdate: statement.columnOnUpdate,
							autoincrement: statement.columnAutoIncrement,
							primaryKey: statement.columnPk,
							generated: statement.columnGenerated,
						},
						schema: statement.schema,
						type: 'alter_table_add_column',
					}),
				];
			}
		} else {
			columnType = ` ${statement.newDataType}`;
			columnNotNull = statement.columnNotNull ? ` NOT NULL` : '';
			columnOnUpdate = columnOnUpdate = statement.columnOnUpdate
				? ` ON UPDATE CURRENT_TIMESTAMP`
				: '';
			columnDefault = statement.columnDefault
				? ` DEFAULT ${statement.columnDefault}`
				: '';
			columnAutoincrement = statement.columnAutoIncrement
				? ' AUTO_INCREMENT'
				: '';
			columnGenerated = statement.columnGenerated
				? ` GENERATED ALWAYS AS (${statement.columnGenerated?.as}) ${statement.columnGenerated?.type.toUpperCase()}`
				: '';
		}

		// Seems like getting value from simple json2 shanpshot makes dates be dates
		columnDefault = columnDefault instanceof Date
			? columnDefault.toISOString()
			: columnDefault;

		return `ALTER TABLE \`${tableName}\` MODIFY COLUMN \`${columnName}\`${columnType}${columnAutoincrement}${columnGenerated}${columnNotNull}${columnDefault}${columnOnUpdate};`;
	}
}

class SqliteAlterTableAlterColumnDropDefaultConvertor extends Convertor {
	can(statement: JsonStatement, dialect: Dialect): boolean {
		return (
			statement.type === 'alter_table_alter_column_drop_default'
			&& dialect === 'sqlite'
		);
	}

	convert(statement: JsonAlterColumnDropDefaultStatement) {
		return (
			'/*\n SQLite does not support "Drop default from column" out of the box, we do not generate automatic migration for that, so it has to be done manually'
			+ '\n Please refer to: https://www.techonthenet.com/sqlite/tables/alter_table.php'
			+ '\n                  https://www.sqlite.org/lang_altertable.html'
			+ '\n                  https://stackoverflow.com/questions/2083543/modify-a-columns-type-in-sqlite3'
			+ "\n\n Due to that we don't generate migration automatically and it has to be done manually"
			+ '\n*/'
		);
	}
}

class PgAlterTableCreateCompositePrimaryKeyConvertor extends Convertor {
	can(statement: JsonStatement, dialect: Dialect): boolean {
		return statement.type === 'create_composite_pk' && dialect === 'postgresql';
	}

	convert(statement: JsonCreateCompositePK) {
		const { name, columns } = PgSquasher.unsquashPK(statement.data);

		const tableNameWithSchema = statement.schema
			? `"${statement.schema}"."${statement.tableName}"`
			: `"${statement.tableName}"`;

		return `ALTER TABLE ${tableNameWithSchema} ADD CONSTRAINT "${statement.constraintName}" PRIMARY KEY("${
			columns.join('","')
		}");`;
	}
}

class PgAlterTableDeleteCompositePrimaryKeyConvertor extends Convertor {
	can(statement: JsonStatement, dialect: Dialect): boolean {
		return statement.type === 'delete_composite_pk' && dialect === 'postgresql';
	}

	convert(statement: JsonDeleteCompositePK) {
		const { name, columns } = PgSquasher.unsquashPK(statement.data);

		const tableNameWithSchema = statement.schema
			? `"${statement.schema}"."${statement.tableName}"`
			: `"${statement.tableName}"`;

		return `ALTER TABLE ${tableNameWithSchema} DROP CONSTRAINT "${statement.constraintName}";`;
	}
}

class PgAlterTableAlterCompositePrimaryKeyConvertor extends Convertor {
	can(statement: JsonStatement, dialect: Dialect): boolean {
		return statement.type === 'alter_composite_pk' && dialect === 'postgresql';
	}

	convert(statement: JsonAlterCompositePK) {
		const { name, columns } = PgSquasher.unsquashPK(statement.old);
		const { name: newName, columns: newColumns } = PgSquasher.unsquashPK(
			statement.new,
		);

		const tableNameWithSchema = statement.schema
			? `"${statement.schema}"."${statement.tableName}"`
			: `"${statement.tableName}"`;

		return `ALTER TABLE ${tableNameWithSchema} DROP CONSTRAINT ${statement.oldConstraintName};\n${BREAKPOINT}ALTER TABLE ${tableNameWithSchema} ADD CONSTRAINT ${statement.newConstraintName} PRIMARY KEY(${
			newColumns.join(',')
		});`;
	}
}

class MySqlAlterTableCreateCompositePrimaryKeyConvertor extends Convertor {
	can(statement: JsonStatement, dialect: Dialect): boolean {
		return statement.type === 'create_composite_pk' && dialect === 'mysql';
	}

	convert(statement: JsonCreateCompositePK) {
		const { name, columns } = MySqlSquasher.unsquashPK(statement.data);
		return `ALTER TABLE \`${statement.tableName}\` ADD PRIMARY KEY(\`${columns.join('`,`')}\`);`;
	}
}

class MySqlAlterTableDeleteCompositePrimaryKeyConvertor extends Convertor {
	can(statement: JsonStatement, dialect: Dialect): boolean {
		return statement.type === 'delete_composite_pk' && dialect === 'mysql';
	}

	convert(statement: JsonDeleteCompositePK) {
		const { name, columns } = MySqlSquasher.unsquashPK(statement.data);
		return `ALTER TABLE \`${statement.tableName}\` DROP PRIMARY KEY;`;
	}
}

class MySqlAlterTableAlterCompositePrimaryKeyConvertor extends Convertor {
	can(statement: JsonStatement, dialect: Dialect): boolean {
		return statement.type === 'alter_composite_pk' && dialect === 'mysql';
	}

	convert(statement: JsonAlterCompositePK) {
		const { name, columns } = MySqlSquasher.unsquashPK(statement.old);
		const { name: newName, columns: newColumns } = MySqlSquasher.unsquashPK(
			statement.new,
		);
		return `ALTER TABLE \`${statement.tableName}\` DROP PRIMARY KEY, ADD PRIMARY KEY(\`${newColumns.join('`,`')}\`);`;
	}
}

class SqliteAlterTableCreateCompositePrimaryKeyConvertor extends Convertor {
	can(statement: JsonStatement, dialect: Dialect): boolean {
		return statement.type === 'create_composite_pk' && dialect === 'sqlite';
	}

	convert(statement: JsonCreateCompositePK) {
		let msg = '/*\n';
		msg += `You're trying to add PRIMARY KEY(${statement.data}) to '${statement.tableName}' table\n`;
		msg += 'SQLite does not support adding primary key to an already created table\n';
		msg += 'You can do it in 3 steps with drizzle orm:\n';
		msg += ' - create new mirror table with needed pk, rename current table to old_table, generate SQL\n';
		msg += ' - migrate old data from one table to another\n';
		msg += ' - delete old_table in schema, generate sql\n\n';
		msg += 'or create manual migration like below:\n\n';
		msg += 'ALTER TABLE table_name RENAME TO old_table;\n';
		msg += 'CREATE TABLE table_name (\n';
		msg += '\tcolumn1 datatype [ NULL | NOT NULL ],\n';
		msg += '\tcolumn2 datatype [ NULL | NOT NULL ],\n';
		msg += '\t...\n';
		msg += '\tPRIMARY KEY (pk_col1, pk_col2, ... pk_col_n)\n';
		msg += ' );\n';
		msg += 'INSERT INTO table_name SELECT * FROM old_table;\n\n';
		msg += "Due to that we don't generate migration automatically and it has to be done manually\n";
		msg += '*/\n';
		return msg;
	}
}
class SqliteAlterTableDeleteCompositePrimaryKeyConvertor extends Convertor {
	can(statement: JsonStatement, dialect: Dialect): boolean {
		return statement.type === 'delete_composite_pk' && dialect === 'sqlite';
	}

	convert(statement: JsonDeleteCompositePK) {
		let msg = '/*\n';
		msg += `You're trying to delete PRIMARY KEY(${statement.data}) from '${statement.tableName}' table\n`;
		msg += 'SQLite does not supportprimary key deletion from existing table\n';
		msg += 'You can do it in 3 steps with drizzle orm:\n';
		msg += ' - create new mirror table table without pk, rename current table to old_table, generate SQL\n';
		msg += ' - migrate old data from one table to another\n';
		msg += ' - delete old_table in schema, generate sql\n\n';
		msg += 'or create manual migration like below:\n\n';
		msg += 'ALTER TABLE table_name RENAME TO old_table;\n';
		msg += 'CREATE TABLE table_name (\n';
		msg += '\tcolumn1 datatype [ NULL | NOT NULL ],\n';
		msg += '\tcolumn2 datatype [ NULL | NOT NULL ],\n';
		msg += '\t...\n';
		msg += '\tPRIMARY KEY (pk_col1, pk_col2, ... pk_col_n)\n';
		msg += ' );\n';
		msg += 'INSERT INTO table_name SELECT * FROM old_table;\n\n';
		msg += "Due to that we don't generate migration automatically and it has to be done manually\n";
		msg += '*/\n';
		return msg;
	}
}

class SqliteAlterTableAlterCompositePrimaryKeyConvertor extends Convertor {
	can(statement: JsonStatement, dialect: Dialect): boolean {
		return statement.type === 'alter_composite_pk' && dialect === 'sqlite';
	}

	convert(statement: JsonAlterCompositePK) {
		let msg = '/*\n';
		msg += 'SQLite does not support altering primary key\n';
		msg += 'You can do it in 3 steps with drizzle orm:\n';
		msg += ' - create new mirror table with needed pk, rename current table to old_table, generate SQL\n';
		msg += ' - migrate old data from one table to another\n';
		msg += ' - delete old_table in schema, generate sql\n\n';
		msg += 'or create manual migration like below:\n\n';
		msg += 'ALTER TABLE table_name RENAME TO old_table;\n';
		msg += 'CREATE TABLE table_name (\n';
		msg += '\tcolumn1 datatype [ NULL | NOT NULL ],\n';
		msg += '\tcolumn2 datatype [ NULL | NOT NULL ],\n';
		msg += '\t...\n';
		msg += '\tPRIMARY KEY (pk_col1, pk_col2, ... pk_col_n)\n';
		msg += ' );\n';
		msg += 'INSERT INTO table_name SELECT * FROM old_table;\n\n';
		msg += "Due to that we don't generate migration automatically and it has to be done manually\n";
		msg += '*/\n';

		return msg;
	}
}

class PgAlterTableAlterColumnSetPrimaryKeyConvertor extends Convertor {
	can(statement: JsonStatement, dialect: Dialect): boolean {
		return (
			statement.type === 'alter_table_alter_column_set_pk'
			&& dialect === 'postgresql'
		);
	}

	convert(statement: JsonAlterColumnSetPrimaryKeyStatement) {
		const { tableName, columnName } = statement;

		const tableNameWithSchema = statement.schema
			? `"${statement.schema}"."${statement.tableName}"`
			: `"${statement.tableName}"`;

		return `ALTER TABLE ${tableNameWithSchema} ADD PRIMARY KEY ("${columnName}");`;
	}
}

class PgAlterTableAlterColumnDropPrimaryKeyConvertor extends Convertor {
	can(statement: JsonStatement, dialect: Dialect): boolean {
		return (
			statement.type === 'alter_table_alter_column_drop_pk'
			&& dialect === 'postgresql'
		);
	}

	convert(statement: JsonAlterColumnDropPrimaryKeyStatement) {
		const { tableName, columnName, schema } = statement;
		return `/* 
    Unfortunately in current drizzle-kit version we can't automatically get name for primary key.
    We are working on making it available!

    Meanwhile you can:
        1. Check pk name in your database, by running
            SELECT constraint_name FROM information_schema.table_constraints
            WHERE table_schema = '${typeof schema === 'undefined' || schema === '' ? 'public' : schema}'
                AND table_name = '${tableName}'
                AND constraint_type = 'PRIMARY KEY';
        2. Uncomment code below and paste pk name manually
        
    Hope to release this update as soon as possible
*/

-- ALTER TABLE "${tableName}" DROP CONSTRAINT "<constraint_name>";`;
	}
}

class PgAlterTableAlterColumnSetNotNullConvertor extends Convertor {
	can(statement: JsonStatement, dialect: Dialect): boolean {
		return (
			statement.type === 'alter_table_alter_column_set_notnull'
			&& dialect === 'postgresql'
		);
	}

	convert(statement: JsonAlterColumnSetNotNullStatement) {
		const { tableName, columnName } = statement;

		const tableNameWithSchema = statement.schema
			? `"${statement.schema}"."${statement.tableName}"`
			: `"${statement.tableName}"`;

		return `ALTER TABLE ${tableNameWithSchema} ALTER COLUMN "${columnName}" SET NOT NULL;`;
	}
}

class SqliteAlterTableAlterColumnSetNotNullConvertor extends Convertor {
	can(statement: JsonStatement, dialect: Dialect): boolean {
		return (
			statement.type === 'alter_table_alter_column_set_notnull'
			&& dialect === 'sqlite'
		);
	}

	convert(statement: JsonAlterColumnSetNotNullStatement) {
		return (
			'/*\n SQLite does not support "Set not null to column" out of the box, we do not generate automatic migration for that, so it has to be done manually'
			+ '\n Please refer to: https://www.techonthenet.com/sqlite/tables/alter_table.php'
			+ '\n                  https://www.sqlite.org/lang_altertable.html'
			+ '\n                  https://stackoverflow.com/questions/2083543/modify-a-columns-type-in-sqlite3'
			+ "\n\n Due to that we don't generate migration automatically and it has to be done manually"
			+ '\n*/'
		);
	}
}

class SqliteAlterTableAlterColumnSetAutoincrementConvertor extends Convertor {
	can(statement: JsonStatement, dialect: Dialect): boolean {
		return (
			statement.type === 'alter_table_alter_column_set_autoincrement'
			&& dialect === 'sqlite'
		);
	}

	convert(statement: JsonAlterColumnSetAutoincrementStatement) {
		return (
			'/*\n SQLite does not support "Set autoincrement to a column" out of the box, we do not generate automatic migration for that, so it has to be done manually'
			+ '\n Please refer to: https://www.techonthenet.com/sqlite/tables/alter_table.php'
			+ '\n                  https://www.sqlite.org/lang_altertable.html'
			+ '\n                  https://stackoverflow.com/questions/2083543/modify-a-columns-type-in-sqlite3'
			+ "\n\n Due to that we don't generate migration automatically and it has to be done manually"
			+ '\n*/'
		);
	}
}

class SqliteAlterTableAlterColumnDropAutoincrementConvertor extends Convertor {
	can(statement: JsonStatement, dialect: Dialect): boolean {
		return (
			statement.type === 'alter_table_alter_column_drop_autoincrement'
			&& dialect === 'sqlite'
		);
	}

	convert(statement: JsonAlterColumnDropAutoincrementStatement) {
		return (
			'/*\n SQLite does not support "Drop autoincrement from a column" out of the box, we do not generate automatic migration for that, so it has to be done manually'
			+ '\n Please refer to: https://www.techonthenet.com/sqlite/tables/alter_table.php'
			+ '\n                  https://www.sqlite.org/lang_altertable.html'
			+ '\n                  https://stackoverflow.com/questions/2083543/modify-a-columns-type-in-sqlite3'
			+ "\n\n Due to that we don't generate migration automatically and it has to be done manually"
			+ '\n*/'
		);
	}
}

class PgAlterTableAlterColumnDropNotNullConvertor extends Convertor {
	can(statement: JsonStatement, dialect: Dialect): boolean {
		return (
			statement.type === 'alter_table_alter_column_drop_notnull'
			&& dialect === 'postgresql'
		);
	}

	convert(statement: JsonAlterColumnDropNotNullStatement) {
		const { tableName, columnName } = statement;

		const tableNameWithSchema = statement.schema
			? `"${statement.schema}"."${statement.tableName}"`
			: `"${statement.tableName}"`;

		return `ALTER TABLE ${tableNameWithSchema} ALTER COLUMN "${columnName}" DROP NOT NULL;`;
	}
}

class SqliteAlterTableAlterColumnDropNotNullConvertor extends Convertor {
	can(statement: JsonStatement, dialect: Dialect): boolean {
		return (
			statement.type === 'alter_table_alter_column_drop_notnull'
			&& dialect === 'sqlite'
		);
	}

	convert(statement: JsonAlterColumnDropNotNullStatement) {
		return (
			'/*\n SQLite does not support "Drop not null from column" out of the box, we do not generate automatic migration for that, so it has to be done manually'
			+ '\n Please refer to: https://www.techonthenet.com/sqlite/tables/alter_table.php'
			+ '\n                  https://www.sqlite.org/lang_altertable.html'
			+ '\n                  https://stackoverflow.com/questions/2083543/modify-a-columns-type-in-sqlite3'
			+ "\n\n Due to that we don't generate migration automatically and it has to be done manually"
			+ '\n*/'
		);
	}
}

// FK
class PgCreateForeignKeyConvertor extends Convertor {
	can(statement: JsonStatement, dialect: Dialect): boolean {
		return statement.type === 'create_reference' && dialect === 'postgresql';
	}

	convert(statement: JsonCreateReferenceStatement): string {
		const {
			name,
			tableFrom,
			tableTo,
			columnsFrom,
			columnsTo,
			onDelete,
			onUpdate,
			schemaTo,
		} = PgSquasher.unsquashFK(statement.data);
		const onDeleteStatement = onDelete ? ` ON DELETE ${onDelete}` : '';
		const onUpdateStatement = onUpdate ? ` ON UPDATE ${onUpdate}` : '';
		const fromColumnsString = columnsFrom.map((it) => `"${it}"`).join(',');
		const toColumnsString = columnsTo.map((it) => `"${it}"`).join(',');

		const tableNameWithSchema = statement.schema
			? `"${statement.schema}"."${tableFrom}"`
			: `"${tableFrom}"`;

		const tableToNameWithSchema = schemaTo
			? `"${schemaTo}"."${tableTo}"`
			: `"${tableTo}"`;

		const alterStatement =
			`ALTER TABLE ${tableNameWithSchema} ADD CONSTRAINT "${name}" FOREIGN KEY (${fromColumnsString}) REFERENCES ${tableToNameWithSchema}(${toColumnsString})${onDeleteStatement}${onUpdateStatement}`;

		let sql = 'DO $$ BEGIN\n';
		sql += ' ' + alterStatement + ';\n';
		sql += 'EXCEPTION\n';
		sql += ' WHEN duplicate_object THEN null;\n';
		sql += 'END $$;\n';
		return sql;
	}
}

class SqliteCreateForeignKeyConvertor extends Convertor {
	can(statement: JsonStatement, dialect: Dialect): boolean {
		return statement.type === 'create_reference' && dialect === 'sqlite';
	}

	convert(statement: JsonCreateReferenceStatement): string {
		return (
			'/*\n SQLite does not support "Creating foreign key on existing column" out of the box, we do not generate automatic migration for that, so it has to be done manually'
			+ '\n Please refer to: https://www.techonthenet.com/sqlite/tables/alter_table.php'
			+ '\n                  https://www.sqlite.org/lang_altertable.html'
			+ "\n\n Due to that we don't generate migration automatically and it has to be done manually"
			+ '\n*/'
		);
	}
}

class MySqlCreateForeignKeyConvertor extends Convertor {
	can(statement: JsonStatement, dialect: Dialect): boolean {
		return statement.type === 'create_reference' && dialect === 'mysql';
	}

	convert(statement: JsonCreateReferenceStatement): string {
		const {
			name,
			tableFrom,
			tableTo,
			columnsFrom,
			columnsTo,
			onDelete,
			onUpdate,
		} = MySqlSquasher.unsquashFK(statement.data);
		const onDeleteStatement = onDelete ? ` ON DELETE ${onDelete}` : '';
		const onUpdateStatement = onUpdate ? ` ON UPDATE ${onUpdate}` : '';
		const fromColumnsString = columnsFrom.map((it) => `\`${it}\``).join(',');
		const toColumnsString = columnsTo.map((it) => `\`${it}\``).join(',');

		return `ALTER TABLE \`${tableFrom}\` ADD CONSTRAINT \`${name}\` FOREIGN KEY (${fromColumnsString}) REFERENCES \`${tableTo}\`(${toColumnsString})${onDeleteStatement}${onUpdateStatement};`;
	}
}

class PgAlterForeignKeyConvertor extends Convertor {
	can(statement: JsonStatement, dialect: Dialect): boolean {
		return statement.type === 'alter_reference' && dialect === 'postgresql';
	}

	convert(statement: JsonAlterReferenceStatement): string {
		const newFk = PgSquasher.unsquashFK(statement.data);
		const oldFk = PgSquasher.unsquashFK(statement.oldFkey);

		const tableNameWithSchema = statement.schema
			? `"${statement.schema}"."${oldFk.tableFrom}"`
			: `"${oldFk.tableFrom}"`;

		let sql = `ALTER TABLE ${tableNameWithSchema} DROP CONSTRAINT "${oldFk.name}";\n`;

		const onDeleteStatement = newFk.onDelete
			? ` ON DELETE ${newFk.onDelete}`
			: '';
		const onUpdateStatement = newFk.onUpdate
			? ` ON UPDATE ${newFk.onUpdate}`
			: '';

		const fromColumnsString = newFk.columnsFrom
			.map((it) => `"${it}"`)
			.join(',');
		const toColumnsString = newFk.columnsTo.map((it) => `"${it}"`).join(',');

		const tableFromNameWithSchema = oldFk.schemaTo
			? `"${oldFk.schemaTo}"."${oldFk.tableFrom}"`
			: `"${oldFk.tableFrom}"`;

		const tableToNameWithSchema = newFk.schemaTo
			? `"${newFk.schemaTo}"."${newFk.tableFrom}"`
			: `"${newFk.tableFrom}"`;

		const alterStatement =
			`ALTER TABLE ${tableFromNameWithSchema} ADD CONSTRAINT "${newFk.name}" FOREIGN KEY (${fromColumnsString}) REFERENCES ${tableToNameWithSchema}(${toColumnsString})${onDeleteStatement}${onUpdateStatement}`;

		sql += 'DO $$ BEGIN\n';
		sql += ' ' + alterStatement + ';\n';
		sql += 'EXCEPTION\n';
		sql += ' WHEN duplicate_object THEN null;\n';
		sql += 'END $$;\n';
		return sql;
	}
}

class SqliteAlterForeignKeyConvertor extends Convertor {
	can(statement: JsonStatement, dialect: Dialect): boolean {
		return statement.type === 'alter_reference' && dialect === 'sqlite';
	}

	convert(statement: JsonAlterReferenceStatement): string {
		return (
			'/*\n SQLite does not support "Changing existing foreign key" out of the box, we do not generate automatic migration for that, so it has to be done manually'
			+ '\n Please refer to: https://www.techonthenet.com/sqlite/tables/alter_table.php'
			+ '\n                  https://www.sqlite.org/lang_altertable.html'
			+ "\n\n Due to that we don't generate migration automatically and it has to be done manually"
			+ '\n*/'
		);
	}
}

class PgDeleteForeignKeyConvertor extends Convertor {
	can(statement: JsonStatement, dialect: Dialect): boolean {
		return statement.type === 'delete_reference' && dialect === 'postgresql';
	}

	convert(statement: JsonDeleteReferenceStatement): string {
		const tableFrom = statement.tableName; // delete fk from renamed table case
		const { name } = PgSquasher.unsquashFK(statement.data);

		const tableNameWithSchema = statement.schema
			? `"${statement.schema}"."${tableFrom}"`
			: `"${tableFrom}"`;

		return `ALTER TABLE ${tableNameWithSchema} DROP CONSTRAINT "${name}";\n`;
	}
}

class SqliteDeleteForeignKeyConvertor extends Convertor {
	can(statement: JsonStatement, dialect: Dialect): boolean {
		return statement.type === 'delete_reference' && dialect === 'sqlite';
	}

	convert(statement: JsonDeleteReferenceStatement): string {
		return (
			'/*\n SQLite does not support "Dropping foreign key" out of the box, we do not generate automatic migration for that, so it has to be done manually'
			+ '\n Please refer to: https://www.techonthenet.com/sqlite/tables/alter_table.php'
			+ '\n                  https://www.sqlite.org/lang_altertable.html'
			+ "\n\n Due to that we don't generate migration automatically and it has to be done manually"
			+ '\n*/'
		);
	}
}

class MySqlDeleteForeignKeyConvertor extends Convertor {
	can(statement: JsonStatement, dialect: Dialect): boolean {
		return statement.type === 'delete_reference' && dialect === 'mysql';
	}

	convert(statement: JsonDeleteReferenceStatement): string {
		const tableFrom = statement.tableName; // delete fk from renamed table case
		const { name } = MySqlSquasher.unsquashFK(statement.data);
		return `ALTER TABLE \`${tableFrom}\` DROP FOREIGN KEY \`${name}\`;\n`;
	}
}

class CreatePgIndexConvertor extends Convertor {
	can(statement: JsonStatement, dialect: Dialect): boolean {
		return statement.type === 'create_index_pg' && dialect === 'postgresql';
	}

	convert(statement: JsonPgCreateIndexStatement): string {
		const {
			name,
			columns,
			isUnique,
			concurrently,
			with: withMap,
			method,
			where,
		} = statement.data;
		// // since postgresql 9.5
		const indexPart = isUnique ? 'UNIQUE INDEX' : 'INDEX';
		const value = columns
			.map(
				(it) =>
					`${it.isExpression ? it.expression : `"${it.expression}"`}${
						it.opclass ? ` ${it.opclass}` : it.asc ? '' : ' DESC'
					}${
						(it.asc && it.nulls && it.nulls === 'last') || it.opclass
							? ''
							: ` NULLS ${it.nulls!.toUpperCase()}`
					}`,
			)
			.join(',');

		const tableNameWithSchema = statement.schema
			? `"${statement.schema}"."${statement.tableName}"`
			: `"${statement.tableName}"`;

		function reverseLogic(mappedWith: Record<string, string>): string {
			let reversedString = '';
			for (const key in mappedWith) {
				if (mappedWith.hasOwnProperty(key)) {
					reversedString += `${key}=${mappedWith[key]},`;
				}
			}
			reversedString = reversedString.slice(0, -1);
			return reversedString;
		}

		return `CREATE ${indexPart}${
			concurrently ? ' CONCURRENTLY' : ''
		} IF NOT EXISTS "${name}" ON ${tableNameWithSchema} USING ${method} (${value})${
			Object.keys(withMap!).length !== 0
				? ` WITH (${reverseLogic(withMap!)})`
				: ''
		}${where ? ` WHERE ${where}` : ''};`;
	}
}

class CreateMySqlIndexConvertor extends Convertor {
	can(statement: JsonStatement, dialect: Dialect): boolean {
		return statement.type === 'create_index' && dialect === 'mysql';
	}

	convert(statement: JsonCreateIndexStatement): string {
		// should be changed
		const { name, columns, isUnique } = MySqlSquasher.unsquashIdx(
			statement.data,
		);
		const indexPart = isUnique ? 'UNIQUE INDEX' : 'INDEX';

		const uniqueString = columns
			.map((it) => {
				return statement.internal?.indexes
					? statement.internal?.indexes[name]?.columns[it]?.isExpression
						? it
						: `\`${it}\``
					: `\`${it}\``;
			})
			.join(',');

		return `CREATE ${indexPart} \`${name}\` ON \`${statement.tableName}\` (${uniqueString});`;
	}
}

export class CreateSqliteIndexConvertor extends Convertor {
	can(statement: JsonStatement, dialect: Dialect): boolean {
		return statement.type === 'create_index' && dialect === 'sqlite';
	}

	convert(statement: JsonCreateIndexStatement): string {
		// should be changed
		const { name, columns, isUnique, where } = SQLiteSquasher.unsquashIdx(
			statement.data,
		);
		// // since postgresql 9.5
		const indexPart = isUnique ? 'UNIQUE INDEX' : 'INDEX';
		const whereStatement = where ? ` WHERE ${where}` : '';
		const uniqueString = columns
			.map((it) => {
				return statement.internal?.indexes
					? statement.internal?.indexes[name]?.columns[it]?.isExpression
						? it
						: `\`${it}\``
					: `\`${it}\``;
			})
			.join(',');
		return `CREATE ${indexPart} \`${name}\` ON \`${statement.tableName}\` (${uniqueString})${whereStatement};`;
	}
}

class PgDropIndexConvertor extends Convertor {
	can(statement: JsonStatement, dialect: Dialect): boolean {
		return statement.type === 'drop_index' && dialect === 'postgresql';
	}

	convert(statement: JsonDropIndexStatement): string {
		const { name } = PgSquasher.unsquashIdx(statement.data);
		return `DROP INDEX IF EXISTS "${name}";`;
	}
}

class PgCreateSchemaConvertor extends Convertor {
	can(statement: JsonStatement, dialect: Dialect): boolean {
		return statement.type === 'create_schema' && dialect === 'postgresql';
	}

	convert(statement: JsonCreateSchema) {
		const { name } = statement;
		return `CREATE SCHEMA "${name}";\n`;
	}
}

class PgRenameSchemaConvertor extends Convertor {
	can(statement: JsonStatement, dialect: Dialect): boolean {
		return statement.type === 'rename_schema' && dialect === 'postgresql';
	}

	convert(statement: JsonRenameSchema) {
		const { from, to } = statement;
		return `ALTER SCHEMA "${from}" RENAME TO "${to}";\n`;
	}
}

class PgDropSchemaConvertor extends Convertor {
	can(statement: JsonStatement, dialect: Dialect): boolean {
		return statement.type === 'drop_schema' && dialect === 'postgresql';
	}

	convert(statement: JsonCreateSchema) {
		const { name } = statement;
		return `DROP SCHEMA "${name}";\n`;
	}
}

class PgAlterTableSetSchemaConvertor extends Convertor {
	can(statement: JsonStatement, dialect: Dialect): boolean {
		return (
			statement.type === 'alter_table_set_schema' && dialect === 'postgresql'
		);
	}

	convert(statement: JsonAlterTableSetSchema) {
		const { tableName, schemaFrom, schemaTo } = statement;

		return `ALTER TABLE "${schemaFrom}"."${tableName}" SET SCHEMA "${schemaTo}";\n`;
	}
}

class PgAlterTableSetNewSchemaConvertor extends Convertor {
	can(statement: JsonStatement, dialect: Dialect): boolean {
		return (
			statement.type === 'alter_table_set_new_schema'
			&& dialect === 'postgresql'
		);
	}

	convert(statement: JsonAlterTableSetNewSchema) {
		const { tableName, to, from } = statement;

		const tableNameWithSchema = from
			? `"${from}"."${tableName}"`
			: `"${tableName}"`;

		return `ALTER TABLE ${tableNameWithSchema} SET SCHEMA "${to}";\n`;
	}
}

class PgAlterTableRemoveFromSchemaConvertor extends Convertor {
	can(statement: JsonStatement, dialect: Dialect): boolean {
		return (
			statement.type === 'alter_table_remove_from_schema'
			&& dialect === 'postgresql'
		);
	}

	convert(statement: JsonAlterTableRemoveFromSchema) {
		const { tableName, schema } = statement;

		const tableNameWithSchema = schema
			? `"${schema}"."${tableName}"`
			: `"${tableName}"`;

		return `ALTER TABLE ${tableNameWithSchema} SET SCHEMA public;\n`;
	}
}

export class SqliteDropIndexConvertor extends Convertor {
	can(statement: JsonStatement, dialect: Dialect): boolean {
		return statement.type === 'drop_index' && dialect === 'sqlite';
	}

	convert(statement: JsonDropIndexStatement): string {
		const { name } = PgSquasher.unsquashIdx(statement.data);
		return `DROP INDEX IF EXISTS \`${name}\`;`;
	}
}

class MySqlDropIndexConvertor extends Convertor {
	can(statement: JsonStatement, dialect: Dialect): boolean {
		return statement.type === 'drop_index' && dialect === 'mysql';
	}

	convert(statement: JsonDropIndexStatement): string {
		const { name } = MySqlSquasher.unsquashIdx(statement.data);
		return `DROP INDEX \`${name}\` ON \`${statement.tableName}\`;`;
	}
}

const convertors: Convertor[] = [];
convertors.push(new PgCreateTableConvertor());
convertors.push(new MySqlCreateTableConvertor());
convertors.push(new SQLiteCreateTableConvertor());

convertors.push(new CreateTypeEnumConvertor());

convertors.push(new CreatePgSequenceConvertor());
convertors.push(new DropPgSequenceConvertor());
convertors.push(new RenamePgSequenceConvertor());
convertors.push(new MovePgSequenceConvertor());
convertors.push(new AlterPgSequenceConvertor());

convertors.push(new PgDropTableConvertor());
convertors.push(new MySQLDropTableConvertor());
convertors.push(new SQLiteDropTableConvertor());

convertors.push(new PgRenameTableConvertor());
convertors.push(new MySqlRenameTableConvertor());
convertors.push(new SqliteRenameTableConvertor());

convertors.push(new PgAlterTableRenameColumnConvertor());
convertors.push(new MySqlAlterTableRenameColumnConvertor());
convertors.push(new SQLiteAlterTableRenameColumnConvertor());

convertors.push(new PgAlterTableDropColumnConvertor());
convertors.push(new MySqlAlterTableDropColumnConvertor());
convertors.push(new SQLiteAlterTableDropColumnConvertor());

convertors.push(new PgAlterTableAddColumnConvertor());
convertors.push(new MySqlAlterTableAddColumnConvertor());
convertors.push(new SQLiteAlterTableAddColumnConvertor());

convertors.push(new PgAlterTableAlterColumnSetTypeConvertor());

convertors.push(new PgAlterTableAddUniqueConstraintConvertor());
convertors.push(new PgAlterTableDropUniqueConstraintConvertor());

convertors.push(new MySQLAlterTableAddUniqueConstraintConvertor());
convertors.push(new MySQLAlterTableDropUniqueConstraintConvertor());

convertors.push(new CreatePgIndexConvertor());
convertors.push(new CreateMySqlIndexConvertor());
convertors.push(new CreateSqliteIndexConvertor());

convertors.push(new PgDropIndexConvertor());
convertors.push(new SqliteDropIndexConvertor());
convertors.push(new MySqlDropIndexConvertor());

convertors.push(new AlterTypeAddValueConvertor());

convertors.push(new PgAlterTableAlterColumnSetPrimaryKeyConvertor());
convertors.push(new PgAlterTableAlterColumnDropPrimaryKeyConvertor());
convertors.push(new PgAlterTableAlterColumnSetNotNullConvertor());
convertors.push(new PgAlterTableAlterColumnDropNotNullConvertor());
convertors.push(new PgAlterTableAlterColumnSetDefaultConvertor());
convertors.push(new PgAlterTableAlterColumnDropDefaultConvertor());

/// generated
convertors.push(new PgAlterTableAlterColumnSetExpressionConvertor());
convertors.push(new PgAlterTableAlterColumnDropGeneratedConvertor());
convertors.push(new PgAlterTableAlterColumnAlterrGeneratedConvertor());

convertors.push(new MySqlAlterTableAlterColumnAlterrGeneratedConvertor());

convertors.push(new SqliteAlterTableAlterColumnDropGeneratedConvertor());
convertors.push(new SqliteAlterTableAlterColumnAlterGeneratedConvertor());
convertors.push(new SqliteAlterTableAlterColumnSetExpressionConvertor());

convertors.push(new MySqlModifyColumn());
// convertors.push(new MySqlAlterTableAlterColumnSetDefaultConvertor());
// convertors.push(new MySqlAlterTableAlterColumnDropDefaultConvertor());

convertors.push(new PgCreateForeignKeyConvertor());
convertors.push(new MySqlCreateForeignKeyConvertor());

convertors.push(new PgAlterForeignKeyConvertor());

convertors.push(new PgDeleteForeignKeyConvertor());
convertors.push(new MySqlDeleteForeignKeyConvertor());

convertors.push(new PgCreateSchemaConvertor());
convertors.push(new PgRenameSchemaConvertor());
convertors.push(new PgDropSchemaConvertor());
convertors.push(new PgAlterTableSetSchemaConvertor());
convertors.push(new PgAlterTableSetNewSchemaConvertor());
convertors.push(new PgAlterTableRemoveFromSchemaConvertor());

// Unhandled sqlite queries, so they will appear last
convertors.push(new SQLiteAlterTableAlterColumnSetTypeConvertor());
convertors.push(new SqliteAlterForeignKeyConvertor());
convertors.push(new SqliteDeleteForeignKeyConvertor());
convertors.push(new SqliteCreateForeignKeyConvertor());

convertors.push(new SQLiteAlterTableAddUniqueConstraintConvertor());
convertors.push(new SQLiteAlterTableDropUniqueConstraintConvertor());

convertors.push(new PgAlterTableAlterColumnDropGenerated());
convertors.push(new PgAlterTableAlterColumnSetGenerated());
convertors.push(new PgAlterTableAlterColumnAlterGenerated());

convertors.push(new SqliteAlterTableAlterColumnSetNotNullConvertor());
convertors.push(new SqliteAlterTableAlterColumnDropNotNullConvertor());
convertors.push(new SqliteAlterTableAlterColumnSetDefaultConvertor());
convertors.push(new SqliteAlterTableAlterColumnDropDefaultConvertor());

convertors.push(new SqliteAlterTableAlterColumnSetAutoincrementConvertor());
convertors.push(new SqliteAlterTableAlterColumnDropAutoincrementConvertor());

convertors.push(new SqliteAlterTableCreateCompositePrimaryKeyConvertor());
convertors.push(new SqliteAlterTableDeleteCompositePrimaryKeyConvertor());
convertors.push(new SqliteAlterTableAlterCompositePrimaryKeyConvertor());

convertors.push(new PgAlterTableCreateCompositePrimaryKeyConvertor());
convertors.push(new PgAlterTableDeleteCompositePrimaryKeyConvertor());
convertors.push(new PgAlterTableAlterCompositePrimaryKeyConvertor());

convertors.push(new MySqlAlterTableDeleteCompositePrimaryKeyConvertor());
convertors.push(new MySqlAlterTableDropPk());
convertors.push(new MySqlAlterTableCreateCompositePrimaryKeyConvertor());
convertors.push(new MySqlAlterTableAddPk());
convertors.push(new MySqlAlterTableAlterCompositePrimaryKeyConvertor());

export const fromJson = (statements: JsonStatement[], dialect: Dialect) => {
	const result = statements
		.flatMap((statement) => {
			const filtered = convertors.filter((it) => {
				// console.log(statement, dialect)
				return it.can(statement, dialect);
			});

			const convertor = filtered.length === 1 ? filtered[0] : undefined;

			if (!convertor) {
				// console.log("no convertor:", statement.type, dialect);
				return '';
			}

			return convertor.convert(statement);
		})
		.filter((it) => it !== '');
	return result;
};

// blog.yo1.dog/updating-enum-values-in-postgresql-the-safe-and-easy-way/
// test case for enum altering
https: `
create table users (
	id int,
    name character varying(128)
);

create type venum as enum('one', 'two', 'three');
alter table users add column typed venum;

insert into users(id, name, typed) values (1, 'name1', 'one');
insert into users(id, name, typed) values (2, 'name2', 'two');
insert into users(id, name, typed) values (3, 'name3', 'three');

alter type venum rename to __venum;
create type venum as enum ('one', 'two', 'three', 'four', 'five');

ALTER TABLE users ALTER COLUMN typed TYPE venum USING typed::text::venum;

insert into users(id, name, typed) values (4, 'name4', 'four');
insert into users(id, name, typed) values (5, 'name5', 'five');

drop type __venum;
`;
