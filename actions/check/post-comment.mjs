// @ts-nocheck
import { readFileSync } from 'node:fs';

const MARKER = '<!-- drizzle-check -->';

const env = process.env;

function notice(message) {
	process.stdout.write(`::notice::${message}\n`);
}

function readEvent() {
	const path = env.GITHUB_EVENT_PATH;
	if (!path) return null;
	try {
		return JSON.parse(readFileSync(path, 'utf8'));
	} catch {
		return null;
	}
}

function resolvePrNumber(event) {
	if (!event) return null;
	return event.pull_request?.number ?? event.issue?.number ?? null;
}

function parseEnvelope(raw) {
	if (!raw) return null;
	const lines = raw
		.split('\n')
		.map((line) => line.trim())
		.filter((line) => line.startsWith('{') && line.endsWith('}'));
	for (let i = lines.length - 1; i >= 0; i--) {
		try {
			return JSON.parse(lines[i]);
		} catch {
			continue;
		}
	}
	return null;
}

function renderClean(envelope) {
	const dialect = envelope.dialect ?? 'your migrations';
	return `### ✅ No migration conflicts\n\n`
		+ `\`drizzle-kit check\` found no conflicting migrations for \`${dialect}\`.`;
}

const ACTION_VERBS = {
	create: 'creates',
	drop: 'drops',
	alter: 'alters',
	recreate: 'recreates',
	rename: 'renames',
	move: 'moves',
	add: 'adds',
	remove: 'removes',
	delete: 'deletes',
};

const SPECIAL_ACTIONS = {
	alter_type_drop_value: 'removes a value from enum',
};

function humanizeAction(action) {
	if (action in SPECIAL_ACTIONS) return SPECIAL_ACTIONS[action];
	const [verb, ...rest] = action.split('_');
	const conjugated = ACTION_VERBS[verb];
	if (!conjugated) return action.replace(/_/g, ' ');
	return rest.length ? `${conjugated} ${rest.join(' ')}` : conjugated;
}

function describeBranch(branch) {
	const action = branch.action ?? '';
	const target = branch.target;
	if (!target || typeof target.name !== 'string') {
		return humanizeAction(action);
	}
	const { name, schema, table } = target;
	if (table) return `${humanizeAction(action)} \`${name}\` on table \`${table}\``;
	if (schema) return `${humanizeAction(action)} \`${name}\` in schema \`${schema}\``;
	return `${humanizeAction(action)} \`${name}\``;
}

function normalizedWd() {
	return (env.DRIZZLE_WORKING_DIRECTORY || '.').replace(/^\.\/?/, '').replace(/\/+$/, '');
}

// Links a migration folder at the commit the check ran against (the PR merge commit),
// so every listed migration — including ones coming from the base branch — resolves.
function migrationUrl(path) {
	const repo = env.GITHUB_REPOSITORY;
	const sha = env.GITHUB_SHA;
	if (!path || !repo || !sha) return null;
	const server = env.GITHUB_SERVER_URL || 'https://github.com';
	const wd = normalizedWd();
	const fullPath = wd ? `${wd}/${path}` : path;
	return `${server}/${repo}/tree/${sha}/${fullPath}`;
}

function migrationLink(path) {
	const url = migrationUrl(path);
	return url ? `[\`${path}\`](${url})` : `\`${path}\``;
}

async function fetchPrFiles(repo, prNumber, token) {
	const files = [];
	let page = 1;
	while (true) {
		const response = await gh(
			'GET',
			`/repos/${repo}/pulls/${prNumber}/files?per_page=100&page=${page}`,
			token,
		);
		const batch = await response.json();
		if (!Array.isArray(batch) || batch.length === 0) break;
		files.push(...batch);
		if (batch.length < 100) break;
		page++;
	}
	return files;
}

