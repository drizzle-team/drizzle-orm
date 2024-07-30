import { is } from "drizzle-orm";
import { MySqlSchema, MySqlTable } from "drizzle-orm/mysql-core";
import {
  PgEnum,
  PgSchema,
  PgSequence,
  PgTable,
  isPgEnum,
  isPgSequence,
} from "drizzle-orm/pg-core";
import { SQLiteTable } from "drizzle-orm/sqlite-core";
import {
  Named,
  columnsResolver,
  enumsResolver,
  schemasResolver,
  sequencesResolver,
  tablesResolver,
} from "src/cli/commands/migrate";
import { mysqlSchema, squashMysqlScheme } from "src/serializer/mysqlSchema";
import { generateMySqlSnapshot } from "src/serializer/mysqlSerializer";
import { pgSchema, squashPgScheme } from "src/serializer/pgSchema";
import { fromDatabase, generatePgSnapshot } from "src/serializer/pgSerializer";
import { fromDatabase as fromMySqlDatabase } from "src/serializer/mysqlSerializer";
import { fromDatabase as fromSqliteDatabase } from "src/serializer/sqliteSerializer";
import { sqliteSchema, squashSqliteScheme } from "src/serializer/sqliteSchema";
import { generateSqliteSnapshot } from "src/serializer/sqliteSerializer";
import {
  Column,
  ColumnsResolverInput,
  ColumnsResolverOutput,
  Enum,
  ResolverInput,
  ResolverOutput,
  ResolverOutputWithMoved,
  Sequence,
  Table,
  applyMysqlSnapshotsDiff,
  applyPgSnapshotsDiff,
  applySqliteSnapshotsDiff,
} from "src/snapshotsDiffer";
import { PGlite } from "@electric-sql/pglite";
import { Connection } from "mysql2/promise";
import { Database } from "better-sqlite3";
import { schemaToTypeScript } from "src/introspect-pg";
import { schemaToTypeScript as schemaToTypeScriptMySQL } from "src/introspect-mysql";
import { schemaToTypeScript as schemaToTypeScriptSQLite } from "src/introspect-sqlite";
import * as fs from "fs";
import { prepareFromPgImports } from "src/serializer/pgImports";
import { prepareFromMySqlImports } from "src/serializer/mysqlImports";
import { prepareFromSqliteImports } from "src/serializer/sqliteImports";
import { logSuggestionsAndReturn } from "src/cli/commands/sqlitePushUtils";

export type PostgresSchema = Record<
  string,
  PgTable<any> | PgEnum<any> | PgSchema | PgSequence
>;
export type MysqlSchema = Record<string, MySqlTable<any> | MySqlSchema>;
export type SqliteSchema = Record<string, SQLiteTable<any>>;

export const testSchemasResolver =
  (renames: Set<string>) =>
  async (input: ResolverInput<Named>): Promise<ResolverOutput<Named>> => {
    try {
      if (
        input.created.length === 0 ||
        input.deleted.length === 0 ||
        renames.size === 0
      ) {
        return {
          created: input.created,
          renamed: [],
          deleted: input.deleted,
        };
      }

      let createdSchemas = [...input.created];
      let deletedSchemas = [...input.deleted];

      const result: {
        created: Named[];
        renamed: { from: Named; to: Named }[];
        deleted: Named[];
      } = { created: [], renamed: [], deleted: [] };

      for (let rename of renames) {
        const [from, to] = rename.split("->");

        const idxFrom = deletedSchemas.findIndex((it) => {
          return it.name === from;
        });

        if (idxFrom >= 0) {
          const idxTo = createdSchemas.findIndex((it) => {
            return it.name === to;
          });

          result.renamed.push({
            from: deletedSchemas[idxFrom],
            to: createdSchemas[idxTo],
          });

          delete createdSchemas[idxTo];
          delete deletedSchemas[idxFrom];

          createdSchemas = createdSchemas.filter(Boolean);
          deletedSchemas = deletedSchemas.filter(Boolean);
        }
      }

      result.created = createdSchemas;
      result.deleted = deletedSchemas;

      return result;
    } catch (e) {
      console.error(e);
      throw e;
    }
  };

