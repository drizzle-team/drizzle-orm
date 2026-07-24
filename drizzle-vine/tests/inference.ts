/**
 * Type-inference playground for drizzle-vine.
 *
 * Each public type is verified at compile-time with Expect<Equal<>>.
 * Run `tsc --noEmit` (or check your IDE) to confirm the inferred types.
 */
import vine from '@vinejs/vine';
import type { Infer } from '@vinejs/vine/types';
import type { Equal } from 'drizzle-orm';
import { jsonb, pgEnum, pgTable, serial, text, uuid, varchar } from 'drizzle-orm/pg-core';
import { createInsertSchema, createSelectSchema, createUpdateSchema } from '../src';
import { Expect } from './utils.ts';

// ──────────────────────────────────────────────────────────────────
// 1. Simple table — select / insert / update
// ──────────────────────────────────────────────────────────────────

const users = pgTable('users', {
	id: serial().primaryKey(),
	name: text().notNull(),
	email: varchar({ length: 255 }).notNull(),
	bio: text(), // nullable
});

const selectUserSchema = createSelectSchema(users);
const insertUserSchema = createInsertSchema(users);
const updateUserSchema = createUpdateSchema(users);

type SelectUser = Infer<typeof selectUserSchema>;
Expect<Equal<SelectUser, { id: number; name: string; email: string; bio: string | null }>>();

// serial() is notNull + hasDefault → id is required-key-with-union (number | undefined)
type InsertUser = Infer<typeof insertUserSchema>;
Expect<Equal<InsertUser, { id: number | undefined; name: string; email: string; bio: string | null | undefined }>>();

type UpdateUser = Infer<typeof updateUserSchema>;
Expect<
	Equal<
		UpdateUser,
		{ id: number | undefined; name: string | undefined; email: string | undefined; bio: string | null | undefined }
	>
>();

// ──────────────────────────────────────────────────────────────────
// 2. Enum column + JSON $type<T>()
// ──────────────────────────────────────────────────────────────────

const roleEnum = pgEnum('role', ['admin', 'editor', 'viewer']);

interface PostMeta {
	views: number;
	featured: boolean;
}

const posts = pgTable('posts', {
	id: uuid().primaryKey().defaultRandom(),
	title: varchar({ length: 200 }).notNull(),
	role: roleEnum().notNull(),
	publishedAt: text(), // nullable
	meta: jsonb().$type<PostMeta>().notNull(), // typed JSON, notNull
	tags: jsonb().$type<string[]>(), // typed JSON, nullable
});

const selectPostSchema = createSelectSchema(posts);
const insertPostSchema = createInsertSchema(posts);

type SelectPost = Infer<typeof selectPostSchema>;
Expect<
	Equal<SelectPost, {
		id: string;
		title: string;
		role: 'admin' | 'editor' | 'viewer';
		publishedAt: string | null;
		meta: PostMeta;
		tags: string[] | null;
	}>
>();

type InsertPost = Infer<typeof insertPostSchema>;
// id has defaultRandom() → number | undefined; tags is nullable → string[] | null | undefined
Expect<
	Equal<InsertPost, {
		id: string | undefined;
		title: string;
		role: 'admin' | 'editor' | 'viewer';
		publishedAt: string | null | undefined;
		meta: PostMeta;
		tags: string[] | null | undefined;
	}>
>();

// ──────────────────────────────────────────────────────────────────
// 3. Refinement — extra constraints at the VineJS level
// ──────────────────────────────────────────────────────────────────

const insertUserRefined = createInsertSchema(users, {
	name: (schema) => schema.minLength(2).maxLength(100),
	email: (schema) => schema.email(),
});

type InsertUserRefined = Infer<typeof insertUserRefined>;
// Refinements narrow runtime behaviour; the TS output shape stays the same
Expect<Equal<InsertUserRefined, InsertUser>>();

// ──────────────────────────────────────────────────────────────────
// 4. Compile and validate (runtime)
// ──────────────────────────────────────────────────────────────────

async function demo() {
	const insertValidator = vine.compile(insertUserRefined);

	const output = await insertValidator.validate({
		name: 'Alice',
		email: 'alice@example.com',
	});

	// Verify output types at compile time
	Expect<Equal<typeof output.name, string>>();
	Expect<Equal<typeof output.email, string>>();
	Expect<Equal<typeof output.bio, string | null | undefined>>();
}

// Suppress unused-variable warnings
void demo;
void selectUserSchema;
void updateUserSchema;
void insertPostSchema;
void selectPostSchema;

export type { InsertPost, InsertUser, InsertUserRefined, SelectPost, SelectUser, UpdateUser };
