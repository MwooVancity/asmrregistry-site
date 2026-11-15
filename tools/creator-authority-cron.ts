import { getDb } from '../src/lib/db';
import { calculateAuthorityScore } from '../src/lib/gates/creator-authority';

export async function refreshCreatorAuthority() {
  const db = getDb();
  console.log('Refreshing creator authority scores...');

  try {
    const result = await db.execute('SELECT * FROM creators');
    const creators = result.rows as any[];

    if (creators.length === 0) {
      console.log('No creators found');
      return { updated: 0 };
    }

    const updates = [];

    for (const creator of creators) {
      const newScore = calculateAuthorityScore(creator);
      updates.push(
        db.execute(
          'UPDATE creators SET authority_score = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
          [newScore, creator.id]
        )
      );
    }

    await Promise.all(updates);
    console.log(`Updated ${updates.length} creator scores`);
    return { updated: updates.length };
  } catch (error) {
    console.error('Error refreshing creator authority:', error);
    throw error;
  }
}

// Run if executed directly
if (import.meta.main) {
  try {
    await refreshCreatorAuthority();
    process.exit(0);
  } catch (error) {
    console.error('Cron job failed:', error);
    process.exit(1);
  }
}
