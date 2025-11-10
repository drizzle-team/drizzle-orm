import { create, diff } from 'src/dialects/dialect';
import { createDDL as pg } from 'src/dialects/postgres/ddl';
import { beforeEach } from 'vitest';
import { expect, expectTypeOf, test } from 'vitest';

const db = create({
	tables: {},
	columns: {
		table: 'required',
		type: 'string',
		primaryKey: 'boolean',
		notNull: 'boolean',
		autoincrement: 'boolean?',
		default: 'string?',
		generated: {
			type: 'string',
			as: 'string',
		},
	},
	indexes: {
		table: 'required',
		columns: [{
			value: 'string',
			expression: 'boolean',
		}],
		isUnique: 'boolean',
		where: 'string?',
	},
	fks: {
		table: 'required',
		tableFrom: 'string',
		columnsFrom: 'string[]',
		tableTo: 'string',
		columnsTo: 'string[]',
		onUpdate: 'string?',
		onDelete: 'string?',
	},
	pks: {
		table: 'required',
		columns: 'string[]',
	},
	uniques: {
		table: 'required',
		columns: 'string[]',
	},
	checks: {
		table: 'required',
		value: 'string',
	},
	views: {
		definition: 'string?',
		isExisting: 'boolean',
	},
	viewColumns: {},
});

beforeEach(() => {
	db.entities.delete();
});

test('Insert with custom conflict detection list', () => {
	db.entities.push({
		entityType: 'checks',
		name: 'a',
		table: 't',
		value: '2',
	}, ['name']);
	expect(
		db.entities.push({
			entityType: 'checks',
			name: 'b',
			table: 't',
			value: '2',
		}, ['name']).status,
	).toStrictEqual('OK');
	expect(
		db.entities.push({
			entityType: 'checks',
			name: 'a',
			table: 'tt',
			value: '2',
		}, ['name']).status,
	).toStrictEqual('CONFLICT');
});

test('Insert & list multiple entities', () => {
	const inFirst = db.columns.push({
		name: 'id',
		autoincrement: null,
		default: null,
		generated: {
			type: 'always',
			as: 'identity',
		},
		notNull: true,
		primaryKey: true,
		table: 'users',
		type: 'string',
	});

	const inSecond = db.indexes.push({
		columns: [{
			value: 'user_id',
			expression: false,
		}, {
			value: 'group_id',
			expression: false,
		}],
		table: 'users_to_groups',
		isUnique: true,
		name: 'utg_idx',
		where: null,
	});

	expect(inFirst).toStrictEqual({
		status: 'OK',
		data: {
			name: 'id',
			autoincrement: null,
			default: null,
			generated: {
				type: 'always',
				as: 'identity',
			},
			notNull: true,
			primaryKey: true,
			table: 'users',
			type: 'string',
			entityType: 'columns',
		},
	});

	expect(inSecond).toStrictEqual({
		status: 'OK',
		data: {
			columns: [{
				value: 'user_id',
				expression: false,
			}, {
				value: 'group_id',
				expression: false,
			}],
			table: 'users_to_groups',
			isUnique: true,
			name: 'utg_idx',
			where: null,
			entityType: 'indexes',
		},
	});

	expect(db.entities.one()).toStrictEqual({
		name: 'id',
		autoincrement: null,
		default: null,
		generated: {
			type: 'always',
			as: 'identity',
		},
		notNull: true,
		primaryKey: true,
		table: 'users',
		type: 'string',
		entityType: 'columns',
	});

	expect(db.pks.one()).toStrictEqual(null);

	expect(db.entities.list()).toStrictEqual([{
		name: 'id',
		autoincrement: null,
		default: null,
		generated: {
			type: 'always',
			as: 'identity',
		},
		notNull: true,
		primaryKey: true,
		table: 'users',
		type: 'string',
		entityType: 'columns',
	}, {
		columns: [{
			value: 'user_id',
			expression: false,
		}, {
			value: 'group_id',
			expression: false,
		}],
		table: 'users_to_groups',
		isUnique: true,
		name: 'utg_idx',
		where: null,
		entityType: 'indexes',
	}]);

	expect(db.columns.list()).toStrictEqual([{
		name: 'id',
		autoincrement: null,
		default: null,
		generated: {
			type: 'always',
			as: 'identity',
		},
		notNull: true,
		primaryKey: true,
		table: 'users',
		type: 'string',
		entityType: 'columns',
	}]);

	expect(db.indexes.list()).toStrictEqual([{
		columns: [{
			value: 'user_id',
			expression: false,
		}, {
			value: 'group_id',
			expression: false,
		}],
		table: 'users_to_groups',
		isUnique: true,
		name: 'utg_idx',
		where: null,
		entityType: 'indexes',
	}]);

	expect(db.views.list()).toStrictEqual([]);
});

test('Insert & list multiple entities via common function', () => {
	const inFirst = db.entities.push({
		entityType: 'columns',
		name: 'id',
		autoincrement: null,
		default: null,
		generated: {
			type: 'always',
			as: 'identity',
		},
		notNull: true,
		primaryKey: true,
		table: 'users',
		type: 'string',
	});

	const inSecond = db.entities.push({
		entityType: 'indexes',
		columns: [{
			value: 'user_id',
			expression: false,
		}, {
			value: 'group_id',
			expression: false,
		}],
		table: 'users_to_groups',
		isUnique: true,
		name: 'utg_idx',
		where: null,
	});

	expect(inFirst).toStrictEqual({
		status: 'OK',
		data: {
			name: 'id',
			autoincrement: null,
			default: null,
			generated: {
				type: 'always',
				as: 'identity',
			},
			notNull: true,
			primaryKey: true,
			table: 'users',
			type: 'string',
			entityType: 'columns',
		},
	});

	expect(inSecond).toStrictEqual({
		status: 'OK',
		data: {
			columns: [{
				value: 'user_id',
				expression: false,
			}, {
				value: 'group_id',
				expression: false,
			}],
			table: 'users_to_groups',
			isUnique: true,
			name: 'utg_idx',
			where: null,
			entityType: 'indexes',
		},
	});

	expect(db.entities.one()).toStrictEqual({
		name: 'id',
		autoincrement: null,
		default: null,
		generated: {
			type: 'always',
			as: 'identity',
		},
		notNull: true,
		primaryKey: true,
		table: 'users',
		type: 'string',
		entityType: 'columns',
	});

	expect(db.pks.one()).toStrictEqual(null);

	expect(db.entities.list()).toStrictEqual([{
		name: 'id',
		autoincrement: null,
		default: null,
		generated: {
			type: 'always',
			as: 'identity',
		},
		notNull: true,
		primaryKey: true,
		table: 'users',
		type: 'string',
		entityType: 'columns',
	}, {
		columns: [{
			value: 'user_id',
			expression: false,
		}, {
			value: 'group_id',
			expression: false,
		}],
		table: 'users_to_groups',
		isUnique: true,
		name: 'utg_idx',
		where: null,
		entityType: 'indexes',
	}]);

	expect(db.columns.list()).toStrictEqual([{
		name: 'id',
		autoincrement: null,
		default: null,
		generated: {
			type: 'always',
			as: 'identity',
		},
		notNull: true,
		primaryKey: true,
		table: 'users',
		type: 'string',
		entityType: 'columns',
	}]);

	expect(db.indexes.list()).toStrictEqual([{
		columns: [{
			value: 'user_id',
			expression: false,
		}, {
			value: 'group_id',
			expression: false,
		}],
		table: 'users_to_groups',
		isUnique: true,
		name: 'utg_idx',
		where: null,
		entityType: 'indexes',
	}]);

	expect(db.views.list()).toStrictEqual([]);
});