// Classifies the conflict's migrations: folders added by this PR belong to the
// current branch; everything else is already on the base branch.
function buildBranchContext(error, files, event) {
	const details = Array.isArray(error.details) ? error.details : [];
	const outDirs = new Set();
	for (const conflict of details) {
		for (const branch of Array.isArray(conflict.branches) ? conflict.branches : []) {
			if (typeof branch.leafPath === 'string' && branch.leafPath.includes('/')) {
				outDirs.add(branch.leafPath.split('/')[0]);
			}
		}
	}
	if (outDirs.size === 0) return null;

	const wd = normalizedWd();
	const wdPrefix = wd ? `${wd}/` : '';
	const ownedFolders = new Set();
	for (const file of files) {
		if (file.status !== 'added' || typeof file.filename !== 'string') continue;
		if (!file.filename.startsWith(wdPrefix)) continue;
		const rel = file.filename.slice(wdPrefix.length);
		const segments = rel.split('/');
		if (segments.length < 3 || !outDirs.has(segments[0])) continue;
		ownedFolders.add(`${segments[0]}/${segments[1]}`);
	}

	return {
		ownedFolders: [...ownedFolders].sort(),
		baseRef: event?.pull_request?.base?.ref ?? null,
		headRef: event?.pull_request?.head?.ref ?? null,
	};
}

// Diagram labels drop the timestamp prefix — the text representation below the
// diagram carries the full folder names.
function migrationName(folder) {
	return folder.split('/').pop().replace(/^\d+_/, '');
}

// Truncation (paired with the wrappingWidth bump in the init directive) keeps
// every label on a single line.
function truncateEnd(label, max = 32) {
	return label.length > max ? `${label.slice(0, max - 1)}…` : label;
}

function descriptionsByLeaf(error) {
	const map = new Map();
	for (const conflict of Array.isArray(error.details) ? error.details : []) {
		for (const branch of Array.isArray(conflict.branches) ? conflict.branches : []) {
			if (!branch.leafPath) continue;
			if (!map.has(branch.leafPath)) map.set(branch.leafPath, new Set());
			map.get(branch.leafPath).add(describeBranch(branch));
		}
	}
	return map;
}

// Object names (enum/table/column) each conflicting migration touches, keyed by folder.
function conflictTargets(error) {
	const map = new Map();
	for (const conflict of Array.isArray(error.details) ? error.details : []) {
		for (const branch of Array.isArray(conflict.branches) ? conflict.branches : []) {
			if (!branch.leafPath) continue;
			const name = branch.target?.name;
			if (typeof name !== 'string' || name.length === 0) continue;
			if (!map.has(branch.leafPath)) map.set(branch.leafPath, new Set());
			map.get(branch.leafPath).add(name);
		}
	}
	return map;
}

