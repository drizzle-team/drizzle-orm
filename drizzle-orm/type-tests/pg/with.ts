import type { Equal } from 'type-tests/utils.ts';
import { Expect } from 'type-tests/utils.ts';
import { gt, inArray } from '~/expressions.ts';
import { integer, pgTable, serial, text } from '~/pg-core/index.ts';
import { sql } from '~/sql/sql.ts';
import { db } from './db.ts';

const orders = pgTable('orders', {
	id: serial('id').primaryKey(),
	region: text('region').notNull(),
	product: text('product').notNull(),
	amount: integer('amount').notNull(),
	quantity: integer('quantity').notNull(),
});

{
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
}
