import { entityKind } from '~/entity.ts';
import type { ColumnsSelection } from '~/sql/sql.ts';
import { View } from '~/sql/sql.ts';

export abstract class SingleStoreViewBase<
	TName extends string = string,
	TExisting extends boolean = boolean,
	TSelectedFields extends ColumnsSelection = ColumnsSelection,
> extends View<TName, TExisting, TSelectedFields> {
	static override readonly [entityKind]: string = 'SingleStoreViewBase';

	declare readonly _: View<TName, TExisting, TSelectedFields>['_'] & {
		readonly viewBrand: 'SingleStoreViewBase';
	};
}
