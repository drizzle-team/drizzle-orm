import {
  PgDate,
  PgJson,
  PgNumeric,
  PgTime,
  PgTimestamp,
  PgUUID,
} from "~/pg-core/columns";

import { type DriverValueEncoder, type QueryTypingsValue } from "~/sql";
import { PgJsonb } from "./columns/jsonb";
import { PgDialect } from "~/pg-core/dialect";

export class PgJSDialect extends PgDialect {
  public constructor() {
    super();
  }
  
  override prepareTyping(
    encoder: DriverValueEncoder<unknown, unknown>
  ): QueryTypingsValue {
    if (encoder instanceof PgJsonb || encoder instanceof PgJson) {
      return "json";
    } else if (encoder instanceof PgNumeric) {
      return "decimal";
    } else if (encoder instanceof PgTime) {
      return "time";
    } else if (encoder instanceof PgTimestamp) {
      return "timestamp";
    } else if (encoder instanceof PgDate) {
      return "date";
    } else if (encoder instanceof PgUUID) {
      return "uuid";
    } else {
      return "none";
    }
  }
}
