import { entityKind } from '~/entity.ts';
import { View, type ViewConfig } from '~/view.ts';

export abstract class SingleStoreViewBase<T extends ViewConfig = ViewConfig> extends View<T> {
	static override readonly [entityKind]: string = 'SingleStoreViewBase';

	declare readonly _: View<T>['_'] & {
		readonly viewBrand: 'SingleStoreViewBase';
	};
}
