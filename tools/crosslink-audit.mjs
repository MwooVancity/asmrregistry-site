/**
 * Crosslink audit: remove padding, add helpful within-cluster links.
 * Rule: "would the user actually click it next?"
 * Run: node tools/crosslink-audit.mjs [--dry-run]
 */
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const DRY = process.argv.includes('--dry-run');
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const file = join(root, 'src/lib/asmr-page-content.json');
const data = JSON.parse(readFileSync(file, 'utf8'));
const published = new Set(Object.keys(data).filter(s => data[s].status === 'published'));

// ── Topic clusters ────────────────────────────────────────────────────────────
// Explicit slug membership — more precise than regex alone
const CLUSTERS = {
  // Microphone accessory cluster: reader on any of these is shopping for a rig
  micAccessory: new Set(['asmr-boom-arm','asmr-pop-filter','asmr-shock-mount','asmr-usb-microphone','asmr-xlr-microphone','best-binaural-microphone','best-asmr-microphone']),
  // Studio/setup cluster: reader building a recording space
  studioSetup: new Set(['asmr-soundproofing','asmr-camera-setup','asmr-editing-software','asmr-studio-setup','how-to-make-asmr-videos']),
  // Headphones cluster
  headphones: new Set(['best-headphones-for-asmr','binaural','binaural-beats-guide','best-binaural-microphone']),
  // Sleep cluster
  sleep: new Set(['sleep','insomnia-asmr','rain-sounds-for-sleeping','sleep-stories-asmr','best-asmr-channels-for-sleep','bedtime-asmr','asmr-for-deep-sleep']),
  // Focus/study cluster
  focus: new Set(['asmr-for-focus','best-asmr-for-focus','best-asmr-for-studying','study-with-me-asmr','asmr-for-adhd','lofi-asmr','best-asmr-playlists']),
  // Anxiety/stress cluster
  anxiety: new Set(['anxiety','best-asmr-for-anxiety','asmr-for-chronic-pain','asmr-for-depression','asmr-for-panic-attacks','asmr-for-ptsd','personal-attention','meditation-asmr']),
  // Trigger-type pages (not gear, not use-case)
  trigger: new Set(['tapping','typing','scratching','brushing','whispering','soft-speaking','no-talking','mouth-sounds','eating-asmr','slime-asmr','roleplay-asmr']),
};

// Which clusters contain this slug?
function slugClusters(slug) {
  const result = new Set();
  for (const [name, members] of Object.entries(CLUSTERS)) {
    if (members.has(slug)) result.add(name);
  }
  return result;
}

// Is this link a gear page?
function isGear(slug) {
  return CLUSTERS.micAccessory.has(slug) || CLUSTERS.studioSetup.has(slug);
}

// ── Padding removal rules ─────────────────────────────────────────────────────
// target slug → remove from source slugs that have NONE of the allowed clusters
const REMOVE_RULES = {
  // Trigger pages should NOT appear on gear pages
  'tapping':         { forbiddenOnClusters: new Set(['micAccessory','studioSetup']) },
  'typing':          { forbiddenOnClusters: new Set(['micAccessory','studioSetup']) },
  'scratching':      { forbiddenOnClusters: new Set(['micAccessory','studioSetup']) },
  'brushing':        { forbiddenOnClusters: new Set(['micAccessory','studioSetup']) },
  'whispering':      { forbiddenOnClusters: new Set(['micAccessory','studioSetup']) },
  'soft-speaking':   { forbiddenOnClusters: new Set(['micAccessory','studioSetup']) },
  'no-talking':      { forbiddenOnClusters: new Set(['micAccessory','studioSetup']) },
  'mouth-sounds':    { forbiddenOnClusters: new Set(['micAccessory','studioSetup']) },
  // Binaural is audio-science, not relevant on pure trigger pages
  'binaural':        { forbiddenOnClusters: new Set(['trigger']) },
  // Personal attention / spa not relevant on gear or focus pages
  'personal-attention': { forbiddenOnClusters: new Set(['micAccessory','studioSetup','focus']) },
};

