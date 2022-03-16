import { JsonAddColumnStatement, JsonAddValueToEnumStatement, JsonAlterColumnDropDefaultStatement, JsonAlterColumnDropNotNullStatement, JsonAlterColumnSetDefaultStatement, JsonAlterColumnSetNotNullStatement, JsonAlterColumnTypeStatement, JsonCreateEnumStatement, JsonCreateIndexStatement, JsonCreateReferenceStatement, JsonCreateTableStatement, JsonDropColumnStatement, JsonDropIndexStatement, JsonDropTableStatement, JsonRenameColumnStatement, JsonRenameTableStatement, JsonStatement } from "./jsonStatements";

abstract class Convertor {
    abstract can(statement: JsonStatement): boolean
    abstract convert(statement: JsonStatement): string
}

class CreateTableConvertor extends Convertor {
    can(statement: JsonStatement): boolean {
        return statement.type === 'create_table'
    }

    convert(st: JsonCreateTableStatement) {
        const { tableName, columns } = st

        let statement = ''

        statement += `CREATE TABLE IF NOT EXISTS ${tableName} (\n`
        for (let i = 0; i < columns.length; i++) {
            const column = columns[i]

            const primaryKeyStatement = column.primaryKey ? "PRIMARY KEY" : ''
            const notNullStatement = column.notNull ? "NOT NULL" : "";
            const defaultStatement = column.defaultValue !== undefined ? `DEFAULT ${column.defaultValue}` : "";

            statement += '\t' + `"${column.name}" ${column.type} ${primaryKeyStatement} ${defaultStatement} ${notNullStatement}`.replace(/  +/g, ' ').trim();
            statement += (i === columns.length - 1 ? '' : ',') + '\n'
        }
        statement += `);`
        statement += `\n`
        return statement;
    }
}

class CreateTypeEnumConvertor extends Convertor {
    can(statement: JsonStatement): boolean {
        return statement.type === 'create_type_enum'
    }


    convert(st: JsonCreateEnumStatement) {
        const { name, values } = st
        let valuesStatement = '('
        valuesStatement += values.map(it => `'${it}'`).join(', ')
        valuesStatement += ')'

        let statement = "DO $$ BEGIN"
        statement += "\n"
        statement += ` CREATE TYPE ${name} AS ENUM${valuesStatement};`
        statement += "\n"
        statement += "EXCEPTION"
        statement += "\n"
        statement += " WHEN duplicate_object THEN null;"
        statement += "\n"
        statement += "END $$;"
        statement += '\n'
        return statement
    }
}

class AlterTypeAddValueConvertor extends Convertor {
    can(statement: JsonStatement): boolean {
        return statement.type === 'alter_type_add_value'
    }

    convert(st: JsonAddValueToEnumStatement) {
        const { name, value } = st
        return `ALTER TYPE ${name} ADD VALUE '${value}';`
    }
}

class DropTableConvertor extends Convertor {
    can(statement: JsonStatement): boolean {
        return statement.type === 'drop_table'
    }

    convert(statement: JsonDropTableStatement) {
        const { tableName } = statement
        return `DROP TABLE ${tableName};`
    }
}

class RenameTableConvertor extends Convertor {
    can(statement: JsonStatement): boolean {
        return statement.type === 'rename_table'
    }

    convert(statement: JsonRenameTableStatement) {
        const { tableNameFrom, tableNameTo } = statement
        return `ALTER TABLE ${tableNameFrom} RENAME TO ${tableNameTo};`
    }
}

class AlterTableRenameColumnConvertor extends Convertor {
    can(statement: JsonStatement): boolean {
        return statement.type === 'alter_table_rename_column'
    }

    convert(statement: JsonRenameColumnStatement) {
        const { tableName, oldColumnName, newColumnName } = statement
        return `ALTER TABLE ${tableName} RENAME COLUMN "${oldColumnName}" TO "${newColumnName}";`
    }
}

class AlterTableDropColumnConvertor extends Convertor {
    can(statement: JsonStatement): boolean {
        return statement.type === 'alter_table_drop_column'
    }

    convert(statement: JsonDropColumnStatement) {
        const { tableName, columnName } = statement
        return `ALTER TABLE ${tableName} DROP COLUMN IF EXISTS "${columnName}";`
    }
}

class AlterTableAddColumnConvertor extends Convertor {
    can(statement: JsonStatement): boolean {
        return statement.type === 'alter_table_add_column'
    }

    convert(statement: JsonAddColumnStatement) {
        const { tableName, column } = statement
        const { name, type, notNull } = column;
        const defaultValue = column.defaultValue

        const defaultStatement = `${defaultValue !== undefined ? `DEFAULT ${defaultValue}` : ''}`
        const notNullStatement = `${notNull ? 'NOT NULL' : ''}`
        return `ALTER TABLE ${tableName} ADD COLUMN "${name}" ${type} ${defaultStatement} ${notNullStatement}`.replace(/  +/g, ' ').trim() + ';'
    }
}

class AlterTableAlterColumnSetTypeConvertor extends Convertor {
    can(statement: JsonStatement): boolean {
        return statement.type === 'alter_table_alter_column_set_type'
    }

