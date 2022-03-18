import { AlteredColumn, Column, Index, Table } from "./snapshotsDiffer";

export interface JsonCreateTableStatement {
  type: "create_table";
  tableName: string;
  columns: Column[];
}

export interface JsonDropTableStatement {
  type: "drop_table";
  tableName: string;
}

export interface JsonRenameTableStatement {
  type: "rename_table";
  tableNameFrom: string;
  tableNameTo: string;
}

export interface JsonCreateEnumStatement {
  type: "create_type_enum";
  name: string;
  values: string[];
}

export interface JsonAddValueToEnumStatement {
  type: "alter_type_add_value";
  name: string;
  value: string;
}

export interface JsonDropColumnStatement {
  type: "alter_table_drop_column";
  tableName: string;
  columnName: string;
}

export interface JsonAddColumnStatement {
  type: "alter_table_add_column";
  tableName: string;
  column: Column;
}

export interface JsonCreateIndexStatement {
  type: "create_index";
  tableName: string;
  indexName: string;
  value: string;
  isUnique: boolean;
}

export interface JsonReferenceStatement {
  type: "create_reference" | "alter_reference" | "delete_reference";
  fromTable: string;
  toTable: string;
  fromColumn: string;
  toColumn: string;
  foreignKeyName: string;
  onDelete?: string;
  onUpdate?: string;
}

export interface JsonCreateReferenceStatement extends JsonReferenceStatement {
  type: "create_reference";
}

export interface JsonAlterReferenceStatement extends JsonReferenceStatement {
  type: "alter_reference";
  oldFkey: string;
}

export interface JsonDeleteReferenceStatement extends JsonReferenceStatement {
  type: "delete_reference";
}

export interface JsonDropIndexStatement {
  type: "drop_index";
  tableName: string;
  indexName: string;
}

export interface JsonRenameColumnStatement {
  type: "alter_table_rename_column";
  tableName: string;
  oldColumnName: string;
  newColumnName: string;
}

export interface JsonAlterColumnTypeStatement {
  type: "alter_table_alter_column_set_type";
  tableName: string;
  columnName: string;
  newDataType: string;
}

export interface JsonAlterColumnSetDefaultStatement {
  type: "alter_table_alter_column_set_default";
  tableName: string;
  columnName: string;
  newDefaultValue: string;
}

export interface JsonAlterColumnDropDefaultStatement {
  type: "alter_table_alter_column_drop_default";
  tableName: string;
  columnName: string;
}

export interface JsonAlterColumnSetNotNullStatement {
  type: "alter_table_alter_column_set_notnull";
  tableName: string;
  columnName: string;
}

export interface JsonAlterColumnDropNotNullStatement {
  type: "alter_table_alter_column_drop_notnull";
  tableName: string;
  columnName: string;
}

export type JsonAlterColumnStatement =
  | JsonRenameColumnStatement
  | JsonAlterColumnTypeStatement
  | JsonAlterColumnSetDefaultStatement
  | JsonAlterColumnDropDefaultStatement
  | JsonAlterColumnSetNotNullStatement
  | JsonAlterColumnDropNotNullStatement;

export type JsonStatement =
  | JsonAlterColumnStatement
  | JsonCreateTableStatement
  | JsonDropTableStatement
  | JsonRenameTableStatement
  | JsonCreateEnumStatement
  | JsonAddValueToEnumStatement
  | JsonDropColumnStatement
  | JsonAddColumnStatement
  | JsonCreateIndexStatement
  | JsonCreateReferenceStatement
  | JsonAlterReferenceStatement
  | JsonDeleteReferenceStatement
  | JsonDropIndexStatement;

export const prepareCreateTableJson = (
  table: Table
): JsonCreateTableStatement => {
  const { name, columns } = table;
  return {
    type: "create_table",
    tableName: name,
    columns: Object.values(columns),
  };
};

