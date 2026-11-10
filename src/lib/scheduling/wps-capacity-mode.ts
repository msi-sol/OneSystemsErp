/**
 * Whether work-package planning needs explicit Project WPS capacities (Planner / Project Engineer / Project Manager
 * grants). Off for now: anyone who can edit the project can prepare the plan, project engineers and admins can record
 * the review, and project managers and admins can approve it, with no capacity grants. Set
 * NEXT_PUBLIC_WPS_CAPACITIES_REQUIRED=true to turn the capacity rules (and the capacities panel) back on.
 */
export const wpsCapacitiesRequired = () => process.env.NEXT_PUBLIC_WPS_CAPACITIES_REQUIRED === 'true';

/**
 * Whether package allowances (materials, labor and equipment) must be complete and confirmed before review and
 * approval. Off for now: allowances and DUPAs are optional. A package may have none, only some kinds (whatever its
 * DUPA holds), or unconfirmed suggestions, and the plan can still be reviewed and approved. The direct-cost check
 * still applies. Set NEXT_PUBLIC_WPS_ALLOWANCES_REQUIRED=true to require all three kinds, each confirmed, again.
 */
export const wpsAllowancesRequired = () => process.env.NEXT_PUBLIC_WPS_ALLOWANCES_REQUIRED === 'true';