    convert(statement: JsonAlterColumnTypeStatement) {
        const { tableName, columnName, newDataType } = statement
        return `ALTER TABLE ${tableName} ALTER COLUMN "${columnName}" SET DATA TYPE ${newDataType};`
    }
}

class AlterTableAlterColumnSetDefaultConvertor extends Convertor {
    can(statement: JsonStatement): boolean {
        return statement.type === 'alter_table_alter_column_set_default'
    }

    convert(statement: JsonAlterColumnSetDefaultStatement) {
        const { tableName, columnName } = statement
        return `ALTER TABLE ${tableName} ALTER COLUMN "${columnName}" SET DEFAULT ${statement.newDefaultValue};`
    }
}

class AlterTableAlterColumnDropDefaultConvertor extends Convertor {
    can(statement: JsonStatement): boolean {
        return statement.type === 'alter_table_alter_column_drop_default'
    }

    convert(statement: JsonAlterColumnDropDefaultStatement) {
        const { tableName, columnName } = statement
        return `ALTER TABLE ${tableName} ALTER COLUMN "${columnName}" DROP DEFAULT;`
    }
}

class AlterTableAlterColumnSetNotNullConvertor extends Convertor {
    can(statement: JsonStatement): boolean {
        return statement.type === 'alter_table_alter_column_set_notnull'
    }

    convert(statement: JsonAlterColumnSetNotNullStatement) {
        const { tableName, columnName } = statement
        return `ALTER TABLE ${tableName} ALTER COLUMN "${columnName}" SET NOT NULL;`
    }
}

class AlterTableAlterColumnDropNotNullConvertor extends Convertor {
    can(statement: JsonStatement): boolean {
        return statement.type === 'alter_table_alter_column_drop_notnull'
    }

    convert(statement: JsonAlterColumnDropNotNullStatement) {
        const { tableName, columnName } = statement
        return `ALTER TABLE ${tableName} ALTER COLUMN "${columnName}" DROP NOT NULL;`
    }
}

class CreateForeignKeyConvertor extends Convertor {
    can(statement: JsonStatement): boolean {
        return statement.type === 'create_reference'
    }

    convert(statement: JsonCreateReferenceStatement) {
        const { fromTable, toTable, fromColumn, toColumn, foreignKeyName, onDelete, onUpdate } = statement
        const onDeleteStatement = onDelete || ""
        const onUpdateStatement = onUpdate || ""
        let sql = "DO $$ BEGIN\n"
        sql += ` ALTER TABLE ${fromTable} ADD CONSTRAINT ${foreignKeyName} FOREIGN KEY ("${fromColumn}") REFERENCES ${toTable}(${toColumn}) ${onDeleteStatement} ${onUpdateStatement}`.replace(/  +/g, ' ').trim() + ';\n'
        sql += "EXCEPTION\n"
        sql += " WHEN duplicate_object THEN null;\n"
        sql += "END $$;\n"
        return sql
    }
}

class CreateIndexConvertor extends Convertor {
    can(statement: JsonStatement): boolean {
        return statement.type === 'create_index'
    }

    convert(statement: JsonCreateIndexStatement) {
        const { tableName, indexName, value } = statement
        // since postgresql 9.5
        const indexPart = statement.isUnique ? 'UNIQUE INDEX' : 'INDEX'
        return `CREATE ${indexPart} IF NOT EXISTS ${indexName} ON ${tableName} (${value});`
    }
}

class DropIndexConvertor extends Convertor {
    can(statement: JsonStatement): boolean {
        return statement.type === 'drop_index'
    }

    convert(statement: JsonDropIndexStatement) {
        const { indexName } = statement
        return `DROP INDEX IF EXISTS ${indexName};`
    }
}

const convertors: Convertor[] = []
convertors.push(new CreateTableConvertor())
convertors.push(new CreateTypeEnumConvertor())
convertors.push(new DropTableConvertor())
convertors.push(new RenameTableConvertor())
convertors.push(new AlterTableRenameColumnConvertor())
convertors.push(new AlterTableDropColumnConvertor())
convertors.push(new AlterTableAddColumnConvertor())
convertors.push(new AlterTableAlterColumnSetTypeConvertor())
convertors.push(new CreateIndexConvertor())
convertors.push(new DropIndexConvertor())
convertors.push(new AlterTypeAddValueConvertor())
convertors.push(new AlterTableAlterColumnSetNotNullConvertor())
convertors.push(new AlterTableAlterColumnDropNotNullConvertor())
convertors.push(new AlterTableAlterColumnSetDefaultConvertor())
convertors.push(new AlterTableAlterColumnDropDefaultConvertor())
convertors.push(new CreateForeignKeyConvertor())

export const fromJson = (statements: JsonStatement[]) => {
    const result = statements.map(statement => {
        const filtered = convertors.filter(it => {
            return it.can(statement)
        })
        const convertor = filtered.length === 1 ? filtered[0] : undefined

        if (!convertor) {
            console.log('no convertor:', statement.type)
            return 'dry run'
        }

        return convertor.convert(statement)
    })
    return result;
}

https://blog.yo1.dog/updating-enum-values-in-postgresql-the-safe-and-easy-way/
// test case for enum altering
`
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
`