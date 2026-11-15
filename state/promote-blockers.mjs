import fs from 'fs'

const slugs = ['asmr-misconceptions','crinkling','study-with-me-asmr','asmr-for-ptsd','asmr-meaning-in-social-media','ocean','best-kept-secret-asmr','reading-to-you','how-asmr-affects-the-brain','binaural','vr-asmr','sleep','autonomous-asmr','eating-sounds','thunderstorm-asmr','whats-asmr','asmr-meaning-slang','mukbang-asmr','sleep-sounds','gaming-asmr','breathing','organizing-asmr','cottagecore-crafts','speaking-asmr','frisson','10-hour-asmr','asmr-for-anxiety','whispering-asmr','goth-asmr','sound-therapy-and-asmr','best-asmr-for-sleep','asmr-for-stress','emo-asmr']

const data = JSON.parse(fs.readFileSync('src/lib/asmr-page-content.json','utf8'))

const proseFile = slugs.map(slug => ({
  slug,
  prose: {
    sections: data[slug]?.sections || [],
    metaDescription: data[slug]?.metaDescription,
  }
}))

fs.writeFileSync('state/grind-prose-temp-blockers.json', JSON.stringify(proseFile, null, 2))
console.log('Wrote prose file for', slugs.length, 'blocked slugs')
