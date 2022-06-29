import { InferType } from "drizzle-orm/tables/inferTypes";
import MySqlTable from "../tables/table";

export class UsersTable extends MySqlTable<UsersTable> {
    public id = this._int('id');

    tableName(): string {
        return 'users'
    }
}

type mySqlUser = InferType<UsersTable>;