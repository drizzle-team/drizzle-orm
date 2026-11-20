import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { create, loadBinarySync, search } from 'zbsearch';
import type { Dialect } from '../utils/schemaValidator';

export const docsDialects = ['pg', 'mysql', 'sqlite', 'mssql', 'cockroach', 'singlestore', 'gel'] as const;
export type DocsDialect = (typeof docsDialects)[number];

export const INDEX_FILE = 'index.bin.gz';
export const PAGES_FILE = 'pages.json.gz';

export interface DocsSection {
	// An empty anchor marks the intro: the text before the first heading.
	anchor: string;
	heading: string;
	level: number;
	markdown: string;
}

export interface DocsPage {
	id: string;
	title: string;
	description: string;
	kind: string;
	// Folders of `docsDialects`, or `any`.
	dialects: string[];
	sections: DocsSection[];
}

export interface DocsPagesFile {
	docsCommit: string;
	pages: DocsPage[];
}

const schema = {
	page: 'enum',
	kind: 'enum',
	dialects: 'enum[]',
	title: 'string',
	heading: 'string',
	body: 'string',
} as const;

export const createDocsDb = () =>
	create(
		{
			schema,
			// `retrieve` reads the text from the pages file, so the search store keeps only ids and filter fields.
			store: { exclude: ['title', 'heading', 'body'] },
			components: { tokenizer: { language: 'english', stemming: true } },
		} as Parameters<typeof create>[0],
	);

export interface DocsIndex {
	db: ReturnType<typeof createDocsDb>;
	pages: Map<string, DocsPage>;
}

export const loadDocsIndex = (dir: string): DocsIndex => {
	const indexPath = join(dir, INDEX_FILE);
	const pagesPath = join(dir, PAGES_FILE);
	if (!existsSync(indexPath) || !existsSync(pagesPath)) {
		throw new Error('This drizzle-kit build has no docs index.');
	}
	const db = createDocsDb();
	loadBinarySync(db, gunzipSync(readFileSync(indexPath)));
	const file: DocsPagesFile = JSON.parse(gunzipSync(readFileSync(pagesPath)).toString('utf8'));
	return { db, pages: new Map(file.pages.map((page) => [page.id, page])) };
};

const dialectFolders: Record<Dialect, DocsDialect | undefined> = {
	postgresql: 'pg',
	mysql: 'mysql',
	sqlite: 'sqlite',
	turso: 'sqlite',
	singlestore: 'singlestore',
	mssql: 'mssql',
	cockroach: 'cockroach',
	duckdb: undefined,
};

export const docsDialectOf = (dialect: Dialect): DocsDialect | undefined => dialectFolders[dialect];

export interface DocsHit {
	id: string;
	title: string;
	description: string;
}

// Scores sections with BM25 and keeps the best page hits. `prefix: false` gave the best Hit@1 in the prototype
// benchmark.
export const searchDocs = async (
	index: DocsIndex,
	query: string,
	{ dialect, limit = 10 }: { dialect?: DocsDialect; limit?: number } = {},
): Promise<DocsHit[]> => {
	const where: Record<string, unknown> = { kind: { nin: ['release'] } };
	if (dialect) where['dialects'] = { containsAny: [dialect, 'any'] };
	const result = await search(
		index.db,
		{
			term: query,
			properties: ['title', 'heading', 'body'],
			boost: { title: 3, heading: 2, body: 1 },
			prefix: false,
			limit: 400,
			where,
		} as Parameters<typeof search>[1],
	);

	const hits = new Map<string, { page: DocsPage; anchor?: string }>();
	for (const hit of result.hits) {
		const { id, page: pageId } = hit.document as unknown as { id: string; page: string };
		const anchor = id.slice(id.indexOf('#') + 1);
		const existing = hits.get(pageId);
		if (existing) {
			existing.anchor ??= anchor || undefined;
			continue;
		}
		if (hits.size >= limit) continue;
		hits.set(pageId, { page: index.pages.get(pageId)!, anchor: anchor || undefined });
	}
	return [...hits.values()].map(({ page, anchor }) => ({
		id: anchor ? `${page.id}#${anchor}` : page.id,
		title: page.title,
		description: page.description,
	}));
};

const MAX_DESCRIPTION_LENGTH = 160;

const toOneLine = (text: string) => text.replace(/`/g, '').replace(/\s+/g, ' ').trim();

// Prints one hit per line as `id  title: description`, which costs an agent fewer tokens than JSON.
export const formatDocsHits = (hits: DocsHit[], query: string): string => {
	if (!hits.length) return `No docs match "${query}". Try other words or fewer words.`;
	return hits.map((hit) => {
		const title = toOneLine(hit.title);
		let description = toOneLine(hit.description);
		if (description.length > MAX_DESCRIPTION_LENGTH) {
			description = `${description.slice(0, MAX_DESCRIPTION_LENGTH - 3)}...`;
		}
		return description ? `${hit.id}  ${title}: ${description}` : `${hit.id}  ${title}`;
	}).join('\n');
};

// Agent harnesses cut tool output at about 10 KB, so a larger result becomes an intro and a section list.
const LARGE_OUTPUT_BYTES = 9500;

export const retrieveDoc = (index: DocsIndex, id: string, { full = false }: { full?: boolean } = {}): string => {
	const [pageId = '', anchor = ''] = id.trim().split('#');
	const page = index.pages.get(pageId);
	if (!page) {
		throw new Error(`No docs page has the id '${pageId}'. Run 'drizzle-kit docs search' to find an id.`);
	}

	let sections = page.sections;
	if (anchor) {
		const start = page.sections.findIndex((section) => section.anchor === anchor);
		if (start === -1) {
			const anchors = page.sections.map((section) => section.anchor).filter(Boolean);
			throw new Error(`The page '${pageId}' has no section '${anchor}'. Its sections are: ${anchors.join(', ')}`);
		}
		const level = page.sections[start]!.level;
		let end = start + 1;
		while (end < page.sections.length && page.sections[end]!.level > level) end++;
		sections = page.sections.slice(start, end);
	}

	const comment = `<!-- ${anchor ? `${pageId}#${anchor}` : pageId} (${page.dialects.join(', ')}) -->`;
	const header = sections[0]!.markdown.startsWith('# ') ? comment : `${comment}\n# ${page.title}`;
	const text = `${header}\n\n${sections.map((section) => section.markdown).join('\n\n')}`;
	if (full || sections.length === 1 || Buffer.byteLength(text) <= LARGE_OUTPUT_BYTES) return text;

	const [first, ...rest] = sections;
	const intro = first!.anchor === anchor ? [first!] : [];
	const listed = intro.length ? rest : sections;
	const levels = [...new Set(listed.map((section) => section.level))].sort();
	const list = listed.map((section) => {
		const indent = '  '.repeat(levels.indexOf(section.level));
		return `${indent}- ${pageId}#${section.anchor}  ${section.heading}  (~${
			Math.ceil(section.markdown.length / 4)
		} tokens)`;
	});
	return [
		header,
		...intro.map((section) => section.markdown),
		`## Sections\n\nRetrieve one section with \`drizzle-kit docs retrieve <id>\`, or use --full to get all of them.\n\n${
			list.join('\n')
		}`,
	].join('\n\n');
};
