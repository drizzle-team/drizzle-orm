import type { Equal } from 'type-tests/utils.ts';
import { Expect } from 'type-tests/utils.ts';
import { gelTable, integer, text } from '~/gel-core/index.ts';
import { gt, inArray, like } from '~/sql/expressions/index.ts';
import { sql } from '~/sql/sql.ts';
import { db } from './db.ts';

const orders = gelTable('orders', {
	id: integer('id').primaryKey(),
	region: text('region').notNull(),
	product: text('product').notNull(),
	amount: integer('amount').notNull(),
	quantity: integer('quantity').notNull(),
	generated: text('generatedText').generatedAlwaysAs(sql``),
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