function renderMermaid(error, ctx) {
	const ownedSet = new Set(ctx?.ownedFolders ?? []);
	const targets = conflictTargets(error);
	const details = Array.isArray(error.details) ? error.details : [];

	// Only the conflicting migrations are drawn, grouped by branch; all fork
	// parents collapse into one node whose arrows point at the branch blocks
	// rather than at individual migrations (the text representation below keeps
	// the per-parent detail).
	const leafPaths = new Set();
	const parents = [];
	for (const conflict of details) {
		for (const branch of Array.isArray(conflict.branches) ? conflict.branches : []) {
			if (branch.leafPath) leafPaths.add(branch.leafPath);
		}
		const parentName = conflict.parentPath
			? migrationName(conflict.parentPath)
			: conflict.parentId ?? 'unknown parent';
		if (!parents.some((parent) => parent.name === parentName)) {
			parents.push({ name: parentName, path: conflict.parentPath ?? null });
		}
	}

	const idMap = new Map();
	let counter = 0;
	const idFor = (key) => {
		if (!idMap.has(key)) idMap.set(key, `m${counter++}`);
		return idMap.get(key);
	};

	// Wraps just the migration name in an anchor, so only the name — not the whole
	// node — is the click target. GitHub's renderer keeps <a> in label HTML and
	// routes clicks to the top page; renderers that encode label HTML instead are
	// already incompatible with the <br/> labels used throughout.
	const linkedName = (name, path, max) => {
		const label = truncateEnd(name, max);
		const url = migrationUrl(path);
		return url ? `<a href='${url}'>${label}</a>` : label;
	};

	const declareLeaf = (path) => {
		const targetList = [...targets.get(path) ?? []];
		const suffix = targetList.length > 0 ? `<br/>⚠ ${truncateEnd(targetList.join(', '))}` : '';
		return `    ${idFor(path)}["${linkedName(migrationName(path), path, 28)}${suffix}"]`;
	};

	const lines = [
		'```mermaid',
		// subGraphTitleMargin reserves room for the two-line subgraph titles so nodes
		// don't overlap them; themeCSS centers the title and shrinks its second line
		// (::first-line restores the branch name to full size — there is no inline
		// tag for font sizing that survives mermaid's sanitizer, so CSS is the only
		// way in). wrappingWidth keeps labels on one line; truncation bounds length.
		'%%{init: {"flowchart": {"subGraphTitleMargin": {"top": 4, "bottom": 24}, "wrappingWidth": 800}, '
		+ '"themeCSS": ".cluster-label p { text-align: center; line-height: 1.1; font-size: 0.8em; } '
		+ '.cluster-label p::first-line { font-size: 1.25em; } '
		// forkone sizes the fork node's role line down to match the subgraph titles'
		// role lines; see the fork label construction.
		+ '.forkone p { line-height: 1.1; font-size: 0.8em; } '
		+ '.forkone p::first-line { font-size: 1.25em; } '
		// Migration names are inline anchors; !important outranks the host page's
		// link styling so they keep the node text color (white on the red conflict
		// nodes) and stay underlined as the link affordance.
		+ '.nodeLabel a { color: inherit !important; text-decoration: underline !important; } '
		// min-width on labels equalizes migration node widths.
		+ '.nodeLabel { display: inline-block; min-width: 220px; }"}}%%',
		'flowchart TD',
	];

	const accBranches = ctx
		? `Migrations on ${ctx.headRef ?? 'this branch'} conflict with migrations already on ${
			ctx.baseRef ?? 'the base branch'
		}`
		: 'Migrations generated in parallel conflict with each other';
	lines.push(
		'    accTitle: Conflicting migrations',
		`    accDescr: ${accBranches}; all diverge from ${parents.map((parent) => parent.name).join(', ')}.`,
	);

	// The role line is shrunk via ::first-line — the only per-line CSS hook — which
	// works only when it trails a single name line (the forkone rules restore the
	// name to full size); with several parents the role line is omitted.
	const parentNames = parents.map((parent) => linkedName(parent.name, parent.path, 30));
	lines.push(
		parentNames.length === 1
			? `    ${idFor('fork')}["${parentNames[0]}<br/>&nbsp;(parent migration)&nbsp;"]:::forkone`
			: `    ${idFor('fork')}["${parentNames.join('<br/>')}"]`,
	);

	const base = [...leafPaths].filter((path) => !ownedSet.has(path));
	const owned = [...leafPaths].filter((path) => ownedSet.has(path));

	if (ctx && base.length > 0) {
		// The nbsp padding buffers the role line against label-width measurement
		// happening before the final fonts apply, which otherwise clips its edges.
		lines.push(
			`    subgraph basebranch["${
				ctx.baseRef ? `${truncateEnd(ctx.baseRef, 28)}<br/>&nbsp;(base branch)&nbsp;` : 'base branch'
			}"]`,
		);
		for (const path of base) lines.push(`    ${declareLeaf(path)}`);
		lines.push('    end');
	} else {
		for (const path of base) lines.push(declareLeaf(path));
	}
	if (owned.length > 0) {
		lines.push(
			`    subgraph thisbranch["${
				ctx?.headRef ? `${truncateEnd(ctx.headRef, 28)}<br/>&nbsp;(this branch)&nbsp;` : 'this branch'
			}"]`,
		);
		for (const path of owned) lines.push(`    ${declareLeaf(path)}`);
		lines.push('    end');
	}

	const forkId = idFor('fork');
	if (ctx) {
		// Base branch edge first — edge order places its block on the left.
		if (base.length > 0) lines.push(`    ${forkId} -->|${base.length} conflicting| basebranch`);
		if (owned.length > 0) lines.push(`    ${forkId} -->|${owned.length} conflicting| thisbranch`);
	} else {
		for (const path of leafPaths) lines.push(`    ${forkId} --> ${idFor(path)}`);
	}

	// Semi-transparent tints stay legible on both GitHub themes: blue marks this
	// branch's block, gray the base branch's.
	if (ctx && base.length > 0) {
		lines.push('    style basebranch fill:#6e7781,fill-opacity:0.08,stroke:#6e7781,stroke-opacity:0.5');
	}
	if (owned.length > 0) {
		lines.push('    style thisbranch fill:#0969da,fill-opacity:0.08,stroke:#0969da,stroke-opacity:0.5');
	}

	// Solid mid-tone fill with explicit white text stays readable in both light
	// and dark GitHub themes; theme-adaptive defaults only restyle unclassed nodes.
	const oursConflicts = owned.map((path) => idFor(path));
	const baseConflicts = base.map((path) => idFor(path));
	if (ctx && oursConflicts.length + baseConflicts.length > 0) {
		if (oursConflicts.length > 0) {
			lines.push('    classDef conflictours fill:#cf222e,stroke:#82071e,color:#ffffff');
			lines.push(`    class ${oursConflicts.join(',')} conflictours`);
		}
		if (baseConflicts.length > 0) {
			lines.push('    classDef conflictbase fill:none,stroke:#cf222e,stroke-width:2px,stroke-dasharray:4');
			lines.push(`    class ${baseConflicts.join(',')} conflictbase`);
		}
	} else if (oursConflicts.length + baseConflicts.length > 0) {
		lines.push('    classDef conflict fill:#cf222e,stroke:#82071e,color:#ffffff');
		lines.push(`    class ${[...oursConflicts, ...baseConflicts].join(',')} conflict`);
	}
	lines.push('```');

	if (ctx) {
		const baseName = ctx.baseRef ? `\`${ctx.baseRef}\`` : 'the base branch';
		lines.push(
			'',
			`*Solid red: conflicting migrations from this branch. Outlined red: conflicting migrations already on ${baseName}.*`,
		);
	} else {
		lines.push('', '*Red: conflicting migrations.*');
	}
	return lines;
}

