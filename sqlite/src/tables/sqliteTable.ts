import BaseLogger from 'drizzle-orm/src/logger/abstractLogger';

export default abstract class AbstractTable<TTable extends AbstractTable<TTable>> {
  public db: DB;

  private _session: ISession;
  private _logger: BaseLogger | undefined;

  public constructor(db: DB) {
    this._session = db.session();
    this._logger = db.logger();
    this.db = db;
  }

  // @TODO document, that you should not use arrow functions for abstract classes
  public abstract tableName(): string;

  public withLogger = (logger: BaseLogger) => {
    this._logger = logger;
  };

  // eslint-disable-next-line max-len
  public select<T extends EmptyPartial<TTable> = undefined>(partial?: T): SelectTRB<TTable, T> {
    if (!this._session) {
      throw new Error(`Db was not provided in constructor, while ${this.constructor.name} class was creating. Please make sure, that you provided Db object to ${this.constructor.name} class. Should be -> new ${this.constructor.name}(db)`);
    }

    return new SelectTRB(
      this._session,
      this.mapServiceToDb(),
      {},
      this,
      this._logger,
      partial,
    );
  }

  public mapServiceToDb(): {[name in keyof ExtractModel<TTable>]: AbstractColumn<ColumnType>} {
    return Object.getOwnPropertyNames(this)
      .reduce<{[name in keyof ExtractModel<TTable>]
      : AbstractColumn<ColumnType>}>((res, fieldName) => {
      const field: unknown = (this as unknown as TTable)[fieldName as keyof TTable];
      if (field instanceof AbstractColumn) {
        res[fieldName as keyof ExtractModel<TTable>] = field;
      }
      return res;
    }, {} as {[name in keyof ExtractModel<TTable>]: AbstractColumn<ColumnType>});
  }

  protected index(columns: Array<Column<ColumnType, boolean, boolean>>): TableIndex
  protected index(columns: Column<ColumnType, boolean, boolean>): TableIndex
  protected index(columns: any) {
    return new TableIndex(this.tableName(), columns instanceof Array ? columns : [columns]);
  }

  protected uniqueIndex(columns: Array<Column<ColumnType, boolean, boolean>>): TableIndex
  protected uniqueIndex(columns: Column<ColumnType, boolean, boolean>): TableIndex
  protected uniqueIndex(columns: any) {
    return new TableIndex(this.tableName(), columns instanceof Array ? columns : [columns], true);
  }

  protected varchar(name: string, params: {size?: number} = {})
    : Column<PgVarChar, true, false, this> {
    return new Column(this, name, new PgVarChar(params.size));
  }

  protected int(name: string): Column<PgInteger, true, false, this> {
    return new Column(this, name, new PgInteger());
  }

  protected smallInt(name: string): Column<PgSmallInt, true, false, this> {
    return new Column(this, name, new PgSmallInt());
  }

  protected serial(name: string): Column<PgSerial, true, true, this> {
    return new Column(this, name, new PgSerial());
  }

  protected bigSerial(name: string, maxBytes: 'max_bytes_53'): Column<PgBigSerial53, true, true, this>
  protected bigSerial(name: string, maxBytes: 'max_bytes_64'): Column<PgBigSerial64, true, true, this>
  protected bigSerial(name: string, maxBytes: 'max_bytes_53' | 'max_bytes_64') {
    if (maxBytes === 'max_bytes_53') {
      return new Column(this, name, new PgBigSerial53());
    }
    return new Column(this, name, new PgBigSerial64());
  }

  protected timestamp(name: string): Column<PgTimestamp, true, false, this> {
    return new Column(this, name, new PgTimestamp());
  }

  protected timestamptz(name: string): Column<PgTimestamptz, true, false, this> {
    return new Column(this, name, new PgTimestamptz());
  }

  protected bigint(name: string, maxBytes: 'max_bytes_53'): Column<PgBigInt53, true, false, this>
  protected bigint(name: string, maxBytes: 'max_bytes_64'): Column<PgBigInt64, true, false, this>
  protected bigint(name: string, maxBytes: 'max_bytes_53' | 'max_bytes_64') {
    if (maxBytes === 'max_bytes_53') {
      return new Column(this, name, new PgBigInt53());
    }
    return new Column(this, name, new PgBigInt64());
  }

  protected type<ETtype extends string>(typeEnum: Enum<ETtype>, name: string)
    : Column<PgEnum<ExtractEnumValues<Enum<ETtype>>>, true, false, this> {
    const pgEnum = new PgEnum<ExtractEnumValues<typeof typeEnum>>(typeEnum.name);
    return new Column(this, name, pgEnum);
  }

  protected decimal(name: string, params: { precision?: number, scale?: number}
  = {}): Column<PgBigDecimal, true, false, this> {
    return new Column(this, name, new PgBigDecimal(params.precision, params.scale));
  }

  protected time(name: string): Column<PgTime, true, false, this> {
    return new Column(this, name, new PgTime());
  }

  protected bool(name: string): Column<PgBoolean, true, false, this> {
    return new Column(this, name, new PgBoolean());
  }

  protected text(name: string): Column<PgText, true, false, this> {
    return new Column(this, name, new PgText());
  }

  protected jsonb<TSubType>(name: string): Column<PgJsonb<TSubType>, true, false, this> {
    return new Column(this, name, new PgJsonb<TSubType>());
  }
}

export abstract class PgTable<TTable extends PgTable<TTable>> extends AbstractTable<TTable> {
}