export const testSequencesResolver =
  (renames: Set<string>) =>
  async (
    input: ResolverInput<Sequence>
  ): Promise<ResolverOutputWithMoved<Sequence>> => {
    try {
      if (
        input.created.length === 0 ||
        input.deleted.length === 0 ||
        renames.size === 0
      ) {
        return {
          created: input.created,
          moved: [],
          renamed: [],
          deleted: input.deleted,
        };
      }

      let createdSequences = [...input.created];
      let deletedSequences = [...input.deleted];

      const result: {
        created: Sequence[];
        moved: { name: string; schemaFrom: string; schemaTo: string }[];
        renamed: { from: Sequence; to: Sequence }[];
        deleted: Sequence[];
      } = { created: [], renamed: [], deleted: [], moved: [] };

      for (let rename of renames) {
        const [from, to] = rename.split("->");

        const idxFrom = deletedSequences.findIndex((it) => {
          return `${it.schema || "public"}.${it.name}` === from;
        });

        if (idxFrom >= 0) {
          const idxTo = createdSequences.findIndex((it) => {
            return `${it.schema || "public"}.${it.name}` === to;
          });

          const tableFrom = deletedSequences[idxFrom];
          const tableTo = createdSequences[idxFrom];

          if (tableFrom.schema !== tableTo.schema) {
            result.moved.push({
              name: tableFrom.name,
              schemaFrom: tableFrom.schema,
              schemaTo: tableTo.schema,
            });
          }

          if (tableFrom.name !== tableTo.name) {
            result.renamed.push({
              from: deletedSequences[idxFrom],
              to: createdSequences[idxTo],
            });
          }

          delete createdSequences[idxTo];
          delete deletedSequences[idxFrom];

          createdSequences = createdSequences.filter(Boolean);
          deletedSequences = deletedSequences.filter(Boolean);
        }
      }

      result.created = createdSequences;
      result.deleted = deletedSequences;

      return result;
    } catch (e) {
      console.error(e);
      throw e;
    }
  };

export const testEnumsResolver =
  (renames: Set<string>) =>
  async (
    input: ResolverInput<Enum>
  ): Promise<ResolverOutputWithMoved<Enum>> => {
    try {
      if (
        input.created.length === 0 ||
        input.deleted.length === 0 ||
        renames.size === 0
      ) {
        return {
          created: input.created,
          moved: [],
          renamed: [],
          deleted: input.deleted,
        };
      }

      let createdEnums = [...input.created];
      let deletedEnums = [...input.deleted];

      const result: {
        created: Enum[];
        moved: { name: string; schemaFrom: string; schemaTo: string }[];
        renamed: { from: Enum; to: Enum }[];
        deleted: Enum[];
      } = { created: [], renamed: [], deleted: [], moved: [] };

      for (let rename of renames) {
        const [from, to] = rename.split("->");

        const idxFrom = deletedEnums.findIndex((it) => {
          return `${it.schema || "public"}.${it.name}` === from;
        });

        if (idxFrom >= 0) {
          const idxTo = createdEnums.findIndex((it) => {
            return `${it.schema || "public"}.${it.name}` === to;
          });

          const tableFrom = deletedEnums[idxFrom];
          const tableTo = createdEnums[idxFrom];

          if (tableFrom.schema !== tableTo.schema) {
            result.moved.push({
              name: tableFrom.name,
              schemaFrom: tableFrom.schema,
              schemaTo: tableTo.schema,
            });
          }

          if (tableFrom.name !== tableTo.name) {
            result.renamed.push({
              from: deletedEnums[idxFrom],
              to: createdEnums[idxTo],
            });
          }

          delete createdEnums[idxTo];
          delete deletedEnums[idxFrom];

          createdEnums = createdEnums.filter(Boolean);
          deletedEnums = deletedEnums.filter(Boolean);
        }
      }

      result.created = createdEnums;
      result.deleted = deletedEnums;

      return result;
    } catch (e) {
      console.error(e);
      throw e;
    }
  };

export const testTablesResolver =
  (renames: Set<string>) =>
  async (
    input: ResolverInput<Table>
  ): Promise<ResolverOutputWithMoved<Table>> => {
    try {
      if (
        input.created.length === 0 ||
        input.deleted.length === 0 ||
        renames.size === 0
      ) {
        return {
          created: input.created,
          moved: [],
          renamed: [],
          deleted: input.deleted,
        };
      }

      let createdTables = [...input.created];
      let deletedTables = [...input.deleted];

      const result: {
        created: Table[];
        moved: { name: string; schemaFrom: string; schemaTo: string }[];
        renamed: { from: Table; to: Table }[];
        deleted: Table[];
      } = { created: [], renamed: [], deleted: [], moved: [] };

      for (let rename of renames) {
        const [from, to] = rename.split("->");

        const idxFrom = deletedTables.findIndex((it) => {
          return `${it.schema || "public"}.${it.name}` === from;
        });

        if (idxFrom >= 0) {
          const idxTo = createdTables.findIndex((it) => {
            return `${it.schema || "public"}.${it.name}` === to;
          });

          const tableFrom = deletedTables[idxFrom];
          const tableTo = createdTables[idxFrom];

          if (tableFrom.schema !== tableTo.schema) {
            result.moved.push({
              name: tableFrom.name,
              schemaFrom: tableFrom.schema,
              schemaTo: tableTo.schema,
            });
          }

          if (tableFrom.name !== tableTo.name) {
            result.renamed.push({
              from: deletedTables[idxFrom],
              to: createdTables[idxTo],
            });
          }

          delete createdTables[idxTo];
          delete deletedTables[idxFrom];

          createdTables = createdTables.filter(Boolean);
          deletedTables = deletedTables.filter(Boolean);
        }
      }

      result.created = createdTables;
      result.deleted = deletedTables;

      return result;
    } catch (e) {
      console.error(e);
      throw e;
    }
  };

