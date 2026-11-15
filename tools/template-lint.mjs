#!/usr/bin/env node
/**
 * template-lint.mjs — catches hardcoded PROSE boilerplate in programmatic page
 * templates (.astro), the blind spot the AI-content bulletproofing can't see.
 *
 * The bug class: a multi-sentence prose literal written straight into a template
 * (a JSX text node) renders byte-identical on every generated page — thin/
 * duplicate content. The content prompts only govern AI-GENERATED text, so this
 * leaks through the template layer. This lint is the guard.
 *
 * Rule: a TEXT NODE in the template body with >= MIN_WORDS words of STATIC text
 * (after stripping {expr} interpolations) is flagged.
 *   - ERROR  : the text node has ZERO interpolation -> literally identical on
 *              every page. Build should fail.
 *   - WARN   : it has some interpolation but a long static remainder -> likely
 *              templated/branched; review (does not fail the build).
 * Exempt a legitimately-static block (e.g. a short legal disclaimer) by putting
 *   {/* template-lint-ok: reason *​/}
 * on the line immediately before it.
 *
 * Usage: node tools/template-lint.mjs <dir> [<dir>...] [--strict] [--quiet]
 * Exit 1 if any ERROR (or any WARN when --strict).
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname, relative } from 'node:path';

const MIN_WORDS = 12;          // static-word floor to consider a text node "prose"
const WARN_MIN_WORDS = 22;     // higher bar for interpolated nodes (reduce branched-copy noise)

const args = process.argv.slice(2);
const strict = args.includes('--strict');
const quiet = args.includes('--quiet');
const dirs = args.filter(a => !a.startsWith('--'));
if (dirs.length === 0) { console.error('usage: template-lint <dir> [dir...] [--strict]'); process.exit(2); }

/**
 * In scope = templates that render MANY pages. A one-off static page (about,
 * privacy, terms…) legitimately contains prose and isn't duplicated, so it's
 * skipped: a page file is only scanned if its route is dynamic (path contains a
 * [param]). Components and layouts are always scanned — their prose propagates
 * to every page that renders them.
 */
function inScope(p) {
  const norm = p.replace(/\\/g, '/');
  const isPage = /\/pages\//.test(norm);
  const isDynamic = /\[[^/]+\]/.test(norm);
  if (isPage && !isDynamic) return false; // static one-off page
  return true;
}

/** Recursively collect in-scope .astro files. */
function collect(p, out) {
  let st; try { st = statSync(p); } catch { return; }
  if (st.isDirectory()) {
    if (/node_modules|\.git|dist|\.astro/.test(p)) return;
    for (const name of readdirSync(p)) collect(join(p, name), out);
  } else if (extname(p) === '.astro' && inScope(p)) out.push(p);
}

/** Split a .astro file into [frontmatter, templateBody], dropping the leading --- block. */
function templateBody(src) {
  const m = src.match(/^\s*---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  return m ? src.slice(m[0].length) : src;
}

/** Map a char offset in the (post-frontmatter) body back to a 1-based file line. */
function lineAt(src, bodyStart, offsetInBody) {
  return src.slice(0, bodyStart + offsetInBody).split('\n').length;
}

const findings = [];

for (const dir of dirs) {
  const files = [];
  collect(dir, files);
  for (const file of files) {
    const src = readFileSync(file, 'utf8');
    const bodyStart = src.length - templateBody(src).length;
    let body = templateBody(src);

    // Blank out <script>/<style> blocks and comments (keep length so offsets hold).
    const blank = (s) => ' '.repeat(s.length);
    body = body.replace(/<script[\s\S]*?<\/script>/gi, blank);
    body = body.replace(/<style[\s\S]*?<\/style>/gi, blank);
    body = body.replace(/<!--[\s\S]*?-->/g, blank);
    // Astro/JSX comments {/* ... */} — but capture exemption markers first.
    const exemptLines = new Set();
    for (const cm of body.matchAll(/\{\/\*([\s\S]*?)\*\/\}/g)) {
      if (/template-lint-ok/i.test(cm[1])) {
        // exempt the line AFTER the marker
        exemptLines.add(lineAt(src, bodyStart, cm.index) + 1);
      }
    }
    body = body.replace(/\{\/\*[\s\S]*?\*\/\}/g, blank);

    // Walk text nodes: the spans between '>' and the next '<'.
    const re = />([^<>]+)</g;
    let mm;
    while ((mm = re.exec(body)) !== null) {
      const raw = mm[1];
      const textOffset = mm.index + 1;
      const line = lineAt(src, bodyStart, textOffset);
      if (exemptLines.has(line)) continue;
      const hasInterp = /\{[^}]*\}/.test(raw);
      const staticText = raw.replace(/\{[^}]*\}/g, ' ').replace(/&[a-z]+;/gi, ' ').trim();
      if (!staticText) continue;
      // Skip text nodes that are actually JS expressions leaking through (a
      // multiline {() => {...}} block whose inner code the brace-strip missed).
      if (/=>|;|\b(const|let|var|function|return|null|undefined)\b/.test(staticText)) continue;
      const words = staticText.split(/\s+/).filter(w => /[a-z]/i.test(w));
      if (words.length < MIN_WORDS) continue;
      // Require it to read like prose (has a space + a lowercase letter sequence),
      // not e.g. a long className or URL token.
      if (!/[a-z]{3,}\s+[a-z]{3,}/.test(staticText)) continue;

      const snippet = staticText.length > 90 ? staticText.slice(0, 90) + '…' : staticText;
      if (!hasInterp) {
        findings.push({ sev: 'ERROR', file, line, words: words.length, snippet });
      } else if (words.length >= WARN_MIN_WORDS) {
        findings.push({ sev: 'WARN', file, line, words: words.length, snippet });
      }
    }
  }
}

const errors = findings.filter(f => f.sev === 'ERROR');
const warns = findings.filter(f => f.sev === 'WARN');

if (!quiet) {
  for (const f of findings) {
    console.log(`  [${f.sev}] ${relative(process.cwd(), f.file)}:${f.line}  (${f.words}w)  "${f.snippet}"`);
  }
  console.log(`\ntemplate-lint: ${errors.length} error(s), ${warns.length} warning(s) across ${dirs.join(', ')}`);
  if (errors.length) console.log('  → hardcoded prose with NO interpolation renders identically on every page. Make it data-driven, remove it, or mark {/* template-lint-ok: <reason> */}.');
}

process.exit(errors.length > 0 || (strict && warns.length > 0) ? 1 : 0);
