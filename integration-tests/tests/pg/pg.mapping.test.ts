import 'dotenv/config';
import Docker from 'dockerode';
import { desc, sql } from 'drizzle-orm';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import getPort from 'get-port';
import pg from 'pg';
import { v4 as uuid } from 'uuid';
import { afterAll, beforeAll, beforeEach, expectTypeOf, test } from 'vitest';
import * as schema from './pg.mapping.schema';

const { Client } = pg;

const ENABLE_LOGGING = false;

/*
	Test cases:
	- querying nested relation without PK with additional fields
*/

let pgContainer: Docker.Container;
let db: NodePgDatabase<typeof schema>;
let client: pg.Client;

async function createDockerDB(): Promise<string> {
	const docker = new Docker();
	const port = await getPort({ port: 5432 });
	const image = 'postgres:14';

	const pullStream = await docker.pull(image);
	await new Promise((resolve, reject) =>
		docker.modem.followProgress(pullStream, (err) => err ? reject(err) : resolve(err))
	);

	pgContainer = await docker.createContainer({
		Image: image,
		Env: [
			'POSTGRES_PASSWORD=postgres',
			'POSTGRES_USER=postgres',
			'POSTGRES_DB=postgres',
		],
		name: `drizzle-integration-tests-${uuid()}`,
		HostConfig: {
			AutoRemove: true,
			PortBindings: {
				'5432/tcp': [{ HostPort: `${port}` }],
			},
		},
	});

	await pgContainer.start();

	return `postgres://postgres:postgres@localhost:${port}/postgres`;
}

beforeAll(async () => {
	const connectionString = process.env['PG_CONNECTION_STRING'] ?? (await createDockerDB());

	const sleep = 250;
	let timeLeft = 5000;
	let connected = false;
	let lastError: unknown | undefined;
	do {
		try {
			client = new Client(connectionString);
			await client.connect();
			connected = true;
			break;
		} catch (e) {
			lastError = e;
			await new Promise((resolve) => setTimeout(resolve, sleep));
			timeLeft -= sleep;
		}
	} while (timeLeft > 0);
	if (!connected) {
		console.error('Cannot connect to Postgres');
		await client?.end().catch(console.error);
		await pgContainer?.stop().catch(console.error);
		throw lastError;
	}
	db = drizzle({ client, schema, logger: ENABLE_LOGGING });
});

afterAll(async () => {
	await client?.end().catch(console.error);
	await pgContainer?.stop().catch(console.error);
});

beforeEach(async () => {
	await db.execute(sql`drop schema public cascade`);
	await db.execute(sql`create schema public`);

	await db.execute(
		sql`
			CREATE TABLE IF NOT EXISTS "ingredients" (
			    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
			    "name" text NOT NULL,
			    "description" text,
			    "image_url" text,
			    "in_stock" boolean DEFAULT true
			);

			CREATE TABLE IF NOT EXISTS "menu_item_ingredients" (
			    "menu_item_id" uuid NOT NULL,
			    "ingredient_id" uuid NOT NULL,
			    "order" integer DEFAULT 0
			);

			ALTER TABLE "menu_item_ingredients" ADD CONSTRAINT "menu_item_ingredients_menu_item_id_ingredient_id_order" PRIMARY KEY("menu_item_id","ingredient_id","order");

			CREATE TABLE IF NOT EXISTS "menu_item_modifier_groups" (
			    "menu_item_id" uuid NOT NULL,
			    "modifier_group_id" uuid NOT NULL,
			    "order" integer DEFAULT 0
			);

			ALTER TABLE "menu_item_modifier_groups" ADD CONSTRAINT "menu_item_modifier_groups_menu_item_id_modifier_group_id_order" PRIMARY KEY("menu_item_id","modifier_group_id","order");

			CREATE TABLE IF NOT EXISTS "menu_items" (
			    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL
			);

			CREATE TABLE IF NOT EXISTS "modifier_group_modifiers" (
			    "modifier_group_id" uuid NOT NULL,
			    "modifier_id" uuid NOT NULL,
			    "order" integer DEFAULT 0
			);

			ALTER TABLE "modifier_group_modifiers" ADD CONSTRAINT "modifier_group_modifiers_modifier_group_id_modifier_id_order" PRIMARY KEY("modifier_group_id","modifier_id","order");

			CREATE TABLE IF NOT EXISTS "modifier_groups" (
			    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL
			);

			CREATE TABLE IF NOT EXISTS "modifiers" (
			    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
			    "ingredient_id" uuid,
			    "item_id" uuid
			);

			DO $$ BEGIN
			 ALTER TABLE "menu_item_ingredients" ADD CONSTRAINT "menu_item_ingredients_menu_item_id_menu_items_id_fk" FOREIGN KEY ("menu_item_id") REFERENCES "menu_items"("id") ON DELETE no action ON UPDATE no action;
			EXCEPTION
			 WHEN duplicate_object THEN null;
			END $$;

			DO $$ BEGIN
			 ALTER TABLE "menu_item_ingredients" ADD CONSTRAINT "menu_item_ingredients_ingredient_id_ingredients_id_fk" FOREIGN KEY ("ingredient_id") REFERENCES "ingredients"("id") ON DELETE no action ON UPDATE no action;
			EXCEPTION
			 WHEN duplicate_object THEN null;
			END $$;

			DO $$ BEGIN
			 ALTER TABLE "menu_item_modifier_groups" ADD CONSTRAINT "menu_item_modifier_groups_menu_item_id_menu_items_id_fk" FOREIGN KEY ("menu_item_id") REFERENCES "menu_items"("id") ON DELETE no action ON UPDATE no action;
			EXCEPTION
			 WHEN duplicate_object THEN null;
			END $$;

			DO $$ BEGIN
			 ALTER TABLE "menu_item_modifier_groups" ADD CONSTRAINT "menu_item_modifier_groups_modifier_group_id_modifier_groups_id_fk" FOREIGN KEY ("modifier_group_id") REFERENCES "modifier_groups"("id") ON DELETE no action ON UPDATE no action;
			EXCEPTION
			 WHEN duplicate_object THEN null;
			END $$;

			DO $$ BEGIN
			 ALTER TABLE "modifier_group_modifiers" ADD CONSTRAINT "modifier_group_modifiers_modifier_group_id_modifier_groups_id_fk" FOREIGN KEY ("modifier_group_id") REFERENCES "modifier_groups"("id") ON DELETE no action ON UPDATE no action;
			EXCEPTION
			 WHEN duplicate_object THEN null;
			END $$;

			DO $$ BEGIN
			 ALTER TABLE "modifier_group_modifiers" ADD CONSTRAINT "modifier_group_modifiers_modifier_id_modifiers_id_fk" FOREIGN KEY ("modifier_id") REFERENCES "modifiers"("id") ON DELETE no action ON UPDATE no action;
			EXCEPTION
			 WHEN duplicate_object THEN null;
			END $$;

			DO $$ BEGIN
			 ALTER TABLE "modifiers" ADD CONSTRAINT "modifiers_ingredient_id_ingredients_id_fk" FOREIGN KEY ("ingredient_id") REFERENCES "ingredients"("id") ON DELETE no action ON UPDATE no action;
			EXCEPTION
			 WHEN duplicate_object THEN null;
			END $$;

			DO $$ BEGIN
			 ALTER TABLE "modifiers" ADD CONSTRAINT "modifiers_item_id_menu_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "menu_items"("id") ON DELETE no action ON UPDATE no action;
			EXCEPTION
			 WHEN duplicate_object THEN null;
			END $$;
		`,
	);
});

