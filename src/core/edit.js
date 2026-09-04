/* Edits to the table that keep its meaning — the page's one place for them.
 *
 * A survey is edited far more than it is written, and the edit that most
 * often breaks a sheet is a rename: an ID other rows name in their Feeds From
 * changes, and every one of those references dangles. Renaming is a spelling
 * change, not a topology change (constitution §3: the same edges under a new
 * name), so the references follow.
 *
 *   renameReferences(rows, oldId, newId) → rows changed
 *   canFollowRename(rows, rowIndex, newId) → false when another row already
 *     carries newId: then nothing follows, because moving the references would
 *     re-attach them to a row the surveyor did not mean; the reader reports
 *     the dangling references with the fix it suggests, and the duplicate.
 */
export function renameReferences(rows, oldId, newId){
  const o=String(oldId||"").trim(), n=String(newId||"").trim();
  if(!o || !n || o===n) return 0;
  let changed=0;
  for(const r of rows){
    const toks=String(r.from||"").split(",").map(t=>t.trim());
    if(!toks.includes(o)) continue;
    r.from=toks.filter(Boolean).map(t=>t===o?n:t).join(", ");
    changed++;
  }
  return changed;
}

export function canFollowRename(rows, rowIndex, newId){
  const n=String(newId||"").trim();
  return !!n && !rows.some((r,i)=>i!==rowIndex && String(r.id||"").trim()===n);
}
