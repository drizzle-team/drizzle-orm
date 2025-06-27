import { entityKind } from '~/entity.ts';
import { extensionName } from '~/extension-core/index.ts';
import { DrizzleMySqlExtension, type DrizzleMySqlHookContext } from '~/extension-core/mysql/index.ts';

export class DrizzleMySqlHookExtension<TContextMeta = unknown> extends DrizzleMySqlExtension<TContextMeta> {
	static override readonly [entityKind]: string = 'DrizzleMySqlHookExtension';

	static override readonly [extensionName] = 'Drizzle MySql Hook';

	constructor(private hookCallback: (context: DrizzleMySqlHookContext<TContextMeta>) => Promise<void> | void) {
		super();
	}

	override hook(context: DrizzleMySqlHookContext<TContextMeta>): Promise<void> | void {
		return this.hookCallback(context);
	}
}

export function hook<TContextMeta = unknown>(
	hookCallback: (context: DrizzleMySqlHookContext<TContextMeta>) => Promise<void> | void,
): DrizzleMySqlHookExtension<TContextMeta> {
	return new DrizzleMySqlHookExtension(hookCallback);
}
