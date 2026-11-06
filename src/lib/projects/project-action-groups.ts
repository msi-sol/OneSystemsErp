export type ProjectActionSnapshot = {
  id: string;
  status: string;
  boqLocked: boolean;
  latestBoqVersion: {
    id: string;
    status: string;
    checksum: string | null;
    sourceProvenance: string | null;
  } | null;
  latestSchedule: {
    workflowStatus: string;
    lockedBOQVersionId: string | null;
    lockedBOQChecksum: string | null;
    authoritativeActivationChecksums: string[];
  } | null;
};

export type ProjectActionGroup = 'boq' | 'wps' | 'other';
export type ProjectActionEntry<T extends ProjectActionSnapshot> = {
  project: T;
  group: ProjectActionGroup;
  approvedBoqRecorded: boolean;
  activeBaselineVerified: boolean;
  boqLabel: string;
  wpsLabel: string;
  nextHref: string;
  nextLabel: string;
  wpsHref: string;
};

const WORK_PACKAGE_DRAFT_STATUSES = new Set([
  'AI_GENERATED_DRAFT',
  'INVALID_GENERATED_DRAFT',
  'TECHNICAL_REVISIONS_REQUIRED',
]);

function verifyActiveBaseline(project: ProjectActionSnapshot, approvedBoqRecorded: boolean): boolean {
  const version = project.latestBoqVersion;
  const schedule = project.latestSchedule;
  if (!approvedBoqRecorded || !version || !schedule || schedule.workflowStatus !== 'ACTIVE_BASELINE') return false;
  if (!version.checksum || !schedule.lockedBOQChecksum || schedule.lockedBOQVersionId !== version.id || schedule.lockedBOQChecksum !== version.checksum) return false;
  return schedule.authoritativeActivationChecksums.length === 1 && schedule.authoritativeActivationChecksums[0] === schedule.lockedBOQChecksum;
}

function statusText(value: string): string {
  return value.replaceAll('_', ' ');
}

export function groupProjectsByAction<T extends ProjectActionSnapshot>(projects: readonly T[]) {
  const groups: Record<ProjectActionGroup, ProjectActionEntry<T>[]> = { boq: [], wps: [], other: [] };

  for (const project of projects) {
    const version = project.latestBoqVersion;
    const approvedBoqRecorded = project.boqLocked && version?.status === 'APPROVED';
    const activeBaselineVerified = verifyActiveBaseline(project, approvedBoqRecorded);
    const group: ProjectActionGroup = project.status === 'ARCHIVED'
      ? 'other'
      : !approvedBoqRecorded
        ? 'boq'
        : activeBaselineVerified
          ? 'other'
          : 'wps';

    const boqLabel = !version
      ? 'No BOQ version'
      : version.status === 'DRAFT' && version.sourceProvenance === 'BOQ_WORKSPACE'
        ? 'Draft workbook import'
        : version.status === 'APPROVED' && !project.boqLocked
          ? 'APPROVED · project lock not recorded'
          : statusText(version.status);
    const wpsLabel = !project.latestSchedule
      ? 'No WPS schedule'
      : project.latestSchedule.workflowStatus === 'ACTIVE_BASELINE' && !activeBaselineVerified
        ? 'ACTIVE BASELINE · activation or BOQ pin unverified'
        : statusText(project.latestSchedule.workflowStatus);
    const wpsHref = activeBaselineVerified
      ? `/projects/${project.id}/work-packages?baseline=active`
      : project.latestSchedule && !WORK_PACKAGE_DRAFT_STATUSES.has(project.latestSchedule.workflowStatus)
        ? `/projects/${project.id}/scheduling`
        : `/projects/${project.id}/work-packages`;

    const nextHref = project.status === 'ARCHIVED'
      ? `/projects/${project.id}`
      : group === 'boq'
        ? `/projects/${project.id}/boq`
        : group === 'wps'
          ? wpsHref
          : `/projects/${project.id}/work-packages?baseline=active`;
    const nextLabel = project.status === 'ARCHIVED'
      ? 'View project'
      : group === 'boq'
        ? 'Open BOQ module'
        : group === 'wps'
          ? 'Open WPS module'
          : 'Open active WPS';

    groups[group].push({ project, group, approvedBoqRecorded, activeBaselineVerified, boqLabel, wpsLabel, nextHref, nextLabel, wpsHref });
  }

  return groups;
}
