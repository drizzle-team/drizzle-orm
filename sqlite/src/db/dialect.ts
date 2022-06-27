import { ISession } from "drizzle-orm/";
import { Database } from "sqlite3";
import { SqliteConfig } from "./config";

export class SqliteDialect extends ISession {
    private db: Database;

    constructor(private sqliteConfig: SqliteConfig) {
        super();
        this.db = new Database(sqliteConfig.filename);
    }

    private async promiseCall(query: string, values?: Array<any>): Promise<any[]> {
        return new Promise((resolve, reject) => {
            this.db.all(query, values,
                function (e, rows) {
                    if (e) reject(e);
                    else resolve(rows);
                }
            );
        });
    }

    protected async _execute(query: string, values?: Array<any>): Promise<any> {
        const rows = await this.promiseCall(query, values);
        return { rows };
    }
    
    parametrized(num: number): string {
        return '?'
    }

    async closeConnection(): Promise<void> {
        return new Promise((resolve, reject) => {
            if (!this.db) resolve();
            else {
                this.db.close(
                    function (err) {
                        if (err) reject(err);
                        else resolve();
                    }
                );
            }
        });
    }
}