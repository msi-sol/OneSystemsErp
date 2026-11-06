import { groupProjectsByAction, type ProjectActionSnapshot } from '@/lib/projects/project-action-groups';

const approvedBoq = { id: 'boq-approved', status: 'APPROVED', checksum: 'checksum-1', sourceProvenance: 'BOQ_WORKSPACE' };
const activeSchedule = {
  workflowStatus: 'ACTIVE_BASELINE',
  lockedBOQVersionId: approvedBoq.id,
  lockedBOQChecksum: approvedBoq.checksum,
  authoritativeActivationChecksums: [approvedBoq.checksum],
};
function project(id: string, values: Partial<ProjectActionSnapshot> = {}): ProjectActionSnapshot {
  return { id, status: 'ACTIVE', boqLocked: false, latestBoqVersion: null, latestSchedule: null, ...values };
}

it('groups missing and draft BOQs, review schedules, and verified active baselines from saved project records', () => {
  const groups = groupProjectsByAction([
    project('missing-boq'),
    project('draft-boq', {
      latestBoqVersion: { id: 'boq-draft', status: 'DRAFT', checksum: 'draft-checksum', sourceProvenance: 'BOQ_WORKSPACE' },
    }),
    project('missing-wps', { boqLocked: true, latestBoqVersion: approvedBoq }),
    project('wps-review', {
      boqLocked: true,
      latestBoqVersion: approvedBoq,
      latestSchedule: { ...activeSchedule, workflowStatus: 'UNDER_TECHNICAL_REVIEW' },
    }),
    project('active-baseline', { boqLocked: true, latestBoqVersion: approvedBoq, latestSchedule: activeSchedule }),
  ]);

  expect(groups.boq.map(entry => entry.project.id)).toEqual(['missing-boq', 'draft-boq']);
  expect(groups.wps.map(entry => entry.project.id)).toEqual(['missing-wps', 'wps-review']);
  expect(groups.other.map(entry => entry.project.id)).toEqual(['active-baseline']);
  expect(groups.boq[0]).toMatchObject({ boqLabel: 'No BOQ version', nextHref: '/projects/missing-boq/boq' });
  expect(groups.boq[1]).toMatchObject({ boqLabel: 'Draft workbook import', nextLabel: 'Open BOQ module' });
  expect(groups.wps[0]).toMatchObject({ wpsLabel: 'No WPS schedule', nextHref: '/projects/missing-wps/work-packages' });
  expect(groups.wps[1]).toMatchObject({ wpsLabel: 'UNDER TECHNICAL REVIEW', nextHref: '/projects/wps-review/scheduling', wpsHref: '/projects/wps-review/scheduling' });
  expect(groups.other[0]).toMatchObject({ activeBaselineVerified: true, nextHref: '/projects/active-baseline/work-packages?baseline=active' });
});

it('keeps unverified active status in the WPS decision group and does not call it ready', () => {
  const groups = groupProjectsByAction([
    project('missing-activation', {
      boqLocked: true,
      latestBoqVersion: approvedBoq,
      latestSchedule: { ...activeSchedule, authoritativeActivationChecksums: [] },
    }),
    project('wrong-boq-pin', {
      boqLocked: true,
      latestBoqVersion: approvedBoq,
      latestSchedule: { ...activeSchedule, lockedBOQChecksum: 'different-checksum', authoritativeActivationChecksums: ['different-checksum'] },
    }),
  ]);

  expect(groups.wps.map(entry => entry.project.id)).toEqual(['missing-activation', 'wrong-boq-pin']);
  expect(groups.wps.every(entry => entry.wpsLabel.includes('unverified'))).toBe(true);
  expect(JSON.stringify(groups)).not.toContain('ready');
  expect(groups.wps.every(entry => entry.nextHref.endsWith('/scheduling'))).toBe(true);
});

it('keeps archived projects out of decision groups', () => {
  const groups = groupProjectsByAction([project('archived', { status: 'ARCHIVED' })]);
  expect(groups.boq).toHaveLength(0);
  expect(groups.wps).toHaveLength(0);
  expect(groups.other[0]).toMatchObject({ nextHref: '/projects/archived', nextLabel: 'View project' });
});
