import { entityKind } from '~/entity.ts';
import { extensionName } from '~/extension-core/index.ts';
import { DrizzleSQLiteExtension, type DrizzleSQLiteHookContext } from '~/extension-core/sqlite/index.ts';

export class DrizzleSQLiteHookExtension<TContextMeta = unknown> extends DrizzleSQLiteExtension<TContextMeta> {
	static override readonly [entityKind]: string = 'DrizzleSQLiteHookExtension';

	static override readonly [extensionName] = 'Drizzle SQLite Hook';

	constructor(private hookCallback: (context: DrizzleSQLiteHookContext<TContextMeta>) => Promise<void> | void) {
		super();
	}

	override hook(context: DrizzleSQLiteHookContext<TContextMeta>): Promise<void> | void {
		return this.hookCallback(context);
	}
}

export function hook<TContextMeta = unknown>(
	hookCallback: (context: DrizzleSQLiteHookContext<TContextMeta>) => Promise<void> | void,
): DrizzleSQLiteHookExtension<TContextMeta> {
	return new DrizzleSQLiteHookExtension(hookCallback);
}
