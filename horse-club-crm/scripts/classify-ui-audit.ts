// Keep the upstream audit intact; verify its JSX findings against TypeScript's AST.
import * as fs from 'node:fs'
import * as path from 'node:path'
import ts from '../frontend/node_modules/typescript/lib/typescript.js'
import { execFileSync } from 'node:child_process'

interface Finding {
  ruleId: string
  file?: string
  line?: number
  [key: string]: unknown
}
type Tag = ts.JsxOpeningElement | ts.JsxSelfClosingElement

const input = process.argv[2] || 'docs/ui-audit-after.json'
const output = process.argv[3] || 'docs/ui-audit-classified.json'
const report: { findings: Finding[] } = JSON.parse(fs.readFileSync(input, 'utf8'))
const cache = new Map<string, { source: ts.SourceFile; tags: Tag[] }>()
function sourceFor(file: string): { source: ts.SourceFile; tags: Tag[] } {
  if (!cache.has(file)) {
    const text = process.argv.includes('--git-head') ? execFileSync('git', ['show', `HEAD:./${file.replaceAll('\\', '/')}`], { encoding: 'utf8' }) : fs.readFileSync(file, 'utf8')
    const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
    const tags: Tag[] = []
    const visit = (node: ts.Node) => {
      if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) tags.push(node)
      ts.forEachChild(node, visit)
    }
    visit(source)
    cache.set(file, { source, tags })
  }
  return cache.get(file)!
}
const findings = report.findings.map(finding => {
  if (!finding.file || !finding.line) return { ...finding, classification: 'unreviewed' }
  const { source, tags } = sourceFor(finding.file)
  const candidates = tags.filter(node => source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1 === finding.line)
  const expected = finding.ruleId === 'form.novalidate-missing' ? 'Form.Item'
    : finding.ruleId === 'ownership.native-select-conflict' ? 'Select' : undefined
  const tag = candidates.find(node => node.tagName.getText(source) === expected)
    || (expected === 'Form.Item' ? candidates.find(node => node.tagName.getText(source) === 'Form' && node.typeArguments?.length
      && node.attributes.properties.some(attribute => ts.isJsxAttribute(attribute) && attribute.name.getText(source) === 'noValidate' && !attribute.initializer)) : undefined)
  // Require the actual Ant Design import, not just a coincidentally named component.
  const imported = source.statements.some(node => ts.isImportDeclaration(node)
    && ts.isStringLiteral(node.moduleSpecifier) && node.moduleSpecifier.text === 'antd'
    && node.importClause?.namedBindings && ts.isNamedImports(node.importClause.namedBindings)
    && node.importClause.namedBindings.elements.some(element => element.name.text === expected?.split('.')[0]))
  return { ...finding, classification: tag && imported ? 'false-positive' : 'unreviewed',
    jsxTag: tag?.tagName.getText(source),
    reason: tag && imported ? expected === 'Form.Item'
      ? tag.tagName.getText(source) === 'Form' ? 'Generic JSX Form<T> already declares noValidate; the HTML parser stops at the type argument closing bracket.'
        : 'Ant Design Form.Item is a field wrapper, not an HTML form. noValidate belongs to the parent Form.'
      : 'Ant Design Select is the authored canonical combobox, not a native HTML select.' : undefined }
})
function filesIn(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory()
    ? filesIn(path.join(dir, entry.name)) : /\.tsx$/.test(entry.name) ? [path.join(dir, entry.name)] : [])
}
const forms = filesIn('frontend/src').flatMap(file => {
  const { source, tags } = sourceFor(file)
  return tags.filter(node => ['Form', 'form'].includes(node.tagName.getText(source))).map(node => ({
    file: file.replaceAll('\\', '/'), line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1,
    noValidate: node.attributes.properties.some(attribute => ts.isJsxAttribute(attribute)
      && ['noValidate', 'novalidate'].includes(attribute.name.getText(source)) && !attribute.initializer),
  }))
})
const summary = { raw: findings.length, falsePositives: findings.filter(f => f.classification === 'false-positive').length,
  unreviewed: findings.filter(f => f.classification === 'unreviewed').length,
  forms: forms.length, formsWithoutNoValidate: forms.filter(form => !form.noValidate).length }
fs.writeFileSync(output, JSON.stringify({ input, summary, forms, findings }, null, 2) + '\n')
console.log(JSON.stringify(summary))
if (summary.unreviewed || summary.formsWithoutNoValidate) process.exitCode = 1
