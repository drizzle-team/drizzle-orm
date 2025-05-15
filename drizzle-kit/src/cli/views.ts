import chalk from 'chalk';
import { Prompt, render, SelectState, TaskView } from 'hanji';
import { SchemaError, SchemaWarning } from 'src/dialects/postgres/ddl';
import { assertUnreachable } from 'src/global';
import { SchemaError as SqliteSchemaError } from '../dialects/sqlite/ddl';
import { Named, NamedWithSchema } from '../dialects/utils';
import { vectorOps } from '../extensions/vector';
import { withStyle } from './validations/outputs';

export const warning = (msg: string) => {
	render(`[${chalk.yellow('Warning')}] ${msg}`);
};
export const err = (msg: string) => {
	render(`${chalk.bold.red('Error')} ${msg}`);
};

export const info = (msg: string, greyMsg: string = ''): string => {
	return `${chalk.blue.bold('Info:')} ${msg} ${greyMsg ? chalk.grey(greyMsg) : ''}`.trim();
};
export const grey = (msg: string): string => {
	return chalk.grey(msg);
};

export const error = (error: string, greyMsg: string = ''): string => {
	return `${chalk.bgRed.bold(' Error ')} ${error} ${greyMsg ? chalk.grey(greyMsg) : ''}`.trim();
};

export const schemaWarning = (warning: SchemaWarning): string => {
	if (warning.type === 'policy_not_linked') {
		return withStyle.errorWarning(
			`"Policy ${warning.policy} was skipped because it was not linked to any table. You should either include the policy in a table or use .link() on the policy to link it to any table you have. For more information, please check:`,
		);
	}

	assertUnreachable(warning.type);
};

export const sqliteSchemaError = (error: SqliteSchemaError): string => {
	if (error.type === 'conflict_table') {
		return `'${error.table}' table name is a duplicate`;
	}

	if (error.type === 'conflict_check') {
		return `'${error.name}' check constraint name is a duplicate`;
	}

	if (error.type === 'conflict_unique') {
		return `'${error.name}' unique constraint name is a duplicate`;
	}

	if (error.type === 'conflict_view') {
		return `'${error.view}' view name is a duplicate`;
	}

	// assertUnreachable(error.type)
	return '';
};

export const schemaError = (error: SchemaError): string => {
	if (error.type === 'constraint_name_duplicate') {
		const { name, schema, table } = error;
		const tableName = chalk.underline.blue(`"${schema}"."${table}"`);
		const constraintName = chalk.underline.blue(`'${name}'`);
		return withStyle.errorWarning(
			`There's a duplicate constraint name ${constraintName} in ${tableName} table`,
		);
	}

	if (error.type === 'index_duplicate') {
		// check for index names duplicates
		const { schema, table, name } = error;
		const sch = chalk.underline.blue(`"${schema}"`);
		const idx = chalk.underline.blue(`'${name}'`);
		const tableName = chalk.underline.blue(`"${schema}"."${table}"`);
		return withStyle.errorWarning(
			`There's a duplicate index name ${idx} in ${sch} schema in ${tableName}`,
		);
	}

	if (error.type === 'index_no_name') {
		const { schema, table, sql } = error;
		const tableName = chalk.underline.blue(`"${schema}"."${table}"`);
		return withStyle.errorWarning(
			`Please specify an index name in ${tableName} table that has "${sql}" expression.\n\nWe can generate index names for indexes on columns only; for expressions in indexes, you need to specify index name yourself.`,
		);
	}

	if (error.type === 'pgvector_index_noop') {
		const { table, indexName, column, method } = error;
		return withStyle.errorWarning(
			`You are specifying an index on the ${
				chalk.blueBright(
					column,
				)
			} column inside the ${
				chalk.blueBright(
					table,
				)
			} table with the ${
				chalk.blueBright(
					'vector',
				)
			} type without specifying an operator class. Vector extension doesn't have a default operator class, so you need to specify one of the available options. Here is a list of available op classes for the vector extension: [${
				vectorOps
					.map((it) => `${chalk.underline(`${it}`)}`)
					.join(', ')
			}].\n\nYou can specify it using current syntax: ${
				chalk.underline(
					`index("${indexName}").using("${method}", table.${column}.op("${vectorOps[0]}"))`,
				)
			}\n\nYou can check the "pg_vector" docs for more info: https://github.com/pgvector/pgvector?tab=readme-ov-file#indexing\n`,
		);
	}

	if (error.type === 'policy_duplicate') {
		const { schema, table, policy } = error;
		const tableName = chalk.underline.blue(`"${schema}"."${table}"`);

		return withStyle.errorWarning(
			`We\'ve found duplicated policy name across ${tableName} table. Please rename one of the policies with ${
				chalk.underline.blue(
					policy,
				)
			} name`,
		);
	}

	if (error.type === 'view_name_duplicate') {
		const schema = chalk.underline.blue(error.schema ?? 'public');
		const name = chalk.underline.blue(error.name);
		return withStyle.errorWarning(
			`There's a view duplicate name ${name} in ${schema} schema`,
		);
	}

	if (error.type === 'sequence_name_duplicate') {
		return withStyle.errorWarning(`There's a sequence name duplicate '${error.name}' in '${error.schema}' schema`);
	}

	// assertUnreachable(error);
	return '';
};

