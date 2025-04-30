import type { Dialect } from './schemaValidator';
import { SingleStoreSquasher } from './serializer/singlestoreSchema';

class SingleStoreCreateTableConvertor implements Convertor {
	can(statement: JsonStatement, dialect: Dialect): boolean {
		return statement.type === 'create_table' && dialect === 'singlestore';
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
				+ `\`${column.name}\` ${column.type}${autoincrementStatement}${primaryKeyStatement}${notNullStatement}${defaultStatement}${onUpdateStatement}${generatedStatement}`;
			statement += i === columns.length - 1 ? '' : ',\n';
		}

		if (typeof compositePKs !== 'undefined' && compositePKs.length > 0) {
			statement += ',\n';
			const compositePK = SingleStoreSquasher.unsquashPK(compositePKs[0]);
			statement += `\tCONSTRAINT \`${st.compositePkName}\` PRIMARY KEY(\`${compositePK.columns.join(`\`,\``)}\`)`;
		}

		if (
			typeof uniqueConstraints !== 'undefined'
			&& uniqueConstraints.length > 0
		) {
			for (const uniqueConstraint of uniqueConstraints) {
				statement += ',\n';
				const unsquashedUnique = SingleStoreSquasher.unsquashUnique(uniqueConstraint);

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


class SingleStoreAlterTableAddUniqueConstraintConvertor implements Convertor {
	can(statement: JsonCreateUniqueConstraint, dialect: Dialect): boolean {
		return statement.type === 'add_unique' && dialect === 'singlestore';
	}
	convert(statement: JsonCreateUniqueConstraint): string {
		const unsquashed = SingleStoreSquasher.unsquashUnique(statement.unique);

		return `ALTER TABLE \`${statement.tableName}\` ADD CONSTRAINT \`${unsquashed.name}\` UNIQUE(\`${
			unsquashed.columns.join('`,`')
		}\`);`;
	}
}
class SingleStoreAlterTableDropUniqueConstraintConvertor implements Convertor {
	can(statement: JsonDeleteUniqueConstraint, dialect: Dialect): boolean {
		return statement.type === 'delete_unique_constraint' && dialect === 'singlestore';
	}
	convert(statement: JsonDeleteUniqueConstraint): string {
		const unsquashed = SingleStoreSquasher.unsquashUnique(statement.data);

		return `ALTER TABLE \`${statement.tableName}\` DROP INDEX \`${unsquashed.name}\`;`;
	}
}

class SingleStoreDropTableConvertor implements Convertor {
	can(statement: JsonStatement, dialect: Dialect): boolean {
		return statement.type === 'drop_table' && dialect === 'singlestore';
	}

	convert(statement: JsonDropTableStatement) {
		const { tableName } = statement;
		return `DROP TABLE \`${tableName}\`;`;
	}
}

class SingleStoreRenameTableConvertor implements Convertor {
	can(statement: JsonStatement, dialect: Dialect): boolean {
		return statement.type === 'rename_table' && dialect === 'singlestore';
	}

	convert(statement: JsonRenameTableStatement) {
		const { tableNameFrom, tableNameTo } = statement;
		return `RENAME TABLE \`${tableNameFrom}\` TO \`${tableNameTo}\`;`;
	}
}

class SingleStoreAlterTableDropColumnConvertor implements Convertor {
	can(statement: JsonStatement, dialect: Dialect): boolean {
		return statement.type === 'alter_table_drop_column' && dialect === 'singlestore';
	}

	convert(statement: JsonDropColumnStatement) {
		const { tableName, columnName } = statement;
		return `ALTER TABLE \`${tableName}\` DROP COLUMN \`${columnName}\`;`;
	}
}

class SingleStoreAlterTableAddColumnConvertor implements Convertor {
	can(statement: JsonStatement, dialect: Dialect): boolean {
		return statement.type === 'alter_table_add_column' && dialect === 'singlestore';
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

		return `ALTER TABLE \`${tableName}\` ADD \`${name}\` ${type}${primaryKeyStatement}${autoincrementStatement}${defaultStatement}${notNullStatement}${onUpdateStatement}${generatedStatement};`;
	}
}

class SingleStoreAlterTableAlterColumnAlterrGeneratedConvertor implements Convertor {
	can(statement: JsonStatement, dialect: Dialect): boolean {
		return (
			statement.type === 'alter_table_alter_column_alter_generated'
			&& dialect === 'singlestore'
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

		const addColumnStatement = new SingleStoreAlterTableAddColumnConvertor().convert({
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
			type: 'add_column',
		});

		return [
			`ALTER TABLE ${tableNameWithSchema} drop column \`${columnName}\`;`,
			addColumnStatement,
		];
	}
}

class SingleStoreAlterTableAlterColumnSetDefaultConvertor implements Convertor {
	can(statement: JsonStatement, dialect: Dialect): boolean {
		return (
			statement.type === 'alter_table_alter_column_set_default'
			&& dialect === 'singlestore'
		);
	}

	convert(statement: JsonAlterColumnSetDefaultStatement) {
		const { tableName, columnName } = statement;
		return `ALTER TABLE \`${tableName}\` ALTER COLUMN \`${columnName}\` SET DEFAULT ${statement.newDefaultValue};`;
	}
}

class SingleStoreAlterTableAlterColumnDropDefaultConvertor implements Convertor {
	can(statement: JsonStatement, dialect: Dialect): boolean {
		return (
			statement.type === 'alter_table_alter_column_drop_default'
			&& dialect === 'singlestore'
		);
	}

	convert(statement: JsonAlterColumnDropDefaultStatement) {
		const { tableName, columnName } = statement;
		return `ALTER TABLE \`${tableName}\` ALTER COLUMN \`${columnName}\` DROP DEFAULT;`;
	}
}

class SingleStoreAlterTableAddPk implements Convertor {
	can(statement: JsonStatement, dialect: string): boolean {
		return (
			statement.type === 'alter_table_alter_column_set_pk'
			&& dialect === 'singlestore'
		);
	}
	convert(statement: JsonAlterColumnSetPrimaryKeyStatement): string {
		return `ALTER TABLE \`${statement.tableName}\` ADD PRIMARY KEY (\`${statement.columnName}\`);`;
	}
}

class SingleStoreAlterTableDropPk implements Convertor {
	can(statement: JsonStatement, dialect: string): boolean {
		return (
			statement.type === 'alter_table_alter_column_drop_pk'
			&& dialect === 'singlestore'
		);
	}
	convert(statement: JsonAlterColumnDropPrimaryKeyStatement): string {
		return `ALTER TABLE \`${statement.tableName}\` DROP PRIMARY KEY`;
	}
}

class SingleStoreModifyColumn implements Convertor {
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
			&& dialect === 'singlestore'
		);
	}

	convert(statement: SingleStoreModifyColumnStatement) {
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
					new SingleStoreAlterTableDropColumnConvertor().convert({
						type: 'drop_column',
						tableName: statement.tableName,
						columnName: statement.columnName,
						schema: statement.schema,
					}),
					new SingleStoreAlterTableAddColumnConvertor().convert({
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
						type: 'add_column',
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
					new SingleStoreAlterTableDropColumnConvertor().convert({
						type: 'drop_column',
						tableName: statement.tableName,
						columnName: statement.columnName,
						schema: statement.schema,
					}),
					new SingleStoreAlterTableAddColumnConvertor().convert({
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
						type: 'add_column',
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

		return `ALTER TABLE \`${tableName}\` MODIFY COLUMN \`${columnName}\`${columnType}${columnAutoincrement}${columnNotNull}${columnDefault}${columnOnUpdate}${columnGenerated};`;
	}
}

class CreateSingleStoreIndexConvertor implements Convertor {
	can(statement: JsonStatement, dialect: Dialect): boolean {
		return statement.type === 'create_index' && dialect === 'singlestore';
	}

	convert(statement: JsonCreateIndexStatement): string {
		// should be changed
		const { name, columns, isUnique } = SingleStoreSquasher.unsquashIdx(
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

class SingleStoreDropIndexConvertor implements Convertor {
	can(statement: JsonStatement, dialect: Dialect): boolean {
		return statement.type === 'drop_index' && dialect === 'singlestore';
	}

	convert(statement: JsonDropIndexStatement): string {
		const { name } = SingleStoreSquasher.unsquashIdx(statement.data);
		return `DROP INDEX \`${name}\` ON \`${statement.tableName}\`;`;
	}
}
