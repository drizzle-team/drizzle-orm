export {
  type CheckConstraint,
  type Column,
  type Enum,
  type ForeignKey,
  type Identity,
  type Index,
  type InterimSchema,
  type Policy,
  type PostgresDDL,
  type PostgresEntity,
  type PrimaryKey,
  type Role,
  type Schema,
  type Sequence,
  type UniqueConstraint,
  type View,
  createDDL,
} from "../dialects/postgres/ddl";

export { ddlDiffDry } from "../dialects/postgres/diff";

import type { PostgresEntities } from "../dialects/postgres/ddl";
export type Table = PostgresEntities["tables"];
export * from "../dialects/postgres/introspect";