test('Insert with common hash conflict', () => {
	const inFirst = db.columns.push({
		name: 'id',
		autoincrement: null,
		default: null,
		generated: {
			type: 'always',
			as: 'identity',
		},
		notNull: true,
		primaryKey: true,
		table: 'users',
		type: 'string',
	});

	const inSecond = db.columns.push({
		name: 'id',
		autoincrement: null,
		default: null,
		generated: null,
		notNull: false,
		primaryKey: false,
		table: 'users',
		type: 'text',
	});

	expect(inFirst).toStrictEqual({
		status: 'OK',
		data: {
			name: 'id',
			autoincrement: null,
			default: null,
			generated: {
				type: 'always',
				as: 'identity',
			},
			notNull: true,
			primaryKey: true,
			table: 'users',
			type: 'string',
			entityType: 'columns',
		},
	});

	expect(inSecond).toStrictEqual({
		status: 'CONFLICT',
		data: {
			name: 'id',
			autoincrement: null,
			default: null,
			generated: {
				type: 'always',
				as: 'identity',
			},
			notNull: true,
			primaryKey: true,
			table: 'users',
			type: 'string',
			entityType: 'columns',
		},
	});

	expect(db.entities.list()).toStrictEqual([{
		name: 'id',
		autoincrement: null,
		default: null,
		generated: {
			type: 'always',
			as: 'identity',
		},
		notNull: true,
		primaryKey: true,
		table: 'users',
		type: 'string',
		entityType: 'columns',
	}]);

	expect(db.columns.list()).toStrictEqual([{
		name: 'id',
		autoincrement: null,
		default: null,
		generated: {
			type: 'always',
			as: 'identity',
		},
		notNull: true,
		primaryKey: true,
		table: 'users',
		type: 'string',
		entityType: 'columns',
	}]);
});

test('Delete specific entities', () => {
	db.columns.push({
		name: 'id',
		autoincrement: null,
		default: null,
		generated: {
			type: 'always',
			as: 'identity',
		},
		notNull: true,
		primaryKey: true,
		table: 'users',
		type: 'string',
	});

	db.columns.push({
		name: 'name',
		autoincrement: null,
		default: null,
		generated: null,
		notNull: true,
		primaryKey: true,
		table: 'users',
		type: 'string',
	});

	db.indexes.push({
		columns: [{
			value: 'user_id',
			expression: false,
		}, {
			value: 'group_id',
			expression: false,
		}],
		table: 'users_to_groups',
		isUnique: true,
		name: 'utg_idx',
		where: null,
	});

	db.indexes.push({
		columns: [{
			value: 'group_id',
			expression: false,
		}],
		table: 'users_to_groups',
		isUnique: false,
		name: 'utg_g_idx',
		where: null,
	});

	const delFirst = db.columns.delete();

	const delSecond = db.indexes.delete({
		columns: {
			CONTAINS: {
				value: 'user_id',
				expression: false,
			},
		},
	});

	expect(delFirst).toStrictEqual([{
		name: 'id',
		autoincrement: null,
		default: null,
		generated: {
			type: 'always',
			as: 'identity',
		},
		notNull: true,
		primaryKey: true,
		table: 'users',
		type: 'string',
		entityType: 'columns',
	}, {
		name: 'name',
		autoincrement: null,
		default: null,
		generated: null,
		notNull: true,
		primaryKey: true,
		table: 'users',
		type: 'string',
		entityType: 'columns',
	}]);

	expect(delSecond).toStrictEqual([{
		columns: [{
			value: 'user_id',
			expression: false,
		}, {
			value: 'group_id',
			expression: false,
		}],
		table: 'users_to_groups',
		isUnique: true,
		name: 'utg_idx',
		where: null,
		entityType: 'indexes',
	}]);

	expect(db.entities.list()).toStrictEqual([{
		columns: [{
			value: 'group_id',
			expression: false,
		}],
		table: 'users_to_groups',
		isUnique: false,
		name: 'utg_g_idx',
		where: null,
		entityType: 'indexes',
	}]);

	expect(db.columns.list()).toStrictEqual([]);

	expect(db.indexes.list()).toStrictEqual([{
		columns: [{
			value: 'group_id',
			expression: false,
		}],
		table: 'users_to_groups',
		isUnique: false,
		name: 'utg_g_idx',
		where: null,
		entityType: 'indexes',
	}]);
});

test('Delete specific entities via common function', () => {
	db.columns.push({
		name: 'id',
		autoincrement: null,
		default: null,
		generated: {
			type: 'always',
			as: 'identity',
		},
		notNull: true,
		primaryKey: true,
		table: 'users',
		type: 'string',
	});

	db.columns.push({
		name: 'name',
		autoincrement: null,
		default: null,
		generated: null,
		notNull: true,
		primaryKey: true,
		table: 'users',
		type: 'string',
	});

	db.indexes.push({
		columns: [{
			value: 'user_id',
			expression: false,
		}, {
			value: 'group_id',
			expression: false,
		}],
		table: 'users_to_groups',
		isUnique: true,
		name: 'utg_idx',
		where: null,
	});

	db.indexes.push({
		columns: [{
			value: 'group_id',
			expression: false,
		}],
		table: 'users_to_groups',
		isUnique: false,
		name: 'utg_g_idx',
		where: null,
	});

	const delFirst = db.entities.delete({
		entityType: 'columns',
	});

	const delSecond = db.entities.delete({
		entityType: 'indexes',
		columns: [{
			value: 'user_id',
			expression: false,
		}, {
			value: 'group_id',
			expression: false,
		}],
	});

	expect(delFirst).toStrictEqual([{
		name: 'id',
		autoincrement: null,
		default: null,
		generated: {
			type: 'always',
			as: 'identity',
		},
		notNull: true,
		primaryKey: true,
		table: 'users',
		type: 'string',
		entityType: 'columns',
	}, {
		name: 'name',
		autoincrement: null,
		default: null,
		generated: null,
		notNull: true,
		primaryKey: true,
		table: 'users',
		type: 'string',
		entityType: 'columns',
	}]);

	expect(delSecond).toStrictEqual([{
		columns: [{
			value: 'user_id',
			expression: false,
		}, {
			value: 'group_id',
			expression: false,
		}],
		table: 'users_to_groups',
		isUnique: true,
		name: 'utg_idx',
		where: null,
		entityType: 'indexes',
	}]);

	expect(db.entities.list()).toStrictEqual([{
		columns: [{
			value: 'group_id',
			expression: false,
		}],
		table: 'users_to_groups',
		isUnique: false,
		name: 'utg_g_idx',
		where: null,
		entityType: 'indexes',
	}]);

	expect(db.columns.list()).toStrictEqual([]);

	expect(db.indexes.list()).toStrictEqual([{
		columns: [{
			value: 'group_id',
			expression: false,
		}],
		table: 'users_to_groups',
		isUnique: false,
		name: 'utg_g_idx',
		where: null,
		entityType: 'indexes',
	}]);
});