export const testColumnsResolver =
  (renames: Set<string>) =>
  async (
    input: ColumnsResolverInput<Column>
  ): Promise<ColumnsResolverOutput<Column>> => {
    try {
      if (
        input.created.length === 0 ||
        input.deleted.length === 0 ||
        renames.size === 0
      ) {
        return {
          tableName: input.tableName,
          schema: input.schema,
          created: input.created,
          renamed: [],
          deleted: input.deleted,
        };
      }

      let createdColumns = [...input.created];
      let deletedColumns = [...input.deleted];

      const renamed: { from: Column; to: Column }[] = [];

      const schema = input.schema || "public";

      for (let rename of renames) {
        const [from, to] = rename.split("->");

        const idxFrom = deletedColumns.findIndex((it) => {
          return `${schema}.${input.tableName}.${it.name}` === from;
        });

        if (idxFrom >= 0) {
          const idxTo = createdColumns.findIndex((it) => {
            return `${schema}.${input.tableName}.${it.name}` === to;
          });

          renamed.push({
            from: deletedColumns[idxFrom],
            to: createdColumns[idxTo],
          });

          delete createdColumns[idxTo];
          delete deletedColumns[idxFrom];

          createdColumns = createdColumns.filter(Boolean);
          deletedColumns = deletedColumns.filter(Boolean);
        }
      }

      return {
        tableName: input.tableName,
        schema: input.schema,
        created: createdColumns,
        deleted: deletedColumns,
        renamed,
      };
    } catch (e) {
      console.error(e);
      throw e;
    }
  };

export const diffTestSchemasPush = async (
  client: PGlite,
  left: PostgresSchema,
  right: PostgresSchema,
  renamesArr: string[],
  cli: boolean = false,
  schemas: string[] = ["public"]
) => {
  const { sqlStatements } = await applyPgDiffs(left);
  for (const st of sqlStatements) {
    await client.query(st);
  }

  // do introspect into PgSchemaInternal
  const introspectedSchema = await fromDatabase(
    {
      query: async (query: string, values?: any[] | undefined) => {
        const res = await client.query(query, values);
        return res.rows as any[];
      },
    },
    undefined,
    schemas
  );

  const leftTables = Object.values(right).filter((it) =>
    is(it, PgTable)
  ) as PgTable[];

  const leftSchemas = Object.values(right).filter((it) =>
    is(it, PgSchema)
  ) as PgSchema[];

  const leftEnums = Object.values(right).filter((it) =>
    isPgEnum(it)
  ) as PgEnum<any>[];

  const leftSequences = Object.values(right).filter((it) =>
    isPgSequence(it)
  ) as PgSequence[];

  const serialized2 = generatePgSnapshot(
    leftTables,
    leftEnums,
    leftSchemas,
    leftSequences
  );

  const { version: v1, dialect: d1, ...rest1 } = introspectedSchema;
  const { version: v2, dialect: d2, ...rest2 } = serialized2;

  const sch1 = {
    version: "7",
    dialect: "postgresql",
    id: "0",
    prevId: "0",
    ...rest1,
  } as const;

  const sch2 = {
    version: "7",
    dialect: "postgresql",
    id: "0",
    prevId: "0",
    ...rest2,
  } as const;

  const sn1 = squashPgScheme(sch1, "push");
  const sn2 = squashPgScheme(sch2, "push");

  const validatedPrev = pgSchema.parse(sch1);
  const validatedCur = pgSchema.parse(sch2);

  const renames = new Set(renamesArr);

  if (!cli) {
    const { sqlStatements, statements } = await applyPgSnapshotsDiff(
      sn1,
      sn2,
      testSchemasResolver(renames),
      testEnumsResolver(renames),
      testSequencesResolver(renames),
      testTablesResolver(renames),
      testColumnsResolver(renames),
      validatedPrev,
      validatedCur,
      "push"
    );
    return { sqlStatements, statements };
  } else {
    const { sqlStatements, statements } = await applyPgSnapshotsDiff(
      sn1,
      sn2,
      schemasResolver,
      enumsResolver,
      sequencesResolver,
      tablesResolver,
      columnsResolver,
      validatedPrev,
      validatedCur,
      "push"
    );
    return { sqlStatements, statements };
  }
};

