import fs from 'fs'
const slug = 'roleplay'
const raw = fs.readFileSync('state/extend-'+slug+'.json','utf8')
try { JSON.parse(raw); console.log('OK') } catch(e) {
  const pos = parseInt(e.message.match(/position (\d+)/)?.[1])
  console.log('pos='+pos)
  console.log(JSON.stringify(raw.slice(Math.max(0,pos-60),pos+60)))
}