export interface RenamePropmtItem<T> {
	from: T;
	to: T;
}

export const isRenamePromptItem = <T extends EntityBase>(
	item: RenamePropmtItem<T> | T,
): item is RenamePropmtItem<T> => {
	return 'from' in item && 'to' in item;
};

export class ResolveColumnSelect<T extends Named> extends Prompt<
	RenamePropmtItem<T> | T
> {
	private readonly data: SelectState<RenamePropmtItem<T> | T>;

	constructor(
		private readonly tableName: string,
		private readonly base: Named,
		data: (RenamePropmtItem<T> | T)[],
	) {
		super();
		this.on('attach', (terminal) => terminal.toggleCursor('hide'));
		this.data = new SelectState(data);
		this.data.bind(this);
	}

	render(status: 'idle' | 'submitted' | 'aborted'): string {
		if (status === 'submitted' || status === 'aborted') {
			return '\n';
		}

		let text = `\nIs ${
			chalk.bold.blue(
				this.base.name,
			)
		} column in ${
			chalk.bold.blue(
				this.tableName,
			)
		} table created or renamed from another column?\n`;

		const isSelectedRenamed = isRenamePromptItem(
			this.data.items[this.data.selectedIdx],
		);

		const selectedPrefix = isSelectedRenamed
			? chalk.yellow('❯ ')
			: chalk.green('❯ ');

		const labelLength: number = this.data.items
			.filter((it) => isRenamePromptItem(it))
			.map((it: RenamePropmtItem<T>) => {
				return this.base.name.length + 3 + it['from'].name.length;
			})
			.reduce((a, b) => {
				if (a > b) {
					return a;
				}
				return b;
			}, 0);

		this.data.items.forEach((it, idx) => {
			const isSelected = idx === this.data.selectedIdx;
			const isRenamed = isRenamePromptItem(it);
			const title = isRenamed
				? `${it.from.name} › ${it.to.name}`.padEnd(labelLength, ' ')
				: it.name.padEnd(labelLength, ' ');
			const label = isRenamed
				? `${chalk.yellow('~')} ${title} ${chalk.gray('rename column')}`
				: `${chalk.green('+')} ${title} ${chalk.gray('create column')}`;

			text += isSelected ? `${selectedPrefix}${label}` : `  ${label}`;
			text += idx != this.data.items.length - 1 ? '\n' : '';
		});
		return text;
	}

	result(): RenamePropmtItem<T> | T {
		return this.data.items[this.data.selectedIdx]!;
	}
}

export const tableKey = (it: NamedWithSchema) => {
	return it.schema === 'public' || !it.schema
		? it.name
		: `${it.schema}.${it.name}`;
};

export class ResolveSelectNamed<T extends Named> extends Prompt<
	RenamePropmtItem<T> | T
> {
	private readonly state: SelectState<RenamePropmtItem<T> | T>;

	constructor(
		private readonly base: T,
		data: (RenamePropmtItem<T> | T)[],
		private readonly entityType: 'role' | 'policy',
	) {
		super();
		this.on('attach', (terminal) => terminal.toggleCursor('hide'));
		this.state = new SelectState(data);
		this.state.bind(this);
		this.base = base;
	}

	render(status: 'idle' | 'submitted' | 'aborted'): string {
		if (status === 'submitted' || status === 'aborted') {
			return '';
		}
		const key = this.base.name;

		let text = `\nIs ${chalk.bold.blue(key)} ${this.entityType} created or renamed from another ${this.entityType}?\n`;

		const isSelectedRenamed = isRenamePromptItem(
			this.state.items[this.state.selectedIdx],
		);

		const selectedPrefix = isSelectedRenamed
			? chalk.yellow('❯ ')
			: chalk.green('❯ ');

		const labelLength: number = this.state.items
			.filter((it) => isRenamePromptItem(it))
			.map((_) => {
				const it = _ as RenamePropmtItem<T>;
				const keyFrom = it.from.name;
				return key.length + 3 + keyFrom.length;
			})
			.reduce((a, b) => {
				if (a > b) {
					return a;
				}
				return b;
			}, 0);

		const entityType = this.entityType;
		this.state.items.forEach((it, idx) => {
			const isSelected = idx === this.state.selectedIdx;
			const isRenamed = isRenamePromptItem(it);

			const title = isRenamed
				? `${it.from.name} › ${it.to.name}`.padEnd(labelLength, ' ')
				: it.name.padEnd(labelLength, ' ');

			const label = isRenamed
				? `${chalk.yellow('~')} ${title} ${chalk.gray(`rename ${entityType}`)}`
				: `${chalk.green('+')} ${title} ${chalk.gray(`create ${entityType}`)}`;

			text += isSelected ? `${selectedPrefix}${label}` : `  ${label}`;
			text += idx != this.state.items.length - 1 ? '\n' : '';
		});
		return text;
	}

	result(): RenamePropmtItem<T> | T {
		return this.state.items[this.state.selectedIdx]!;
	}
}

