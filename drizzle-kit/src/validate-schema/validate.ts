import chalk from 'chalk';
import { getTableConfig as getPgTableConfig, getViewConfig as getPgViewConfig, getMaterializedViewConfig as getPgMaterializedViewConfig, PgEnum, PgMaterializedView, PgSchema, PgSequence, PgTable, PgView, IndexedColumn as PgIndexColumn, uniqueKeyName as pgUniqueKeyName, PgColumn, PgDialect } from 'drizzle-orm/pg-core';
import { Sequence as SequenceCommon, Table as TableCommon } from './utils';
import { MySqlTable, MySqlView, getTableConfig as getMySqlTableConfig, getViewConfig as getMySqlViewConfig, MySqlColumn, uniqueKeyName as mysqlUniqueKeyName } from 'drizzle-orm/mysql-core';
import { SQLiteColumn, SQLiteTable, SQLiteView, getTableConfig as getSQLiteTableConfig, getViewConfig as getSQLiteViewConfig, uniqueKeyName as sqliteUniqueKeyName } from 'drizzle-orm/sqlite-core';
import { GeneratedIdentityConfig, getTableName, is, SQL } from 'drizzle-orm';
import { ValidateDatabase } from './db';
import { CasingType } from 'src/cli/validations/common';
import { getColumnCasing, getForeignKeyName, getIdentitySequenceName, getPrimaryKeyName } from 'src/utils';
import { indexName as pgIndexName } from 'src/serializer/pgSerializer';
import { indexName as mysqlIndexName } from 'src/serializer/mysqlSerializer';
import { render } from 'hanji';
import { ValidationError } from './errors';

export function printValidationErrors(errors: ValidationError[], exitOnError: boolean) {
  for (const { message, hint } of errors) {
    console.log(`${chalk.bgRed.bold(' Error ')} ${chalk.red(`${message}.`)}\n${chalk.underline.dim('Hint')}${chalk.dim(': ')}${chalk.dim(`${hint}.`)}\n`);
  }

  if (errors.length === 0) {
    render(`[${chalk.green('✓')}] Schema is valid`);
  } else {
    render(`[${chalk.red('x')}] Found ${errors.length} error${errors.length > 1 ? 's' : ''} in your schema`);
  }

  if (exitOnError && errors.length > 0) {
    process.exit(1);
  }
}

