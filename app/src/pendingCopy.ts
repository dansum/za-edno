// "Запази копие в нова стая" (§8.18): новата стая е нов Yjs документ/връзка,
// затова не може просто да се копира в паметта - вместо това дървото се
// пази за миг в localStorage под ключ, специфичен за новата стая, и се
// прилага веднъж, щом тя се отвори (вж. hooks/useYDoc.ts).
export const PENDING_COPY_PREFIX = "mindmap-pending-copy:";

export function pendingCopyKey(roomId: string): string {
  return `${PENDING_COPY_PREFIX}${roomId}`;
}
