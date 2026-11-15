import fs from 'fs'

function repairJson(raw) {
  let result = '', inString = false, i = 0
  while (i < raw.length) {
    const ch = raw[i]
    if (ch === '\\' && inString) { result += ch + raw[i+1]; i += 2; continue }
    if (ch === '"') {
      if (!inString) { inString = true; result += ch }
      else {
        const next = raw.slice(i+1).trimStart()
        if (next.startsWith(':') || next.startsWith('}') || next.startsWith(']') || next.startsWith(',')) {
          inString = false; result += ch
        } else { result += "'" }
      }
    } else { result += ch }
    i++
  }
  return result
}

const files = fs.readdirSync('state').filter(f =>
  f.startsWith('extend-') && f.endsWith('.json') &&
  !f.includes('intros') && !f.includes('-g1') && !f.includes('-g2') &&
  !f.includes('-g3') && !f.includes('-g4') && !f.includes('merge')
)

let fixed = 0, ok = 0, broken = 0
for (const f of files) {
  const path = 'state/' + f
  const raw = fs.readFileSync(path, 'utf8')
  try { JSON.parse(raw); ok++ }
  catch {
    const repaired = repairJson(raw)
    try { JSON.parse(repaired); fs.writeFileSync(path, repaired); fixed++ }
    catch(e2) { console.log('STILL BROKEN:', f, e2.message.slice(0,60)); broken++ }
  }
}
console.log('OK:', ok, '| Fixed:', fixed, '| Still broken:', broken, '| Total:', files.length)