export const applyPgDiffs = async (sn: PostgresSchema) => {
  const dryRun = {
    version: "7",
    dialect: "postgresql",
    id: "0",
    prevId: "0",
    tables: {},
    enums: {},
    schemas: {},
    sequences: {},
    _meta: {
      schemas: {},
      tables: {},
      columns: {},
    },
  } as const;

  const tables = Object.values(sn).filter((it) => is(it, PgTable)) as PgTable[];

  const schemas = Object.values(sn).filter((it) =>
    is(it, PgSchema)
  ) as PgSchema[];

  const enums = Object.values(sn).filter((it) => isPgEnum(it)) as PgEnum<any>[];

  const sequences = Object.values(sn).filter((it) =>
    isPgSequence(it)
  ) as PgSequence[];

  const serialized1 = generatePgSnapshot(tables, enums, schemas, sequences);

  const { version: v1, dialect: d1, ...rest1 } = serialized1;

  const sch1 = {
    version: "7",
    dialect: "postgresql",
    id: "0",
    prevId: "0",
    ...rest1,
  } as const;

  const sn1 = squashPgScheme(sch1);

  const validatedPrev = pgSchema.parse(dryRun);
  const validatedCur = pgSchema.parse(sch1);

  const { sqlStatements, statements } = await applyPgSnapshotsDiff(
    dryRun,
    sn1,
    testSchemasResolver(new Set()),
    testEnumsResolver(new Set()),
    testSequencesResolver(new Set()),
    testTablesResolver(new Set()),
    testColumnsResolver(new Set()),
    validatedPrev,
    validatedCur
  );
  return { sqlStatements, statements };
};

export const diffTestSchemas = async (
  left: PostgresSchema,
  right: PostgresSchema,
  renamesArr: string[],
  cli: boolean = false
) => {
  const leftTables = Object.values(left).filter((it) =>
    is(it, PgTable)
  ) as PgTable[];

  const rightTables = Object.values(right).filter((it) =>
    is(it, PgTable)
  ) as PgTable[];

  const leftSchemas = Object.values(left).filter((it) =>
    is(it, PgSchema)
  ) as PgSchema[];

  const rightSchemas = Object.values(right).filter((it) =>
    is(it, PgSchema)
  ) as PgSchema[];

  const leftEnums = Object.values(left).filter((it) =>
    isPgEnum(it)
  ) as PgEnum<any>[];

  const rightEnums = Object.values(right).filter((it) =>
    isPgEnum(it)
  ) as PgEnum<any>[];

  const leftSequences = Object.values(left).filter((it) =>
    isPgSequence(it)
  ) as PgSequence[];

  const rightSequences = Object.values(right).filter((it) =>
    isPgSequence(it)
  ) as PgSequence[];

  const serialized1 = generatePgSnapshot(
    leftTables,
    leftEnums,
    leftSchemas,
    leftSequences
  );
  const serialized2 = generatePgSnapshot(
    rightTables,
    rightEnums,
    rightSchemas,
    rightSequences
  );

  const { version: v1, dialect: d1, ...rest1 } = serialized1;
  const { version: v2, dialect: d2, ...rest2 } = serialized2;

  const sch1 = {
    version: "7",
    dialect: "postgresql",
    id: "0",
    prevId: "0",
    ...rest1,
  } as const;

  const sch2 = {
    version: "7",
    dialect: "postgresql",
    id: "0",
    prevId: "0",
    ...rest2,
  } as const;

  const sn1 = squashPgScheme(sch1);
  const sn2 = squashPgScheme(sch2);

  const validatedPrev = pgSchema.parse(sch1);
  const validatedCur = pgSchema.parse(sch2);

  const renames = new Set(renamesArr);

  if (!cli) {
    const { sqlStatements, statements } = await applyPgSnapshotsDiff(
      sn1,
      sn2,
      testSchemasResolver(renames),
      testEnumsResolver(renames),
      testSequencesResolver(renames),
      testTablesResolver(renames),
      testColumnsResolver(renames),
      validatedPrev,
      validatedCur
    );
    return { sqlStatements, statements };
  } else {
    const { sqlStatements, statements } = await applyPgSnapshotsDiff(
      sn1,
      sn2,
      schemasResolver,
      enumsResolver,
      sequencesResolver,
      tablesResolver,
      columnsResolver,
      validatedPrev,
      validatedCur
    );
    return { sqlStatements, statements };
  }
};

