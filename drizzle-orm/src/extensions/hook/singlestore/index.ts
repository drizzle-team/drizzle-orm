import { entityKind } from '~/entity.ts';
import { extensionName } from '~/extension-core/index.ts';
import { DrizzleSingleStoreExtension, type DrizzleSingleStoreHookContext } from '~/extension-core/singlestore/index.ts';

export class DrizzleSingleStoreHookExtension<TContextMeta = unknown> extends DrizzleSingleStoreExtension<TContextMeta> {
	static override readonly [entityKind]: string = 'DrizzleSingleStoreHookExtension';

	static override readonly [extensionName] = 'Drizzle SingleStore Hook';

	constructor(private hookCallback: (context: DrizzleSingleStoreHookContext<TContextMeta>) => Promise<void> | void) {
		super();
	}

	override hook(context: DrizzleSingleStoreHookContext<TContextMeta>): Promise<void> | void {
		return this.hookCallback(context);
	}
}

export function hook<TContextMeta = unknown>(
	hookCallback: (context: DrizzleSingleStoreHookContext<TContextMeta>) => Promise<void> | void,
): DrizzleSingleStoreHookExtension<TContextMeta> {
	return new DrizzleSingleStoreHookExtension(hookCallback);
}
