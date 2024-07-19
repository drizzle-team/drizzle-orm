import { coerce, intersection, object, string, TypeOf, union } from "zod";
import { mysqlCredentials } from "./mysql";
import { sqliteCredentials } from "./sqlite";
import { dialect } from "../../schemaValidator";
import { postgresCredentials } from "./postgres";

export const credentials = intersection(
  postgresCredentials,
  mysqlCredentials,
  sqliteCredentials
);

export type Credentials = TypeOf<typeof credentials>;

export const studioCliParams = object({
  port: coerce.number().optional().default(4983),
  host: string().optional().default("127.0.0.1"),
  config: string().optional(),
});

export const studioConfig = object({
  dialect,
  schema: union([string(), string().array()]).optional(),
});
