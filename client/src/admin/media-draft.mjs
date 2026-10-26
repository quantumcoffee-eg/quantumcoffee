// Server image endpoints return full records in API format. Only media fields
// and the server revision belong in the form; keep ALL unsaved user edits.
export function mergeMediaIntoDraft(draft, updated, kind) {
  if (!draft || !updated || draft._id !== updated._id) return draft;
  if (!Number.isSafeInteger(updated.revision)) return draft;
  return kind === 'product'
    ? { ...draft, revision: updated.revision, imageKeys: [...(updated.imageKeys || [])], imageUrls: [...(updated.imageUrls || [])] }
    : { ...draft, revision: updated.revision, imageKey: updated.imageKey || null, imageUrl: updated.imageUrl || null };
}
