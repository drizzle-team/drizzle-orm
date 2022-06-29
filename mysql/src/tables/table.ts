import { AbstractTable, Column, DB } from "drizzle-orm/";
import {
  MySqlInt,
  MySqlMediumInt,
  MySqlSmallInt,
  MySqlBigInt53,
  MySqlBigInt64
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
}
