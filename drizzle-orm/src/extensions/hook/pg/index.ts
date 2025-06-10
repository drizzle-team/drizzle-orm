import { entityKind } from '~/entity.ts';
import { extensionName } from '~/extension-core/index.ts';
import { DrizzlePgExtension, type DrizzlePgHookContext } from '~/extension-core/pg/index.ts';

export class DrizzlePgHookExtension<TContextMeta = unknown> extends DrizzlePgExtension<TContextMeta> {
	static override readonly [entityKind]: string = 'DrizzlePgHookExtension';

	static override readonly [extensionName] = 'Drizzle PostgreSQL Hook';

	constructor(private hookCallback: (context: DrizzlePgHookContext<TContextMeta>) => Promise<void> | void) {
		super();
	}

	override hook(context: DrizzlePgHookContext<TContextMeta>): Promise<void> | void {
		return this.hookCallback(context);
	}
}

export function hook<TContextMeta = unknown>(
	hookCallback: (context: DrizzlePgHookContext<TContextMeta>) => Promise<void> | void,
): DrizzlePgHookExtension<TContextMeta> {
	return new DrizzlePgHookExtension(hookCallback);
}
