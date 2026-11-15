// tools/wave-check.ts — Detect content wave thresholds and generate Opus handoff prompts.
// Checks which triggers/channels have crossed thresholds for new content pieces.
//
//   npx tsx tools/wave-check.ts
//
// Thresholds:
// - Trigger guide: trigger has ≥10 published videos AND no existing guide
// - Creator profile: channel has ≥4 published videos AND no existing profile
// - Curated list: intent has ≥15 published videos (for "best asmr for [intent]" lists)

import 'dotenv/config';
import { getDb } from '../scripts/lib/db.js';

// Pillar-owned triggers are covered by the [intent]/[trigger] matrix pages.
// A standalone trigger_guide for a pillar would cannibalize them, so insert-content
// SKIPs these. Mirror that gate here (must match scripts/insert-content.ts).
const GUIDE_PILLARS = ['binaural','eating-sounds','hair-play','nature','no-talking','rain','soft-speaking','tapping','whispering','personal-attention'];

async function main() {
  const db = getDb();

  console.log('=== WAVE CHECK — Content Threshold Detection ===\n');

  // 1. Trigger guides ready (non-pillar triggers only — pillars cannibalize matrix pages)
  const pillarPlaceholders = GUIDE_PILLARS.map(() => '?').join(',');
  const guideReady = await db.execute({
    sql: `SELECT v.primary_trigger as trigger_slug, COUNT(*) as video_count
    FROM videos v
    WHERE v.status = 'published' AND v.primary_trigger != ''
      AND v.primary_trigger NOT IN (SELECT slug FROM trigger_guides WHERE status = 'published')
      AND v.primary_trigger NOT IN (${pillarPlaceholders})
    GROUP BY v.primary_trigger
    HAVING COUNT(*) >= 10
    ORDER BY COUNT(*) DESC`,
    args: GUIDE_PILLARS,
  });

  if (guideReady.rows.length > 0) {
    console.log(`📖 TRIGGER GUIDES READY (${guideReady.rows.length}):`);
    for (const row of guideReady.rows) {
      console.log(`  ${row.trigger_slug}: ${row.video_count} videos`);
    }

    console.log('\n--- OPUS HANDOFF PROMPT (trigger guides) ---');
    const slugs = guideReady.rows.map(r => r.trigger_slug).join(', ');
    console.log(`Write trigger guide content for asmrregistry.com for these triggers: ${slugs}

Each guide needs:
- intro (2-3 paragraphs about the trigger sound/experience)
- science section (why this trigger works for ASMR)
- whoResponds section (who responds to this trigger and why)
- 3-5 h2 sections with body text (angles: technique, equipment, popular variations, use cases)
- 5+ FAQs with answers

Output as JSON matching the trigger_guides shape in content-v16.json. Slug must match exactly: ${slugs}

VOICE: Follow docs/VOICE.md — lead with the answer, no filler, concrete claims.
`);
  } else {
    console.log('📖 Trigger guides: none ready (need ≥10 videos per trigger without existing guide)');
  }

  // 2. Creator profiles ready
  const profileReady = await db.execute(`
    SELECT v.channel_id, v.channel_name, COUNT(*) as video_count
    FROM videos v
    WHERE v.status = 'published'
      AND v.channel_id NOT IN (SELECT channel_id FROM creator_profiles WHERE status = 'published')
    GROUP BY v.channel_id
    HAVING COUNT(*) >= 4
    ORDER BY COUNT(*) DESC
    LIMIT 20
  `);

  if (profileReady.rows.length > 0) {
    console.log(`\n👤 CREATOR PROFILES READY (${profileReady.rows.length}):`);
    for (const row of profileReady.rows) {
      console.log(`  ${row.channel_name}: ${row.video_count} videos`);
    }

    console.log('\n--- OPUS HANDOFF PROMPT (creator profiles) ---');
    const creators = profileReady.rows.map(r => `${r.channel_name} (${r.channel_id})`).join(', ');
    console.log(`Write creator profile content for asmrregistry.com for these channels: ${creators}

Each profile needs:
- editorial_bio (2-3 paragraphs about the creator's style, what makes them distinctive)
- trigger_specialties (array of trigger slugs they're known for)
- style_tags (array of descriptive tags like "gentle", "immersive", "high-production")
- signature_videos (array of 3-5 video IDs from their published videos on the site)

Output as JSON matching the creator_profiles shape in content-v16.json.

HARD RULE: Only reference information derivable from their published video titles, descriptions, and classification data. Do NOT fabricate biographical details, subscriber counts, or personal information.
VOICE: Follow docs/VOICE.md.
`);
  } else {
    console.log('\n👤 Creator profiles: none ready (need ≥4 published videos per channel without existing profile)');
  }

  // 3. Curated lists ready (intent-based)
  const listReady = await db.execute(`
    SELECT intent_slug, COUNT(DISTINCT video_id) as video_count
    FROM trigger_usecase_pairs
    WHERE video_id IN (SELECT id FROM videos WHERE status = 'published')
    GROUP BY intent_slug
    HAVING COUNT(DISTINCT video_id) >= 15
    ORDER BY COUNT(DISTINCT video_id) DESC
  `);

  // Check which intents already have lists
  const existingLists = await db.execute(`SELECT slug FROM curated_lists WHERE status = 'published'`);
  const existingSlugs = new Set(existingLists.rows.map(r => r.slug as string));
  const newLists = listReady.rows.filter(r => {
    const slug = `best-asmr-for-${r.intent_slug}`;
    return !existingSlugs.has(slug);
  });

  if (newLists.length > 0) {
    console.log(`\n📋 CURATED LISTS READY (${newLists.length}):`);
    for (const row of newLists) {
      console.log(`  best-asmr-for-${row.intent_slug}: ${row.video_count} eligible videos`);
    }
  } else {
    console.log('\n📋 Curated lists: none new ready');
  }

  // 4. Overall pipeline stats
  const stats = await db.execute(`SELECT
    (SELECT COUNT(*) FROM videos WHERE status='published') as published,
    (SELECT COUNT(*) FROM videos WHERE status='draft') as drafts,
    (SELECT COUNT(*) FROM videos WHERE status='rejected') as rejected,
    (SELECT COUNT(*) FROM channels WHERE status='pending_ingestion') as pending_channels,
    (SELECT COUNT(*) FROM channels WHERE status='active') as active_channels,
    (SELECT COUNT(*) FROM ingest_queue WHERE processing_status='pending') as queue_pending,
    (SELECT COUNT(*) FROM ingest_queue WHERE processing_status='failed') as queue_failed,
    (SELECT COUNT(*) FROM trigger_guides WHERE status='published') as guides,
    (SELECT COUNT(*) FROM creator_profiles WHERE status='published') as profiles,
    (SELECT COUNT(*) FROM curated_lists WHERE status='published') as lists
  `);
  const s = stats.rows[0];
  console.log('\n=== PIPELINE STATUS ===');
  console.log(`Videos: ${s.published} published, ${s.drafts} draft, ${s.rejected} rejected`);
  console.log(`Channels: ${s.active_channels} active, ${s.pending_channels} pending ingestion`);
  console.log(`Queue: ${s.queue_pending} pending enrichment, ${s.queue_failed} failed`);
  console.log(`Content: ${s.guides} guides, ${s.profiles} profiles, ${s.lists} lists`);

  // 5. Page multiplication estimate
  const triggerIntentPairs = await db.execute(`
    SELECT COUNT(DISTINCT trigger_slug || '/' || intent_slug) as pairs
    FROM trigger_usecase_pairs
    WHERE video_id IN (SELECT id FROM videos WHERE status='published')
  `);
  const pairs = triggerIntentPairs.rows[0]?.pairs as number ?? 0;
  const videoPages = s.published as number;
  const channelPages = s.active_channels as number;
  const matrixPages = pairs;
  const guidePages = s.guides as number;
  const profilePages = s.profiles as number;
  const listPages = s.lists as number;
  const totalPages = videoPages + channelPages + matrixPages + guidePages + profilePages + listPages;

  console.log(`\n=== PAGE COUNT ESTIMATE ===`);
  console.log(`Video pages:    ${videoPages}`);
  console.log(`Channel pages:  ${channelPages}`);
  console.log(`Matrix pages:   ${matrixPages} (trigger×intent)`);
  console.log(`Guide pages:    ${guidePages}`);
  console.log(`Profile pages:  ${profilePages}`);
  console.log(`List pages:     ${listPages}`);
  console.log(`TOTAL:          ${totalPages}`);
}

main().catch(err => { console.error(err); process.exit(1); });
