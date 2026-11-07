import ts from 'typescript';
import { afterEach, describe, expect, it } from 'vitest';
import { englishLabels } from './translations';
import { memberLabels } from '../../features/member/memberLabels';
import { staffSourceCatalog } from '../../features/operations/staffSourceCatalog';
import { englishShopPublicLabels } from '../../features/shop/shopTranslations';
import { clearMissingTranslations, getMissingTranslations, setLanguage, translateSource } from './language';
import routerSource from '../../app/router.tsx?raw';

// Inspect source-owned text only. This does not substitute for logged-in browser/E2E verification.
const files = import.meta.glob<string>(['../../features/**/*.{ts,tsx}', '../../shared/**/*.{ts,tsx}', '!../../**/*.test.{ts,tsx}'], { query: '?raw', import: 'default', eager: true });
const ast = new Map(Object.entries(files).map(([name, content]) => [name, ts.createSourceFile(name, content, ts.ScriptTarget.Latest, true, name.endsWith('tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)]));
const router = ts.createSourceFile('router.tsx', routerSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const routes: { route: string; entry: string }[] = [];
function walk(node: ts.Node, visit: (node: ts.Node) => void) { visit(node); node.forEachChild(child => walk(child, visit)); }
walk(router, node => {
  if (!ts.isObjectLiteralExpression(node)) return;
  const path = node.properties.find(p => ts.isPropertyAssignment(p) && p.name.getText(router) === 'path');
  const lazy = node.properties.find(p => ts.isPropertyAssignment(p) && p.name.getText(router) === 'lazy');
  if (!path || !ts.isPropertyAssignment(path) || !ts.isStringLiteral(path.initializer) || !lazy) return;
  const routePath = path.initializer.text;
  walk(lazy, child => { if (ts.isCallExpression(child) && child.expression.kind === ts.SyntaxKind.ImportKeyword && ts.isStringLiteral(child.arguments[0])) routes.push({ route: routePath, entry: child.arguments[0].text.replace('../features/', '../../features/') + '.tsx' }); });
});
function resolve(file: string, dependency: string) {
  const parts = (file.substring(0, file.lastIndexOf('/') + 1) + dependency).split('/');
  const normalized: string[] = [];
  for (const part of parts) { if (part === '.') continue; if (part === '..' && normalized.length && normalized.at(-1) !== '..') normalized.pop(); else normalized.push(part); }
  const base = normalized.join('/');
  return [base, base + '.tsx', base + '.ts', base + '/index.ts'].find(candidate => ast.has(candidate));
}
function reachable(entry: string, seen = new Set<string>()): Set<string> {
  if (seen.has(entry)) return seen;
  seen.add(entry); const source = ast.get(entry); if (!source) return seen;
  walk(source, node => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier) && node.moduleSpecifier.text.startsWith('.')) {
      const dependency = resolve(entry, node.moduleSpecifier.text); if (dependency) reachable(dependency, seen);
    }
  });
  return seen;
}
const translationCalls = new Set(['t', 'memberText', 'memberMessage', 'sourceText', 'sourcePair', 'sourceFormat', 'sourceMessage', 'staffMessage']);
function catalog(file: string) {
  const domain = /\/(member|courts|checkin|schedule|wallet|payments)\//.test(file) ? memberLabels
    : /\/(coaching|classes|reception|manager|operations|support)\//.test(file) ? staffSourceCatalog
    : /\/(landing|auth|shop|pwa)\//.test(file) ? englishShopPublicLabels : {};
  return { ...englishLabels, ...domain };
}
afterEach(() => { localStorage.clear(); setLanguage('vi'); clearMissingTranslations(); });
describe('active route source translation coverage', () => {
  it('discovers every lazy route instead of maintaining a hand-picked screen list', () => { expect(routes.length).toBeGreaterThanOrEqual(50); });
  for (const { route, entry } of routes) it(route + ' has paired source labels and no raw Vietnamese JSX', () => {
    const errors: string[] = []; let labels = 0;
    for (const file of reachable(entry)) {
      const source = ast.get(file); if (!source) { errors.push('Missing route source: ' + file); continue; }
      const messages = catalog(file);
      walk(source, node => {
        if (ts.isJsxText(node) && /[\u00c0-\u1ef9]/u.test(node.text) && !/^\s*SÖL(?:\s+(?:Fitness|AI))?\s*$/i.test(node.text)) {
          let parent: ts.Node | undefined = node.parent, bilingualBranch = false;
          while (parent && !ts.isFunctionDeclaration(parent)) { if (ts.isConditionalExpression(parent) && /lang|english|locale|language/i.test(parent.condition.getText(source))) bilingualBranch = true; parent = parent.parent; }
          if (!bilingualBranch) errors.push(file + ': raw JSX ' + node.text.trim());
        }
        if (ts.isJsxAttribute(node) && node.initializer && ts.isStringLiteral(node.initializer) && ['title', 'placeholder', 'alt', 'aria-label', 'label', 'eyebrow', 'description', 'confirmLabel', 'cancelLabel'].includes(node.name.getText(source)) && /[\u00c0-\u1ef9]/u.test(node.initializer.text.replace(/S?L/gi, '')) && node.initializer.text !== 'Ti?ng Vi?t') {
          errors.push(file + ': raw UI attribute ' + node.initializer.text);
        }
        if (!ts.isCallExpression(node) || !translationCalls.has(node.expression.getText(source))) return;
        const first = node.arguments[0]; if (!first || !ts.isStringLiteral(first)) return;
        const vi = first.text, explicit = node.arguments[1];
        const en = explicit && ts.isStringLiteral(explicit) ? explicit.text : messages[vi] ?? messages[vi.trim().replace(/\s+/g, ' ')];
        if (!/[\u00c0-\u1ef9]/u.test(vi.replace(/SÖL/gi, '')) || vi === 'Tiếng Việt') return;
        labels++;
        if (en === undefined) { errors.push(file + ': missing EN ' + vi); return; }
        expect(translateSource(vi, en, 'vi')).toBe(vi);
        expect(translateSource(vi, en, 'en')).toBe(vi.replace(vi.trim(), en));
      });
    }
    expect(labels, route).toBeGreaterThan(0);
    expect(errors, route).toEqual([]);
    expect(getMissingTranslations()).toEqual([]);
  });
});