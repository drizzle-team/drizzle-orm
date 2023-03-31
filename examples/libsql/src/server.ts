import 'dotenv/config';

import { zValidator } from '@hono/zod-validator';
import { createClient } from '@libsql/client';
import { eq } from 'drizzle-orm/expressions';
import { drizzle } from 'drizzle-orm/libsql';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { type z } from 'zod';
import { DATABASE_AUTH_TOKEN, DATABASE_URL } from './env';
import { insertPostSchema, insertUserSchema, posts, selectPostSchema, selectUserSchema, users } from './schema';
import { aggregateOneToMany } from './utils';

const client = createClient({ url: DATABASE_URL, authToken: DATABASE_AUTH_TOKEN });
export const db = drizzle(client);

export const app = new Hono();

app.onError((err, ctx) => {
	if ('format' in err) {
		console.error(JSON.stringify((err as z.ZodError).format(), undefined, 2));
	} else {
		console.error(err);
	}
	return ctx.json({ error: 'Internal Server Error' }, 500);
});

app.use('*', cors());

const listUsersResponse = selectUserSchema.array();

app.get('/users', async (ctx) => {
	const allUsers = await db.select().from(users).all();
	return ctx.json(listUsersResponse.parse(allUsers));
});

const insertUserRequest = insertUserSchema.pick({
	name: true,
	email: true,
});
const insertUserResponse = selectUserSchema;

app.post('/users', zValidator('json', insertUserRequest), async (ctx) => {
	const data = ctx.req.valid('json');
	const user = await db.insert(users).values(data).returning().get();
	return ctx.json(insertUserResponse.parse(user));
});

const updateUserRequest = insertUserRequest.partial();
const updateUserResponse = selectUserSchema;

app.patch('/users/:id', zValidator('json', updateUserRequest), async (ctx) => {
	const data = ctx.req.valid('json');
	const user = await db
		.update(users)
		.set(data)
		.where(eq(users.id, +ctx.req.param('id')))
		.returning()
		.get();
	return ctx.json(updateUserResponse.parse(user));
});

const getUserResponse = selectUserSchema.extend({
	posts: selectPostSchema.array(),
});

app.get('/users/:id', async (ctx) => {
	const user = await db
		.select()
		.from(users)
		.where(eq(users.id, +ctx.req.param('id')))
		.leftJoin(posts, eq(users.id, posts.authorId))
		.all()
		.then((rows) => aggregateOneToMany(rows, 'users', 'posts')[0]);

	if (!user) return ctx.json({ error: 'User not found' }, 404);

	return ctx.json(getUserResponse.parse(user));
});

const deleteUserResponse = selectUserSchema.pick({ id: true });

app.delete('/users/:id', async (ctx) => {
	const user = await db
		.delete(users)
		.where(eq(users.id, +ctx.req.param('id')))
		.returning({ id: users.id })
		.get();
	return ctx.json(deleteUserResponse.parse(user));
});

const listPostsResponse = selectPostSchema.array();

app.get('/posts', async (ctx) => {
	const allPosts = await db.select().from(posts).all();
	return ctx.json(listPostsResponse.parse(allPosts));
});

app.get('/users/:id/posts', async (ctx) => {
	const allPosts = await db.select().from(posts).where(eq(posts.authorId, +ctx.req.param('id'))).all();
	return ctx.json(listPostsResponse.parse(allPosts));
});

const insertPostRequest = insertPostSchema.pick({
	title: true,
	body: true,
	authorId: true,
});
const insertPostResponse = selectPostSchema;

app.post('/posts', zValidator('json', insertPostRequest), async (ctx) => {
	const data = ctx.req.valid('json');
	const post = await db.insert(posts).values(data).returning().get();
	return ctx.json(insertPostResponse.parse(post));
});

const updatePostRequest = insertPostRequest.pick({ title: true, body: true }).partial();
const updatePostResponse = selectPostSchema;

app.patch('/posts/:id', zValidator('json', updatePostRequest), async (ctx) => {
	const data = ctx.req.valid('json');
	const post = await db
		.update(posts)
		.set(data)
		.where(eq(posts.id, +ctx.req.param('id')))
		.returning()
		.get();
	return ctx.json(updatePostResponse.parse(post));
});

const getPostResponse = selectPostSchema;

app.get('/posts/:id', async (ctx) => {
	const post = await db
		.select()
		.from(posts)
		.where(eq(posts.id, +ctx.req.param('id')))
		.get();
	return ctx.json(getPostResponse.parse(post));
});

const deletePostResponse = selectPostSchema.pick({ id: true });

app.delete('/posts/:id', async (ctx) => {
	const post = await db
		.delete(posts)
		.where(eq(posts.id, +ctx.req.param('id')))
		.returning({ id: posts.id })
		.get();
	return ctx.json(deletePostResponse.parse(post));
});