test('Update entities', () => {
	db.columns.push({
		name: 'id',
		autoincrement: null,
		default: null,
		generated: {
			type: 'always',
			as: 'identity',
		},
		notNull: true,
		primaryKey: true,
		table: 'users',
		type: 'string',
	});

	db.columns.push({
		name: 'name',
		autoincrement: null,
		default: null,
		generated: null,
		notNull: true,
		primaryKey: true,
		table: 'users',
		type: 'string',
	});

	db.indexes.push({
		columns: [{
			value: 'user_id',
			expression: false,
		}, {
			value: 'group_id',
			expression: false,
		}],
		table: 'users_to_groups',
		isUnique: true,
		name: 'utg_idx',
		where: null,
	});

	db.indexes.push({
		columns: [{
			value: 'group_id',
			expression: false,
		}],
		table: 'users_to_groups',
		isUnique: false,
		name: 'utg_g_idx',
		where: null,
	});

	const updFirst = db.columns.update({
		set: {
			type: 'bigint',
		},
	});

	const updSecond = db.indexes.update({
		set: {
			where: 'whereExp',
			columns: (c) => {
				return {
					...c,
					expression: true,
				};
			},
		},
		where: {
			columns: {
				CONTAINS: {
					value: 'user_id',
					expression: false,
				},
			},
		},
	});

	expect(updFirst).toStrictEqual({
		status: 'OK',
		data: [{
			name: 'id',
			autoincrement: null,
			default: null,
			generated: {
				type: 'always',
				as: 'identity',
			},
			notNull: true,
			primaryKey: true,
			table: 'users',
			type: 'bigint',
			entityType: 'columns',
		}, {
			name: 'name',
			autoincrement: null,
			default: null,
			generated: null,
			notNull: true,
			primaryKey: true,
			table: 'users',
			type: 'bigint',
			entityType: 'columns',
		}],
	});

	expect(updSecond).toStrictEqual({
		status: 'OK',
		data: [{
			columns: [{
				value: 'user_id',
				expression: true,
			}, {
				value: 'group_id',
				expression: true,
			}],
			table: 'users_to_groups',
			isUnique: true,
			name: 'utg_idx',
			where: 'whereExp',
			entityType: 'indexes',
		}],
	});

	expect(db.entities.list()).toStrictEqual([
		{
			autoincrement: null,
			default: null,
			entityType: 'columns',
			generated: {
				as: 'identity',
				type: 'always',
			},
			name: 'id',
			notNull: true,
			primaryKey: true,
			table: 'users',
			type: 'bigint',
		},
		{
			autoincrement: null,
			default: null,
			entityType: 'columns',
			generated: null,
			name: 'name',
			notNull: true,
			primaryKey: true,
			table: 'users',
			type: 'bigint',
		},
		{
			columns: [
				{
					expression: true,
					value: 'user_id',
				},
				{
					expression: true,
					value: 'group_id',
				},
			],
			entityType: 'indexes',
			isUnique: true,
			name: 'utg_idx',
			table: 'users_to_groups',
			where: 'whereExp',
		},
		{
			columns: [
				{
					expression: false,
					value: 'group_id',
				},
			],
			entityType: 'indexes',
			isUnique: false,
			name: 'utg_g_idx',
			table: 'users_to_groups',
			where: null,
		},
	]);

	expect(db.columns.list()).toStrictEqual(
		[
			{
				autoincrement: null,
				default: null,
				entityType: 'columns',
				generated: {
					as: 'identity',
					type: 'always',
				},
				name: 'id',
				notNull: true,
				primaryKey: true,
				table: 'users',
				type: 'bigint',
			},
			{
				autoincrement: null,
				default: null,
				entityType: 'columns',
				generated: null,
				name: 'name',
				notNull: true,
				primaryKey: true,
				table: 'users',
				type: 'bigint',
			},
		],
	);

	expect(db.indexes.list()).toStrictEqual(
		[
			{
				columns: [
					{
						expression: true,
						value: 'user_id',
					},
					{
						expression: true,
						value: 'group_id',
					},
				],
				entityType: 'indexes',
				isUnique: true,
				name: 'utg_idx',
				table: 'users_to_groups',
				where: 'whereExp',
			},
			{
				columns: [
					{
						expression: false,
						value: 'group_id',
					},
				],
				entityType: 'indexes',
				isUnique: false,
				name: 'utg_g_idx',
				table: 'users_to_groups',
				where: null,
			},
		],
	);
});

test('Update entities conflict - with filter', () => {
	db.columns.push({
		name: 'id',
		autoincrement: null,
		default: null,
		generated: {
			type: 'always',
			as: 'identity',
		},
		notNull: true,
		primaryKey: true,
		table: 'users',
		type: 'string',
	});

	db.columns.push({
		name: 'name',
		autoincrement: null,
		default: null,
		generated: null,
		notNull: true,
		primaryKey: true,
		table: 'users',
		type: 'string',
	});

	db.columns.push({
		name: 'avatar',
		autoincrement: null,
		default: null,
		generated: null,
		notNull: true,
		primaryKey: false,
		table: 'users',
		type: 'string',
	});

	const upd = db.columns.update({
		set: {
			name: 'id',
		},
		where: {
			name: 'name',
		},
	});

	expect(upd).toStrictEqual({
		status: 'CONFLICT',
		data: [{
			name: 'id',
			autoincrement: null,
			default: null,
			generated: {
				type: 'always',
				as: 'identity',
			},
			notNull: true,
			primaryKey: true,
			table: 'users',
			type: 'string',
			entityType: 'columns',
		}],
	});

	expect(db.entities.list()).toStrictEqual([
		{
			autoincrement: null,
			default: null,
			entityType: 'columns',
			generated: {
				as: 'identity',
				type: 'always',
			},
			name: 'id',
			notNull: true,
			primaryKey: true,
			table: 'users',
			type: 'string',
		},
		{
			autoincrement: null,
			default: null,
			entityType: 'columns',
			generated: null,
			name: 'name',
			notNull: true,
			primaryKey: true,
			table: 'users',
			type: 'string',
		},
		{
			autoincrement: null,
			default: null,
			entityType: 'columns',
			generated: null,
			name: 'avatar',
			notNull: true,
			primaryKey: false,
			table: 'users',
			type: 'string',
		},
	]);

	expect(db.columns.list()).toStrictEqual(
		[
			{
				autoincrement: null,
				default: null,
				entityType: 'columns',
				generated: {
					as: 'identity',
					type: 'always',
				},
				name: 'id',
				notNull: true,
				primaryKey: true,
				table: 'users',
				type: 'string',
			},
			{
				autoincrement: null,
				default: null,
				entityType: 'columns',
				generated: null,
				name: 'name',
				notNull: true,
				primaryKey: true,
				table: 'users',
				type: 'string',
			},
			{
				autoincrement: null,
				default: null,
				entityType: 'columns',
				generated: null,
				name: 'avatar',
				notNull: true,
				primaryKey: false,
				table: 'users',
				type: 'string',
			},
		],
	);

	expect(db.indexes.list()).toStrictEqual([]);
});

