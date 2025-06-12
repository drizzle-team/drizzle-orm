import { entityKind } from '~/entity.ts';
import { DrizzleGelExtension, type DrizzleGelHookContext } from '~/extension-core/gel/index.ts';
import { extensionName } from '~/extension-core/index.ts';

export class DrizzleGelHookExtension<TContextMeta = unknown> extends DrizzleGelExtension<TContextMeta> {
	static override readonly [entityKind]: string = 'DrizzleGelHookExtension';

	static override readonly [extensionName] = 'Drizzle Gel Hook';

	constructor(private hookCallback: (context: DrizzleGelHookContext<TContextMeta>) => Promise<void> | void) {
		super();
	}

	override hook(context: DrizzleGelHookContext<TContextMeta>): Promise<void> | void {
		return this.hookCallback(context);
	}
}

export function hook<TContextMeta = unknown>(
	hookCallback: (context: DrizzleGelHookContext<TContextMeta>) => Promise<void> | void,
): DrizzleGelHookExtension<TContextMeta> {
	return new DrizzleGelHookExtension(hookCallback);
}