test('Simple case from GH', async () => {
	const firstMenuItemId = uuid();
	const secondMenuItemId = uuid();

	const firstModGroupsId = uuid();
	const secondModGroupsId = uuid();

	await db.insert(schema.menuItems).values([{ id: firstMenuItemId }, { id: secondMenuItemId }]);
	await db.insert(schema.modifierGroups).values([{ id: firstModGroupsId }, { id: secondModGroupsId }]);
	await db.insert(schema.menuItemModifierGroups).values([{
		modifierGroupId: firstModGroupsId,
		menuItemId: firstMenuItemId,
	}, {
		modifierGroupId: firstModGroupsId,
		menuItemId: secondMenuItemId,
	}, {
		modifierGroupId: secondModGroupsId,
		menuItemId: firstMenuItemId,
	}]);

	const firstIngredientId = uuid();
	const secondIngredientId = uuid();

	await db.insert(schema.ingredients).values([{
		id: firstIngredientId,
		name: 'first',
	}, {
		id: secondIngredientId,
		name: 'second',
	}]);

	const firstModifierId = uuid();
	const secondModifierId = uuid();

	await db.insert(schema.modifiers).values([{
		id: firstModifierId,
		ingredientId: firstIngredientId,
		itemId: firstMenuItemId,
	}, {
		id: secondModifierId,
		ingredientId: secondIngredientId,
		itemId: secondMenuItemId,
	}]);

	await db.insert(schema.modifierGroupModifiers).values([
		{
			modifierGroupId: firstModGroupsId,
			modifierId: firstModifierId,
		},
		{
			modifierGroupId: secondModGroupsId,
			modifierId: secondModifierId,
		},
	]);

	const response = await db._query.menuItems
		.findMany({
			with: {
				modifierGroups: {
					with: {
						modifierGroup: {
							with: {
								modifiers: {
									with: {
										modifier: {
											with: {
												ingredient: true,
												item: true,
											},
										},
									},
									orderBy: desc(schema.modifierGroupModifiers.order),
								},
							},
						},
					},
					orderBy: schema.menuItemModifierGroups.order,
				},
			},
		});

	expectTypeOf(response).toEqualTypeOf<
		{
			id: string;
			modifierGroups: {
				menuItemId: string;
				modifierGroupId: string;
				order: number | null;
				modifierGroup: {
					id: string;
					modifiers: {
						modifierGroupId: string;
						order: number | null;
						modifierId: string;
						modifier: {
							id: string;
							ingredientId: string | null;
							itemId: string | null;
							ingredient: {
								id: string;
								name: string;
								description: string | null;
								imageUrl: string | null;
								inStock: boolean | null;
							} | null;
							item: {
								id: string;
							} | null;
						};
					}[];
				};
			}[];
		}[]
	>();

	// TODO: don't rely on items order
	// expect(response.length).eq(2);
	// expect(response[0]?.modifierGroups.length).eq(1);
	// expect(response[0]?.modifierGroups[0]?.modifierGroup.modifiers.length).eq(1);

	// TODO: add correct IDs
	// expect(response[0]?.modifierGroups[0]?.modifierGroup.modifiers[0]?.modifier.ingredient?.id).eq(
	// 	'0b2b9abc-5975-4a1d-ba3d-6fc3b3149902',
	// );
	// expect(response[0]?.modifierGroups[0]?.modifierGroup.modifiers[0]?.modifier.item?.id).eq(
	// 	'a867133e-60b7-4003-aaa0-deeefad7e518',
	// );
});