type EntityBase = { schema?: string; table?: string; name: string };

const keyFor = (it: EntityBase, defaultSchema: 'dbo' | 'public' = 'public') => {
	const schemaPrefix = it.schema && it.schema !== defaultSchema ? `${it.schema}.` : '';
	const tablePrefix = it.table ? `${it.schema}.` : '';
	return `${schemaPrefix}${tablePrefix}${it.name}`;
};

export class ResolveSelect<T extends EntityBase> extends Prompt<
	RenamePropmtItem<T> | T
> {
	private readonly state: SelectState<RenamePropmtItem<T> | T>;

	constructor(
		private readonly base: T,
		data: (RenamePropmtItem<T> | T)[],
		private readonly entityType:
			| 'schema'
			| 'enum'
			| 'table'
			| 'column'
			| 'sequence'
			| 'view'
			| 'policy'
			| 'role'
			| 'check'
			| 'index'
			| 'unique'
			| 'primary key'
			| 'foreign key'
			| 'default',
		private defaultSchema: 'dbo' | 'public' = 'public',
	) {
		super();
		this.on('attach', (terminal) => terminal.toggleCursor('hide'));
		this.state = new SelectState(data);
		this.state.bind(this);
		this.base = base;
	}

	render(status: 'idle' | 'submitted' | 'aborted'): string {
		if (status === 'submitted' || status === 'aborted') {
			return '';
		}

		const key = keyFor(this.base, this.defaultSchema);
		let text = `\nIs ${chalk.bold.blue(key)} ${this.entityType} created or renamed from another ${this.entityType}?\n`;

		const isSelectedRenamed = isRenamePromptItem(
			this.state.items[this.state.selectedIdx],
		);

		const selectedPrefix = isSelectedRenamed
			? chalk.yellow('❯ ')
			: chalk.green('❯ ');

		const labelLength: number = this.state.items
			.filter((it) => isRenamePromptItem(it))
			.map((_) => {
				const it = _ as RenamePropmtItem<T>;
				const keyFrom = keyFor(it.from);
				return key.length + 3 + keyFrom.length;
			})
			.reduce((a, b) => {
				if (a > b) {
					return a;
				}
				return b;
			}, 0);

		const entityType = this.entityType;
		this.state.items.forEach((it, idx) => {
			const isSelected = idx === this.state.selectedIdx;
			const isRenamed = isRenamePromptItem(it);

			const title = isRenamed
				? `${keyFor(it.from, this.defaultSchema)} › ${keyFor(it.to, this.defaultSchema)}`.padEnd(labelLength, ' ')
				: keyFor(it, this.defaultSchema).padEnd(labelLength, ' ');

			const label = isRenamed
				? `${chalk.yellow('~')} ${title} ${chalk.gray(`rename ${entityType}`)}`
				: `${chalk.green('+')} ${title} ${chalk.gray(`create ${entityType}`)}`;

			text += isSelected ? `${selectedPrefix}${label}` : `  ${label}`;
			text += idx != this.state.items.length - 1 ? '\n' : '';
		});
		return text;
	}

	result(): RenamePropmtItem<T> | T {
		return this.state.items[this.state.selectedIdx]!;
	}
}

export class ResolveSchemasSelect<T extends Named> extends Prompt<
	RenamePropmtItem<T> | T
