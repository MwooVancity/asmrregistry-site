export interface DuplicateMatch {
  canonical_video_id: string;
  canonical_title: string;
  reason: 'title_similarity';
  similarity_score: number;
}

function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = Array(b.length + 1)
    .fill(0)
    .map(() => Array(a.length + 1).fill(0));

  for (let i = 0; i <= a.length; i++) matrix[0][i] = i;
  for (let j = 0; j <= b.length; j++) matrix[j][0] = j;

  for (let j = 1; j <= b.length; j++) {
    for (let i = 1; i <= a.length; i++) {
      const indicator = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[j][i] = Math.min(
        matrix[j][i - 1] + 1,
        matrix[j - 1][i] + 1,
        matrix[j - 1][i - 1] + indicator
      );
    }
  }

  return matrix[b.length][a.length];
}

function titleSimilarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1; // Both empty strings are identical
  const distance = levenshteinDistance(a.toLowerCase(), b.toLowerCase());
  return 1 - distance / maxLen;
}

export async function detectDuplicates(
  video: any,
  existing: any[]
): Promise<DuplicateMatch[]> {
  const duplicates: DuplicateMatch[] = [];

  for (const existing_video of existing) {
    // Different creators with similar titles are NOT duplicates
    if (video.channel_id && existing_video.channel_id && video.channel_id !== existing_video.channel_id) continue;

    const similarity = titleSimilarity(video.title, existing_video.title);
    if (similarity > 0.95) {
      duplicates.push({
        canonical_video_id: existing_video.id,
        canonical_title: existing_video.title,
        reason: 'title_similarity',
        similarity_score: similarity,
      });
    }
  }

  return duplicates;
}
