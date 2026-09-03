import { entityKind } from '~/entity.ts';
import { View, type ViewConfig } from '~/view.ts';

export abstract class MySqlViewBase<T extends ViewConfig = ViewConfig> extends View<T> {
	static override readonly [entityKind]: string = 'MySqlViewBase';

	declare readonly _: View<T>['_'] & {
		readonly viewBrand: 'MySqlViewBase';
	};
}
