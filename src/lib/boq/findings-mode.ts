/**
 * Whether BOQ reading findings must be decided before the engineering review and PM approval. Off for now: the
 * Reading findings panel is hidden and findings never block review or approval. Set
 * NEXT_PUBLIC_BOQ_FINDINGS_REQUIRED=true to show the panel and enforce the rules again.
 */
export const boqFindingsRequired = () => process.env.NEXT_PUBLIC_BOQ_FINDINGS_REQUIRED === 'true';
