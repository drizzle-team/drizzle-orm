import { prepareFromExports } from "./serializer/pgImports";
import { PgDatabase } from "drizzle-orm/pg-core";
import { generatePgSnapshot } from "./serializer/pgSerializer";
import { fillPgSnapshot } from "./migrationPreparator";
import { randomUUID } from "crypto";
import {
  pgSchema,
  PgSchema as PgSchemaKit,
  squashPgScheme,
} from "./serializer/pgSchema";
import {
  sqliteSchema,
  SQLiteSchema as SQLiteSchemaKit,
  squashSqliteScheme,
} from "./serializer/sqliteSchema";
import {
  mysqlSchema,
  MySqlSchema as MySQLSchemaKit,
  squashMysqlScheme,
} from "./serializer/mysqlSchema";
import { pgPushIntrospect } from "./cli/commands/pgIntrospect";
import { pgSuggestions } from "./cli/commands/pgPushUtils";
import { sqlitePushIntrospect } from "./cli/commands/sqliteIntrospect";
import { generateSqliteSnapshot } from "./serializer/sqliteSerializer";
import type { MySql2Database } from "drizzle-orm/mysql2";
import { logSuggestionsAndReturn } from "./cli/commands/sqlitePushUtils";
import { generateMySqlSnapshot } from "./serializer/mysqlSerializer";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { originUUID } from "./global";
import {
  columnsResolver,
  enumsResolver,
  schemasResolver,
  sequencesResolver,
  tablesResolver,
} from "./cli/commands/migrate";
import type { DB, SQLiteDB } from "./utils";
import { updateUpToV6 as upPgV6 } from "./cli/commands/pgUp";
import { LibSQLDatabase } from "drizzle-orm/libsql";
export type DrizzleSnapshotJSON = PgSchemaKit;
export type DrizzleSQLiteSnapshotJSON = SQLiteSchemaKit;
export type DrizzleMySQLSnapshotJSON = MySQLSchemaKit;

export const generateDrizzleJson = (
  imports: Record<string, unknown>,
  prevId?: string,
  schemaFilters?: string[]
): PgSchemaKit => {
  const prepared = prepareFromExports(imports);

  const id = randomUUID();

  const snapshot = generatePgSnapshot(
    prepared.tables,
    prepared.enums,
    prepared.schemas,
    prepared.sequences,
    schemaFilters
  );

  return fillPgSnapshot({
    serialized: snapshot,
    id,
    idPrev: prevId ?? originUUID,
  });
};

export const generateMigration = async (
  prev: DrizzleSnapshotJSON,
  cur: DrizzleSnapshotJSON
) => {
  const { applyPgSnapshotsDiff } = await import("./snapshotsDiffer");

  const validatedPrev = pgSchema.parse(prev);
  const validatedCur = pgSchema.parse(cur);

  const squashedPrev = squashPgScheme(validatedPrev);
  const squashedCur = squashPgScheme(validatedCur);

  const { sqlStatements, _meta } = await applyPgSnapshotsDiff(
    squashedPrev,
    squashedCur,
    schemasResolver,
    enumsResolver,
    sequencesResolver,
    tablesResolver,
    columnsResolver,
    validatedPrev,
    validatedCur
  );

  return sqlStatements;
};

export const pushSchema = async (
  imports: Record<string, unknown>,
  drizzleInstance: PgDatabase<any>,
  schemaFilters?: string[]
) => {
  const { applyPgSnapshotsDiff } = await import("./snapshotsDiffer");
  const { sql } = await import("drizzle-orm");

  const db: DB = {
    query: async (query: string, params?: any[]) => {
      const res = await drizzleInstance.execute(sql.raw(query));
      return res.rows;
    },
  };

  const cur = generateDrizzleJson(imports);
  const { schema: prev } = await pgPushIntrospect(
    db,
    [],
    schemaFilters ?? ["public"]
  );

  const validatedPrev = pgSchema.parse(prev);
  const validatedCur = pgSchema.parse(cur);

  const squashedPrev = squashPgScheme(validatedPrev, "push");
  const squashedCur = squashPgScheme(validatedCur, "push");

  const { statements } = await applyPgSnapshotsDiff(
    squashedPrev,
    squashedCur,
    schemasResolver,
    enumsResolver,
    sequencesResolver,
    tablesResolver,
    columnsResolver,
    validatedPrev,
    validatedCur,
    "push"
  );

  const { shouldAskForApprove, statementsToExecute, infoToPrint } =
    await pgSuggestions(db, statements);

  return {
    hasDataLoss: shouldAskForApprove,
    warnings: infoToPrint,
    statementsToExecute,
    apply: async () => {
      for (const dStmnt of statementsToExecute) {
        await db.query(dStmnt);
      }
    },
  };
};

// SQLite

export const generateSQLiteDrizzleJson = async (
  imports: Record<string, unknown>,
  prevId?: string
): Promise<SQLiteSchemaKit> => {
  const { prepareFromExports } = await import("./serializer/sqliteImports");

  const prepared = prepareFromExports(imports);

  const id = randomUUID();

  const snapshot = generateSqliteSnapshot(prepared.tables);

  return {
    ...snapshot,
    id,
    prevId: prevId ?? originUUID,
  };
};