export const diffTestSchemasPushMysql = async (
  client: Connection,
  left: MysqlSchema,
  right: MysqlSchema,
  renamesArr: string[],
  schema: string,
  cli: boolean = false
) => {
  const { sqlStatements } = await applyMySqlDiffs(left);
  for (const st of sqlStatements) {
    await client.query(st);
  }
  // do introspect into PgSchemaInternal
  const introspectedSchema = await fromMySqlDatabase(
    {
      query: async (sql: string, params?: any[]) => {
        const res = await client.execute(sql, params);
        return res[0] as any;
      },
    },
    schema
  );

  const leftTables = Object.values(right).filter((it) =>
    is(it, MySqlTable)
  ) as MySqlTable[];

  const serialized2 = generateMySqlSnapshot(leftTables);

  const { version: v1, dialect: d1, ...rest1 } = introspectedSchema;
  const { version: v2, dialect: d2, ...rest2 } = serialized2;

  const sch1 = {
    version: "5",
    dialect: "mysql",
    id: "0",
    prevId: "0",
    ...rest1,
  } as const;

  const sch2 = {
    version: "5",
    dialect: "mysql",
    id: "0",
    prevId: "0",
    ...rest2,
  } as const;

  const sn1 = squashMysqlScheme(sch1);
  const sn2 = squashMysqlScheme(sch2);

  const validatedPrev = mysqlSchema.parse(sch1);
  const validatedCur = mysqlSchema.parse(sch2);

  const renames = new Set(renamesArr);

  if (!cli) {
    const { sqlStatements, statements } = await applyMysqlSnapshotsDiff(
      sn1,
      sn2,
      testTablesResolver(renames),
      testColumnsResolver(renames),
      validatedPrev,
      validatedCur,
      "push"
    );
    return { sqlStatements, statements };
  } else {
    const { sqlStatements, statements } = await applyMysqlSnapshotsDiff(
      sn1,
      sn2,
      tablesResolver,
      columnsResolver,
      validatedPrev,
      validatedCur,
      "push"
    );
    return { sqlStatements, statements };
  }
};

export const applyMySqlDiffs = async (sn: MysqlSchema) => {
  const dryRun = {
    version: "5",
    dialect: "mysql",
    id: "0",
    prevId: "0",
    tables: {},
    enums: {},
    schemas: {},
    _meta: {
      schemas: {},
      tables: {},
      columns: {},
    },
  } as const;

  const tables = Object.values(sn).filter((it) =>
    is(it, MySqlTable)
  ) as MySqlTable[];

  const serialized1 = generateMySqlSnapshot(tables);

  const { version: v1, dialect: d1, ...rest1 } = serialized1;

  const sch1 = {
    version: "5",
    dialect: "mysql",
    id: "0",
    prevId: "0",
    ...rest1,
  } as const;

  const sn1 = squashMysqlScheme(sch1);

  const validatedPrev = mysqlSchema.parse(dryRun);
  const validatedCur = mysqlSchema.parse(sch1);

  const { sqlStatements, statements } = await applyMysqlSnapshotsDiff(
    dryRun,
    sn1,
    testTablesResolver(new Set()),
    testColumnsResolver(new Set()),
    validatedPrev,
    validatedCur
  );
  return { sqlStatements, statements };
};