// ── Helpful additions map ──────────────────────────────────────────────────────
// slug → array of {href, label} to ADD if missing
const ADDITIONS = {
  'asmr-boom-arm': [
    { href: '/asmr-pop-filter/', label: 'ASMR pop filters' },
    { href: '/asmr-shock-mount/', label: 'ASMR shock mounts' },
    { href: '/asmr-xlr-microphone/', label: 'XLR microphones for ASMR' },
  ],
  'asmr-pop-filter': [
    { href: '/asmr-boom-arm/', label: 'ASMR boom arms' },
    { href: '/asmr-shock-mount/', label: 'ASMR shock mounts' },
    { href: '/asmr-usb-microphone/', label: 'USB microphones for ASMR' },
  ],
  'asmr-shock-mount': [
    { href: '/asmr-boom-arm/', label: 'ASMR boom arms' },
    { href: '/asmr-pop-filter/', label: 'ASMR pop filters' },
    { href: '/asmr-xlr-microphone/', label: 'XLR microphones for ASMR' },
  ],
  'asmr-usb-microphone': [
    { href: '/asmr-xlr-microphone/', label: 'XLR microphones for ASMR' },
    { href: '/asmr-boom-arm/', label: 'ASMR boom arms' },
    { href: '/asmr-shock-mount/', label: 'ASMR shock mounts' },
  ],
  'asmr-xlr-microphone': [
    { href: '/asmr-usb-microphone/', label: 'USB microphones for ASMR' },
    { href: '/asmr-boom-arm/', label: 'ASMR boom arms' },
    { href: '/asmr-shock-mount/', label: 'ASMR shock mounts' },
  ],
  'asmr-soundproofing': [
    { href: '/asmr-studio-setup/', label: 'ASMR studio setup' },
    { href: '/asmr-camera-setup/', label: 'ASMR camera setup' },
  ],
  'asmr-camera-setup': [
    { href: '/asmr-editing-software/', label: 'ASMR editing software' },
    { href: '/asmr-studio-setup/', label: 'ASMR studio setup' },
    { href: '/asmr-soundproofing/', label: 'ASMR soundproofing' },
  ],
  'asmr-editing-software': [
    { href: '/asmr-camera-setup/', label: 'ASMR camera setup' },
    { href: '/asmr-studio-setup/', label: 'ASMR studio setup' },
  ],
  'asmr-studio-setup': [
    { href: '/asmr-soundproofing/', label: 'ASMR soundproofing' },
    { href: '/asmr-camera-setup/', label: 'ASMR camera setup' },
    { href: '/asmr-editing-software/', label: 'ASMR editing software' },
    { href: '/asmr-xlr-microphone/', label: 'XLR microphones for ASMR' },
  ],
  'best-asmr-channels-for-sleep': [
    { href: '/sleep/', label: 'ASMR for sleep' },
    { href: '/best-asmr-playlists/', label: 'Best ASMR playlists' },
  ],
  'best-asmr-playlists': [
    { href: '/best-asmr-for-studying/', label: 'Best ASMR for studying' },
    { href: '/best-asmr-for-focus/', label: 'Best ASMR for focus' },
    { href: '/best-asmr-channels-for-sleep/', label: 'Best ASMR channels for sleep' },
  ],
  'best-asmr-for-focus': [
    { href: '/best-asmr-for-studying/', label: 'Best ASMR for studying' },
    { href: '/best-asmr-playlists/', label: 'Best ASMR playlists' },
  ],
  'best-asmr-for-studying': [
    { href: '/best-asmr-for-focus/', label: 'Best ASMR for focus' },
    { href: '/best-asmr-playlists/', label: 'Best ASMR playlists' },
    { href: '/study-with-me-asmr/', label: 'Study with me ASMR' },
  ],
  'best-asmr-for-anxiety': [
    { href: '/anxiety/', label: 'ASMR for anxiety' },
    { href: '/meditation-asmr/', label: 'Meditation ASMR' },
  ],
  'asmr-and-highly-sensitive-person': [
    { href: '/anxiety/', label: 'ASMR for anxiety' },
    { href: '/misophonia-and-asmr/', label: 'ASMR and misophonia' },
  ],
};

// ── Run audit ─────────────────────────────────────────────────────────────────
let removedTotal = 0, addedTotal = 0;
const changes = [];

for (const slug of published) {
  const page = data[slug];
  if (!page) continue;
  const srcClusters = slugClusters(slug);
  let cl = [...(page.crossLinks || [])];
  const before = cl.length;

  // 1. Remove padding links
  cl = cl.filter(link => {
    const targetSlug = link.href.replace(/^\/|\/$/g,'');
    const rule = REMOVE_RULES[targetSlug];
    if (!rule) return true; // no rule = keep
    // Remove if source is in a forbidden cluster
    for (const fc of rule.forbiddenOnClusters) {
      if (srcClusters.has(fc)) return false;
    }
    return true;
  });

  // 2. Add helpful links
  const additions = ADDITIONS[slug] || [];
  const existingHrefs = new Set(cl.map(l => l.href));
  for (const add of additions) {
    const addSlug = add.href.replace(/^\/|\/$/g,'');
    if (!existingHrefs.has(add.href) && published.has(addSlug)) {
      cl.push(add);
      existingHrefs.add(add.href);
    }
  }

  const removed = before - cl.length + (cl.length - before - (cl.length - before < 0 ? 0 : 0));
  const netRemoved = before - (cl.length - additions.filter(a => !page.crossLinks?.some(l=>l.href===a.href) && published.has(a.href.replace(/^\/|\/$/g,''))).length);
  const actualAdded = cl.length - (before - (before - cl.filter(l => page.crossLinks?.some(o=>o.href===l.href)).length));

  if (cl.length !== before || actualAdded > 0) {
    const prevHrefs = new Set((page.crossLinks||[]).map(l=>l.href));
    const rm = (page.crossLinks||[]).filter(l => !cl.some(c=>c.href===l.href)).map(l=>l.href);
    const added = cl.filter(l => !prevHrefs.has(l.href)).map(l=>l.href);
    if (rm.length || added.length) {
      changes.push({ slug, removed: rm, added });
      removedTotal += rm.length;
      addedTotal += added.length;
    }
  }

  page.crossLinks = cl;
}

// Print summary
console.log(`\nCrosslink audit:`);
console.log(`  Removed: ${removedTotal} padding links`);
console.log(`  Added:   ${addedTotal} helpful links`);
console.log(`\nChanges per page:`);
for (const c of changes) {
  if (c.removed.length) console.log(`  ${c.slug}: -[${c.removed.join(', ')}]`);
  if (c.added.length)   console.log(`  ${c.slug}: +[${c.added.join(', ')}]`);
}

if (!DRY) {
  writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
  console.log(`\nWritten ${file}`);
} else {
  console.log('\n[DRY RUN — no changes written]');
}
