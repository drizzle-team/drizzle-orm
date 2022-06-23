/* eslint-disable max-classes-per-file */
import ColumnType from './columnType';

export default class PgBigSerial53 extends ColumnType<number> {
  public dbName: string;

  public constructor() {
    super();
    this.dbName = 'BIGSERIAL';
  }

  public getDbName = (): string => this.dbName;

  public insertStrategy = (value: number): string => `${value}`;

  public selectStrategy(value: string): number | undefined {
    return value ? parseInt(value, 10) : undefined;
  }
}

export class PgBigSerial64 extends ColumnType<bigint> {
  public dbName: string;

  public constructor() {
    super();
    this.dbName = 'BIGSERIAL';
  }

  public getDbName = (): string => this.dbName;

  public insertStrategy = (value: bigint): string => `${value}`;

  public selectStrategy(value: string): bigint | undefined {
    return value ? BigInt(value) : undefined;
  }
}
