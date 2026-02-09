import { entityKind } from '~/entity.ts';
import { type ColumnsSelection, View } from '~/sql/sql.ts';

export abstract class DSQLViewBase<
	TName extends string = string,
	TExisting extends boolean = boolean,
	TSelectedFields extends ColumnsSelection = ColumnsSelection,
> extends View<TName, TExisting, TSelectedFields> {
	static override readonly [entityKind]: string = 'DSQLViewBase';

	declare readonly _: View<TName, TExisting, TSelectedFields>['_'] & {
		readonly viewBrand: 'DSQLViewBase';
	};
}
