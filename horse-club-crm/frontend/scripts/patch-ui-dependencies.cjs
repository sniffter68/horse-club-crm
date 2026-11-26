// rc-select 14.16.8 reads element.ref, which React 19 reports as console.error.
// Keep the patch reproducible after npm ci until the upstream dependency is upgraded.
const fs = require('node:fs')
const path = require('node:path')
const root = path.dirname(require.resolve('rc-select/package.json'))
for (const variant of ['es', 'lib']) {
  const file = path.join(root, variant, 'Selector', 'Input.js')
  const source = fs.readFileSync(file, 'utf8')
  const before = 'originRef = _inputNode.ref,'
  const after = "originRef = Number(React.version.split('.')[0]) >= 19 ? _inputNode.props.ref : _inputNode.ref,"
  if (source.includes(after)) continue
  if (!source.includes(before)) throw new Error(`Review React 19 select patch against the installed rc-select: ${file}`)
  fs.writeFileSync(file, source.replace(before, after))
}

// rc-util's comparison remembers values from completed sibling branches and
// incorrectly reports shared values as cycles. Track the active ancestor path.
const utilRoot = path.dirname(require.resolve('rc-util/package.json'))
for (const variant of ['es', 'lib']) {
  const file = path.join(utilRoot, variant, 'isEqual.js')
  const source = fs.readFileSync(file, 'utf8')
  if (source.includes('finally { refSet.delete(a); }')) continue
  const before = 'refSet.add(a);'
  const end = '// other\n    return false;'
  if (!source.includes(before) || !source.includes(end)) throw new Error(`Review rc-util comparison patch: ${file}`)
  const patched = source.replace(before, `${before}\n    try {`).replace(end, `${end}\n    } finally { refSet.delete(a); }`)
  fs.writeFileSync(file, patched)
}