test('Update entities conflict - no filter', () => {
	db.columns.push({
		name: 'id',
		autoincrement: null,
		default: null,
		generated: {
			type: 'always',
			as: 'identity',
		},
		notNull: true,
		primaryKey: true,
		table: 'users',
		type: 'string',
	});

	db.columns.push({
		name: 'name',
		autoincrement: null,
		default: null,
		generated: null,
		notNull: true,
		primaryKey: true,
		table: 'users',
		type: 'string',
	});

	db.columns.push({
		name: 'avatar',
		autoincrement: null,
		default: null,
		generated: null,
		notNull: true,
		primaryKey: false,
		table: 'users',
		type: 'string',
	});

	const upd = db.columns.update({
		set: {
			name: 'id',
		},
	});

	expect(upd).toStrictEqual({
		status: 'CONFLICT',
		data: [{
			name: 'id',
			autoincrement: null,
			default: null,
			generated: {
				type: 'always',
				as: 'identity',
			},
			notNull: true,
			primaryKey: true,
			table: 'users',
			type: 'string',
			entityType: 'columns',
		}],
	});

	expect(db.entities.list()).toStrictEqual([
		{
			autoincrement: null,
			default: null,
			entityType: 'columns',
			generated: {
				as: 'identity',
				type: 'always',
			},
			name: 'id',
			notNull: true,
			primaryKey: true,
			table: 'users',
			type: 'string',
		},
		{
			autoincrement: null,
			default: null,
			entityType: 'columns',
			generated: null,
			name: 'name',
			notNull: true,
			primaryKey: true,
			table: 'users',
			type: 'string',
		},
		{
			autoincrement: null,
			default: null,
			entityType: 'columns',
			generated: null,
			name: 'avatar',
			notNull: true,
			primaryKey: false,
			table: 'users',
			type: 'string',
		},
	]);

	expect(db.columns.list()).toStrictEqual(
		[
			{
				autoincrement: null,
				default: null,
				entityType: 'columns',
				generated: {
					as: 'identity',
					type: 'always',
				},
				name: 'id',
				notNull: true,
				primaryKey: true,
				table: 'users',
				type: 'string',
			},
			{
				autoincrement: null,
				default: null,
				entityType: 'columns',
				generated: null,
				name: 'name',
				notNull: true,
				primaryKey: true,
				table: 'users',
				type: 'string',
			},
			{
				autoincrement: null,
				default: null,
				entityType: 'columns',
				generated: null,
				name: 'avatar',
				notNull: true,
				primaryKey: false,
				table: 'users',
				type: 'string',
			},
		],
	);

	expect(db.indexes.list()).toStrictEqual([]);
});

test('Update entities via common function', () => {
	db.columns.push({
		name: 'id',
		autoincrement: null,
		default: null,
		generated: {
			type: 'always',
			as: 'identity',
		},
		notNull: true,
		primaryKey: true,
		table: 'users',
		type: 'string',
	});

	db.columns.push({
		name: 'name',
		autoincrement: null,
		default: null,
		generated: null,
		notNull: true,
		primaryKey: true,
		table: 'users',
		type: 'string',
	});

	db.indexes.push({
		columns: [{
			value: 'user_id',
			expression: false,
		}, {
			value: 'group_id',
			expression: false,
		}],
		table: 'users_to_groups',
		isUnique: true,
		name: 'utg_idx',
		where: null,
	});

	db.indexes.push({
		columns: [{
			value: 'group_id',
			expression: false,
		}],
		table: 'users_to_groups',
		isUnique: false,
		name: 'utg_g_idx',
		where: null,
	});

	const updFirst = db.entities.update({
		set: {
			table: 'upd_tbl',
		},
	});

	const updSecond = db.entities.update({
		set: {
			name: (n) => `${n}_upd`,
		},
		where: {
			columns: [
				{
					expression: false,
					value: 'user_id',
				},
				{
					expression: false,
					value: 'group_id',
				},
			],
		},
	});

	expect(updFirst).toStrictEqual({
		status: 'OK',
		data: [{
			name: 'id',
			autoincrement: null,
			default: null,
			generated: {
				type: 'always',
				as: 'identity',
			},
			notNull: true,
			primaryKey: true,
			table: 'upd_tbl',
			type: 'string',
			entityType: 'columns',
		}, {
			name: 'name',
			autoincrement: null,
			default: null,
			generated: null,
			notNull: true,
			primaryKey: true,
			table: 'upd_tbl',
			type: 'string',
			entityType: 'columns',
		}, {
			columns: [{
				value: 'user_id',
				expression: false,
			}, {
				value: 'group_id',
				expression: false,
			}],
			table: 'upd_tbl',
			isUnique: true,
			name: 'utg_idx_upd',
			where: null,
			entityType: 'indexes',
		}, {
			columns: [
				{
					expression: false,
					value: 'group_id',
				},
			],
			entityType: 'indexes',
			isUnique: false,
			name: 'utg_g_idx',
			table: 'upd_tbl',
			where: null,
		}],
	});

	expect(updSecond).toStrictEqual({
		status: 'OK',
		data: [{
			columns: [{
				value: 'user_id',
				expression: false,
			}, {
				value: 'group_id',
				expression: false,
			}],
			table: 'upd_tbl',
			isUnique: true,
			name: 'utg_idx_upd',
			where: null,
			entityType: 'indexes',
		}],
	});

	expect(db.entities.list()).toStrictEqual([{
		name: 'id',
		autoincrement: null,
		default: null,
		generated: {
			type: 'always',
			as: 'identity',
		},
		notNull: true,
		primaryKey: true,
		table: 'upd_tbl',
		type: 'string',
		entityType: 'columns',
	}, {
		name: 'name',
		autoincrement: null,
		default: null,
		generated: null,
		notNull: true,
		primaryKey: true,
		table: 'upd_tbl',
		type: 'string',
		entityType: 'columns',
	}, {
		columns: [{
			value: 'user_id',
			expression: false,
		}, {
			value: 'group_id',
			expression: false,
		}],
		table: 'upd_tbl',
		isUnique: true,
		name: 'utg_idx_upd',
		where: null,
		entityType: 'indexes',
	}, {
		columns: [
			{
				expression: false,
				value: 'group_id',
			},
		],
		entityType: 'indexes',
		isUnique: false,
		name: 'utg_g_idx',
		table: 'upd_tbl',
		where: null,
	}]);

	expect(db.columns.list()).toStrictEqual(
		[
			{
				name: 'id',
				autoincrement: null,
				default: null,
				generated: {
					type: 'always',
					as: 'identity',
				},
				notNull: true,
				primaryKey: true,
				table: 'upd_tbl',
				type: 'string',
				entityType: 'columns',
			},
			{
				name: 'name',
				autoincrement: null,
				default: null,
				generated: null,
				notNull: true,
				primaryKey: true,
				table: 'upd_tbl',
				type: 'string',
				entityType: 'columns',
			},
		],
	);

	expect(db.indexes.list()).toStrictEqual(
		[
			{
				columns: [{
					value: 'user_id',
					expression: false,
				}, {
					value: 'group_id',
					expression: false,
				}],
				table: 'upd_tbl',
				isUnique: true,
				name: 'utg_idx_upd',
				where: null,
				entityType: 'indexes',
			},
			{
				columns: [
					{
						expression: false,
						value: 'group_id',
					},
				],
				entityType: 'indexes',
				isUnique: false,
				name: 'utg_g_idx',
				table: 'upd_tbl',
				where: null,
			},
		],
	);
});