function htmlEscape(text) {
	return text
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

// Markdown is not processed inside HTML blocks, so inline code spans in the
// humanized descriptions convert to <code> tags explicitly.
function inlineHtml(text) {
	return text
		.split('`')
		.map((part, i) => (i % 2 === 1 ? `<code>${htmlEscape(part)}</code>` : htmlEscape(part)))
		.join('');
}

function migrationLinkHtml(path) {
	const label = `<code>${htmlEscape(path)}</code>`;
	const url = migrationUrl(path);
	return url ? `<a href="${url}">${label}</a>` : label;
}

// Rendered as <dl>/<dd> blocks: indented like a nested list, but without markers,
// and wrapped lines keep their row's indentation.
function renderNestedList(error, ctx) {
	const descriptions = descriptionsByLeaf(error);
	const baseLabel = ctx?.baseRef ? `from <code>${htmlEscape(ctx.baseRef)}</code>` : 'from the base branch';
	const ownedSet = new Set(ctx?.ownedFolders ?? []);
	const origin = (folder) => {
		if (!ctx) return '';
		return ownedSet.has(folder) ? ' <em>(this branch)</em>' : ` <em>(${baseLabel})</em>`;
	};
	// Mirrors the diagram: solid red for this branch's conflicts, outlined for the base's.
	const conflictEmoji = (folder) => (!ctx || ownedSet.has(folder)) ? '🔴' : '⭕';
	const descsHtml = (path) => {
		const list = [...descriptions.get(path) ?? []].filter(Boolean);
		return list.length > 0 ? ` — ${inlineHtml(list.join('; '))}` : '';
	};

	const byParent = new Map();
	for (const conflict of Array.isArray(error.details) ? error.details : []) {
		const parent = conflict.parentPath
			? migrationLinkHtml(conflict.parentPath)
			: `<code>${htmlEscape(conflict.parentId ?? '(unknown parent)')}</code>`;
		if (!byParent.has(parent)) byParent.set(parent, new Map());
		const leaves = byParent.get(parent);
		for (const branch of Array.isArray(conflict.branches) ? conflict.branches : []) {
			const key = branch.leafPath ?? branch.leafId ?? '(unknown migration)';
			if (!leaves.has(key)) leaves.set(key, branch.leafPath ?? null);
		}
	}

	const groups = [];
	for (const [parent, leaves] of byParent) {
		const leafItems = [...leaves].map(([key, path]) => {
			const label = path ? migrationLinkHtml(path) : `<code>${htmlEscape(key)}</code>`;
			const emoji = path ? conflictEmoji(path) : '🔴';
			return `<dd>${emoji} ${label}${path ? origin(path) : ''}${path ? descsHtml(path) : ''}</dd>`;
		});
		// Children go into a sibling wrapper <dd> rather than the parent's own <dd>:
		// every line then carries the same dd bottom margin, keeping spacing uniform.
		groups.push(`<dd>🔀 ${parent} <em>(fork point)</em></dd><dd><dl>${leafItems.join('')}</dl></dd>`);
	}
	return [`<dl>${groups.join('')}</dl>`];
}

function regenerateCommands(ctx) {
	const wd = normalizedWd();
	const pmExec = (env.DRIZZLE_PM_EXEC || 'npx --no-install') === 'npx --no-install'
		? 'npx'
		: env.DRIZZLE_PM_EXEC;
	const config = env.DRIZZLE_CONFIG && env.DRIZZLE_CONFIG !== 'drizzle.config.ts'
		? ` --config ${env.DRIZZLE_CONFIG}`
		: '';

	const lastFolder = ctx.ownedFolders[ctx.ownedFolders.length - 1];
	const lastName = lastFolder.split('/').pop().split('_').slice(1).join('_');

	const commands = [];
	if (wd) commands.push(`cd ${wd}`);
	commands.push(`rm -rf ${ctx.ownedFolders.join(' ')}`);
	commands.push(`${pmExec} drizzle-kit generate${lastName ? ` --name ${lastName}` : ''}${config}`);
	return commands;
}

// Mermaid renders on github.com and GitHub Enterprise Cloud unconditionally, and on
// GitHub Enterprise Server starting with 3.7. Rendering happens client-side, so the
// server version is the only queryable signal.
async function mermaidSupported(token) {
	const server = env.GITHUB_SERVER_URL || 'https://github.com';
	let host;
	try {
		host = new URL(server).hostname;
	} catch {
		return false;
	}
	if (host === 'github.com' || host === 'ghe.com' || host.endsWith('.ghe.com')) return true;

	try {
		const api = env.GITHUB_API_URL || `${server.replace(/\/+$/, '')}/api/v3`;
		const response = await fetch(`${api}/meta`, {
			headers: {
				Accept: 'application/vnd.github+json',
				'User-Agent': 'drizzle-check-action',
				...(token ? { Authorization: `Bearer ${token}` } : {}),
			},
		});
		if (!response.ok) return false;
		const meta = await response.json();
		const match = typeof meta?.installed_version === 'string'
			? meta.installed_version.match(/^(\d+)\.(\d+)/)
			: null;
		if (!match) return false;
		const major = Number(match[1]);
		const minor = Number(match[2]);
		return major > 3 || (major === 3 && minor >= 7);
	} catch {
		return false;
	}
}

function renderConflicts(error, ctx, includeDiagram) {
	const details = Array.isArray(error.details) ? error.details : [];
	const count = typeof error.conflicts === 'number' ? error.conflicts : details.length;

	const leafIds = new Set();
	for (const conflict of details) {
		for (const branch of Array.isArray(conflict.branches) ? conflict.branches : []) {
			leafIds.add(branch.leafId ?? branch.leafPath);
		}
	}

	const lines = [
		`### ❌ Conflicting migrations detected`,
		'',
		`Found **${count}** conflict${count === 1 ? '' : 's'}`
		+ (leafIds.size > 0 ? ` across **${leafIds.size}** migration${leafIds.size === 1 ? '' : 's'}.` : '.'),
		'',
		'These migrations were generated in parallel from the same parent migration and modify the same '
		+ 'database objects, so the resulting database state depends on the order they are applied in.',
	];

	if (includeDiagram) {
		lines.push('', ...renderMermaid(error, ctx));
	}
	lines.push('', ...renderNestedList(error, ctx));

	if (ctx && ctx.ownedFolders.length > 0) {
		const plural = ctx.ownedFolders.length === 1 ? '' : 's';
		lines.push(
			'',
			`To resolve this, update the branch with the latest ${ctx.baseRef ? `\`${ctx.baseRef}\`` : 'base branch'} `
				+ `(merge or rebase), then regenerate this branch's migration${plural} on top of the migrations it brings in:`,
			'',
			'```sh',
			...regenerateCommands(ctx),
			'```',
			'',
			'Commit the result and push.',
		);
	} else {
		lines.push(
			'',
			'To resolve this, regenerate the migration that belongs to this branch: update the branch with '
				+ "the latest base branch, delete this branch's conflicting migration folder, and run "
				+ '`drizzle-kit generate` again so the migration is created on top of the latest one.',
		);
	}

	return lines.join('\n');
}

