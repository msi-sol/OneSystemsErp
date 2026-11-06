/** Count workflow stages using the statuses actually written by MR transitions. */
export function summarizeMaterialRequests(requests: ReadonlyArray<{ status: string }>) {
  const awaitingAction = new Set(['DRAFT', 'AI_CHECKING', 'SUBMITTED', 'FOR_REVIEW', 'RETURNED']);
  const approved = new Set(['APPROVED', 'PARTIALLY_PROCURED', 'FULLY_PROCURED']);
  return {
    pending: requests.filter(request => awaitingAction.has(request.status)).length,
    approved: requests.filter(request => approved.has(request.status)).length,
  };
}
