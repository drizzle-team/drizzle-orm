import type { Equal } from 'type-tests/utils.ts';
import { Expect } from 'type-tests/utils.ts';
import { cockroachTable, int4, text } from '~/cockroach-core/index.ts';
import { gt, inArray, like } from '~/sql/expressions/index.ts';
import { sql } from '~/sql/sql.ts';
import { db } from './db.ts';

{
	const orders = cockroachTable('orders', {
		id: int4('id').primaryKey().generatedAlwaysAsIdentity(),
		region: text('region').notNull(),
		product: text('product').notNull(),
		amount: int4('amount').notNull(),
		quantity: int4('quantity').notNull(),
		generated: text('generatedText').generatedAlwaysAs(sql``),
	});

	const regionalSales = db
		.$with('regional_sales')
		.as((qb) =>
			qb
				.select({
					region: orders.region,
					totalSales: sql<number>`sum(${orders.amount})`.as('total_sales'),
				})
				.from(orders)
				.groupBy(orders.region)
		);

	const topRegions = db
		.$with('top_regions')
		.as((qb) =>
			qb
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
				)
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
			generated: string | null;
		}[], typeof allFromWith>
	>;

	const regionalSalesWith = db.$with('regional_sales_with').as(db.select().from(regionalSales));
	db.with(regionalSalesWith).select().from(regionalSalesWith).where(like(regionalSalesWith.totalSales, 'abc'));
}

{
	const providers = cockroachTable('providers', {
		id: int4().primaryKey().generatedAlwaysAsIdentity(),
		providerName: text().notNull(),
	});
	const products = cockroachTable('products', {
		id: int4().primaryKey().generatedAlwaysAsIdentity(),
		productName: text().notNull(),
	});

	const sq1 = db.$with('inserted_products').as(
		db.insert(products).values({ productName: sql`` }),
	);
	const sq2 = db.$with('inserted_products').as(
		db.insert(products).values({ productName: sql`` }).returning(),
	);
	const sq3 = db.$with('inserted_products').as(
		db.insert(products).values({ productName: sql`` }).returning({ productName: products.productName }),
	);

	// @ts-expect-error
	db.with(sq1).select().from(sq1);
	// @ts-expect-error
	db.with(sq1).select().from(providers).leftJoin(sq1, sql``);

	const q3 = await db.with(sq2).select().from(sq2);
	Expect<
		Equal<typeof q3, {
			id: number;
			productName: string;
		}[]>
	>;
	const q4 = await db.with(sq3).select().from(providers).leftJoin(sq2, sql``);
	Expect<
		Equal<typeof q4, {
			providers: {
				id: number;
				providerName: string;
			};
			inserted_products: {
				id: number;
				productName: string;
			} | null;
		}[]>
	>;

	const q5 = await db.with(sq3).select().from(sq3);
	Expect<Equal<typeof q5, { productName: string }[]>>;
	const q6 = await db.with(sq3).select().from(providers).leftJoin(sq3, sql``);
	Expect<
		Equal<
			typeof q6,
			{ providers: { id: number; providerName: string }; inserted_products: { productName: string } | null }[]
		>
	>;
}

{
	const providers = cockroachTable('providers', {
		id: int4().primaryKey(),
		providerName: text().notNull(),
	});
	const products = cockroachTable('products', {
		id: int4().primaryKey(),
		productName: text().notNull(),
	});
	const otherProducts = cockroachTable('other_products', {
		id: int4().primaryKey(),
		productName: text().notNull(),
	});

	const sq1 = db.$with('updated_products').as(
		db.update(products).set({ productName: sql`` }),
	);
	const sq2 = db.$with('updated_products').as(
		db.update(products).set({ productName: sql`` }).returning(),
	);
	const sq3 = db.$with('updated_products').as(
		db.update(products).set({ productName: sql`` }).returning({ productName: products.productName }),
	);
	const sq4 = db.$with('updated_products').as(
		db.update(products).set({ productName: sql`` }).from(otherProducts).returning(),
	);

	// @ts-expect-error
	db.with(sq1).select().from(sq1);
	// @ts-expect-error
	db.with(sq1).select().from(providers).leftJoin(sq1, sql``);

	const q3 = await db.with(sq2).select().from(sq2);
	Expect<
		Equal<typeof q3, {
			id: number;
			productName: string;
		}[]>
	>;
	const q4 = await db.with(sq3).select().from(providers).leftJoin(sq2, sql``);
	Expect<
		Equal<typeof q4, {
			providers: {
				id: number;
				providerName: string;
			};
			updated_products: {
				id: number;
				productName: string;
			} | null;
		}[]>
	>;

	const q5 = await db.with(sq3).select().from(sq3);
	Expect<
		Equal<typeof q5, {
			productName: string;
		}[]>
	>;
	const q6 = await db.with(sq3).select().from(providers).leftJoin(sq3, sql``);
	Expect<
		Equal<typeof q6, {
			providers: {
				id: number;
				providerName: string;
			};
			updated_products: {
				productName: string;
			} | null;
		}[]>
	>;

	const q7 = await db.with(sq4).select().from(sq4);
	Expect<
		Equal<typeof q7, {
			products: {
				id: number;
				productName: string;
			};
			other_products: {
				id: number;
				productName: string;
			};
		}[]>
	>;
	const q8 = await db.with(sq4).select().from(providers).leftJoin(sq4, sql``);
	Expect<
		Equal<typeof q8, {
			providers: {
				id: number;
				providerName: string;
			};
			updated_products: {
				products: {
					id: number;
					productName: string;
				};
				other_products: {
					id: number;
					productName: string;
				};
			} | null;
		}[]>
	>;
}

{
	const providers = cockroachTable('providers', {
		id: int4().primaryKey(),
		providerName: text().notNull(),
	});
	const products = cockroachTable('products', {
		id: int4().primaryKey(),
		productName: text().notNull(),
	});

	const sq1 = db.$with('inserted_products').as(
		db.delete(products),
	);
	const sq2 = db.$with('inserted_products').as(
		db.delete(products).returning(),
	);
	const sq3 = db.$with('inserted_products').as(
		db.delete(products).returning({ productName: products.productName }),
	);

	// @ts-expect-error
	db.with(sq1).select().from(sq1);
	// @ts-expect-error
	db.with(sq1).select().from(providers).leftJoin(sq1, sql``);

	const q3 = await db.with(sq2).select().from(sq2);
	Expect<
		Equal<typeof q3, {
			id: number;
			productName: string;
		}[]>
	>;
	const q4 = await db.with(sq3).select().from(providers).leftJoin(sq2, sql``);
	Expect<
		Equal<typeof q4, {
			providers: {
				id: number;
				providerName: string;
			};
			inserted_products: {
				id: number;
				productName: string;
			} | null;
		}[]>
	>;

	const q5 = await db.with(sq3).select().from(sq3);
	Expect<Equal<typeof q5, { productName: string }[]>>;
	const q6 = await db.with(sq3).select().from(providers).leftJoin(sq3, sql``);
	Expect<
		Equal<
			typeof q6,
			{ providers: { id: number; providerName: string }; inserted_products: { productName: string } | null }[]
		>
	>;
}

{
	const providers = cockroachTable('providers', {
		id: int4().primaryKey(),
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
