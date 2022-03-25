/* eslint-disable max-classes-per-file */
/* eslint-disable import/no-named-as-default-member */
/* eslint-disable import/no-named-as-default */
/* eslint-disable no-param-reassign */
/* eslint-disable no-restricted-syntax */

import { Column } from '../columns';
import ColumnType from '../columns/types/columnType';
import { DB } from '../db';
import TableIndex from '../indexes/tableIndex';
import { AbstractTable } from '../tables';
import Enum from '../types/type';

interface EnumsAsObject {
  [name: string]: {
    name: string,
    values: string[]
  }
}

interface ColumnAsObject {
  [name: string]: {
    name?: string;
    type?: string;
    primaryKey?: boolean;
    unique?: boolean;
    default?: any;
    notNull?: boolean;
    references?: string;
  };
}

interface IndexColumnAsObject {
  [name: string]: {
    name?: string;
  };
}

interface IndexAsObject {
  [name: string]: {
    name?: string;
    columns?: ColumnAsObject;
    isUnique?: boolean
  };
}

interface TableAsObject {
  [name: string]: {
    name: string;
    columns: ColumnAsObject;
    indexes: {
      [name: string]: {
        name?: string;
        type?: string;
      };
    };
  };
}

// eslint-disable-next-line max-len
const serialiseForeignKey = (fkName:string, table:string, column:string, onDelete?:string, onUpdate?:string) => `${fkName};${table};${column};${onDelete ?? ''};${onUpdate ?? ''}`;

export default class MigrationSerializer {
  public generate = (tables: AbstractTable<any>[], enums: Enum<any>[]) => {
    const result: TableAsObject = {};

    for (const table of tables) {
      const tableEntries = Object.entries(table);
      const columnToReturn: ColumnAsObject = {};
      const indexToReturn: IndexAsObject = {};

      for (const properties of tableEntries) {
        const value = properties[1];
        if (value instanceof TableIndex) {
          const columns = value.getColumns();
          const name = value.indexName();

          const indexColumnToReturn: IndexColumnAsObject = {};

          for (const column of columns) {
            const columnName = column.getColumnName();
            indexColumnToReturn[columnName] = {
              name: columnName,
            };
          }

          indexToReturn[name] = {
            name,
            columns: indexColumnToReturn,
            isUnique: value.isUnique(),
          };
        }

        if (value instanceof Column) {
          columnToReturn[value.getColumnName()] = {
            name: value.getColumnName(),
            type: (value.getColumnType() as ColumnType).getDbName(),
            primaryKey: !!value.primaryKeyName,
            // unique: !!value.uniqueKeyName,
            // default: value.getDefaultValue() === null ? undefined : value.getDefaultValue(),
            notNull: !value.isNullableFlag,
          };

          if (value.getDefaultValue() !== undefined && value.getDefaultValue() !== null) {
            columnToReturn[value.getColumnName()].default = value.getDefaultValue().toJSON();
          }

          if (value.uniqueKeyName) {
            const indexName = `${value.getParent().tableName()}_${value.getColumnName()}_index`;

            const indexColumnToReturn: IndexColumnAsObject = {};
            indexColumnToReturn[value.getColumnName()] = {
              name: value.getColumnName(),
            };

            indexToReturn[indexName] = {
              name: indexName,
              columns: indexColumnToReturn,
              isUnique: true,
            };
          }

          const referenced = value.getReferenced();
          if (referenced) {
            const fkName = `${value.getParent().tableName()}_${value.getColumnName()}_fkey`;
            const tableParentName = referenced.getParentName();
            const column = referenced.getColumnName();
            const onDelete = value.getOnDelete();
            const onUpdate = value.getOnUpdate();

            // eslint-disable-next-line max-len
            const referenceString = serialiseForeignKey(fkName, tableParentName, column, onDelete, onUpdate);
            columnToReturn[value.getColumnName()].references = referenceString;
          }
        }
      }

      result[table.tableName()] = {
        name: table.tableName(),
        columns: columnToReturn,
        indexes: indexToReturn,
      };
    }

    const enumsToReturn = enums.reduce<{[key:string]: Enum<any>}>((map, obj) => {
      const key = obj.name;
      const newValues = obj.values.reduce((mapped, value) => {
        mapped[value] = value;
        return mapped;
      }, {});

      map[key] = { name: obj.name, values: newValues };
      return map;
    }, {});

    return { version: '2', tables: result, enums: enumsToReturn };
  };

