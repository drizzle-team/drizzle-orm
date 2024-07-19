import { index, mysqlTable, text } from "drizzle-orm/mysql-core";
import { diffTestSchemasMysql } from "./schemaDiffer";

const from = {
  users: mysqlTable(
    "table",
    {
      name: text("name"),
    },
    (t) => {
      return {
        idx: index("name_idx").on(t.name),
      };
    }
  ),
};

const to = {
  users: mysqlTable("table", {
    name: text("name"),
  }),
};

const { statements, sqlStatements } = await diffTestSchemasMysql(from, to, []);

console.log(statements);
console.log(sqlStatements);