test('List with filters', () => {
	db.columns.push({
		name: 'id',
		autoincrement: null,
		default: null,
		generated: {
			type: 'always',
			as: 'identity',
		},
		notNull: true,
		primaryKey: true,
		table: 'users',
		type: 'string',
	});

	db.columns.push({
		name: 'name',
		autoincrement: null,
		default: null,
		generated: null,
		notNull: true,
		primaryKey: true,
		table: 'users',
		type: 'string',
	});

	db.indexes.push({
		columns: [{
			value: 'user_id',
			expression: false,
		}, {
			value: 'group_id',
			expression: false,
		}],
		table: 'users_to_groups',
		isUnique: true,
		name: 'utg_idx',
		where: null,
	});

	db.indexes.push({
		columns: [{
			value: 'group_id',
			expression: false,
		}],
		table: 'users_to_groups',
		isUnique: false,
		name: 'utg_g_idx',
		where: null,
	});

	const listFirst = db.columns.list();

	const listSecond = db.indexes.list({
		columns: {
			CONTAINS: {
				value: 'user_id',
				expression: false,
			},
		},
	});

	expect(listFirst).toStrictEqual([{
		name: 'id',
		autoincrement: null,
		default: null,
		generated: {
			type: 'always',
			as: 'identity',
		},
		notNull: true,
		primaryKey: true,
		table: 'users',
		type: 'string',
		entityType: 'columns',
	}, {
		name: 'name',
		autoincrement: null,
		default: null,
		generated: null,
		notNull: true,
		primaryKey: true,
		table: 'users',
		type: 'string',
		entityType: 'columns',
	}]);

	expect(listSecond).toStrictEqual([{
		columns: [{
			value: 'user_id',
			expression: false,
		}, {
			value: 'group_id',
			expression: false,
		}],
		table: 'users_to_groups',
		isUnique: true,
		name: 'utg_idx',
		where: null,
		entityType: 'indexes',
	}]);
});

test('List via common function with filters', () => {
	db.columns.push({
		name: 'id',
		autoincrement: null,
		default: null,
		generated: {
			type: 'always',
			as: 'identity',
		},
		notNull: true,
		primaryKey: true,
		table: 'users',
		type: 'string',
	});

	db.columns.push({
		name: 'name',
		autoincrement: null,
		default: null,
		generated: null,
		notNull: true,
		primaryKey: true,
		table: 'users',
		type: 'string',
	});

	db.indexes.push({
		columns: [{
			value: 'user_id',
			expression: false,
		}, {
			value: 'group_id',
			expression: false,
		}],
		table: 'users_to_groups',
		isUnique: true,
		name: 'utg_idx',
		where: null,
	});

	db.indexes.push({
		columns: [{
			value: 'group_id',
			expression: false,
		}],
		table: 'users_to_groups',
		isUnique: false,
		name: 'utg_g_idx',
		where: null,
	});

	const listFirst = db.entities.list({
		entityType: 'columns',
	});

	const listSecond = db.entities.list({
		entityType: 'indexes',
		columns: [{
			value: 'user_id',
			expression: false,
		}, {
			value: 'group_id',
			expression: false,
		}],
	});

	expect(listFirst).toStrictEqual([{
		name: 'id',
		autoincrement: null,
		default: null,
		generated: {
			type: 'always',
			as: 'identity',
		},
		notNull: true,
		primaryKey: true,
		table: 'users',
		type: 'string',
		entityType: 'columns',
	}, {
		name: 'name',
		autoincrement: null,
		default: null,
		generated: null,
		notNull: true,
		primaryKey: true,
		table: 'users',
		type: 'string',
		entityType: 'columns',
	}]);

	expect(listSecond).toStrictEqual([{
		columns: [{
			value: 'user_id',
			expression: false,
		}, {
			value: 'group_id',
			expression: false,
		}],
		table: 'users_to_groups',
		isUnique: true,
		name: 'utg_idx',
		where: null,
		entityType: 'indexes',
	}]);
});