export function validatePgSchema(
  casing: CasingType | undefined,
  schemas: PgSchema[],
  tables: PgTable[],
  views: PgView[],
  materializedViews: PgMaterializedView[],
  enums: PgEnum<any>[],
  sequences: PgSequence[],
) {
  const dialect = new PgDialect({ casing });
  const tableConfigs = tables.map((table) => getPgTableConfig(table));
  const viewConfigs = views.map((view) => getPgViewConfig(view));
  const materializedViewConfigs = materializedViews.map((view) => getPgMaterializedViewConfig(view));

  const group = [
    new PgSchema('public'),
    ...schemas
  ].map((schema) => {
    const schemaTables = tableConfigs
      .filter((table) => (table.schema ?? 'public') === schema.schemaName)
      .map((table) => ({
        ...table,
        columns: table.columns.map((column) => ({
          ...column,
          name: getColumnCasing(column, casing)
        }))
      }));

    const schemaEnums = enums.filter((enum_) => (enum_.schema ?? 'public') === schema.schemaName);
    
    const schemaSequences = [
      // Sequences defined with `pgSequence`
      ...sequences.filter((sequence): sequence is PgSequence & { seqName: string } => (sequence.schema ?? 'public') === schema.schemaName && !!sequence.seqName),
      // Sequences defined with `column.generatedAlwaysAsIdentity`
      ...schemaTables
        .map(
          (table) => table.columns
            .filter((column): column is PgColumn & { generatedIdentity: GeneratedIdentityConfig } => !!column.generatedIdentity)
            .map((column) => ({
              seqName: getIdentitySequenceName(column.generatedIdentity.sequenceName, table.name, column.name),
              seqOptions: column.generatedIdentity.sequenceOptions
            }))
        ).flat(1)
    ] satisfies SequenceCommon[];
    
    const schemaViews = viewConfigs.filter((view) => (view.schema ?? 'public') === schema.schemaName);
    
    const schemaMaterializedViews = materializedViewConfigs.filter((materializedView) => (materializedView.schema ?? 'public') === schema.schemaName);

    const schemaIndexes = schemaTables.map(
      (table) => table.indexes.map(
        (index) => {
          const indexColumns = index.config.columns
            .filter((column): column is PgIndexColumn => !is(column, SQL));

          const indexColumnNames = indexColumns
            .map((column) => column.name)
            .filter((c) => c !== undefined);

          return {
            name: index.config.name
              ? index.config.name
              : indexColumns.length === index.config.columns.length
                ? pgIndexName(table.name, indexColumnNames)
                : '',
            columns: index.config.columns.map((column) => {
              if (is(column, SQL)) {
                return column;
              }
              const c = column as PgIndexColumn;
              return {
                type: c.type,
                op: c.indexConfig.opClass,
                name: getColumnCasing(c, casing),
              }
            })
          };
        }
      )
    ).flat(1) satisfies TableCommon['indexes'];

    const schemaForeignKeys = schemaTables.map(
      (table) => table.foreignKeys.map(
        (fk) => {
          const ref = fk.reference();
          return {
            name: getForeignKeyName(fk, casing),
            reference: {
              columns: ref.columns.map(
                (column) => {
                  const tableConfig = getPgTableConfig(column.table);
                  return {
                    name: getColumnCasing(column, casing),
                    sqlType: column.getSQLType(),
                    table: {
                      name: tableConfig.name,
                      schema: tableConfig.schema
                    }
                  };
                }
              ),
              foreignColumns: ref.foreignColumns.map(
                (column) => {
                  const tableConfig = getPgTableConfig(column.table);
                  return {
                    name: getColumnCasing(column, casing),
                    sqlType: column.getSQLType(),
                    table: {
                      name: tableConfig.name,
                      schema: tableConfig.schema
                    }
                  };
                }
              ),
            }
          };
        }
      )
    ).flat(1) satisfies TableCommon['foreignKeys'];

    const schemaChecks = schemaTables.map(
      (table) => table.checks.map(
        (check) => ({
          name: check.name
        })
      )
    ).flat(1) satisfies TableCommon['checks'];

    const schemaPrimaryKeys = schemaTables.map(
      (table) => table.primaryKeys.map(
        (pk) => ({
          name: getPrimaryKeyName(pk, casing),
          columns: pk.columns.map(
            (column) => {
              const tableConfig = getPgTableConfig(column.table);
              return {
                name: getColumnCasing(column, casing),
                table: {
                  name: tableConfig.name,
                  schema: tableConfig.schema
                }
              }
            }
          )
        })
      )
    ).flat(1) satisfies TableCommon['primaryKeys'];

    const schemaUniqueConstraints = schemaTables.map(
      (table) => table.uniqueConstraints.map(
        (unique) => {
          const columnNames = unique.columns.map((column) => getColumnCasing(column, casing));

          return {
            name: unique.name ?? pgUniqueKeyName(tables.find((t) => getTableName(t) === table.name && getPgTableConfig(t).schema === table.schema)!, columnNames)
          };
        }
      )
    ).flat(1) satisfies TableCommon['uniqueConstraints'];

    return {
      name: schema.schemaName,
      tables: schemaTables,
      enums: schemaEnums,
      sequences: schemaSequences,
      views: schemaViews,
      materializedViews: schemaMaterializedViews,
      indexes: schemaIndexes,
      foreignKeys: schemaForeignKeys,
      checks: schemaChecks,
      primaryKeys: schemaPrimaryKeys,
      uniqueConstraints: schemaUniqueConstraints
    };
  });

  const vDb = new ValidateDatabase();
  vDb.schemaNameCollisions(schemas);

  for (const schema of group) {
    const v = vDb.validateSchema(schema.name ?? 'public');

    v
      .constraintNameCollisions(
        schema.indexes,
        schema.foreignKeys,
        schema.checks,
        schema.primaryKeys,
        schema.uniqueConstraints
      )
      .entityNameCollisions(
        schema.tables,
        schema.views,
        schema.materializedViews,
        schema.enums,
        schema.sequences
      );

    for (const enum_ of schema.enums) {
      v.validateEnum(enum_.enumName).valueCollisions(enum_.enumValues);
    }

    for (const sequence of schema.sequences) {
      v.validateSequence(sequence.seqName).incorrectvalues(sequence);
    }

    for (const table of schema.tables) {
      v.validateTable(table.name).columnNameCollisions(table.columns, casing);
    }

    for (const foreignKey of schema.foreignKeys) {
      v
        .validateForeignKey(foreignKey.name)
        .columnsMixingTables(foreignKey)
        .mismatchingColumnCount(foreignKey)
        .mismatchingDataTypes(foreignKey, 'pg');
    }

    for (const primaryKey of schema.primaryKeys) {
      v
        .validatePrimaryKey(primaryKey.name)
        .columnsMixingTables(primaryKey);
    }

    for (const index of schema.indexes) {
      v
        .validateIndex(index.name)
        .requiresName(index.columns, dialect)
        .vectorColumnRequiresOp(index.columns);
    }
  }

  return {
    messages: vDb.errors,
    codes: vDb.errorCodes
  };
}

