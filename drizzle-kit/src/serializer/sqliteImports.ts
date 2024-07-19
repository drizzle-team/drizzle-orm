import { AnySQLiteTable, SQLiteTable } from "drizzle-orm/sqlite-core";
import { is } from "drizzle-orm";
import { safeRegister } from "../cli/commands/utils";

export const prepareFromExports = (exports: Record<string, unknown>) => {
  const tables: AnySQLiteTable[] = [];
  const i0values = Object.values(exports);
  i0values.forEach((t) => {
    if (is(t, SQLiteTable)) {
      tables.push(t);
    }
  });

  return { tables };
};

export const prepareFromSqliteImports = async (imports: string[]) => {
  const tables: AnySQLiteTable[] = [];

  const { unregister } = await safeRegister();
  for (let i = 0; i < imports.length; i++) {
    const it = imports[i];

    const i0: Record<string, unknown> = require(`${it}`);
    const prepared = prepareFromExports(i0);

    tables.push(...prepared.tables);
  }

  unregister();

  return { tables: Array.from(new Set(tables)) };
};
