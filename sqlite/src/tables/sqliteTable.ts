import { AbstractTable, Column, DB, EmptyPartial, ISession } from "drizzle-orm/";
import BaseLogger from "drizzle-orm/logger/abstractLogger";
import SqliteInt from "../columns/types/sqliteInt";

export default abstract class SqliteTable<TTable extends AbstractTable<TTable>> extends AbstractTable<TTable>{
  public constructor(db: DB) {
    super(db);
    this._session = db.session();
    this._logger = db.logger();
  }

  protected _int(name: string): Column<SqliteInt, true, false, this> {
    return new Column(this, name, new SqliteInt());
  }
}