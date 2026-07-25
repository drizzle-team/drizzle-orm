import { entityKind } from '~/entity.ts';
import type { ColumnsSelection } from '~/sql/sql.ts';
import { View } from '~/sql/sql.ts';

export abstract class FirebirdViewBase<
	TName extends string = string,
	TExisting extends boolean = boolean,
	TSelection extends ColumnsSelection = ColumnsSelection,
> extends View<TName, TExisting, TSelection> {
	static override readonly [entityKind]: string = 'FirebirdViewBase';

	declare _: View<TName, TExisting, TSelection>['_'] & {
		viewBrand: 'FirebirdView';
	};
}
