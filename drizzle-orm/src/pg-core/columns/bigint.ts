import type { ColumnBaseConfig } from "~/column.ts";
import { entityKind } from "~/entity.ts";
import type { PgTable } from "~/pg-core/table.ts";
import { PgColumn } from "./common.ts";
import { PgIntColumnBaseBuilder } from "./int.common.ts";

export class PgBigInt53Builder extends PgIntColumnBaseBuilder<{
  name: string;
  dataType: "number";
  data: number;
  driverParam: number | string;
  enumValues: undefined;
}> {
  static override readonly [entityKind]: string = "PgBigInt53Builder";

  constructor(name: string) {
    super(name, "number", "PgBigInt53");
  }

  /** @internal */
  override build(table: PgTable) {
    return new PgBigInt53(table, this.config as any);
  }
}

export class PgBigInt53 extends PgColumn<ColumnBaseConfig<"number">> {
  static override readonly [entityKind]: string = "PgBigInt53";

  getSQLType(): string {
    return "bigint";
  }

  override mapFromDriverValue(value: number | string): number {
    if (typeof value === "number") {
      return value;
    }
    return Number(value);
  }
}

export class PgBigInt64Builder extends PgIntColumnBaseBuilder<{
  name: string;
  dataType: "bigint";
  data: bigint;
  driverParam: string;
  enumValues: undefined;
}> {
  static override readonly [entityKind]: string = "PgBigInt64Builder";

  constructor(name: string) {
    super(name, "bigint", "PgBigInt64");
  }

  /** @internal */
  override build(table: PgTable) {
    return new PgBigInt64(table, this.config as any);
  }
}

export class PgBigInt64 extends PgColumn<ColumnBaseConfig<"bigint">> {
  static override readonly [entityKind]: string = "PgBigInt64";

  getSQLType(): string {
    return "bigint";
  }

  // eslint-disable-next-line unicorn/prefer-native-coercion-functions
  override mapFromDriverValue(value: string): bigint {
    return BigInt(value);
  }
}

export function bigint(config: { mode: "number" }): PgBigInt53Builder;
export function bigint(config: { mode: "bigint" }): PgBigInt64Builder;
export function bigint(
  name: string,
  config: { mode: "bigint" }
): PgBigInt64Builder;
export function bigint(
  name: string,
  config: { mode: "number" }
): PgBigInt53Builder;
export function bigint(
  ...params:
    | [string, { mode: "number" }]
    | [{ mode: "number" }]
    | [string, { mode: "bigint" }]
    | [{ mode: "bigint" }]
): PgBigInt53Builder | PgBigInt64Builder {
  let name = "";
  let cfg: { mode: "number" | "bigint" };

  if (params.length === 1) {
    // [ config ]
    cfg = params[0];
  } else {
    // [ name, config ]
    name = params[0];
    cfg = params[1];
  }

  return cfg.mode === "number"
    ? new PgBigInt53Builder(name)
    : new PgBigInt64Builder(name);
}
