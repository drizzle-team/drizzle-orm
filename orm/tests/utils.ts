import { Pool } from "pg";
import { AbstractTable, DB } from "../src";
import Session from "../src/db/session";
import Enum from "../src/types/type";
import MigrationSerializer from "@/serializer/serializer";
import {
  dry,
  applySnapshotsDiff,
  Column,
  ColumnsResolverInput,
  ColumnsResolverOutput,
  Table,
  TablesResolverInput,
  TablesResolverOutput,
} from "drizzle-kit/src/snapshotsDiffer";


export const prepareTestSqlFromSchema = async (schema: any) => {
  const tables: AbstractTable<any>[] = [];
  const enums: Enum<any>[] = [];
  const values = Object.values(schema);

  const db = new DB(new Session(new Pool()));

  values.forEach((t) => {
    if (t instanceof Enum) {
      enums.push(t);
      return;
    }

    if (typeof t === "function" && t.prototype && t.prototype.constructor) {
      const instance = new t.prototype.constructor(db);
      if (instance instanceof AbstractTable) {
        tables.push(instance as unknown as AbstractTable<any>);
      }
    }
  });

  const serializer = new MigrationSerializer();
  const jsonSchema = serializer.generate(tables, enums);

  const simulatedTablesResolver = async (
    input: TablesResolverInput<Table>
  ): Promise<TablesResolverOutput<Table>> => {
    return { created: input.created, deleted: [], renamed: [] };
  };

  const simulatedColumnsResolver = async (
    input: ColumnsResolverInput<Column>
  ): Promise<ColumnsResolverOutput<Column>> => {
    return {
      tableName: input.tableName,
      created: input.created,
      deleted: [],
      renamed: [],
    };
  };

  const initSQL = await applySnapshotsDiff(
    dry,
    jsonSchema,
    simulatedTablesResolver,
    simulatedColumnsResolver
  );

  return initSQL;
};