export const diffTestSchemasMysql = async (
  left: MysqlSchema,
  right: MysqlSchema,
  renamesArr: string[],
  cli: boolean = false
) => {
  const leftTables = Object.values(left).filter((it) =>
    is(it, MySqlTable)
  ) as MySqlTable[];

  const rightTables = Object.values(right).filter((it) =>
    is(it, MySqlTable)
  ) as MySqlTable[];

  const serialized1 = generateMySqlSnapshot(leftTables);
  const serialized2 = generateMySqlSnapshot(rightTables);

  const { version: v1, dialect: d1, ...rest1 } = serialized1;
  const { version: v2, dialect: d2, ...rest2 } = serialized2;

  const sch1 = {
    version: "5",
    dialect: "mysql",
    id: "0",
    prevId: "0",
    ...rest1,
  } as const;

  const sch2 = {
    version: "5",
    dialect: "mysql",
    id: "0",
    prevId: "0",
    ...rest2,
  } as const;

  const sn1 = squashMysqlScheme(sch1);
  const sn2 = squashMysqlScheme(sch2);

  const validatedPrev = mysqlSchema.parse(sch1);
  const validatedCur = mysqlSchema.parse(sch2);

  const renames = new Set(renamesArr);

  if (!cli) {
    const { sqlStatements, statements } = await applyMysqlSnapshotsDiff(
      sn1,
      sn2,
      testTablesResolver(renames),
      testColumnsResolver(renames),
      validatedPrev,
      validatedCur
    );
    return { sqlStatements, statements };
  }

  const { sqlStatements, statements } = await applyMysqlSnapshotsDiff(
    sn1,
    sn2,
    tablesResolver,
    columnsResolver,
    validatedPrev,
    validatedCur
  );
  return { sqlStatements, statements };
};

export const diffTestSchemasPushSqlite = async (
  client: Database,
  left: SqliteSchema,
  right: SqliteSchema,
  renamesArr: string[],
  cli: boolean = false
) => {
  const { sqlStatements } = await applySqliteDiffs(left, "push");
  for (const st of sqlStatements) {
    client.exec(st);
  }
  // do introspect into PgSchemaInternal
  const introspectedSchema = await fromSqliteDatabase(
    {
      query: async <T>(sql: string, params: any[] = []) => {
        return client.prepare(sql).bind(params).all() as T[];
      },
      run: async (query: string) => {
        client.prepare(query).run();
      },
    },
    undefined
  );

  const leftTables = Object.values(right).filter((it) =>
    is(it, SQLiteTable)
  ) as SQLiteTable[];

  const serialized2 = generateSqliteSnapshot(leftTables);

  const { version: v1, dialect: d1, ...rest1 } = introspectedSchema;
  const { version: v2, dialect: d2, ...rest2 } = serialized2;

  const sch1 = {
    version: "6",
    dialect: "sqlite",
    id: "0",
    prevId: "0",
    ...rest1,
  } as const;

  const sch2 = {
    version: "6",
    dialect: "sqlite",
    id: "0",
    prevId: "0",
    ...rest2,
  } as const;

  const sn1 = squashSqliteScheme(sch1, "push");
  const sn2 = squashSqliteScheme(sch2, "push");

  const renames = new Set(renamesArr);

  if (!cli) {
    const { sqlStatements, statements, _meta } = await applySqliteSnapshotsDiff(
      sn1,
      sn2,
      testTablesResolver(renames),
      testColumnsResolver(renames),
      sch1,
      sch2,
      "push"
    );

    const { statementsToExecute } = await logSuggestionsAndReturn(
      {
        query: async <T>(sql: string, params: any[] = []) => {
          return client.prepare(sql).bind(params).all() as T[];
        },
        run: async (query: string) => {
          client.prepare(query).run();
        },
      },
      statements,
      sn1,
      sn2,
      _meta!
    );

    return { sqlStatements: statementsToExecute, statements };
  } else {
    const { sqlStatements, statements } = await applySqliteSnapshotsDiff(
      sn1,
      sn2,
      tablesResolver,
      columnsResolver,
      sch1,
      sch2,
      "push"
    );
    return { sqlStatements, statements };
  }
};

export const applySqliteDiffs = async (
  sn: SqliteSchema,
  action?: "push" | undefined
) => {
  const dryRun = {
    version: "6",
    dialect: "sqlite",
    id: "0",
    prevId: "0",
    tables: {},
    enums: {},
    schemas: {},
    _meta: {
      schemas: {},
      tables: {},
      columns: {},
    },
  } as const;

  const tables = Object.values(sn).filter((it) =>
    is(it, SQLiteTable)
  ) as SQLiteTable[];

  const serialized1 = generateSqliteSnapshot(tables);

  const { version: v1, dialect: d1, ...rest1 } = serialized1;

  const sch1 = {
    version: "6",
    dialect: "sqlite",
    id: "0",
    prevId: "0",
    ...rest1,
  } as const;

  const sn1 = squashSqliteScheme(sch1, action);

  const { sqlStatements, statements } = await applySqliteSnapshotsDiff(
    dryRun,
    sn1,
    testTablesResolver(new Set()),
    testColumnsResolver(new Set()),
    dryRun,
    sch1,
    action
  );

  return { sqlStatements, statements };
};

