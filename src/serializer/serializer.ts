/* eslint-disable import/no-named-as-default-member */
/* eslint-disable import/no-named-as-default */
/* eslint-disable no-param-reassign */
/* eslint-disable no-restricted-syntax */

import { Column } from '../columns';
import ColumnType from '../columns/types/columnType';
import TableIndex from '../indexes/tableIndex';
import { AbstractTable } from '../tables';
import Enum from '../types/type';

interface ColumnAsObject {
  [name: string]: {
    name?: string;
    type?: string;
    primaryKey?: boolean;
    unique?: boolean;
    default?: any;
    notNull?: boolean;
    references?: {
      foreignKeyName: string;
      onDelete?: string;
      onUpdate?: string;
      table: string;
      column: string;
    };
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
          };
        }

        if (value instanceof Column) {
          columnToReturn[value.getColumnName()] = {
            name: value.getColumnName(),
            type: value.isAutoIncrement() ? 'serial' : (value.getColumnType() as ColumnType).getDbName(),
            primaryKey: !!value.primaryKeyName,
            unique: !!value.uniqueKeyName,
            default: value.getDefaultValue() === null ? undefined : value.getDefaultValue(),
            notNull: !value.isNullableFlag,
          };

          const referenced = value.getReferenced();
          if (referenced) {
            columnToReturn[value.getColumnName()].references = {
              foreignKeyName: `${value.getParent().tableName()}_${value.getColumnName()}_fk`,
              table: referenced.getParentName(),
              column: referenced.getColumnName(),
              onDelete: value.getOnDelete(),
              onUpdate: value.getOnUpdate(),
            };
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

    return { version: '1', tables: result, enums: enumsToReturn };
  };
}
