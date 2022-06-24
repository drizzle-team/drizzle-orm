import { InferType } from "drizzle-orm/tables/inferTypes";
import SqliteTable from "../tables/sqliteTable";

export class UsersTable extends SqliteTable<UsersTable> {
    public id = this._int('id');

    tableName(): string {
        return 'users'
    }
}

type sqliteUser = InferType<UsersTable>;