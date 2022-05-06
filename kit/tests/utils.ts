import serializer from "../src/serializer";
import {
  applySnapshotsDiff,
  Column,
  ColumnsResolverInput,
  ColumnsResolverOutput,
  Table,
  TablesResolverInput,
  TablesResolverOutput,
} from "../src/snapshotsDiffer";
import { PatchResolver } from "./patch-resolver";
import fs from "fs";
import yaml from "js-yaml";
import { AbstractTable, DB } from "drizzle-orm/";
import Enum from "drizzle-orm/types/type";
import Session from "drizzle-orm/db/session";
import { Pool } from 'pg'
import MigrationSerializer from "drizzle-orm/serializer/serializer";

const dry = {
  version: "1",
  tables: {},
  enums: {},
};

export interface Patch {
  tables: {
    removed: string[];
    added: string[];
    sequence: string[];
  };
  columns_in_tables: Record<
    string,
    { removed: string[]; added: string[]; sequence: string[] }
  >;
}

export const prepareTestSQL = async (path: string) => {
  const fromExists = fs.existsSync(`${path}/from.ts`);
  const fromJson = fromExists ? serializer(path, "from.ts") : dry;

  if (!fs.existsSync(`${path}/to.ts`)) {
    console.error(`Missing to.ts in the ${path}`);
    process.exit();
  }

  const toJson = serializer(path, "to.ts");
  const patch = yaml.load(
    fs.readFileSync(`${path}/_patch.yaml`).toString("utf-8")
  ) as Patch;

  const patchResolver = new PatchResolver(patch);

  const simulatedTablesResolver = async (
    input: TablesResolverInput<Table>
  ): Promise<TablesResolverOutput<Table>> => {
    return patchResolver.resolveTables(input.created, input.deleted);
  };

  const simulatedColumnsResolver = async (
    input: ColumnsResolverInput<Column>
  ): Promise<ColumnsResolverOutput<Column>> => {
    return patchResolver.resolveColumns(
      input.tableName,
      input.created,
      input.deleted
    );
  };
  const result = await applySnapshotsDiff(
    fromJson,
    toJson,
    simulatedTablesResolver,
    simulatedColumnsResolver
  );
  const initSQL = await applySnapshotsDiff(
    dry,
    fromJson,
    simulatedTablesResolver,
    simulatedColumnsResolver
  );
  return { initSQL: initSQL, migrationSQL: result };
};

export const prepareTestSqlFromSchema = (schema: any) => {
  const tables: AbstractTable<any>[] = [];
  const enums: Enum<any>[] = [];
  const values = Object.values(schema);

  const db = new DB(new Session(new Pool()));
  
  values.forEach(t => {
      if (t instanceof Enum) {
          enums.push(t);
          return;
      }
      
      if (typeof t === "function" && t.prototype && t.prototype.constructor === t) {
          const instance = new t.prototype.constructor(db);
          if (instance instanceof AbstractTable) {
              tables.push(instance as unknown as AbstractTable<any>);
          }
      }
  });
  
  const serializer = new MigrationSerializer();
  return serializer.generate(tables, enums);
};