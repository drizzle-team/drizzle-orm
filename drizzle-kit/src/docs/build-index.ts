import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { gzipSync } from 'node:zlib';
import { insertMultiple, saveBinarySync } from 'zbsearch';
import {
	createDocsDb,
	docsDialects,
	type DocsPage,
	type DocsPagesFile,
	type DocsSection,
	INDEX_FILE,
	PAGES_FILE,
} from './search';

const coreImport = /drizzle-orm\/(pg|mysql|sqlite|mssql|cockroach|singlestore|gel)-core/g;
const configDialects: Record<string, string> = {
	postgresql: 'pg',
	mysql: 'mysql',
	sqlite: 'sqlite',
	turso: 'sqlite',
	mssql: 'mssql',
	cockroach: 'cockroach',
	singlestore: 'singlestore',
	gel: 'gel',
};

const walk = (dir: string): string[] =>
	readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) return walk(path);
		return entry.name.endsWith('.mdx') ? [path] : [];
	});

const parseFrontmatter = (src: string): { fields: Record<string, string>; body: string } => {
	const match = src.match(/^---\n([\s\S]*?)\n---\n?/);
	if (!match) return { fields: {}, body: src };
	const fields: Record<string, string> = {};
	for (const line of match[1]!.split('\n')) {
		const field = line.match(/^(\w+):\s*(.*)$/);
		if (field) fields[field[1]!] = field[2]!.replace(/^["']|["']$/g, '');
	}
	return { fields, body: src.slice(match[0].length) };
};

// Inlines `@mdx/*.mdx` partials and removes imports and JSX tags. Prose and code fences stay as they are.
const cleanMdx = (src: string, partialsDir: string, depth = 0): string => {
	src = src.replace(/<style[\s\S]*?<\/style>/g, '').replace(/<script[\s\S]*?<\/script>/g, '');
	const partials = new Map<string, string>();
	for (const match of src.matchAll(/^import\s+(\w+)\s+from\s+['"]@mdx\/([^'"]+\.mdx)['"];?\s*$/gm)) {
		const file = join(partialsDir, match[2]!);
		if (depth < 3 && existsSync(file)) {
			partials.set(match[1]!, cleanMdx(parseFrontmatter(readFileSync(file, 'utf8')).body, partialsDir, depth + 1));
		}
	}
	const out: string[] = [];
	let inFence = false;
	let inTag = false;
	for (let line of src.split('\n')) {
		if (/^\s*```/.test(line)) {
			inFence = !inFence;
			out.push(line.replace(/^\s+/, ''));
			continue;
		}
		if (inFence) {
			out.push(line);
			continue;
		}
		if (/^import\s.+from\s/.test(line) || /^export\s+const\s/.test(line)) continue;
		if (inTag) {
			if (!line.includes('>')) continue;
			inTag = false;
			line = line.slice(line.indexOf('>') + 1);
		}
		const selfClosing = line.match(/^\s*<(\w+)\b[^>]*\/>\s*$/);
		if (selfClosing && partials.has(selfClosing[1]!)) {
			out.push(partials.get(selfClosing[1]!)!);
			continue;
		}
		// An opening tag that continues on the next lines.
		if (/^\s*<[A-Za-z][\w.]*\b[^>]*$/.test(line)) {
			inTag = true;
			continue;
		}
		out.push(line.replace(/<\/?(?:[A-Z][\w.]*|li|ul|ol|div|span|br|p)\b[^>]*\/?>/g, '').replace(/^\s+$/, ''));
	}
	return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
};

const slug = (text: string) => text.toLowerCase().replace(/`/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const kindOf = (id: string): string => {
	const top = id.split('/')[0]!;
	if (top === 'latest-releases') return 'release';
	if (top === 'guides' || top === 'tutorials' || top === 'get-started') return top.replace(/s$/, '');
	return 'reference';
};

const dialectsOf = (id: string, text: string): string[] => {
	const top = id.split('/')[0]!;
	if ((docsDialects as readonly string[]).includes(top)) return [top];
	if (id.startsWith('column-types/')) return [id.split('/')[1]!];
	const found = new Set<string>();
	for (const match of text.matchAll(coreImport)) found.add(match[1]!);
	for (const match of text.matchAll(/dialect:\s*['"](\w+)['"]/g)) {
		const dialect = configDialects[match[1]!];
		if (dialect) found.add(dialect);
	}
	return found.size ? [...found] : ['any'];
};

// Splits a page at `##`, `###` and `####` headings. Repeated headings get `-1`, `-2` anchor suffixes, as on GitHub.
const splitSections = (title: string, markdown: string): DocsSection[] => {
	const sections: DocsSection[] = [];
	const used = new Map<string, number>();
	let current = { anchor: '', heading: title, level: 1, lines: [] as string[] };
	let inFence = false;
	const flush = () => {
		const text = current.lines.join('\n').trim();
		if (text) sections.push({ anchor: current.anchor, heading: current.heading, level: current.level, markdown: text });
	};
	for (const line of markdown.split('\n')) {
		if (line.startsWith('```')) inFence = !inFence;
		const heading = inFence ? null : line.match(/^(#{2,4})\s+(.+)$/);
		if (!heading) {
			current.lines.push(line);
			continue;
		}
		flush();
		// An empty anchor marks the intro, so a heading with no letters or digits gets one.
		const base = slug(heading[2]!) || 'section';
		const count = used.get(base) ?? 0;
		used.set(base, count + 1);
		current = {
			anchor: count ? `${base}-${count}` : base,
			heading: heading[2]!.replace(/`/g, ''),
			level: heading[1]!.length,
			lines: [line],
		};
	}
	flush();
	return sections;
};

const firstParagraph = (markdown: string): string => {
	let inFence = false;
	for (const line of markdown.split('\n')) {
		if (line.startsWith('```')) {
			inFence = !inFence;
			continue;
		}
		const text = line.trim();
		// Skips headings, lists, tables, markup and bare package lists such as `drizzle-orm@rc drizzle-kit@rc`.
		const isPackageList = /^[\w@/.-]+(\s+[\w@/.-]+)*$/.test(text) && text.includes('@');
		if (inFence || !text || /^[#>|\-*{<[!]/.test(text) || !/\s/.test(text) || isPackageList) continue;
		const plain = text.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
		return plain.length > 160 ? `${plain.slice(0, 157)}...` : plain;
	}
	return '';
};

const docsCommitOf = (docsRepo: string): string => {
	try {
		return execFileSync('git', ['-C', docsRepo, 'rev-parse', 'HEAD'], {
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'ignore'],
		}).trim();
	} catch {
		return 'unknown';
	}
};

// Builds the docs index from a checkout of drizzle-team/drizzle-orm-docs and writes its two files into `outDir`.
export const writeDocsIndex = async (docsRepo: string, outDir: string) => {
	const contentDir = join(docsRepo, 'src', 'content', 'docs');
	const partialsDir = join(docsRepo, 'src', 'mdx');
	if (!existsSync(contentDir)) throw new Error(`The docs folder '${contentDir}' does not exist.`);

	const pages: DocsPage[] = [];
	const documents: Record<string, unknown>[] = [];
	for (const file of walk(contentDir).sort()) {
		const id = relative(contentDir, file).replace(/\.mdx$/, '').split(sep).join('/');
		const { fields, body } = parseFrontmatter(readFileSync(file, 'utf8'));
		const markdown = cleanMdx(body, partialsDir);
		if (markdown.length < 40) continue;
		const title = (fields['title'] || markdown.match(/^#\s+(.+)$/m)?.[1] || id).replace(/`/g, '');
		const description = fields['description'] || firstParagraph(markdown.replace(/^#\s+.+$/m, ''));
		const kind = kindOf(id);
		const dialects = dialectsOf(id, markdown);
		const sections = splitSections(title, markdown);
		pages.push({ id, title, description, kind, dialects, sections });
		for (const section of sections) {
			documents.push({
				id: `${id}#${section.anchor}`,
				page: id,
				kind,
				dialects,
				title,
				heading: section.heading,
				body: section.markdown,
			});
		}
	}

	const db = createDocsDb();
	await insertMultiple(db, documents as never, 500);
	const pagesFile: DocsPagesFile = { docsCommit: docsCommitOf(docsRepo), pages };
	const index = gzipSync(saveBinarySync(db));
	const pagesData = gzipSync(JSON.stringify(pagesFile));
	mkdirSync(outDir, { recursive: true });
	writeFileSync(join(outDir, INDEX_FILE), index);
	writeFileSync(join(outDir, PAGES_FILE), pagesData);
	return { pages: pages.length, sections: documents.length, bytes: index.length + pagesData.length };
};