> {
	private readonly state: SelectState<RenamePropmtItem<T> | T>;

	constructor(private readonly base: Named, data: (RenamePropmtItem<T> | T)[]) {
		super();
		this.on('attach', (terminal) => terminal.toggleCursor('hide'));
		this.state = new SelectState(data);
		this.state.bind(this);
		this.base = base;
	}

	render(status: 'idle' | 'submitted' | 'aborted'): string {
		if (status === 'submitted' || status === 'aborted') {
			return '';
		}

		let text = `\nIs ${
			chalk.bold.blue(
				this.base.name,
			)
		} schema created or renamed from another schema?\n`;
		const isSelectedRenamed = isRenamePromptItem(
			this.state.items[this.state.selectedIdx],
		);
		const selectedPrefix = isSelectedRenamed
			? chalk.yellow('❯ ')
			: chalk.green('❯ ');

		const labelLength: number = this.state.items
			.filter((it) => isRenamePromptItem(it))
			.map((it: RenamePropmtItem<T>) => {
				return this.base.name.length + 3 + it['from'].name.length;
			})
			.reduce((a, b) => {
				if (a > b) {
					return a;
				}
				return b;
			}, 0);

		this.state.items.forEach((it, idx) => {
			const isSelected = idx === this.state.selectedIdx;
			const isRenamed = isRenamePromptItem(it);
			const title = isRenamed
				? `${it.from.name} › ${it.to.name}`.padEnd(labelLength, ' ')
				: it.name.padEnd(labelLength, ' ');
			const label = isRenamed
				? `${chalk.yellow('~')} ${title} ${chalk.gray('rename schema')}`
				: `${chalk.green('+')} ${title} ${chalk.gray('create schema')}`;

			text += isSelected ? `${selectedPrefix}${label}` : `  ${label}`;
			text += idx != this.state.items.length - 1 ? '\n' : '';
		});
		return text;
	}

	result(): RenamePropmtItem<T> | T {
		return this.state.items[this.state.selectedIdx]!;
	}
}

class Spinner {
	private offset: number = 0;
	private readonly iterator: () => void;

	constructor(private readonly frames: string[]) {
		this.iterator = () => {
			this.offset += 1;
			this.offset %= frames.length - 1;
		};
	}

	public tick = () => {
		this.iterator();
	};

	public value = () => {
		return this.frames[this.offset];
	};
}

const frames = function(values: string[]): () => string {
	let index = 0;
	const iterator = () => {
		const frame = values[index];
		index += 1;
		index %= values.length;
		return frame!;
	};
	return iterator;
};

type ValueOf<T> = T[keyof T];
export type IntrospectStatus = 'fetching' | 'done';
export type IntrospectStage =
	| 'tables'
	| 'columns'
	| 'enums'
	| 'indexes'
	| 'policies'
	| 'checks'
	| 'fks'
	| 'views';

type IntrospectState = {
	[key in IntrospectStage]: {
		count: number;
		name: string;
		status: IntrospectStatus;
	};
};

export class IntrospectProgress extends TaskView {
	private readonly spinner: Spinner = new Spinner('⣷⣯⣟⡿⢿⣻⣽⣾'.split(''));
	private timeout: NodeJS.Timeout | undefined;

	private state: IntrospectState = {
		tables: {
			count: 0,
			name: 'tables',
			status: 'fetching',
		},
		columns: {
			count: 0,
			name: 'columns',
			status: 'fetching',
		},
		enums: {
			count: 0,
			name: 'enums',
			status: 'fetching',
		},
		indexes: {
			count: 0,
			name: 'indexes',
			status: 'fetching',
		},
		fks: {
			count: 0,
			name: 'foreign keys',
			status: 'fetching',
		},
		policies: {
			count: 0,
			name: 'policies',
			status: 'fetching',
		},
		checks: {
			count: 0,
			name: 'check constraints',
			status: 'fetching',
		},
		views: {
			count: 0,
			name: 'views',
			status: 'fetching',
		},
	};

	constructor(private readonly hasEnums: boolean = false) {
		super();
		this.timeout = setInterval(() => {
			this.spinner.tick();
			this.requestLayout();
		}, 128);

		this.on('detach', () => clearInterval(this.timeout));
	}

	public update(
		stage: IntrospectStage,
		count: number,
		status: IntrospectStatus,
	) {
		this.state[stage].count = count;
		this.state[stage].status = status;
		this.requestLayout();
	}

	private formatCount = (count: number) => {
		const width: number = Math.max.apply(
			null,
			Object.values(this.state).map((it) => it.count.toFixed(0).length),
		);

		return count.toFixed(0).padEnd(width, ' ');
	};

	private statusText = (spinner: string, stage: ValueOf<IntrospectState>) => {
		const { name, count } = stage;
		const isDone = stage.status === 'done';

		const prefix = isDone ? `[${chalk.green('✓')}]` : `[${spinner}]`;

		const formattedCount = this.formatCount(count);
		const suffix = isDone
			? `${formattedCount} ${name} fetched`
			: `${formattedCount} ${name} fetching`;

		return `${prefix} ${suffix}\n`;
	};

