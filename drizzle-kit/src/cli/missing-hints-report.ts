import chalk from 'chalk';
import type { MissingHint, MissingHintsResponse } from './hints';
import { humanizeKind } from './views';

const entityDisplay = (entity: readonly string[]): string => entity.join('.');

const jsonArray = (segments: readonly string[]): string => `[${segments.map((s) => JSON.stringify(s)).join(', ')}]`;

const entityToJsonArray = (entity: readonly string[]): string => jsonArray(entity);

// Placeholders are intentionally invalid JSON — the user MUST replace the angle-bracket
// segments before re-running. Enumerating real candidate `from` values would bloat the
// snippet count proportional to deleted-of-same-kind (D-05).
const fromPlaceholder = (entity: readonly string[]): string => {
	const labels = entity.map((_, idx) => {
		if (entity.length === 1) return '<old_name>';
		if (entity.length === 2) return idx === 0 ? '<schema>' : '<old_name>';
		if (entity.length === 3) {
			if (idx === 0) return '<schema>';
			if (idx === 1) return '<table>';
			return '<old_name>';
		}
		if (idx === entity.length - 1) return '<old_name>';
		return `<segment_${idx + 1}>`;
	});
	return jsonArray(labels);
};

const renderRenameOrCreate = (index: number, item: Extract<MissingHint, { type: 'rename_or_create' }>): string[] => {
	const header = `${index}. Rename or create  ${chalk.gray('—')}  ${humanizeKind(item.kind)}  ${
		chalk.bold.cyan(entityDisplay(item.entity))
	}`;
	const renameSnippet = `     { "type": "rename", "kind": "${item.kind}", "from": ${
		fromPlaceholder(item.entity)
	}, "to": ${entityToJsonArray(item.entity)} }`;
	const createSnippet = `     { "type": "create", "kind": "${item.kind}", "entity": ${
		entityToJsonArray(item.entity)
	} }`;
	return [
		header,
		'   Add to --hints:',
		renameSnippet,
		'     OR',
		createSnippet,
	];
};

const confirmReasonProse = (item: Extract<MissingHint, { type: 'confirm_data_loss' }>): string => {
	switch (item.reason) {
		case 'non_empty':
			return `non-empty ${humanizeKind(item.kind)}`;
		case 'table_recreate':
			return 'confirming wipes all rows and recreates the table';
		case 'type_change':
			return `type change from ${item.reason_details.from} to ${item.reason_details.to}`;
	}
};

const renderConfirmDataLoss = (index: number, item: Extract<MissingHint, { type: 'confirm_data_loss' }>): string[] => {
	const header = `${index}. Confirm data loss  ${chalk.gray('—')}  ${humanizeKind(item.kind)}  ${
		chalk.bold.cyan(entityDisplay(item.entity))
	}  ${chalk.gray(confirmReasonProse(item))}`;
	const snippet = `     { "type": "confirm_data_loss", "kind": "${item.kind}", "entity": ${
		entityToJsonArray(item.entity)
	} }`;
	return [header, '   Add to --hints:', snippet];
};

export const formatMissingHintsText = (env: MissingHintsResponse): string => {
	const renameOrCreate = env.unresolved.filter(
		(item): item is Extract<MissingHint, { type: 'rename_or_create' }> => item.type === 'rename_or_create',
	);
	const confirmDataLoss = env.unresolved.filter(
		(item): item is Extract<MissingHint, { type: 'confirm_data_loss' }> => item.type === 'confirm_data_loss',
	);

	const lines: string[] = [chalk.yellow.bold(`missing_hints: ${env.unresolved.length} unresolved decisions`)];

	let index = 1;
	const itemBlocks: string[][] = [];
	for (const item of renameOrCreate) {
		itemBlocks.push(renderRenameOrCreate(index, item));
		index += 1;
	}
	for (const item of confirmDataLoss) {
		itemBlocks.push(renderConfirmDataLoss(index, item));
		index += 1;
	}

	for (const block of itemBlocks) {
		lines.push('');
		lines.push(...block);
	}

	lines.push('');
	lines.push(chalk.gray(`Re-run with --hints '<json-array>'. Exit code 2.`));

	return lines.join('\n') + '\n';
};
