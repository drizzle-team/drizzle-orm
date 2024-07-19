import { fromDatabase } from "../../serializer/pgSerializer";
import { originUUID } from "../../global";
import { Minimatch } from "minimatch";
import type { DB } from "../../utils";
import type { PgSchema } from "../../serializer/pgSchema";
import { ProgressView } from "../views";
import { renderWithTask } from "hanji";

export const pgPushIntrospect = async (
  db: DB,
  filters: string[],
  schemaFilters: string[]
) => {
  const matchers = filters.map((it) => {
    return new Minimatch(it);
  });

  const filter = (tableName: string) => {
    if (matchers.length === 0) return true;

    let flags: boolean[] = [];

    for (let matcher of matchers) {
      if (matcher.negate) {
        if (!matcher.match(tableName)) {
          flags.push(false);
        }
      }

      if (matcher.match(tableName)) {
        flags.push(true);
      }
    }

    if (flags.length > 0) {
      return flags.every(Boolean);
    }
    return false;
  };
  const progress = new ProgressView(
    "Pulling schema from database...",
    "Pulling schema from database..."
  );
  const res = await renderWithTask(
    progress,
    fromDatabase(db, filter, schemaFilters)
  );

  const schema = { id: originUUID, prevId: "", ...res } as PgSchema;
  const { internal, ...schemaWithoutInternals } = schema;
  return { schema: schemaWithoutInternals };
};
