import * as drizzle from "drizzle-orm";
import Session from "drizzle-orm/db/session";
import MigrationSerializer from "drizzle-orm/serializer/serializer";
import Enum from "drizzle-orm/types/type";
import * as pg from "pg";
import * as i0 from "/Users/alexblokh/Development/drizzle-orm/kit/tests/alters/suite1/from";
const db = new drizzle.DB(new Session(new pg.Pool()));
const serializer = new MigrationSerializer();
const testFun = () => {
    const tables: drizzle.AbstractTable<any>[] = [];
    const enums: Enum<any>[] = [];
    const i0values = Object.values(i0);
    i0values.forEach(t => {
        if (t instanceof Enum) {
            enums.push(t);
            return;
        }
        if (typeof t === "function" && t.prototype && t.prototype.constructor) {
            const instance = new t(db);
            if (instance instanceof drizzle.AbstractTable) {
                tables.push(instance as unknown as drizzle.AbstractTable<any>);
            }
        }
    });
    return serializer.generate(tables, enums);
};
testFun();
