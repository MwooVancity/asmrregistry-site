import fs from 'fs'

// Fix unescaped double quotes inside JSON string values by replacing " with ' in prose
const bad = ['thunder-sounds','misophonia','scissors-sounds','asmr-copyright','plastic-sounds','what-does-asmr-mean-in-text','roleplay','asmr-in-korea','best-asmr-youtuber-rankings','asmr-in-japan','best-asmr','kisses','best-asmr-creators']

function repairJson(raw) {
  // Walk char by char, track if inside a JSON string, fix unescaped " inside strings
  let result = ''
  let inString = false
  let i = 0
  while (i < raw.length) {
    const ch = raw[i]
    if (ch === '\\' && inString) {
      // escaped char — keep both
      result += ch + raw[i+1]
      i += 2
      continue
    }
    if (ch === '"') {
      if (!inString) {
        inString = true
        result += ch
      } else {
        // Could be end of string OR unescaped quote inside string
        // Check if it's followed by : } ] , (structural) or is prose quote
        const next = raw.slice(i+1).trimStart()
        if (next.startsWith(':') || next.startsWith('}') || next.startsWith(']') || next.startsWith(',')) {
          // structural closing quote
          inString = false
          result += ch
        } else {
          // prose double quote — replace with single quote
          result += "'"
        }
      }
    } else {
      result += ch
    }
    i++
  }
  return result
}

for (const slug of bad) {
  const path = 'state/extend-'+slug+'.json'
  const raw = fs.readFileSync(path, 'utf8')
  const fixed = repairJson(raw)
  try {
    JSON.parse(fixed)
    fs.writeFileSync(path, fixed)
    console.log(slug+': FIXED')
  } catch(e) {
    console.log(slug+': STILL BROKEN — '+e.message.slice(0,80))
  }
}