export function validateMySqlSchema(
  casing: CasingType | undefined,
  tables: MySqlTable[],
  views: MySqlView[],
) {
  const tableConfigs = tables.map((table) => getMySqlTableConfig(table));
  const viewConfigs = views.map((view) => getMySqlViewConfig(view));

  const group = (() => {
    const dbTables = tableConfigs
      .map((table) => ({
        ...table,
        columns: table.columns.map((column) => ({
          ...column,
          name: getColumnCasing(column, casing)
        }))
      }));
  
    const dbViews = viewConfigs;
  
    const dbIndexes = dbTables.map(
      (table) => table.indexes.map(
        (index) => {
          const indexColumns = index.config.columns
            .filter((column): column is MySqlColumn => !is(column, SQL));
  
          const indexColumnNames = indexColumns
            .map((column) => column.name)
            .filter((c) => c !== undefined);
  
          return {
            name: index.config.name
              ? index.config.name
              : indexColumns.length === index.config.columns.length
                ? mysqlIndexName(table.name, indexColumnNames)
                : '',
            columns: index.config.columns.map((column) => {
              if (is(column, SQL)) {
                return column;
              }
  
              return {
                type: '',
                name: getColumnCasing(column as MySqlColumn, casing),
              }
            })
          };
        }
      )
    ).flat(1) satisfies TableCommon['indexes'];
  
    const dbForeignKeys = dbTables.map(
      (table) => table.foreignKeys.map(
        (fk) => {
          const ref = fk.reference();
          return {
            name: getForeignKeyName(fk, casing),
            reference: {
              columns: ref.columns.map(
                (column) => {
                  const tableConfig = getMySqlTableConfig(column.table);
                  return {
                    name: getColumnCasing(column, casing),
                    sqlType: column.getSQLType(),
                    table: {
                      name: tableConfig.name,
                      schema: tableConfig.schema
                    }
                  };
                }
              ),
              foreignColumns: ref.foreignColumns.map(
                (column) => {
                  const tableConfig = getMySqlTableConfig(column.table);
                  return {
                    name: getColumnCasing(column, casing),
                    sqlType: column.getSQLType(),
                    table: {
                      name: tableConfig.name,
                      schema: tableConfig.schema
                    }
                  };
                }
              ),
            }
          };
        }
      )
    ).flat(1) satisfies TableCommon['foreignKeys'];
  
    const dbChecks = dbTables.map(
      (table) => table.checks.map(
        (check) => ({
          name: check.name
        })
      )
    ).flat(1) satisfies TableCommon['checks'];
  
    const dbPrimaryKeys = dbTables.map(
      (table) => table.primaryKeys.map(
        (pk) => ({
          name: getPrimaryKeyName(pk, casing),
          columns: pk.columns.map(
            (column) => {
              const tableConfig = getMySqlTableConfig(column.table);
              return {
                name: getColumnCasing(column, casing),
                table: {
                  name: tableConfig.name,
                  schema: tableConfig.schema
                }
              }
            }
          )
        })
      )
    ).flat(1) satisfies TableCommon['primaryKeys'];
  
    const dbUniqueConstraints = dbTables.map(
      (table) => table.uniqueConstraints.map(
        (unique) => {
          const columnNames = unique.columns.map((column) => getColumnCasing(column, casing));
  
          return {
            name: unique.name ?? mysqlUniqueKeyName(tables.find((t) => getTableName(t) === table.name && getMySqlTableConfig(t).schema === table.schema)!, columnNames)
          };
        }
      )
    ).flat(1) satisfies TableCommon['uniqueConstraints'];

    return {
      tables: dbTables,
      views: dbViews,
      indexes: dbIndexes,
      foreignKeys: dbForeignKeys,
      checks: dbChecks,
      primaryKeys: dbPrimaryKeys,
      uniqueConstraints: dbUniqueConstraints
    };
  })();

  const vDb = new ValidateDatabase();
  const v = vDb.validateSchema(undefined);

  v
    .constraintNameCollisions(
      group.indexes,
      group.foreignKeys,
      group.checks,
      group.primaryKeys,
      group.uniqueConstraints
    )
    .entityNameCollisions(
      group.tables,
      group.views,
      [],
      [],
      []
    );

  for (const table of group.tables) {
    v.validateTable(table.name).columnNameCollisions(table.columns, casing);
  }

  for (const foreignKey of group.foreignKeys) {
    v
      .validateForeignKey(foreignKey.name)
      .columnsMixingTables(foreignKey)
      .mismatchingColumnCount(foreignKey)
      .mismatchingDataTypes(foreignKey, 'mysql');
  }

  for (const primaryKey of group.primaryKeys) {
    v
      .validatePrimaryKey(primaryKey.name)
      .columnsMixingTables(primaryKey);
  }

  return {
    messages: vDb.errors,
    codes: vDb.errorCodes
  };
}

