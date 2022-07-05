import { InferType } from "drizzle-orm/tables/inferTypes";
import MySqlTable from "../tables/table";

export class UsersTable extends MySqlTable<UsersTable> {
  public id = this._int("id");
  public date = this._date("date");
  public datetime = this._datetime("datetime");
  public timestamp = this._timestamp("timestamp", { fsp: 3 });

  tableName(): string {
    return "users";
  }
}

type mySqlUser = InferType<UsersTable>;
