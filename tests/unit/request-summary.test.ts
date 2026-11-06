import { summarizeMaterialRequests } from '@/lib/procurement/request-summary';

describe('project material request counts', () => {
  it('keeps every unfinished request visible and retains approved requests after procurement', () => {
    expect(summarizeMaterialRequests([
      ...['DRAFT', 'AI_CHECKING', 'SUBMITTED', 'FOR_REVIEW', 'RETURNED'],
      ...['APPROVED', 'PARTIALLY_PROCURED', 'FULLY_PROCURED'],
      ...['CANCELLED', 'REJECTED'],
    ].map(status => ({ status })))).toEqual({ pending: 5, approved: 3 });
  });

  it('shows zero when the project has no requests', () => {
    expect(summarizeMaterialRequests([])).toEqual({ pending: 0, approved: 0 });
  });
});