export const diffTestSchemasSqlite = async (
  left: SqliteSchema,
  right: SqliteSchema,
  renamesArr: string[],
  cli: boolean = false
) => {
  const leftTables = Object.values(left).filter((it) =>
    is(it, SQLiteTable)
  ) as SQLiteTable[];

  const rightTables = Object.values(right).filter((it) =>
    is(it, SQLiteTable)
  ) as SQLiteTable[];

  const serialized1 = generateSqliteSnapshot(leftTables);
  const serialized2 = generateSqliteSnapshot(rightTables);

  const { version: v1, dialect: d1, ...rest1 } = serialized1;
  const { version: v2, dialect: d2, ...rest2 } = serialized2;

  const sch1 = {
    version: "6",
    dialect: "sqlite",
    id: "0",
    prevId: "0",
    ...rest1,
  } as const;

  const sch2 = {
    version: "6",
    dialect: "sqlite",
    id: "0",
    prevId: "0",
    ...rest2,
  } as const;

  const sn1 = squashSqliteScheme(sch1);
  const sn2 = squashSqliteScheme(sch2);

  const renames = new Set(renamesArr);

  if (!cli) {
    const { sqlStatements, statements } = await applySqliteSnapshotsDiff(
      sn1,
      sn2,
      testTablesResolver(renames),
      testColumnsResolver(renames),
      sch1,
      sch2
    );
    return { sqlStatements, statements };
  }

  const { sqlStatements, statements } = await applySqliteSnapshotsDiff(
    sn1,
    sn2,
    tablesResolver,
    columnsResolver,
    sch1,
    sch2
  );
  return { sqlStatements, statements };
};

// --- Introspect to file helpers ---

export const introspectPgToFile = async (
  client: PGlite,
  initSchema: PostgresSchema,
  testName: string,
  schemas: string[] = ["public"]
) => {
  // put in db
  const { sqlStatements } = await applyPgDiffs(initSchema);
  for (const st of sqlStatements) {
    await client.query(st);
  }

  // introspect to schema
  const introspectedSchema = await fromDatabase(
    {
      query: async (query: string, values?: any[] | undefined) => {
        const res = await client.query(query, values);
        return res.rows as any[];
      },
    },
    undefined,
    schemas
  );

  const file = schemaToTypeScript(introspectedSchema, "camel");

  fs.writeFileSync(`tests/introspect/${testName}.ts`, file.file);

  const response = await prepareFromPgImports([
    `tests/introspect/${testName}.ts`,
  ]);

  const afterFileImports = generatePgSnapshot(
    response.tables,
    response.enums,
    response.schemas,
    response.sequences
  );

  const { version: v2, dialect: d2, ...rest2 } = afterFileImports;

  const sch2 = {
    version: "7",
    dialect: "postgresql",
    id: "0",
    prevId: "0",
    ...rest2,
  } as const;

  const sn2AfterIm = squashPgScheme(sch2);
  const validatedCurAfterImport = pgSchema.parse(sch2);

  const leftTables = Object.values(initSchema).filter((it) =>
    is(it, PgTable)
  ) as PgTable[];

  const leftSchemas = Object.values(initSchema).filter((it) =>
    is(it, PgSchema)
  ) as PgSchema[];

  const leftEnums = Object.values(initSchema).filter((it) =>
    isPgEnum(it)
  ) as PgEnum<any>[];

  const leftSequences = Object.values(initSchema).filter((it) =>
    isPgSequence(it)
  ) as PgSequence[];

  const initSnapshot = generatePgSnapshot(
    leftTables,
    leftEnums,
    leftSchemas,
    leftSequences
  );

  const { version: initV, dialect: initD, ...initRest } = initSnapshot;

  const initSch = {
    version: "7",
    dialect: "postgresql",
    id: "0",
    prevId: "0",
    ...initRest,
  } as const;

  const initSn = squashPgScheme(initSch);
  const validatedCur = pgSchema.parse(initSch);

  const {
    sqlStatements: afterFileSqlStatements,
    statements: afterFileStatements,
  } = await applyPgSnapshotsDiff(
    sn2AfterIm,
    initSn,
    testSchemasResolver(new Set()),
    testEnumsResolver(new Set()),
    testSequencesResolver(new Set()),
    testTablesResolver(new Set()),
    testColumnsResolver(new Set()),
    validatedCurAfterImport,
    validatedCur
  );

  fs.rmSync(`tests/introspect/${testName}.ts`);

  return {
    sqlStatements: afterFileSqlStatements,
    statements: afterFileStatements,
  };
};

