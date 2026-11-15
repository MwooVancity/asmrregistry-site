#!/bin/sh
# Publishes public/creator-data/ as a single fresh commit on the creator-data branch, force-pushed: GitHub keeps only
# the latest copy, never old YouTube data (30-day rule). Deploy workflows load this branch before building.
set -e
[ -d public/creator-data ] || { echo "no public/creator-data"; exit 1; }
export GIT_INDEX_FILE="$(mktemp)"
rm -f "$GIT_INDEX_FILE"
git --work-tree=public/creator-data add -A .
tree=$(git write-tree)
commit=$(git -c user.name="ASMR Registry" -c user.email="3124681+MwooVancity@users.noreply.github.com" commit-tree "$tree" -m "creator data $(date -u +%F)")
git push -f --no-verify origin "$commit:refs/heads/creator-data"
rm -f "$GIT_INDEX_FILE"
echo "creator-data: $(ls public/creator-data | wc -l) files pushed as $commit"
