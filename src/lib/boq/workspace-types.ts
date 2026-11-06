export type NonPricedSourceRow = { rowNumber: number; reason: string };
export type WorkspaceMapping = {
  /** One-based Excel row and column indexes. */
  headerRow: number;
  itemCode: number | null;
  description: number | null;
  unit: number | null;
  quantity: number | null;
  unitCost: number | null;
  amount: number | null;
};

export type WorkspaceBreakdownMapping = Partial<Record<
  'materialUnitCost' | 'laborUnitCost' | 'equipmentUnitCost' | 'totalDirectCost' |
  'ocm' | 'cp' | 'vat' | 'totalIndirectCost' | 'percentage',
  number | null
>>;

export const WORKSPACE_BREAKDOWN_FIELDS = [
  'materialUnitCost', 'laborUnitCost', 'equipmentUnitCost', 'totalDirectCost',
  'ocm', 'cp', 'vat', 'totalIndirectCost', 'percentage',
] as const satisfies readonly (keyof WorkspaceBreakdownMapping)[];

export type WorkspaceItem = {
  sourceRowNumber: number;
  section: string;
  /** Source occurrence identity (heading row), distinct when section names repeat. */
  sectionSourceKey: string;
  sectionOrder: number;
  sectionStartRow: number | null;
  quantityDefaulted: boolean;
  unitDefaulted: boolean;
  itemCodeSynthesized: boolean;
  sourceUnitCost: number | null;
  rateDerived: boolean;
  itemCode: string;
  description: string;
  unit: string;
  quantity: number;
  unitCost: number;
  amount: number;
  materialUnitCost?: number | null;
  laborUnitCost?: number | null;
  equipmentUnitCost?: number | null;
  totalDirectCost?: number | null;
  ocm?: number | null;
  cp?: number | null;
  vat?: number | null;
  totalIndirectCost?: number | null;
  percentage?: number | null;
};

export type WorkspaceIssue = { row: number | string; field: string; message: string };

export type WorkspaceSectionSummary = {
  /** Stable identity for this occurrence, even when another section has the same label. */
  key: string;
  name: string;
  order: number;
  startRow: number | null;
  itemCount: number;
  total: string;
};

export type WorkspaceAnalysis = {
  documentToken?: string;
  documentKind?: 'pdf' | 'docx';
  extractedProjectName?: string | null;
  extractedContractAmount?: string | null;
  documentExtraction?: unknown;
  fileName: string;
  fileHash: string;
  sheets: Array<{ name: string; rowCount: number; candidate: boolean }>;
  selectedSheet: string | null;
  mapping: WorkspaceMapping | null;
  breakdownMapping: WorkspaceBreakdownMapping;
  columns: Array<{ index: number; label: string; populatedRows?: number; pricedPopulatedRows?: number; pricedRowCount?: number }>;
  sections: WorkspaceSectionSummary[];
  preview: WorkspaceItem[];
  /** Full-scope summary values remain unchanged by the active preview filter/page. */
  itemCount: number;
  total: string;
  selectedSectionKey: string | null;
  previewOffset: number;
  previewPageSize: number;
  filteredItemCount: number;
  filteredTotal: string;
  printedTotal: string | null;
  errors: WorkspaceIssue[];
  warnings: WorkspaceIssue[];
  suggestedProjectName: string;
};

export class WorkspaceError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'WorkspaceError';
  }
}
