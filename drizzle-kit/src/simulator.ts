declare global {
	interface Array<T> {
		exactlyOne(): T;
	}
}

Array.prototype.exactlyOne = function() {
	if (this.length !== 1) {
		return undefined;
	}
	return this[0];
};

interface TablesHandler<T extends Named> {
	can(added: T[], removed: T[]): boolean;
	handle(added: T[], removed: T[]): { created: T[]; deleted: T[]; renamed: { from: T; to: T }[] };
}

interface ColumnsHandler<T extends Named> {
	can(tableName: string, added: T[], removed: T[]): boolean;
	handle(
		tableName: string,
		added: T[],
		removed: T[],
	): { tableName: string; created: T[]; deleted: T[]; renamed: { from: T; to: T }[] };
}

class DryRun<T extends Named> implements TablesHandler<T> {
	can(added: T[], removed: T[]): boolean {
		return added.length === 0 && removed.length === 0;
	}
	handle(added: T[], _: T[]): { created: T[]; deleted: T[]; renamed: { from: T; to: T }[] } {
		return { created: added, deleted: [], renamed: [] };
	}
}

// class Fallback implements Handler {
//     can(_: Table[], __: Table[]): boolean {
//         return true
//     }
//     handle(added: Table[], _: Table[]): { created: Table[]; deleted: Table[]; renamed: { from: Table; to: Table; }[]; } {
//         return { created: added, deleted: , renamed: [] }
//     }
// }

class Case1<T extends Named> implements TablesHandler<T> {
	can(_: T[], removed: T[]): boolean {
		return removed.length === 1 && removed[0].name === 'citiess';
	}

	handle(added: T[], removed: T[]): { created: T[]; deleted: T[]; renamed: { from: T; to: T }[] } {
		return { created: added, deleted: removed, renamed: [] };
	}
}
class Case2<T extends Named> implements TablesHandler<T> {
	// authOtp, deleted, users -> authOtp renamed, cities added, deleted deleted
	can(_: T[], removed: T[]): boolean {
		return removed.length === 3 && removed[0].name === 'auth_otp';
	}

	handle(added: T[], removed: T[]): { created: T[]; deleted: T[]; renamed: { from: T; to: T }[] } {
		return { created: added.slice(1), deleted: removed.slice(1), renamed: [{ from: removed[0], to: added[0] }] };
	}
}

type Named = { name: string };

const handlers: TablesHandler<any>[] = [];
handlers.push(new Case1());
handlers.push(new Case2());
handlers.push(new DryRun());

export const resolveTables = <T extends Named>(added: T[], removed: T[]) => {
	const handler = handlers.filter((it) => {
		return it.can(added, removed);
	}).exactlyOne();

	if (!handler) {
		console.log('added', added.map((it) => it.name).join());
		console.log('removed', removed.map((it) => it.name).join());
		throw new Error('No handler');
	}

	console.log(`Simluated by ${handler.constructor.name}`);
	return handler.handle(added, removed);
};
class LehaColumnsHandler<T extends Named> implements ColumnsHandler<T> {
	can(tableName: string, _: T[], __: T[]): boolean {
		return tableName === 'users';
	}

	handle(
		tableName: string,
		added: T[],
		removed: T[],
	): { tableName: string; created: T[]; deleted: T[]; renamed: { from: T; to: T }[] } {
		return { tableName, created: [], deleted: [], renamed: [{ from: removed[0], to: added[0] }] };
	}
}

class DryRunColumnsHandler<T extends Named> implements ColumnsHandler<T> {
	can(tableName: string, _: T[], __: T[]): boolean {
		return true;
	}

	handle(
		tableName: string,
		added: T[],
		removed: T[],
	): { tableName: string; created: T[]; deleted: T[]; renamed: { from: T; to: T }[] } {
		return { tableName, created: added, deleted: removed, renamed: [] };
	}
}

class V1V2AuthOtpColumnsHandler<T extends Named> implements ColumnsHandler<T> {
	can(tableName: string, _: T[], __: T[]): boolean {
		return tableName === 'auth_otp';
	}

	handle(
		tableName: string,
		added: T[],
		removed: T[],
	): { tableName: string; created: T[]; deleted: T[]; renamed: { from: T; to: T }[] } {
		const phonePrev = removed.filter((it) => it.name === 'phone')[0];
		const phoneNew = added.filter((it) => it.name === 'phone1')[0];

		const newAdded = added.filter((it) => it.name !== 'phone1');
		const newRemoved = removed.filter((it) => it.name !== 'phone');

		return { tableName, created: newAdded, deleted: newRemoved, renamed: [{ from: phonePrev, to: phoneNew }] };
	}

	// handle(tableName:string, added: T[], _: T[]): { created: T[]; deleted: T[]; renamed: { from: T; to: T; }[]; } {
	//     return { created: added, deleted: [], renamed: [] }
	// }
}

const columnsHandlers: ColumnsHandler<any>[] = [];
columnsHandlers.push(new V1V2AuthOtpColumnsHandler());
columnsHandlers.push(new LehaColumnsHandler());
columnsHandlers.push(new DryRunColumnsHandler());

export const resolveColumns = <T extends Named>(tableName: string, added: T[], removed: T[]) => {
	const handler = columnsHandlers.filter((it) => {
		return it.can(tableName, added, removed);
	})[0];

	if (!handler) {
		console.log('added', added.map((it) => it.name).join());
		console.log('removed', removed.map((it) => it.name).join());
		throw new Error('No columns handler for table: ' + tableName);
	}

	console.log(`${tableName} columns simluated by ${handler.constructor.name}`);
	return handler.handle(tableName, added, removed);
};
