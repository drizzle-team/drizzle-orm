import { entityKind } from '~/entity.ts';

export const requiredExtension = Symbol.for('drizzle:ExtensionColumnRequiredExtension');
export const extensionColumnConfig = Symbol.for('drizzle:ExtensionColumnConfig');
export const extensionName = Symbol.for('drizzle:ExtensionName');

export abstract class DrizzleExtension<TContext extends Record<string, unknown> = Record<string, unknown>> {
	static readonly [entityKind]: string = 'DrizzleExtension';
	static readonly [extensionName]: string = 'Abstract Drizzle Extension';

	abstract hook(context: TContext): Promise<void> | void;
}
