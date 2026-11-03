export function draftWorkflowMessage(code: unknown): string {
  if (typeof code !== 'string') return 'The change could not be saved. Refresh the page and try again.';
  const messages: Record<string, string> = {
    FORBIDDEN: 'Your account does not have permission for this action.',
    Unauthorized: 'Your account does not have permission for this action.',
    UNAUTHORIZED: 'Please sign in again before saving.',
    BOQ_ALREADY_LOCKED: 'This BOQ is already locked. Refresh the page to see its current state.',
    DRAFT_VERSION_CONFLICT: 'This BOQ is no longer the editable draft. Refresh the page.',
    DRAFT_CHECKSUM_CONFLICT: 'The BOQ changed since you opened it. Refresh the page before saving.',
    SCHEDULE_VERSION_CONFLICT: 'The plan changed since you opened it. Refresh the page before saving.',
    SCHEDULE_NOT_EDITABLE_IN_CURRENT_STATUS: 'This plan is under review or already locked. It cannot be edited in its current state.',
    PROJECT_BOQ_NOT_LOCKED: 'Approve and lock the BOQ before changing package quantities.',
    BOQ_TOTAL_DOES_NOT_MATCH_CONTRACT: 'The BOQ total must match the contract value before approval.',
    BOQ_HAS_REVIEWED_OR_IMMUTABLE_SCHEDULE: 'This project already has a plan under review or an approved baseline. Its BOQ draft cannot be edited.',
    FINISH_BEFORE_START: 'The finish date must be on or after the start date.',
  };
  if (messages[code]) return messages[code];
  if (/OVER.?ALLOCAT|EXCEEDS.*QUANTITY|QUANTITY.*EXCEED/.test(code)) return 'This quantity exceeds the BOQ scope still available. Reduce the other allocation first, then try again.';
  if (code.startsWith('INVALID_')) return 'Check the entered text, quantities and amounts. Use nonnegative quantities and no more than two decimal places for money.';
  return 'The change could not be saved. Check the current plan and refresh the page before trying again.';
}