export const generateSQLiteMigration = async (
  prev: DrizzleSQLiteSnapshotJSON,
  cur: DrizzleSQLiteSnapshotJSON
) => {
  const { applySqliteSnapshotsDiff } = await import("./snapshotsDiffer");

  const validatedPrev = sqliteSchema.parse(prev);
  const validatedCur = sqliteSchema.parse(cur);

  const squashedPrev = squashSqliteScheme(validatedPrev);
  const squashedCur = squashSqliteScheme(validatedCur);

  const { sqlStatements } = await applySqliteSnapshotsDiff(
    squashedPrev,
    squashedCur,
    tablesResolver,
    columnsResolver,
    validatedPrev,
    validatedCur
  );

  return sqlStatements;
};

export const pushSQLiteSchema = async (
  imports: Record<string, unknown>,
  drizzleInstance: LibSQLDatabase<any>
) => {
  const { applySqliteSnapshotsDiff } = await import("./snapshotsDiffer");
  const { sql } = await import("drizzle-orm");

  const db: SQLiteDB = {
    query: async (query: string, params?: any[]) => {
      const res = drizzleInstance.all<any>(sql.raw(query));
      return res;
    },
    run: async (query: string) => {
      return Promise.resolve(drizzleInstance.run(sql.raw(query))).then(
        () => { }
      );
    },
  };

  const cur = await generateSQLiteDrizzleJson(imports);
  const { schema: prev } = await sqlitePushIntrospect(db, []);

  const validatedPrev = sqliteSchema.parse(prev);
  const validatedCur = sqliteSchema.parse(cur);

  const squashedPrev = squashSqliteScheme(validatedPrev, "push");
  const squashedCur = squashSqliteScheme(validatedCur, "push");

  const { statements, _meta } = await applySqliteSnapshotsDiff(
    squashedPrev,
    squashedCur,
    tablesResolver,
    columnsResolver,
    validatedPrev,
    validatedCur,
    "push"
  );

  const { shouldAskForApprove, statementsToExecute, infoToPrint } =
    await logSuggestionsAndReturn(
      db,
      statements,
      squashedPrev,
      squashedCur,
      _meta!
    );

  return {
    hasDataLoss: shouldAskForApprove,
    warnings: infoToPrint,
    statementsToExecute,
    apply: async () => {
      for (const dStmnt of statementsToExecute) {
        await db.query(dStmnt);
      }
    },
  };
};

// MySQL

export const generateMySQLDrizzleJson = async (
  imports: Record<string, unknown>,
  prevId?: string
): Promise<MySQLSchemaKit> => {
  const { prepareFromExports } = await import("./serializer/mysqlImports");

  const prepared = prepareFromExports(imports);

  const id = randomUUID();

  const snapshot = generateMySqlSnapshot(prepared.tables);

  return {
    ...snapshot,
    id,
    prevId: prevId ?? originUUID,
  };
};

export const generateMySQLMigration = async (
  prev: DrizzleMySQLSnapshotJSON,
  cur: DrizzleMySQLSnapshotJSON
) => {
  const { applyMysqlSnapshotsDiff } = await import("./snapshotsDiffer");

  const validatedPrev = mysqlSchema.parse(prev);
  const validatedCur = mysqlSchema.parse(cur);

  const squashedPrev = squashMysqlScheme(validatedPrev);
  const squashedCur = squashMysqlScheme(validatedCur);

  const { sqlStatements } = await applyMysqlSnapshotsDiff(
    squashedPrev,
    squashedCur,
    tablesResolver,
    columnsResolver,
    validatedPrev,
    validatedCur
  );

  return sqlStatements;
};

export const pushMySQLSchema = async (
  imports: Record<string, unknown>,
  drizzleInstance: MySql2Database<any>,
  databaseName: string
) => {
  const { applyMysqlSnapshotsDiff } = await import("./snapshotsDiffer");
  const { logSuggestionsAndReturn } = await import(
    "./cli/commands/mysqlPushUtils"
  );
  const { mysqlPushIntrospect } = await import(
    "./cli/commands/mysqlIntrospect"
  );
  const { sql } = await import("drizzle-orm");

  const db: DB = {
    query: async (query: string, params?: any[]) => {
      const res = await drizzleInstance.execute(sql.raw(query));
      return res[0] as unknown as any[];
    },
  };
  const cur = await generateMySQLDrizzleJson(imports);
  const { schema: prev } = await mysqlPushIntrospect(db, databaseName, []);

  const validatedPrev = mysqlSchema.parse(prev);
  const validatedCur = mysqlSchema.parse(cur);

  const squashedPrev = squashMysqlScheme(validatedPrev);
  const squashedCur = squashMysqlScheme(validatedCur);

  const { statements } = await applyMysqlSnapshotsDiff(
    squashedPrev,
    squashedCur,
    tablesResolver,
    columnsResolver,
    validatedPrev,
    validatedCur,
    "push"
  );

  const { shouldAskForApprove, statementsToExecute, infoToPrint } =
    await logSuggestionsAndReturn(db, statements, validatedCur);

  return {
    hasDataLoss: shouldAskForApprove,
    warnings: infoToPrint,
    statementsToExecute,
    apply: async () => {
      for (const dStmnt of statementsToExecute) {
        await db.query(dStmnt);
      }
    },
  };
};

export const upPgSnapshot = (snapshot: Record<string, unknown>) => {
  return upPgV6(snapshot);
};