function renderError(error, exitCode) {
	const kind = error?.kind ? ` (\`${error.kind}\`)` : '';
	const message = error?.message ?? `drizzle-kit check failed with exit code ${exitCode}`;
	return `### ⚠️ drizzle-kit check failed${kind}\n\n${message}`;
}

function renderNotFound(workingDirectory) {
	return `### ⚠️ drizzle-kit not found\n\n`
		+ `\`drizzle-kit\` could not be resolved in \`${workingDirectory}\`. `
		+ `Make sure the workflow installs dependencies before this step and that \`drizzle-kit\` is a `
		+ `dependency of the package containing your drizzle config. In a monorepo, point the `
		+ `\`working-directory\` input at that package.`;
}

async function gh(method, path, token, body) {
	const response = await fetch(`https://api.github.com${path}`, {
		method,
		headers: {
			Authorization: `Bearer ${token}`,
			Accept: 'application/vnd.github+json',
			'X-GitHub-Api-Version': '2022-11-28',
			'User-Agent': 'drizzle-check-action',
			'Content-Type': 'application/json',
		},
		body: body ? JSON.stringify(body) : undefined,
	});
	if (!response.ok) {
		const text = await response.text();
		throw new Error(`GitHub API ${method} ${path} failed: ${response.status} ${text}`);
	}
	return response;
}