test('Validate', () => {
	const junk = {};
	if (db.views.validate(junk)) {
		expectTypeOf(junk).toEqualTypeOf<Exclude<ReturnType<typeof db.views.one>, null>>();
	}

	if (db.entities.validate(junk)) {
		expectTypeOf(junk).toEqualTypeOf<Exclude<ReturnType<typeof db.entities.one>, null>>();
	}

	const table: typeof db._.types.tables = {
		entityType: 'tables',
		name: 'tbl',
	};

	expect(db.entities.validate(table)).toStrictEqual(true);
	expect(db.tables.validate(table)).toStrictEqual(true);
	expect(db.views.validate(table)).toStrictEqual(false);

	const deformedTable = {
		entityType: 'tables',
		name: 'tbl',
		schema: null,
	};

	expect(db.entities.validate(deformedTable)).toStrictEqual(false);
	expect(db.tables.validate(deformedTable)).toStrictEqual(false);
	expect(db.views.validate(deformedTable)).toStrictEqual(false);

	const deformedTable2 = {
		entityType: 'tables',
		name: 'tbl',
		schema: 'sch',
	};

	expect(db.entities.validate(deformedTable2)).toStrictEqual(false);
	expect(db.tables.validate(deformedTable2)).toStrictEqual(false);
	expect(db.views.validate(deformedTable2)).toStrictEqual(false);

	const column: typeof db._.types.columns = {
		autoincrement: false,
		default: null,
		entityType: 'columns',
		generated: { as: 'as', type: 'type' },
		name: 'cn',
		notNull: false,
		primaryKey: false,
		table: 'tt',
		type: 'varchar',
	};

	expect(db.entities.validate(column)).toStrictEqual(true);
	expect(db.columns.validate(column)).toStrictEqual(true);
	expect(db.tables.validate(column)).toStrictEqual(false);

	const column2: typeof db._.types.columns = {
		autoincrement: false,
		default: null,
		entityType: 'columns',
		generated: null,
		name: 'cn',
		notNull: false,
		primaryKey: false,
		table: 'tt',
		type: 'varchar',
	};

	expect(db.entities.validate(column2)).toStrictEqual(true);
	expect(db.columns.validate(column2)).toStrictEqual(true);
	expect(db.tables.validate(column2)).toStrictEqual(false);

	const columnDeformed = {
		autoincrement: false,
		default: null,
		entityType: 'columns',
		generated: { as: 'as', type: 'type', something: undefined },
		name: 'cn',
		notNull: false,
		primaryKey: false,
		table: 'tt',
		type: 'varchar',
	};

	expect(db.entities.validate(columnDeformed)).toStrictEqual(false);
	expect(db.columns.validate(columnDeformed)).toStrictEqual(false);
	expect(db.tables.validate(columnDeformed)).toStrictEqual(false);

	const columnDeformed2 = {
		autoincrement: false,
		default: null,
		entityType: 'columns',
		generated: 'wrong',
		name: 'cn',
		notNull: false,
		primaryKey: false,
		table: 'tt',
		type: 'varchar',
	};

	expect(db.entities.validate(columnDeformed2)).toStrictEqual(false);
	expect(db.columns.validate(columnDeformed2)).toStrictEqual(false);
	expect(db.tables.validate(columnDeformed2)).toStrictEqual(false);

	const pk: typeof db._.types.pks = {
		columns: [],
		entityType: 'pks',
		name: 'pk1',
		table: 'tt',
	};

	expect(db.entities.validate(pk)).toStrictEqual(true);
	expect(db.pks.validate(pk)).toStrictEqual(true);
	expect(db.views.validate(pk)).toStrictEqual(false);

	const pk2: typeof db._.types.pks = {
		columns: ['str', 'str2', 'str3'],
		entityType: 'pks',
		name: 'pk1',
		table: 'tt',
	};

	expect(db.entities.validate(pk2)).toStrictEqual(true);
	expect(db.pks.validate(pk2)).toStrictEqual(true);
	expect(db.views.validate(pk2)).toStrictEqual(false);

	const pkDeformed = {
		columns: ['str', null, 'str3'],
		entityType: 'pks',
		name: 'pk1',
		table: 'tt',
	};

	expect(db.entities.validate(pkDeformed)).toStrictEqual(false);
	expect(db.pks.validate(pkDeformed)).toStrictEqual(false);
	expect(db.views.validate(pkDeformed)).toStrictEqual(false);

	const index: typeof db._.types.indexes = {
		columns: [],
		entityType: 'indexes',
		isUnique: true,
		name: 'idx',
		table: 'tt',
		where: null,
	};

	expect(db.entities.validate(index)).toStrictEqual(true);
	expect(db.indexes.validate(index)).toStrictEqual(true);
	expect(db.pks.validate(index)).toStrictEqual(false);

	const index2: typeof db._.types.indexes = {
		columns: [{
			expression: true,
			value: 'expr',
		}],
		entityType: 'indexes',
		isUnique: true,
		name: 'idx',
		table: 'tt',
		where: null,
	};

	expect(db.entities.validate(index2)).toStrictEqual(true);
	expect(db.indexes.validate(index2)).toStrictEqual(true);
	expect(db.pks.validate(index2)).toStrictEqual(false);

	const index3: typeof db._.types.indexes = {
		columns: [{
			expression: true,
			value: 'expr',
		}, {
			expression: false,
			value: 'ex2',
		}],
		entityType: 'indexes',
		isUnique: true,
		name: 'idx',
		table: 'tt',
		where: null,
	};

	expect(db.entities.validate(index3)).toStrictEqual(true);
	expect(db.indexes.validate(index3)).toStrictEqual(true);
	expect(db.pks.validate(index3)).toStrictEqual(false);

	const indexDeformed = {
		columns: 2,
		entityType: 'indexes',
		isUnique: true,
		name: 'idx',
		table: 'tt',
		where: null,
	};

	expect(db.entities.validate(indexDeformed)).toStrictEqual(false);
	expect(db.indexes.validate(indexDeformed)).toStrictEqual(false);
	expect(db.pks.validate(indexDeformed)).toStrictEqual(false);

	const indexDeformed2 = {
		columns: [{
			expression: true,
			value: 'expr',
		}, {
			expression: false,
			value: 'ex2',
		}, 'who?'],
		entityType: 'indexes',
		isUnique: true,
		name: 'idx',
		table: 'tt',
		where: null,
	};

	expect(db.entities.validate(indexDeformed2)).toStrictEqual(false);
	expect(db.indexes.validate(indexDeformed2)).toStrictEqual(false);
	expect(db.pks.validate(indexDeformed2)).toStrictEqual(false);

	const indexDeformed3 = {
		columns: [null, {
			expression: true,
			value: 'expr',
		}, {
			expression: false,
			value: 'ex2',
		}],
		entityType: 'indexes',
		isUnique: true,
		name: 'idx',
		table: 'tt',
		where: null,
	};

	expect(db.entities.validate(indexDeformed3)).toStrictEqual(false);
	expect(db.indexes.validate(indexDeformed3)).toStrictEqual(false);
	expect(db.pks.validate(indexDeformed3)).toStrictEqual(false);
});

test('diff: update', () => {
	const cfg = {
		column: {
			type: 'string',
			pk: 'boolean?',
			table: 'required',
		},
	} as const;

	const original = create(cfg);
	const changed = create(cfg);

	original.column.push({
		name: 'id',
		type: 'serial',
		pk: true,
		table: 'user',
	});
	original.column.push({
		name: 'name',
		type: 'varchar',
		pk: false,
		table: 'user',
	});

	changed.column.push({
		name: 'id',
		type: 'serial',
		pk: true,
		table: 'user',
	});
	changed.column.push({
		name: 'name',
		type: 'text',
		pk: false,
		table: 'user',
	});

	const res = diff.alters(original, changed, 'column');

	expect(diff.all(original, changed, 'column')).toStrictEqual([{
		$diffType: 'alter',
		entityType: 'column',
		table: 'user',
		name: 'name',
		type: {
			from: 'varchar',
			to: 'text',
		},
		$left: {
			entityType: 'column',
			name: 'name',
			pk: false,
			table: 'user',
			type: 'varchar',
		},
		$right: {
			entityType: 'column',
			name: 'name',
			pk: false,
			table: 'user',
			type: 'text',
		},
	}]);
	expect(diff.all(original, changed)).toStrictEqual([{
		$diffType: 'alter',
		entityType: 'column',
		table: 'user',
		name: 'name',
		type: {
			from: 'varchar',
			to: 'text',
		},
		$left: {
			entityType: 'column',
			name: 'name',
			pk: false,
			table: 'user',
			type: 'varchar',
		},
		$right: {
			entityType: 'column',
			name: 'name',
			pk: false,
			table: 'user',
			type: 'text',
		},
	}]);
	expect(diff.drops(original, changed, 'column')).toStrictEqual([]);
	expect(diff.drops(original, changed)).toStrictEqual([]);
	expect(diff.alters(original, changed, 'column')).toStrictEqual([{
		$diffType: 'alter',
		entityType: 'column',
		table: 'user',
		name: 'name',
		type: {
			from: 'varchar',
			to: 'text',
		},
		$left: {
			entityType: 'column',
			name: 'name',
			pk: false,
			table: 'user',
			type: 'varchar',
		},
		$right: {
			entityType: 'column',
			name: 'name',
			pk: false,
			table: 'user',
			type: 'text',
		},
	}]);
	expect(diff.alters(original, changed)).toStrictEqual([{
		$diffType: 'alter',
		entityType: 'column',
		table: 'user',
		name: 'name',
		type: {
			from: 'varchar',
			to: 'text',
		},
		$left: {
			entityType: 'column',
			name: 'name',
			pk: false,
			table: 'user',
			type: 'varchar',
		},
		$right: {
			entityType: 'column',
			name: 'name',
			pk: false,
			table: 'user',
			type: 'text',
		},
	}]);
	expect(diff.creates(original, changed, 'column')).toStrictEqual([]);
	expect(diff.creates(original, changed)).toStrictEqual([]);

	expect(res).toStrictEqual([{
		$diffType: 'alter',
		entityType: 'column',
		table: 'user',
		name: 'name',
		type: {
			from: 'varchar',
			to: 'text',
		},
		$left: {
			entityType: 'column',
			name: 'name',
			pk: false,
			table: 'user',
			type: 'varchar',
		},
		$right: {
			entityType: 'column',
			name: 'name',
			pk: false,
			table: 'user',
			type: 'text',
		},
	}]);
});