export function validateSQLiteSchema(
  casing: CasingType | undefined,
  tables: SQLiteTable[],
  views: SQLiteView[],
) {
  const tableConfigs = tables.map((table) => getSQLiteTableConfig(table));
  const viewConfigs = views.map((view) => getSQLiteViewConfig(view));

  const group = (() => {
    const dbTables = tableConfigs
      .map((table) => ({
        ...table,
        columns: table.columns.map((column) => ({
          ...column,
          name: getColumnCasing(column, casing)
        }))
      }));
  
    const dbViews = viewConfigs;
  
    const dbIndexes = dbTables.map(
      (table) => table.indexes.map(
        (index) => {
          const indexColumns = index.config.columns
            .filter((column): column is SQLiteColumn => !is(column, SQL));
  
          const indexColumnNames = indexColumns
            .map((column) => column.name)
            .filter((c) => c !== undefined);
  
          return {
            name: index.config.name
              ? index.config.name
              : indexColumns.length === index.config.columns.length
                ? mysqlIndexName(table.name, indexColumnNames)
                : '',
            columns: index.config.columns.map((column) => {
              if (is(column, SQL)) {
                return column;
              }
  
              return {
                type: '',
                name: getColumnCasing(column as SQLiteColumn, casing),
              }
            })
          };
        }
      )
    ).flat(1) satisfies TableCommon['indexes'];
  
    const dbForeignKeys = dbTables.map(
      (table) => table.foreignKeys.map(
        (fk) => {
          const ref = fk.reference();
          return {
            name: getForeignKeyName(fk, casing),
            reference: {
              columns: ref.columns.map(
                (column) => {
                  const tableConfig = getSQLiteTableConfig(column.table);
                  return {
                    name: getColumnCasing(column, casing),
                    sqlType: column.getSQLType(),
                    table: {
                      name: tableConfig.name
                    }
                  };
                }
              ),
              foreignColumns: ref.foreignColumns.map(
                (column) => {
                  const tableConfig = getSQLiteTableConfig(column.table);
                  return {
                    name: getColumnCasing(column, casing),
                    sqlType: column.getSQLType(),
                    table: {
                      name: tableConfig.name
                    }
                  };
                }
              ),
            }
          };
        }
      )
    ).flat(1) satisfies TableCommon['foreignKeys'];
  
    const dbChecks = dbTables.map(
      (table) => table.checks.map(
        (check) => ({
          name: check.name
        })
      )
    ).flat(1) satisfies TableCommon['checks'];
  
    const dbPrimaryKeys = dbTables.map(
      (table) => table.primaryKeys.map(
        (pk) => ({
          name: getPrimaryKeyName(pk, casing),
          columns: pk.columns.map(
            (column) => {
              const tableConfig = getSQLiteTableConfig(column.table);
              return {
                name: getColumnCasing(column, casing),
                table: {
                  name: tableConfig.name
                }
              }
            }
          )
        })
      )
    ).flat(1) satisfies TableCommon['primaryKeys'];
  
    const dbUniqueConstraints = dbTables.map(
      (table) => table.uniqueConstraints.map(
        (unique) => {
          const columnNames = unique.columns.map((column) => getColumnCasing(column, casing));
  
          return {
            name: unique.name ?? sqliteUniqueKeyName(tables.find((t) => getTableName(t) === table.name)!, columnNames)
          };
        }
      )
    ).flat(1) satisfies TableCommon['uniqueConstraints'];

    return {
      tables: dbTables,
      views: dbViews,
      indexes: dbIndexes,
      foreignKeys: dbForeignKeys,
      checks: dbChecks,
      primaryKeys: dbPrimaryKeys,
      uniqueConstraints: dbUniqueConstraints
    };
  })();

  const vDb = new ValidateDatabase();
  const v = vDb.validateSchema(undefined);

  v
    .constraintNameCollisions(
      group.indexes,
      group.foreignKeys,
      group.checks,
      group.primaryKeys,
      group.uniqueConstraints
    )
    .entityNameCollisions(
      group.tables,
      group.views,
      [],
      [],
      []
    );

  for (const table of group.tables) {
    v.validateTable(table.name).columnNameCollisions(table.columns, casing);
  }

  for (const foreignKey of group.foreignKeys) {
    v
      .validateForeignKey(foreignKey.name)
      .columnsMixingTables(foreignKey)
      .mismatchingColumnCount(foreignKey)
      .mismatchingDataTypes(foreignKey, 'sqlite');
  }

  for (const primaryKey of group.primaryKeys) {
    v
      .validatePrimaryKey(primaryKey.name)
      .columnsMixingTables(primaryKey);
  }

  return {
    messages: vDb.errors,
    codes: vDb.errorCodes
  };
}