export const introspectMySQLToFile = async (
  client: Connection,
  initSchema: MysqlSchema,
  testName: string,
  schema: string
) => {
  // put in db
  const { sqlStatements } = await applyMySqlDiffs(initSchema);
  for (const st of sqlStatements) {
    await client.query(st);
  }

  // introspect to schema
  const introspectedSchema = await fromMySqlDatabase(
    {
      query: async (sql: string, params?: any[] | undefined) => {
        const res = await client.execute(sql, params);
        return res[0] as any;
      },
    },
    schema
  );

  const file = schemaToTypeScriptMySQL(introspectedSchema, "camel");

  fs.writeFileSync(`tests/introspect/mysql/${testName}.ts`, file.file);

  const response = await prepareFromMySqlImports([
    `tests/introspect/mysql/${testName}.ts`,
  ]);

  const afterFileImports = generateMySqlSnapshot(response.tables);

  const { version: v2, dialect: d2, ...rest2 } = afterFileImports;

  const sch2 = {
    version: "5",
    dialect: "mysql",
    id: "0",
    prevId: "0",
    ...rest2,
  } as const;

  const sn2AfterIm = squashMysqlScheme(sch2);
  const validatedCurAfterImport = mysqlSchema.parse(sch2);

  const leftTables = Object.values(initSchema).filter((it) =>
    is(it, MySqlTable)
  ) as MySqlTable[];

  const initSnapshot = generateMySqlSnapshot(leftTables);

  const { version: initV, dialect: initD, ...initRest } = initSnapshot;

  const initSch = {
    version: "5",
    dialect: "mysql",
    id: "0",
    prevId: "0",
    ...initRest,
  } as const;

  const initSn = squashMysqlScheme(initSch);
  const validatedCur = mysqlSchema.parse(initSch);

  const {
    sqlStatements: afterFileSqlStatements,
    statements: afterFileStatements,
  } = await applyMysqlSnapshotsDiff(
    sn2AfterIm,
    initSn,
    testTablesResolver(new Set()),
    testColumnsResolver(new Set()),
    validatedCurAfterImport,
    validatedCur
  );

  fs.rmSync(`tests/introspect/mysql/${testName}.ts`);

  return {
    sqlStatements: afterFileSqlStatements,
    statements: afterFileStatements,
  };
};

export const introspectSQLiteToFile = async (
  client: Database,
  initSchema: SqliteSchema,
  testName: string
) => {
  // put in db
  const { sqlStatements } = await applySqliteDiffs(initSchema);
  for (const st of sqlStatements) {
    client.exec(st);
  }

  // introspect to schema
  const introspectedSchema = await fromSqliteDatabase(
    {
      query: async <T>(sql: string, params: any[] = []) => {
        return client.prepare(sql).bind(params).all() as T[];
      },
      run: async (query: string) => {
        client.prepare(query).run();
      },
    },
    undefined
  );

  const file = schemaToTypeScriptSQLite(introspectedSchema, "camel");

  fs.writeFileSync(`tests/introspect/sqlite/${testName}.ts`, file.file);

  const response = await prepareFromSqliteImports([
    `tests/introspect/sqlite/${testName}.ts`,
  ]);

  const afterFileImports = generateSqliteSnapshot(response.tables);

  const { version: v2, dialect: d2, ...rest2 } = afterFileImports;

  const sch2 = {
    version: "6",
    dialect: "sqlite",
    id: "0",
    prevId: "0",
    ...rest2,
  } as const;

  const sn2AfterIm = squashSqliteScheme(sch2);
  const validatedCurAfterImport = sqliteSchema.parse(sch2);

  const leftTables = Object.values(initSchema).filter((it) =>
    is(it, SQLiteTable)
  ) as SQLiteTable[];

  const initSnapshot = generateSqliteSnapshot(leftTables);

  const { version: initV, dialect: initD, ...initRest } = initSnapshot;

  const initSch = {
    version: "6",
    dialect: "sqlite",
    id: "0",
    prevId: "0",
    ...initRest,
  } as const;

  const initSn = squashSqliteScheme(initSch);
  const validatedCur = sqliteSchema.parse(initSch);

  const {
    sqlStatements: afterFileSqlStatements,
    statements: afterFileStatements,
  } = await applySqliteSnapshotsDiff(
    sn2AfterIm,
    initSn,
    testTablesResolver(new Set()),
    testColumnsResolver(new Set()),
    validatedCurAfterImport,
    validatedCur
  );

  fs.rmSync(`tests/introspect/sqlite/${testName}.ts`);

  return {
    sqlStatements: afterFileSqlStatements,
    statements: afterFileStatements,
  };
};