test('diff: update object', () => {
	const cfg = {
		column: {
			type: 'string',
			pk: 'boolean?',
			table: 'required',
			obj: {
				subfield: 'string',
				subArr: 'string[]',
			},
		},
	} as const;

	const original = create(cfg);
	const changed = create(cfg);

	original.column.push({
		name: 'id',
		type: 'serial',
		pk: true,
		table: 'user',
		obj: {
			subArr: ['s3', 's4'],
			subfield: 'sf_value_upd',
		},
	});
	original.column.push({
		name: 'name',
		type: 'varchar',
		pk: false,
		table: 'user',
		obj: {
			subArr: ['s1', 's2'],
			subfield: 'sf_value',
		},
	});

	changed.column.push({
		name: 'id',
		type: 'serial',
		pk: true,
		table: 'user',
		obj: null,
	});
	changed.column.push({
		name: 'name',
		type: 'text',
		pk: false,
		table: 'user',
		obj: {
			subArr: ['s3', 's4'],
			subfield: 'sf_value',
		},
	});

	const res = diff.alters(original, changed, 'column');

	expect(res).toStrictEqual([{
		$diffType: 'alter',
		entityType: 'column',
		table: 'user',
		name: 'id',
		obj: {
			from: {
				subArr: ['s3', 's4'],
				subfield: 'sf_value_upd',
			},
			to: null,
		},
		$left: {
			entityType: 'column',
			name: 'id',
			obj: {
				subArr: [
					's3',
					's4',
				],
				subfield: 'sf_value_upd',
			},
			pk: true,
			table: 'user',
			type: 'serial',
		},
		$right: {
			entityType: 'column',
			name: 'id',
			obj: null,
			pk: true,
			table: 'user',
			type: 'serial',
		},
	}, {
		$diffType: 'alter',
		entityType: 'column',
		table: 'user',
		name: 'name',
		type: {
			from: 'varchar',
			to: 'text',
		},
		obj: {
			from: {
				subArr: ['s1', 's2'],
				subfield: 'sf_value',
			},
			to: {
				subArr: ['s3', 's4'],
				subfield: 'sf_value',
			},
		},
		$left: {
			entityType: 'column',
			name: 'name',
			obj: {
				subArr: [
					's1',
					's2',
				],
				subfield: 'sf_value',
			},
			pk: false,
			table: 'user',
			type: 'varchar',
		},
		$right: {
			entityType: 'column',
			name: 'name',
			obj: {
				subArr: [
					's3',
					's4',
				],
				subfield: 'sf_value',
			},
			pk: false,
			table: 'user',
			type: 'text',
		},
	}]);
});

test('diff: update object array', () => {
	const original = create({
		column: {
			type: 'string',
			pk: 'boolean?',
			table: 'required',
			obj: [{
				subfield: 'string',
				subArr: 'string[]',
			}],
		},
	});
	const changed = create({
		column: {
			type: 'string',
			pk: 'boolean?',
			table: 'required',
			obj: [{
				subfield: 'string',
				subArr: 'string[]',
			}],
		},
	});

	original.column.push({
		name: 'id',
		type: 'serial',
		pk: true,
		table: 'user',
		obj: [{
			subArr: ['s3', 's4'],
			subfield: 'sf_value',
		}],
	});
	original.column.push({
		name: 'name',
		type: 'varchar',
		pk: false,
		table: 'user',
		obj: [{
			subArr: ['s1', 's2'],
			subfield: 'sf_value',
		}],
	});

	changed.column.push({
		name: 'id',
		type: 'serial',
		pk: true,
		table: 'user',
		obj: [{
			subArr: ['s3', 's4'],
			subfield: 'sf_value',
		}, {
			subArr: ['s1', 's2'],
			subfield: 'sf_value',
		}],
	});
	changed.column.push({
		name: 'name',
		type: 'text',
		pk: false,
		table: 'user',
		obj: [{
			subArr: ['s1', 's2'],
			subfield: 'sf_value_upd',
		}],
	});

	const res = diff.alters(original, changed, 'column');

	expect(res).toStrictEqual([{
		$diffType: 'alter',
		entityType: 'column',
		table: 'user',
		name: 'id',
		obj: {
			from: [{
				subArr: ['s3', 's4'],
				subfield: 'sf_value',
			}],
			to: [{
				subArr: ['s3', 's4'],
				subfield: 'sf_value',
			}, {
				subArr: ['s1', 's2'],
				subfield: 'sf_value',
			}],
		},
		$left: {
			entityType: 'column',
			name: 'id',
			obj: [
				{
					subArr: [
						's3',
						's4',
					],
					subfield: 'sf_value',
				},
			],
			pk: true,
			table: 'user',
			type: 'serial',
		},
		$right: {
			entityType: 'column',
			name: 'id',
			obj: [
				{
					subArr: [
						's3',
						's4',
					],
					subfield: 'sf_value',
				},
				{
					subArr: [
						's1',
						's2',
					],
					subfield: 'sf_value',
				},
			],
			pk: true,
			table: 'user',
			type: 'serial',
		},
	}, {
		$diffType: 'alter',
		entityType: 'column',
		table: 'user',
		name: 'name',
		type: {
			from: 'varchar',
			to: 'text',
		},
		obj: {
			from: [{
				subArr: ['s1', 's2'],
				subfield: 'sf_value',
			}],
			to: [{
				subArr: ['s1', 's2'],
				subfield: 'sf_value_upd',
			}],
		},
		$left: {
			entityType: 'column',
			name: 'name',
			obj: [
				{
					subArr: [
						's1',
						's2',
					],
					subfield: 'sf_value',
				},
			],
			pk: false,
			table: 'user',
			type: 'varchar',
		},
		$right: {
			entityType: 'column',
			name: 'name',
			obj: [
				{
					subArr: [
						's1',
						's2',
					],
					subfield: 'sf_value_upd',
				},
			],
			pk: false,
			table: 'user',
			type: 'text',
		},
	}]);
});

