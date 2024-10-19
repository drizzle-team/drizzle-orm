import { entityKind } from '~/entity.ts';
import type { ColumnsSelection } from '~/sql/sql.ts';
import { View } from '~/sql/sql.ts';

export abstract class MySqlViewBase<
	TName extends string = string,
	TExisting extends boolean = boolean,
	TSelectedFields extends ColumnsSelection = ColumnsSelection,
> extends View<TName, TExisting, TSelectedFields> {
	static override readonly [entityKind]: string = 'MySqlViewBase';

	declare readonly _: View<TName, TExisting, TSelectedFields>['_'] & {
		readonly viewBrand: 'MySqlViewBase';
	};
}
