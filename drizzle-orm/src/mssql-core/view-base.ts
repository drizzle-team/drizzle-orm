import { entityKind } from '~/entity.ts';
import { View, type ViewConfig } from '~/view.ts';

export abstract class MsSqlViewBase<T extends ViewConfig = ViewConfig> extends View<T> {
	static override readonly [entityKind]: string = 'MsSqlViewBase';

	declare readonly _: View<T>['_'] & {
		readonly viewBrand: 'MsSqlViewBase';
	};
}