export const prepareDropTableJson = (table: Table): JsonDropTableStatement => {
  return {
    type: "drop_table",
    tableName: table.name,
  };
};

export const prepareRenameTableJson = (
  tableFrom: Table,
  tableTo: Table
): JsonRenameTableStatement => {
  return {
    type: "rename_table",
    tableNameFrom: tableFrom.name,
    tableNameTo: tableTo.name,
  };
};

export const prepareCreateEnumJson = (
  name: string,
  values: string[]
): JsonCreateEnumStatement => {
  return {
    type: "create_type_enum",
    name: name,
    values,
  };
};

// https://blog.yo1.dog/updating-enum-values-in-postgresql-the-safe-and-easy-way/
export const prepareAddValuesToEnumJson = (
  name: string,
  values: string[]
): JsonAddValueToEnumStatement[] => {
  return values.map((it) => {
    return {
      type: "alter_type_add_value",
      name: name,
      value: it,
    };
  });
};

export const prepareRenameColumns = (
  tableName: string,
  pairs: { from: Column; to: Column }[]
): JsonRenameColumnStatement[] => {
  return pairs.map((it) => {
    return {
      type: "alter_table_rename_column",
      tableName: tableName,
      oldColumnName: it.from.name,
      newColumnName: it.to.name,
    };
  });
};

export const prepareAlterTableColumnsJson = (
  tableName: string,
  deleted: Column[],
  added: Column[],
  altered: AlteredColumn[]
) => {
  const statements: JsonStatement[] = [];

  const dropColumns = _prepareDropColumns(tableName, deleted);
  const addColumns = _prepareAddColumns(tableName, added);
  const alterColumns = _prepareAlterColumns(tableName, altered);

  statements.push(...dropColumns);
  statements.push(...addColumns);
  statements.push(...alterColumns);

  return statements;
};

const _prepareDropColumns = (
  taleName: string,
  columns: Column[]
): JsonDropColumnStatement[] => {
  return columns.map((it) => {
    return {
      type: "alter_table_drop_column",
      tableName: taleName,
      columnName: it.name,
    };
  });
};

const _prepareAddColumns = (
  tableName: string,
  columns: Column[]
): JsonAddColumnStatement[] => {
  return columns.map((it) => {
    return {
      type: "alter_table_add_column",
      tableName: tableName,
      column: it,
    };
  });
};

const _prepareAlterColumns = (
  tableName: string,
  columns: AlteredColumn[]
): JsonAlterColumnStatement[] => {
  let statements: JsonAlterColumnStatement[] = [];

  for (const column of columns) {
    // TODO: rename column
    const columnName =
      typeof column.name !== "string" ? column.name.new : column.name;

    if (typeof column.name !== "string") {
      statements.push({
        type: "alter_table_rename_column",
        tableName,
        oldColumnName: column.name.old,
        newColumnName: column.name.new,
      });
    }

    if (column.type?.type === "changed") {
      statements.push({
        type: "alter_table_alter_column_set_type",
        tableName,
        columnName,
        newDataType: column.type.new,
      });
    }

    if (column.defaultValue?.type === "added") {
      statements.push({
        type: "alter_table_alter_column_set_default",
        tableName,
        columnName,
        newDefaultValue: column.defaultValue.value,
      });
    }

    if (column.defaultValue?.type === "changed") {
      statements.push({
        type: "alter_table_alter_column_set_default",
        tableName,
        columnName,
        newDefaultValue: column.defaultValue.new,
      });
    }

    if (column.defaultValue?.type === "deleted") {
      statements.push({
        type: "alter_table_alter_column_drop_default",
        tableName,
        columnName,
      });
    }

    if (column.notNull?.type === "added") {
      statements.push({
        type: "alter_table_alter_column_set_notnull",
        tableName,
        columnName,
      });
    }

    if (column.notNull?.type === "changed") {
      const type = column.notNull.new
        ? "alter_table_alter_column_set_notnull"
        : "alter_table_alter_column_drop_notnull";
      statements.push({
        type: type,
        tableName,
        columnName,
      });
    }

    if (column.notNull?.type === "deleted") {
      statements.push({
        type: "alter_table_alter_column_drop_notnull",
        tableName,
        columnName,
      });
    }

    if (column.notNull?.type === "added") {
      statements.push({
        type: "alter_table_alter_column_set_notnull",
        tableName,
        columnName,
      });
    }

    if (column.notNull?.type === "changed") {
      const type = column.notNull.new
        ? "alter_table_alter_column_set_notnull"
        : "alter_table_alter_column_drop_notnull";
      statements.push({
        type: type,
        tableName,
        columnName,
      });
    }

    if (column.notNull?.type === "deleted") {
      statements.push({
        type: "alter_table_alter_column_drop_notnull",
        tableName,
        columnName,
      });
    }
  }

  return statements;
};