	render(): string {
		let info = '';
		const spin = this.spinner.value();
		info += this.statusText(spin, this.state.tables);
		info += this.statusText(spin, this.state.columns);
		info += this.hasEnums ? this.statusText(spin, this.state.enums) : '';
		info += this.statusText(spin, this.state.indexes);
		info += this.statusText(spin, this.state.fks);
		info += this.statusText(spin, this.state.policies);
		info += this.statusText(spin, this.state.checks);
		info += this.statusText(spin, this.state.views);

		return info;
	}
}

export class MigrateProgress extends TaskView {
	private readonly spinner: Spinner = new Spinner('⣷⣯⣟⡿⢿⣻⣽⣾'.split(''));
	private timeout: NodeJS.Timeout | undefined;

	constructor() {
		super();
		this.timeout = setInterval(() => {
			this.spinner.tick();
			this.requestLayout();
		}, 128);

		this.on('detach', () => clearInterval(this.timeout));
	}

	render(status: 'pending' | 'done'): string {
		if (status === 'pending') {
			const spin = this.spinner.value();
			return `[${spin}] applying migrations...`;
		}
		return `[${chalk.green('✓')}] migrations applied successfully!`;
	}
}

export class ProgressView extends TaskView {
	private readonly spinner: Spinner = new Spinner('⣷⣯⣟⡿⢿⣻⣽⣾'.split(''));
	private timeout: NodeJS.Timeout | undefined;

	constructor(
		private readonly progressText: string,
		private readonly successText: string,
	) {
		super();
		this.timeout = setInterval(() => {
			this.spinner.tick();
			this.requestLayout();
		}, 128);

		this.on('detach', () => clearInterval(this.timeout));
	}

	render(status: 'pending' | 'done'): string {
		if (status === 'pending') {
			const spin = this.spinner.value();
			return `[${spin}] ${this.progressText}\n`;
		}
		return `[${chalk.green('✓')}] ${this.successText}\n`;
	}
}

export class DropMigrationView<T extends { tag: string }> extends Prompt<T> {
	private readonly data: SelectState<T>;

	constructor(data: T[]) {
		super();
		this.on('attach', (terminal) => terminal.toggleCursor('hide'));
		this.data = new SelectState(data);
		this.data.selectedIdx = data.length - 1;
		this.data.bind(this);
	}

	render(status: 'idle' | 'submitted' | 'aborted'): string {
		if (status === 'submitted' || status === 'aborted') {
			return '\n';
		}

		let text = chalk.bold('Please select migration to drop:\n');
		const selectedPrefix = chalk.yellow('❯ ');

		const data = trimmedRange(this.data.items, this.data.selectedIdx, 9);
		const labelLength: number = data.trimmed
			.map((it) => it.tag.length)
			.reduce((a, b) => {
				if (a > b) {
					return a;
				}
				return b;
			}, 0);

		text += data.startTrimmed ? '  ...\n' : '';

		data.trimmed.forEach((it, idx) => {
			const isSelected = idx === this.data.selectedIdx - data.offset;
			let title = it.tag.padEnd(labelLength, ' ');
			title = isSelected ? chalk.yellow(title) : title;

			text += isSelected ? `${selectedPrefix}${title}` : `  ${title}`;
			text += idx != this.data.items.length - 1 ? '\n' : '';
		});

		text += data.endTrimmed ? '  ...\n' : '';
		return text;
	}

	result(): T {
		return this.data.items[this.data.selectedIdx]!;
	}
}

export const trimmedRange = <T>(
	arr: T[],
	index: number,
	limitLines: number,
): {
	trimmed: T[];
	offset: number;
	startTrimmed: boolean;
	endTrimmed: boolean;
} => {
	const limit = limitLines - 2;
	const sideLimit = Math.round(limit / 2);

	const endTrimmed = arr.length - sideLimit > index;
	const startTrimmed = index > sideLimit - 1;

	const paddingStart = Math.max(index + sideLimit - arr.length, 0);
	const paddingEnd = Math.min(index - sideLimit + 1, 0);

	const d1 = endTrimmed ? 1 : 0;
	const d2 = startTrimmed ? 0 : 1;

	const start = Math.max(0, index - sideLimit + d1 - paddingStart);
	const end = Math.min(arr.length, index + sideLimit + d2 - paddingEnd);

	return {
		trimmed: arr.slice(start, end),
		offset: start,
		startTrimmed,
		endTrimmed,
	};
};