async function findExistingComment(repo, prNumber, token) {
	let page = 1;
	while (true) {
		const response = await gh(
			'GET',
			`/repos/${repo}/issues/${prNumber}/comments?per_page=100&page=${page}`,
			token,
		);
		const comments = await response.json();
		if (!Array.isArray(comments) || comments.length === 0) return null;
		const match = comments.find((comment) => typeof comment.body === 'string' && comment.body.includes(MARKER));
		if (match) return match;
		if (comments.length < 100) return null;
		page++;
	}
}

async function upsertComment(repo, prNumber, token, body) {
	const fullBody = `${MARKER}\n${body}`;
	const existing = await findExistingComment(repo, prNumber, token);
	if (existing) {
		await gh('PATCH', `/repos/${repo}/issues/comments/${existing.id}`, token, { body: fullBody });
	} else {
		await gh('POST', `/repos/${repo}/issues/${prNumber}/comments`, token, { body: fullBody });
	}
}

async function main() {
	const exitCode = Number.parseInt(env.DRIZZLE_CHECK_EXIT_CODE ?? '0', 10) || 0;
	const envelope = parseEnvelope(env.DRIZZLE_CHECK_ENVELOPE);

	const token = env.GITHUB_TOKEN;
	const repo = env.GITHUB_REPOSITORY;
	const event = readEvent();
	const prNumber = resolvePrNumber(event);

	let body;
	let hasConflicts = false;
	let failed = exitCode !== 0;

	if (env.DRIZZLE_CHECK_NOT_FOUND === 'true') {
		body = renderNotFound(env.DRIZZLE_WORKING_DIRECTORY || '.');
		failed = true;
	} else if (envelope?.status === 'ok') {
		body = renderClean(envelope);
		failed = exitCode !== 0;
	} else if (
		envelope?.status === 'error'
		&& envelope.error?.code === 'check_error'
		&& envelope.error?.kind === 'conflicts'
	) {
		let ctx = null;
		if (prNumber && token && repo) {
			try {
				const files = await fetchPrFiles(repo, prNumber, token);
				ctx = buildBranchContext(envelope.error, files, event);
			} catch (e) {
				notice(`Could not determine which migrations belong to this PR: ${e instanceof Error ? e.message : e}`);
			}
		}
		const diagramInput = (env.DRIZZLE_DIAGRAM || '').toLowerCase().trim();
		const includeDiagram = diagramInput === ''
			? await mermaidSupported(token)
			: diagramInput !== 'false';
		body = renderConflicts(envelope.error, ctx, includeDiagram);
		hasConflicts = true;
		failed = true;
	} else if (envelope?.status === 'error') {
		body = renderError(envelope.error, exitCode);
		failed = true;
	} else {
		body = renderError(undefined, exitCode);
		failed = true;
	}

	if (!prNumber || !token || !repo) {
		notice('No pull request context — skipping sticky comment.');
	} else {
		try {
			await upsertComment(repo, prNumber, token, body);
		} catch (e) {
			process.stdout.write(`::error::${e instanceof Error ? e.message : String(e)}\n`);
			// A comment-write failure must not mask a clean check, but must not hide conflicts either.
			if (!failed) process.exit(1);
		}
	}

	process.exit(hasConflicts || failed ? 1 : 0);
}

main().catch((e) => {
	process.stdout.write(`::error::${e instanceof Error ? e.message : String(e)}\n`);
	process.exit(1);
});