export const prepareCreateIndexesJson = (
  tableName: string,
  indexes: Index[]
): JsonCreateIndexStatement[] => {
  return indexes.map((index) => {
    return {
      type: "create_index",
      tableName,
      indexName: index.name,
      value: index.columns.join(", "),
      isUnique: index.isUnique,
    };
  });
};

export const prepareCreateReferencesJson = (
  tableName: string,
  columns: Column[]
): JsonCreateReferenceStatement[] => {
  return columns
    .filter((it) => {
      return it.references !== undefined;
    })
    .map((entry) => {
      const column = entry;
      const references = column.references!!;
      const [fkName, toTable, toColumn, onDelete, onUpdate] =
        references.split(";");
      return {
        type: "create_reference",
        fromTable: tableName,
        toTable: toTable,
        fromColumn: column.name,
        toColumn: toColumn,
        foreignKeyName: fkName,
        onDelete: onDelete,
        onUpdate: onUpdate,
      };
    });
};

export const prepareAlterReferencesJson = (
  tableName: string,
  columns: AlteredColumn[]
): JsonReferenceStatement[] => {
  const result: JsonReferenceStatement[] = columns
    .filter((it) => {
      return it.references !== undefined;
    })
    .map((column): JsonReferenceStatement => {
      const references = column.references!!;
      const fromColumnName =
        typeof column.name === "string" ? column.name : column.name.new;

      if (references.type === "added") {
        const [fkName, toTable, toColumn, onDelete, onUpdate] =
          references.value.split(";");
        return {
          type: "create_reference",
          fromTable: tableName,
          toTable: toTable,
          fromColumn: fromColumnName,
          toColumn: toColumn,
          foreignKeyName: fkName,
          onDelete: onDelete,
          onUpdate: onUpdate,
        };
      } else if (references.type === "changed") {
        const [oldFkey] = references.old.split(";");
        const [fkName, toTable, toColumn, onDelete, onUpdate] =
          references.old.split(";");
        const alterReference: JsonAlterReferenceStatement = {
          type: "alter_reference",
          fromTable: tableName,
          toTable: toTable,
          fromColumn: fromColumnName,
          toColumn: toColumn,
          foreignKeyName: fkName,
          onDelete: onDelete,
          onUpdate: onUpdate,
          oldFkey: oldFkey
        };
        return alterReference;
      } else {
        const [fkName, toTable, toColumn, onDelete, onUpdate] =
          references.value.split(";");
        return {
          type: "delete_reference",
          fromTable: tableName,
          toTable: toTable,
          fromColumn: fromColumnName,
          toColumn: toColumn,
          foreignKeyName: fkName,
          onDelete: onDelete,
          onUpdate: onUpdate,
        };
      }
    });
    return result
};

export const prepareDropIndexesJson = (
  tableName: string,
  indexes: Index[]
): JsonDropIndexStatement[] => {
  return indexes.map((index) => {
    return {
      type: "drop_index",
      tableName,
      indexName: index.name,
    };
  });
};
