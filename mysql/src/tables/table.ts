import { AbstractTable, Column, DB } from "drizzle-orm/";
import Enum, { ExtractEnumValues } from "drizzle-orm/types/type";
import {
  MySqlInt,
  MySqlMediumInt,
  MySqlSmallInt,
  MySqlBigInt53,
  MySqlBigInt64,
  MySqlDouble,
  MySqlFloat,
  MySqlDecimal,
  MySqlTinyInt,
  MySqlBit,
  MySqlBoolean,
  MySqlChar,
  MySqlVarChar,
  MySqlBinary,
  MySqlVarBinary,
  MySqlTinyText,
  MySqlText,
  MySqlMediumText,
  MySqlLongText,
  MySqlEnum,
  MySqlDate,
  MySqlDateTime,
  MySqlTimestamp,
  MySqlTime,
} from "../columns/types";

export default abstract class MySqlTable<
  TTable extends AbstractTable<TTable>
> extends AbstractTable<TTable> {
  public constructor(db: DB) {
    super(db);
    this._session = db.session();
    this._logger = db.logger();
  }

  protected _int(name: string): Column<MySqlInt, true, false, this> {
    return new Column(this, name, new MySqlInt());
  }

  protected _smallint(name: string): Column<MySqlSmallInt, true, false, this> {
    return new Column(this, name, new MySqlSmallInt());
  }

  protected _mediumint(
    name: string
  ): Column<MySqlMediumInt, true, false, this> {
    return new Column(this, name, new MySqlMediumInt());
  }

  protected _bigint53(name: string): Column<MySqlBigInt53, true, false, this> {
    return new Column(this, name, new MySqlBigInt53());
  }

  protected _bigint64(name: string): Column<MySqlBigInt64, true, false, this> {
    return new Column(this, name, new MySqlBigInt64());
  }

  protected _double(
    name: string,
    params: { precision?: number; scale?: number } = {}
  ): Column<MySqlDouble, true, false, this> {
    return new Column(
      this,
      name,
      new MySqlDouble(params.precision, params.scale)
    );
  }

  protected _float(
    name: string,
    params: { precision?: number; scale?: number } = {}
  ): Column<MySqlFloat, true, false, this> {
    return new Column(
      this,
      name,
      new MySqlFloat(params.precision, params.scale)
    );
  }

  protected _decimal(
    name: string,
    params: { precision?: number; scale?: number } = {}
  ): Column<MySqlDecimal, true, false, this> {
    return new Column(
      this,
      name,
      new MySqlDecimal(params.precision, params.scale)
    );
  }

  protected _tinyint(
    name: string,
    params: { size: number }
  ): Column<MySqlTinyInt, true, false, this> {
    return new Column(this, name, new MySqlTinyInt(params.size));
  }

  protected _bit(
    name: string,
    params: { size: number }
  ): Column<MySqlBit, true, false, this> {
    return new Column(this, name, new MySqlBit(params.size));
  }

  protected _boolean(name: string): Column<MySqlBoolean, true, false, this> {
    return new Column(this, name, new MySqlBoolean());
  }

  protected _char(
    name: string,
    params: { size: number }
  ): Column<MySqlChar, true, false, this> {
    return new Column(this, name, new MySqlChar(params.size));
  }

  protected _varchar(
    name: string,
    params: { size: number }
  ): Column<MySqlVarChar, true, false, this> {
    return new Column(this, name, new MySqlVarChar(params.size));
  }

  protected _binary(
    name: string,
    params: { size?: number }
  ): Column<MySqlBinary, true, false, this> {
    return new Column(this, name, new MySqlBinary(params.size));
  }

  protected _varbinary(
    name: string,
    params: { size: number }
  ): Column<MySqlVarBinary, true, false, this> {
    return new Column(this, name, new MySqlVarBinary(params.size));
  }

  protected _tinytext(name: string): Column<MySqlTinyText, true, false, this> {
    return new Column(this, name, new MySqlTinyText());
  }

  protected _text(
    name: string,
    params: { size?: number }
  ): Column<MySqlText, true, false, this> {
    return new Column(this, name, new MySqlText(params.size));
  }

  protected _mediumtext(
    name: string
  ): Column<MySqlMediumText, true, false, this> {
    return new Column(this, name, new MySqlMediumText());
  }

  protected _longtext(name: string): Column<MySqlLongText, true, false, this> {
    return new Column(this, name, new MySqlLongText());
  }

  protected _enum<ETtype extends string>(
    typeEnum: Enum<ETtype>,
    name: string
  ): Column<MySqlEnum<ExtractEnumValues<Enum<ETtype>>>, true, false, this> {
    const mySqlEnum = new MySqlEnum<ExtractEnumValues<typeof typeEnum>>(
      typeEnum.name
    );
    return new Column(this, name, mySqlEnum);
  }

  protected _date(name: string): Column<MySqlDate, true, false, this> {
    return new Column(this, name, new MySqlDate());
  }

  protected _datetime(name: string): Column<MySqlDateTime, true, false, this> {
    return new Column(this, name, new MySqlDateTime());
  }

  protected _timestamp(
    name: string,
    params: { fsp: number }
  ): Column<MySqlTimestamp, true, false, this> {
    return new Column(this, name, new MySqlTimestamp(params.fsp));
  }

  protected _time(name: string): Column<MySqlTime, true, false, this> {
    return new Column(this, name, new MySqlTime());
  }
}
