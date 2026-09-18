import {randomUUID} from 'node:crypto';
import {fail,keys,string,now,filteredEntries} from './store.mjs';

// Journal order, not timestamps, determines the latest review. Old entry reviews remain auditable.
export function latestReviews(state) {
  const reviews = {};
  for (const review of state.reviews ?? []) {
    reviews[review.entry_id] = review;
  }
  return reviews;
}

export function createReview(state, entryId, body) {
  keys(body, ['status', 'note', 'expectedReviewId']);
  if (!['checked', 'needs_changes'].includes(body.status)) {
    fail('Invalid review status');
  }
  const note = body.note === undefined && body.status === 'checked' ? '' : body.note;
  string(note, 1000, body.status === 'checked');
  if (!Object.hasOwn(body, 'expectedReviewId') ||
      (body.expectedReviewId !== null && typeof body.expectedReviewId !== 'string')) {
    fail('expectedReviewId must be a review id or null');
  }
  if (!state.entries.some(entry => entry.id === entryId)) {
    fail('Entry not found', 404);
  }
  if (!filteredEntries(state).some(entry => entry.id === entryId)) {
    fail('Entry is no longer current', 409);
  }
  const latest = latestReviews(state)[entryId];
  if (body.expectedReviewId !== (latest?.id ?? null)) {
    fail('Review changed; reload workspace', 409);
  }
  // This is a human workflow check, never regulatory approval or a mutation of the diary.
  return {
    id: randomUUID(),
    entry_id: entryId,
    status: body.status,
    note,
    created_at: now()
  };
}