test('diff: insert', () => {
	const cfg = {
		column: {
			type: 'string',
			pk: 'boolean?',
			table: 'required',
		},
	} as const;

	const original = create(cfg);
	const changed = create(cfg);

	original.column.push({
		name: 'id',
		type: 'serial',
		pk: true,
		table: 'user',
	});

	changed.column.push({
		name: 'id',
		type: 'serial',
		pk: true,
		table: 'user',
	});
	changed.column.push({
		name: 'name',
		type: 'varchar',
		pk: false,
		table: 'user',
	});

	const res = diff(original, changed, 'column');

	expect(diff.all(original, changed, 'column')).toStrictEqual([{
		$diffType: 'create',
		entityType: 'column',
		name: 'name',
		table: 'user',
		type: 'varchar',
		pk: false,
	}]);
	expect(diff.all(original, changed)).toStrictEqual([{
		$diffType: 'create',
		entityType: 'column',
		name: 'name',
		table: 'user',
		type: 'varchar',
		pk: false,
	}]);
	expect(diff.drops(original, changed, 'column')).toStrictEqual([]);
	expect(diff.drops(original, changed)).toStrictEqual([]);
	expect(diff.alters(original, changed, 'column')).toStrictEqual([]);
	expect(diff.alters(original, changed)).toStrictEqual([]);
	expect(diff.creates(original, changed, 'column')).toStrictEqual([{
		$diffType: 'create',
		entityType: 'column',
		name: 'name',
		table: 'user',
		type: 'varchar',
		pk: false,
	}]);
	expect(diff.creates(original, changed)).toStrictEqual([{
		$diffType: 'create',
		entityType: 'column',
		name: 'name',
		table: 'user',
		type: 'varchar',
		pk: false,
	}]);

	expect(res).toStrictEqual([{
		$diffType: 'create',
		entityType: 'column',
		name: 'name',
		table: 'user',
		type: 'varchar',
		pk: false,
	}]);
});

test('diff: delete', () => {
	const cfg = {
		column: {
			type: 'string',
			pk: 'boolean?',
			table: 'required',
		},
	} as const;

	const original = create(cfg);
	const changed = create(cfg);

	original.column.push({
		name: 'id',
		type: 'serial',
		pk: true,
		table: 'user',
	});
	original.column.push({
		name: 'name',
		type: 'varchar',
		pk: false,
		table: 'user',
	});

	changed.column.push({
		name: 'id',
		type: 'serial',
		pk: true,
		table: 'user',
	});
	const res = diff(original, changed, 'column');

	expect(diff.all(original, changed, 'column')).toStrictEqual([{
		$diffType: 'drop',
		entityType: 'column',
		name: 'name',
		table: 'user',
		type: 'varchar',
		pk: false,
	}]);
	expect(diff.all(original, changed)).toStrictEqual([{
		$diffType: 'drop',
		entityType: 'column',
		name: 'name',
		table: 'user',
		type: 'varchar',
		pk: false,
	}]);
	expect(diff.drops(original, changed, 'column')).toStrictEqual([{
		$diffType: 'drop',
		entityType: 'column',
		name: 'name',
		table: 'user',
		type: 'varchar',
		pk: false,
	}]);
	expect(diff.drops(original, changed)).toStrictEqual([{
		$diffType: 'drop',
		entityType: 'column',
		name: 'name',
		table: 'user',
		type: 'varchar',
		pk: false,
	}]);
	expect(diff.alters(original, changed, 'column')).toStrictEqual([]);
	expect(diff.alters(original, changed)).toStrictEqual([]);
	expect(diff.creates(original, changed, 'column')).toStrictEqual([]);
	expect(diff.creates(original, changed)).toStrictEqual([]);

	expect(res).toStrictEqual([{
		$diffType: 'drop',
		entityType: 'column',
		name: 'name',
		table: 'user',
		type: 'varchar',
		pk: false,
	}]);
});

test('indexes #1', () => {
	const ddl1 = pg();
	const ddl2 = pg();

	ddl1.indexes.push({
		schema: 'public',
		table: 'users',
		name: 'users_id_index',
		columns: [{ value: 'id', isExpression: false, opclass: null, nullsFirst: false, asc: false }],
		isUnique: false,
		where: null,
		with: '',
		concurrently: false,
		method: 'btree',
		nameExplicit: true,
	});

	ddl1.indexes.push({
		schema: 'public',
		table: 'users',
		name: 'indx4',
		columns: [{ value: 'id', isExpression: false, opclass: null, nullsFirst: false, asc: false }],
		isUnique: false,
		where: null,
		with: '',
		concurrently: false,
		method: 'btree',
		nameExplicit: true,
	});

	ddl2.indexes.push({
		schema: 'public',
		table: 'users',
		name: 'users_id_index',
		columns: [{ value: 'id', isExpression: false, opclass: null, nullsFirst: false, asc: false }],
		isUnique: false,
		where: null,
		with: '',
		concurrently: false,
		method: 'btree',
		nameExplicit: false,
	});

	ddl2.indexes.push({
		schema: 'public',
		table: 'users',
		name: 'indx4',
		columns: [{ value: 'id', isExpression: false, opclass: null, nullsFirst: false, asc: false }],
		isUnique: false,
		where: null,
		with: '',
		concurrently: false,
		method: 'btree',
		nameExplicit: true,
	});

	const d = diff(ddl1, ddl2, 'indexes');
	expect(d).toStrictEqual([]);
});

test('hasDiff', () => {
	const cfg = {
		column: {
			type: 'string',
			pk: 'boolean?',
			table: 'required',
		},
	} as const;

	const original = create(cfg);
	const changed = create(cfg);

	original.column.push({
		name: 'id',
		type: 'serial',
		pk: true,
		table: 'user',
	});
	original.column.push({
		name: 'name',
		type: 'varchar',
		pk: false,
		table: 'user',
	});

	changed.column.push({
		name: 'id',
		type: 'serial',
		pk: true,
		table: 'user',
	});
	changed.column.push({
		name: 'name',
		type: 'text',
		pk: false,
		table: 'user',
	});

	const res = diff.alters(original, changed, 'column');

	const exampleDiff = res[0];
	expect(original.column.hasDiff(exampleDiff)).toStrictEqual(true);
	expect(original.entities.hasDiff(exampleDiff)).toStrictEqual(true);

	delete exampleDiff['type'];
	expect(original.column.hasDiff(exampleDiff)).toStrictEqual(false);
	expect(original.entities.hasDiff(exampleDiff)).toStrictEqual(false);
});
