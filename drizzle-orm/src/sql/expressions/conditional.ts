import type { Column, GetColumnData } from "~/column.ts";

import { type SQL, sql, type SQLWrapper } from "../sql.ts";

type ExpressionType<T> = T extends Column ? GetColumnData<T, "raw"> : T extends SQL<infer I> ? I : unknown;

export const caseWhen = (condition: SQL | undefined) => {
  const sqlChunks: SQL[] = [];
  sqlChunks.push(sql`CASE `);

  const when = <AccType = null>(condition: SQL | undefined) => {
    sqlChunks.push(sql`WHEN ${condition} `);

    const end = <FinalType = null>() => {
      sqlChunks.push(sql`END`);
      return sql.join(sqlChunks) as SQL<FinalType>;
    };

    return {
      then: <T extends SQL | SQLWrapper | Column>(value: T) => {
        sqlChunks.push(sql`THEN ${value} `);

        return {
          when: when<Exclude<AccType, null> | ExpressionType<T>>,
          else: <E>(value: E) => {
            sqlChunks.push(sql`ELSE ${value} `);
            return {
              end: end<Exclude<AccType, null> | ExpressionType<T> | ExpressionType<E>>,
            };
          },
          end: end<AccType | ExpressionType<T> | null>,
        };
      },
    };
  };

  return when(condition);
};
