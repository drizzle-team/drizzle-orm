import type { Equal } from 'type-tests/utils.ts';
import { Expect } from 'type-tests/utils.ts';
import { int, serial, singlestoreTable, text } from '~/singlestore-core/index.ts';
import { gt, inArray } from '~/sql/expressions/index.ts';
import { sql } from '~/sql/sql.ts';
import { db } from './db.ts';

const orders = singlestoreTable('orders', {
	id: serial('id').primaryKey(),
	region: text('region').notNull(),
	product: text('product').notNull(),
	amount: int('amount').notNull(),
	quantity: int('quantity').notNull(),
	/* generated: text('generatedText').generatedAlwaysAs(sql``), */
});

{
	const regionalSales = db
		.$with('regional_sales')
		.as(
			db
				.select({
					region: orders.region,
					totalSales: sql<number>`sum(${orders.amount})`.as('total_sales'),
				})
				.from(orders)
				.groupBy(orders.region),
		);

	const topRegions = db
		.$with('top_regions')
		.as(
			db
				.select({
					region: orders.region,
					totalSales: orders.amount,
				})
				.from(regionalSales)
				.where(
					gt(
						regionalSales.totalSales,
						db.select({ sales: sql`sum(${regionalSales.totalSales})/10` }).from(regionalSales),
					),
				),
		);

	const result = await db
		.with(regionalSales, topRegions)
		.select({
			region: orders.region,
			product: orders.product,
			productUnits: sql<number>`sum(${orders.quantity})`,
			productSales: sql<number>`sum(${orders.amount})`,
		})
		.from(orders)
		.where(inArray(orders.region, db.select({ region: topRegions.region }).from(topRegions)));

	Expect<
		Equal<{
			region: string;
			product: string;
			productUnits: number;
			productSales: number;
		}[], typeof result>
	>;

	const allOrdersWith = db.$with('all_orders_with').as(db.select().from(orders));
	const allFromWith = await db.with(allOrdersWith).select().from(allOrdersWith);

	Expect<
		Equal<{
			id: number;
			region: string;
			product: string;
			amount: number;
			quantity: number;
			/* generated: string | null; */
		}[], typeof allFromWith>
	>;
}

{
	const providers = singlestoreTable('providers', {
		id: serial().primaryKey(),
		providerName: text().notNull(),
	});

	const sq1 = db.$with('providers_sq', {
		name: providers.providerName,
	}).as(sql`select provider_name as name from providers`);
	const q1 = await db.with(sq1).select().from(sq1);
	Expect<Equal<typeof q1, { name: string }[]>>;

	const sq2 = db.$with('providers_sq', {
		nested: {
			id: providers.id,
		},
	}).as(() => sql`select id from providers`);
	const q2 = await db.with(sq2).select().from(sq2);
	Expect<Equal<typeof q2, { nested: { id: number } }[]>>;

	// @ts-expect-error
	db.$with('providers_sq', { name: providers.providerName }).as(db.select().from(providers));
	// @ts-expect-error
	db.$with('providers_sq', { name: providers.providerName }).as((qb) => qb.select().from(providers));
}
