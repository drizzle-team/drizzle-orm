import PgVarChar from '../columns/types/pgVarChar';
import PgTimestamp from '../columns/types/pgTimestamp';
import PgInteger from '../columns/types/pgInteger';
import PgBigDecimal from '../columns/types/pgBigDecimal';
import PgTime from '../columns/types/pgTime';
import PgBoolean from '../columns/types/pgBoolean';
import PgText from '../columns/types/pgText';
import PgJsonb from '../columns/types/pgJsonb';
import ColumnType from '../columns/types/columnType';
import InsertTRB from '../builders/highLvlBuilders/insertRequestBuilder';
import DeleteTRB from '../builders/highLvlBuilders/deleteRequestBuilder';
import UpdateTRB from '../builders/highLvlBuilders/updateRequestBuilder';
import SelectTRB from '../builders/highLvlBuilders/selectRequestBuilder';
import PgBigInt from '../columns/types/pgBigInt';
import { ISession } from '../db/session';
import BaseLogger from '../logger/abstractLogger';
import PgEnum from '../columns/types/pgEnum';
import DB from '../db/db';
import { AbstractColumn, Column } from '../columns/column';
import TableIndex from '../indexes/tableIndex';
import { ExtractModel } from './inferTypes';
import Enum, { ExtractEnumValues } from '../types/type';
import PgSmallInt from '../columns/types/pgSmallInt';
import PgSerial from '../columns/types/pgSerial';
import PgTimestamptz from '../columns/types/pgTimestamptz';

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

  public select({ limit, offset }: {
    limit?: number,
    offset?: number }
  = {}): SelectTRB<TTable> {
    if (!this._session) {
      throw new Error(`Db was not provided in constructor, while ${this.constructor.name} class was creating. Please make sure, that you provided Db object to ${this.constructor.name} class. Should be -> new ${this.constructor.name}(db)`);
    }

    return new SelectTRB(
      this._session,
      this.mapServiceToDb(),
      { limit, offset },
      this,
      this._logger,
    );
  }

  public update = (): UpdateTRB<TTable> => {
    if (!this._session) {
      throw new Error(`Db was not provided in constructor, while ${this.constructor.name} class was creating. Please make sure, that you provided Db object to ${this.constructor.name} class. Should be -> new ${this.constructor.name}(db)`);
    }
    return new UpdateTRB(this, this._session, this.mapServiceToDb(), this._logger);
  };

  public insert = (value: ExtractModel<TTable>):
  InsertTRB<TTable> => {
    if (!this._session) {
      throw new Error(`Db was not provided in constructor, while ${this.constructor.name} class was creating. Please make sure, that you provided Db object to ${this.constructor.name} class. Should be -> new ${this.constructor.name}(db)`);
    }
    return new InsertTRB([value], this._session,
      this.mapServiceToDb(), this, this._logger);
  };

  public insertMany = (values: ExtractModel<TTable>[]):
  InsertTRB<TTable> => {
    if (!this._session) {
      throw new Error(`Db was not provided in constructor, while ${this.constructor.name} class was creating. Please make sure, that you provided Db object to ${this.constructor.name} class. Should be -> new ${this.constructor.name}(db)`);
    }
    return new InsertTRB(values, this._session,
      this.mapServiceToDb(), this, this._logger);
  };

  public delete = (): DeleteTRB<TTable> => {
    if (!this._session) {
      throw new Error(`Db was not provided in constructor, while ${this.constructor.name} class was creating. Please make sure, that you provided Db object to ${this.constructor.name} class. Should be -> new ${this.constructor.name}(db)`);
    }
    return new DeleteTRB(this, this._session, this.mapServiceToDb(), this._logger);
  };

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
    return new TableIndex(this.tableName(), columns instanceof Array ? columns : [columns]);
  }

  protected varchar(name: string, params: {size?: number} = {}): Column<PgVarChar, true> {
    return new Column(this, name, new PgVarChar(params.size));
  }

  protected int(name: string): Column<PgInteger, true> {
    return new Column(this, name, new PgInteger());
  }

  protected smallInt(name: string): Column<PgInteger, true> {
    return new Column(this, name, new PgSmallInt());
  }

  protected serial(name: string): Column<PgSerial, true, true> {
    return new Column(this, name, new PgSerial());
  }

  protected timestamp(name: string): Column<PgTimestamp, true> {
    return new Column(this, name, new PgTimestamp());
  }

  protected timestamptz(name: string): Column<PgTimestamptz, true> {
    return new Column(this, name, new PgTimestamptz());
  }

  protected bigint(name: string): Column<PgBigInt, true> {
    return new Column(this, name, new PgBigInt());
  }

  protected type<ETtype extends string>(typeEnum: Enum<ETtype>, name: string)
    : Column<PgEnum<ExtractEnumValues<Enum<ETtype>>>, true> {
    const pgEnum = new PgEnum<ExtractEnumValues<typeof typeEnum>>(typeEnum.name);
    return new Column(this, name, pgEnum);
  }

  protected decimal(name: string, params: { precision?: number, scale?: number}
  = {}): Column<PgBigDecimal, true> {
    return new Column(this, name, new PgBigDecimal(params.precision, params.scale));
  }

  protected time(name: string): Column<PgTime, true> {
    return new Column(this, name, new PgTime());
  }

  protected bool(name: string): Column<PgBoolean, true> {
    return new Column(this, name, new PgBoolean());
  }

  protected text(name: string): Column<PgText, true> {
    return new Column(this, name, new PgText());
  }

  protected jsonb<TSubType>(name: string): Column<PgJsonb<TSubType>, true> {
    return new Column(this, name, new PgJsonb<TSubType>());
  }
}
