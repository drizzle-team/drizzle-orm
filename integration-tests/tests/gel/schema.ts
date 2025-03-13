import { sql } from 'drizzle-orm';
import { gelTable, integer, text, timestamptz, uuid } from 'drizzle-orm/gel-core';
import 'zx';

$.quiet = true;

export const rqbUser = gelTable('user_rqb_test', {
	_id: uuid('id').primaryKey().default(sql`uuid_generate_v4()`),
	id: integer('custom_id').unique().notNull(),
	name: text().notNull(),
	createdAt: timestamptz('created_at').notNull(),
});

export const rqbPost = gelTable('post_rqb_test', {
	_id: uuid('id').primaryKey().default(sql`uuid_generate_v4()`),
	id: integer('custom_id').unique().notNull(),
	userId: integer('user_id').notNull(),
	content: text(),
	createdAt: timestamptz('created_at').notNull(),
});

export const init = async (tlsSecurity: string, dsn: string) => {
	await $`gel query "CREATE TYPE default::user_rqb_test {
        create property custom_id: int32 {
            create constraint exclusive;
        };
        create property name: str;
  		create required property created_at -> datetime;
    };" --tls-security=${tlsSecurity} --dsn=${dsn}`;
	await $`gel query "CREATE TYPE default::post_rqb_test {
        create property custom_id: int32 {
            create constraint exclusive;
        };
        create required property user_id: int32;
        create property content: str;
  		create required property created_at -> datetime;
    };" --tls-security=${tlsSecurity} --dsn=${dsn}`;
};

export const clear = async (tlsSecurity: string, dsn: string) => {
	await $`gel query "DELETE default::user_rqb_test" --tls-security=${tlsSecurity} --dsn=${dsn}`;
	await $`gel query "DELETE default::post_rqb_test" --tls-security=${tlsSecurity} --dsn=${dsn}`;
	await $`gel query "DROP TYPE default::user_rqb_test" --tls-security=${tlsSecurity} --dsn=${dsn}`;
	await $`gel query "DROP TYPE default::post_rqb_test" --tls-security=${tlsSecurity} --dsn=${dsn}`;
};