  public fromDatabase = async (db: DB) => {
    const result: TableAsObject = {};

    const allTables = await db.session().execute('SELECT table_schema, table_name FROM information_schema.tables WHERE table_schema != \'pg_catalog\' and table_schema != \'information_schema\';');
    for await (const row of allTables.rows) {
      try {
        // const tableSchema = row.table_schema;
        const tableName = row.table_name;

        const columnToReturn: ColumnAsObject = {};
        const indexToReturn: IndexAsObject = {};

        const tableResponse = await db.session().execute(`SELECT a.attrelid::regclass::text, a.attname
        , CASE WHEN a.atttypid = ANY ('{int,int8,int2}'::regtype[])
             AND EXISTS (
                SELECT FROM pg_attrdef ad
                WHERE  ad.adrelid = a.attrelid
                AND    ad.adnum   = a.attnum
                AND    pg_get_expr(ad.adbin, ad.adrelid)
                     = 'nextval('''
                    || (pg_get_serial_sequence (a.attrelid::regclass::text
                                             , a.attname))::regclass
                    || '''::regclass)'
                )
           THEN CASE a.atttypid
                   WHEN 'int'::regtype  THEN 'serial'
                   WHEN 'int8'::regtype THEN 'bigserial'
                   WHEN 'int2'::regtype THEN 'smallserial'
                END
           ELSE format_type(a.atttypid, a.atttypmod)
           END AS data_type, INFORMATION_SCHEMA.COLUMNS.table_name, INFORMATION_SCHEMA.COLUMNS.column_name, INFORMATION_SCHEMA.COLUMNS.column_default
   FROM  pg_attribute  a
   JOIN INFORMATION_SCHEMA.COLUMNS ON INFORMATION_SCHEMA.COLUMNS.column_name = a.attname
   WHERE  a.attrelid = '${tableName}'::regclass and INFORMATION_SCHEMA.COLUMNS.table_name = '${tableName}'
   AND    a.attnum > 0
   AND    NOT a.attisdropped
   ORDER  BY a.attnum;`);
        const tableConstraints = await db.session().execute(`SELECT c.column_name, c.data_type, constraint_type, constraint_name
      FROM information_schema.table_constraints tc 
      JOIN information_schema.constraint_column_usage AS ccu USING (constraint_schema, constraint_name) 
      JOIN information_schema.columns AS c ON c.table_schema = tc.constraint_schema
        AND tc.table_name = c.table_name AND ccu.column_name = c.column_name
      WHERE tc.table_name = '${tableName}';`);

        const tableForeignKeys = await db.session().execute(`SELECT
        tc.table_schema, 
        tc.constraint_name, 
        tc.table_name, 
        kcu.column_name,
        ccu.table_schema AS foreign_table_schema,
        ccu.table_name AS foreign_table_name,
        ccu.column_name AS foreign_column_name,
        rc.delete_rule, rc.update_rule
    FROM 
        information_schema.table_constraints AS tc
        JOIN information_schema.key_column_usage AS kcu
          ON tc.constraint_name = kcu.constraint_name
          AND tc.table_schema = kcu.table_schema
        JOIN information_schema.constraint_column_usage AS ccu
          ON ccu.constraint_name = tc.constraint_name
          AND ccu.table_schema = tc.table_schema
        JOIN information_schema.referential_constraints AS rc
          ON ccu.constraint_name = rc.constraint_name 
    WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_name='${tableName}';`);

        const mappedRefernces: { [name: string]: string } = {};

        for (const fk of tableForeignKeys.rows) {
          // const tableFrom = fk.table_name;
          const columnFrom = fk.column_name;
          const tableTo = fk.foreign_table_name;
          const columnTo = fk.foreign_column_name;
          const foreignKeyName = fk.constraint_name;
          const onUpdate = fk.update_rule;
          const onDelete = fk.delete_rule;
          // eslint-disable-next-line max-len
          const references = serialiseForeignKey(foreignKeyName, tableTo, columnTo, onDelete, onUpdate);
          mappedRefernces[columnFrom] = references;
        }

        for (const columnResponse of tableResponse.rows) {
          const columnName = columnResponse.attname;
          const columnType = columnResponse.data_type;

          const primaryKey = tableConstraints.rows.filter((mapRow) => columnName === mapRow.column_name && mapRow.constraint_type === 'PRIMARY KEY');
          const uniqueKey = tableConstraints.rows.filter((mapRow) => columnName === mapRow.column_name && mapRow.constraint_type === 'UNIQUE');

          const defaultValue: string = columnResponse.column_default === null
            ? undefined : columnResponse.column_default;

          const isSerial = columnType === 'serial';

          columnToReturn[columnName] = {
            name: columnName,
            type: columnType,
            primaryKey: !!primaryKey[0],
            unique: !!uniqueKey[0],
            default: isSerial ? undefined : defaultValue,
            notNull: !columnResponse.is_nullable,
            references: mappedRefernces[columnName] ?? undefined,
          };
        }

        const dbIndexes = await db.session().execute(`select
        t.relname as table_name,
        i.relname as index_name,
        a.attname as column_name
    from
        pg_class t,
        pg_class i,
        pg_index ix,
        pg_attribute a
    where
        t.oid = ix.indrelid
        and i.oid = ix.indexrelid
        and a.attrelid = t.oid
        and a.attnum = ANY(ix.indkey)
        and t.relkind = 'r'
        and t.relname = '${tableName}'
    order by
        t.relname,
        i.relname;`);

        for (const dbIndex of dbIndexes.rows) {
          const indexName = dbIndex.index_name;
          const indexColumnName = dbIndex.column_name;

          if (indexToReturn[indexName] !== undefined && indexToReturn[indexName] !== null) {
            indexToReturn[indexName]!.columns![indexColumnName] = {
              name: indexColumnName,
            };
          } else {
            indexToReturn[indexName] = {
              name: indexName,
              columns: {
                [indexColumnName]: {
                  name: indexColumnName,
                },
              },
            };
          }
        }

        result[tableName] = {
          name: tableName,
          columns: columnToReturn,
          indexes: indexToReturn,
        };
      } catch (e) {
        console.log(e);
      }
    }

    const allEnums = await db.session().execute(`select n.nspname as enum_schema,  
    t.typname as enum_name,  
    e.enumlabel as enum_value
    from pg_type t 
    join pg_enum e on t.oid = e.enumtypid  
    join pg_catalog.pg_namespace n ON n.oid = t.typnamespace;`);

    const enumsToReturn: EnumsAsObject = {};

    for (const dbEnum of allEnums.rows) {
      const enumName = dbEnum.enum_name;
      const enumValue = dbEnum.enum_value;

      if (enumsToReturn[enumName] !== undefined && enumsToReturn[enumName] !== null) {
        enumsToReturn[enumName].values.push(enumValue);
      } else {
        enumsToReturn[enumName] = {
          name: enumName,
          values: [enumValue],
        };
      }
    }

    return { version: '2', tables: result, enums: enumsToReturn };
  };
}
