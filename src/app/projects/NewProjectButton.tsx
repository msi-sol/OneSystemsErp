'use client';

import { useState, useMemo } from 'react';
import Modal from '@/components/ui/Modal';
import { createProject } from '@/app/actions/mutations';
import * as xlsx from 'xlsx';

export default function NewProjectButton({ users }: { users?: {id: string, name: string}[] }) {
  const [isOpen, setIsOpen] = useState(false);
  const [isPending, setIsPending] = useState(false);

  const [startDate, setStartDate] = useState<string>('');
  const [durationDays, setDurationDays] = useState<number | ''>('');
  const [contractAmountOverride, setContractAmountOverride] = useState<number | ''>('');

  // Column Mapping State
  const [mappingData, setMappingData] = useState<{ headers: string[], rows: any[][] } | null>(null);
  const [pendingFormData, setPendingFormData] = useState<FormData | null>(null);
  const [mappings, setMappings] = useState({
    itemCode: '',
    description: '',
    unit: '',
    quantity: '',
    unitCost: '',
    totalCost: '',
    materialCost: '',
    laborCost: '',
    equipmentCost: ''
  });

  const computedCompletionDate = useMemo(() => {
    if (!startDate || !durationDays) return '';
    const date = new Date(startDate);
    date.setDate(date.getDate() + Number(durationDays));
    return date.toISOString().split('T')[0];
  }, [startDate, durationDays]);

  const openModal = () => {
    setIsOpen(true);
    setIsPending(false);
  };

  const closeModal = () => {
    setIsOpen(false);
    setIsPending(false);
  };

  async function submitToServer(formData: FormData) {
    setIsPending(true);
    try {
      await createProject(formData);
      setIsOpen(false);
      setMappingData(null);
    } catch (error: any) {
      alert("Error: " + error.message);
      console.error(error);
    } finally {
      setIsPending(false);
    }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const boqFile = formData.get('boqFile') as File | null;

    if (boqFile && (boqFile.name.endsWith('.xlsx') || boqFile.name.endsWith('.xls') || boqFile.name.endsWith('.csv'))) {
      setIsPending(true);
      const reader = new FileReader();
      reader.onload = (evt) => {
        try {
          const data = new Uint8Array(evt.target?.result as ArrayBuffer);
          const workbook = xlsx.read(data, { type: 'array' });
          const sheetName = workbook.SheetNames[0];
          const sheet = workbook.Sheets[sheetName];
          const rows = xlsx.utils.sheet_to_json<any[]>(sheet, { header: 1 });

          // Smart Auto-guess mappings by scanning the first 30 rows
          const guessMapping = { itemCode: '', description: '', unit: '', quantity: '', unitCost: '', totalCost: '', materialCost: '', laborCost: '', equipmentCost: '' };
          let dataStartIndex = 1;
          let bestHeaderRowIndex = 0;

          for (let i = 0; i < Math.min(30, rows.length); i++) {
            const row = rows[i] || [];
            let foundHeaderInThisRow = false;
            
            row.forEach((cell: any, colIdx: number) => {
              if (typeof cell === 'string') {
                const cLower = cell.toLowerCase().trim();
                
                if ((cLower === 'item' || cLower.includes('item #') || cLower.includes('item no')) && !guessMapping.itemCode) { guessMapping.itemCode = colIdx.toString(); foundHeaderInThisRow = true; }
                else if (cLower.includes('desc') && !guessMapping.description) { guessMapping.description = colIdx.toString(); foundHeaderInThisRow = true; }
                else if (cLower === 'unit' && !guessMapping.unit) { guessMapping.unit = colIdx.toString(); foundHeaderInThisRow = true; }
                else if ((cLower === 'qty' || cLower === 'quantity') && !guessMapping.quantity) { guessMapping.quantity = colIdx.toString(); foundHeaderInThisRow = true; }
                else if ((cLower === 'unit cost' || cLower.includes('unit cost')) && !cLower.includes('direct') && !guessMapping.unitCost) { guessMapping.unitCost = colIdx.toString(); foundHeaderInThisRow = true; }
                else if ((cLower.includes('total cost') || cLower === 'amount') && !guessMapping.totalCost) { guessMapping.totalCost = colIdx.toString(); foundHeaderInThisRow = true; }
                else if (cLower === 'material' && !guessMapping.materialCost) { guessMapping.materialCost = colIdx.toString(); foundHeaderInThisRow = true; }
                else if (cLower === 'labor' && !guessMapping.laborCost) { guessMapping.laborCost = colIdx.toString(); foundHeaderInThisRow = true; }
                else if (cLower === 'equipment' && !guessMapping.equipmentCost) { guessMapping.equipmentCost = colIdx.toString(); foundHeaderInThisRow = true; }
              }
            });

            if (foundHeaderInThisRow) {
              dataStartIndex = i + 1; // Data starts AFTER the lowest header row
              bestHeaderRowIndex = i; // Keep track of the last row that had headers for the dropdown labels
            }
          }

          let isMasterTemplate = false;
          for (let i = 0; i < Math.min(40, rows.length); i++) {
             const row = rows[i] || [];
             if (row.some((cell: any) => String(cell || '').replace(/\s/g, '').toUpperCase().includes('BIDDETAILEDCOSTBREAKDOWN'))) {
                isMasterTemplate = true;
                break;
             }
          }

          if (isMasterTemplate) {
            formData.append('isMasterTemplate', 'true');
            submitToServer(formData);
            return;
          }

          // Use the best header row for the dropdown labels, or fallback to Column N
          const headers = (rows[bestHeaderRowIndex] || []).map((h: any, idx: number) => h ? String(h).trim() : `Column ${idx + 1}`);

          // Make sure headers array is at least as long as our guessed columns
          for(let i = 0; i < 20; i++) {
            if (!headers[i]) headers[i] = `Column ${i + 1}`;
          }

          const dataRows = rows.slice(dataStartIndex).filter(r => r && r.length > 0);

          const isConfident = guessMapping.description !== '' && (guessMapping.totalCost !== '' || (guessMapping.quantity !== '' && guessMapping.unitCost !== ''));

          if (isConfident) {
            processAndSubmit(guessMapping, dataRows, formData, headers);
            return;
          }

          setMappings(guessMapping);
          setMappingData({ headers, rows: dataRows });
          setPendingFormData(formData);
          setIsPending(false);
        } catch (err) {
          console.error("Mapping Error:", err);
          submitToServer(formData); // Fallback to server parser
        }
      };
      reader.readAsArrayBuffer(boqFile);
    } else {
      submitToServer(formData);
    }
  }

  function processAndSubmit(mappingsToUse: any, rowsToUse: any[][], form: FormData, rawHeaders?: string[]) {
    const parseNumber = (val: any) => {
      if (typeof val === 'number') return val;
      if (!val) return 0;
      let strVal = String(val).trim();
      if (strVal.startsWith('(') && strVal.endsWith(')')) {
        strVal = '-' + strVal;
      }
      const cleaned = strVal.replace(/[^0-9.-]/g, '');
      const parsed = parseFloat(cleaned);
      return isNaN(parsed) ? 0 : parsed;
    };

    let currentSectionIndex = 0;

    const parsedItems = rowsToUse.map(row => {
      let description = mappingsToUse.description !== '' ? String(row[parseInt(mappingsToUse.description)] || '').trim() : '';
      let itemCode = mappingsToUse.itemCode !== '' ? String(row[parseInt(mappingsToUse.itemCode)] || '').trim() : '';

      const quantity = mappingsToUse.quantity !== '' ? parseNumber(row[parseInt(mappingsToUse.quantity)]) : 0;
      const unitCost = mappingsToUse.unitCost !== '' ? parseNumber(row[parseInt(mappingsToUse.unitCost)]) : 0;
      let totalCost = mappingsToUse.totalCost !== '' ? parseNumber(row[parseInt(mappingsToUse.totalCost)]) : 0;
      const materialCost = mappingsToUse.materialCost !== '' ? parseNumber(row[parseInt(mappingsToUse.materialCost)]) : 0;
      const laborCost = mappingsToUse.laborCost !== '' ? parseNumber(row[parseInt(mappingsToUse.laborCost)]) : 0;
      const equipmentCost = mappingsToUse.equipmentCost !== '' ? parseNumber(row[parseInt(mappingsToUse.equipmentCost)]) : 0;

      if (totalCost === 0 && quantity > 0 && unitCost > 0) totalCost = quantity * unitCost;

      if (totalCost === 0 && quantity === 0) {
        const allText = row
          .filter(c => typeof c === 'string' || typeof c === 'number')
          .map(c => String(c).trim())
          .filter(c => c)
          .join(' ');
        
        if (allText) {
          description = allText;
          itemCode = '';
        }
        
        if (description && !description.toUpperCase().includes('MATERIAL LABOR EQUIPMENT')) {
           currentSectionIndex = 0;
        }
      } else {
        if (!itemCode && description && !description.toUpperCase().includes('MATERIAL LABOR EQUIPMENT')) {
          currentSectionIndex += 1;
          itemCode = `${currentSectionIndex}.0`;
        }
      }

      const directCostTotal = materialCost + laborCost + equipmentCost;

      return {
        itemCode,
        description,
        unit: mappingsToUse.unit !== '' ? String(row[parseInt(mappingsToUse.unit)] || '') : '',
        quantity,
        directCost: directCostTotal,
        indirectCost: 0,
        combinedUnitCost: unitCost,
        totalCost,
        status: 'PENDING',
        processingType: 'MATERIAL_EQUIPMENT'
      };
    }).filter(item => {
      if (!item.description || item.description.trim() === '') return false;
      
      const descUpper = item.description.toUpperCase().trim();
      if (descUpper === 'TOTAL' || descUpper === 'GRAND TOTAL' || descUpper.includes('TOTAL PROJECT COST') || descUpper.includes('SUB-TOTAL') || descUpper.includes('SUB TOTAL') || descUpper.startsWith('TOTAL:')) return false;
      if (descUpper.includes('MATERIAL LABOR EQUIPMENT')) return false;

      const descNoSpaces = descUpper.replace(/\s/g, '');
      if (
        descNoSpaces.includes("DIRECTCOSTOCM") ||
        descNoSpaces.includes("PROFIT(8%)") ||
        descNoSpaces.includes("INDIRECTCOST") ||
        descNoSpaces === "(1)" ||
        descNoSpaces === "(2)" ||
        descNoSpaces === "(3)"
      ) {
        return false;
      }
      return true;
    });

    if (rawHeaders && rawHeaders.length > 0) {
      form.append('boqRawHeaders', JSON.stringify(rawHeaders));
    }
    form.append('mappedBoqJson', JSON.stringify(parsedItems));
    submitToServer(form);
  }

  function confirmMapping() {
    if (!mappingData || !pendingFormData) return;
    processAndSubmit(mappings, mappingData.rows, pendingFormData, mappingData.headers);
  }



  return (
    <>
      <button 
        className="btn-primary" 
        onClick={openModal}
      >
        + New Project
      </button>

      <Modal isOpen={isOpen} onClose={closeModal} title={mappingData ? "Map Excel Columns" : "Upload Awarded BOQ"}>
        {mappingData ? (
          <div style={{ padding: '10px 20px' }}>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '15px' }}>
              We could not perfectly auto-detect your columns. Please map the required fields below.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '20px' }}>
              {[
                { label: 'Description (Required)', key: 'description' },
                { label: 'Quantity', key: 'quantity' },
                { label: 'Total Cost', key: 'totalCost' },
                { label: 'Item No / Code (Optional)', key: 'itemCode' },
                { label: 'Unit (Optional)', key: 'unit' },
                { label: 'Unit Cost (Optional)', key: 'unitCost' }
              ].map(field => (
                <div key={field.key}>
                  <label style={{ display: 'block', marginBottom: '5px', color: 'var(--text-primary)', fontSize: '0.9rem' }}>{field.label}</label>
                  <select 
                    value={(mappings as any)[field.key]} 
                    onChange={e => setMappings({ ...mappings, [field.key]: e.target.value })}
                    style={{ width: '100%', padding: '10px', borderRadius: '6px', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--glass-border)', color: 'white' }}
                  >
                    <option value="">-- Ignore / Not Present --</option>
                    {mappingData.headers.map((h, i) => (
                      <option key={i} value={String(i)}>{h}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>

            <details style={{ marginBottom: '20px' }}>
              <summary style={{ cursor: 'pointer', color: '#10b981', fontSize: '0.85rem', fontWeight: 'bold', padding: '12px', background: 'rgba(16,185,129,0.05)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: '8px' }}>
                Advanced: Direct Unit Cost Breakdown (Program of Works)
              </summary>
              <div style={{ padding: '15px', border: '1px solid rgba(16,185,129,0.3)', borderTop: 'none', borderRadius: '0 0 8px 8px', background: 'rgba(16,185,129,0.02)' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '15px' }}>
                  {[
                    { label: 'Material Cost', key: 'materialCost' },
                    { label: 'Labor Cost', key: 'laborCost' },
                    { label: 'Equipment Cost', key: 'equipmentCost' }
                  ].map(field => (
                    <div key={field.key}>
                      <label style={{ display: 'block', marginBottom: '5px', color: 'var(--text-primary)', fontSize: '0.85rem' }}>{field.label}</label>
                      <select 
                        value={(mappings as any)[field.key]} 
                        onChange={e => setMappings({ ...mappings, [field.key]: e.target.value })}
                        style={{ width: '100%', padding: '10px', borderRadius: '6px', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--glass-border)', color: 'white' }}
                      >
                        <option value="">-- Ignore --</option>
                        {mappingData.headers.map((h, i) => (
                          <option key={i} value={String(i)}>{h}</option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              </div>
            </details>
            
            <div className="modal-actions" style={{ justifyContent: 'space-between' }}>
              <button type="button" className="btn-secondary" onClick={() => setMappingData(null)}>Back to Upload</button>
              <button type="button" className="btn-primary" onClick={confirmMapping} disabled={!mappings.description || isPending}>
                {isPending ? 'Processing...' : 'Confirm & Import BOQ'}
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="modal-form" encType="multipart/form-data">
            <div style={{ textAlign: 'center', padding: '10px 20px' }}>
              <p style={{ color: 'var(--text-secondary)', marginBottom: '15px', fontSize: '0.85rem' }}>
                The system will automatically analyze your Excel, PDF, or Image file to extract the Project Name, Location, and compute the Total Contract Amount. Note: AI processing for PDFs/Images may take 5-15 seconds.
              </p>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', textAlign: 'left', marginBottom: '15px' }}>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={{ display: 'block', marginBottom: '5px', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Project Manager</label>
                  <select name="managerId" style={{ width: '100%', padding: '10px', borderRadius: '6px', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--glass-border)', color: 'white' }}>
                    <option value="">Unassigned</option>
                    {users?.map(u => (
                      <option key={u.id} value={u.id}>{u.name || 'Unnamed'}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="new-project-start" style={{ display: 'block', marginBottom: '5px', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Project Start Date <span style={{ opacity: 0.7 }}>(optional)</span></label>
                  <input id="new-project-start" type="date" name="startDate" value={startDate} onChange={e => setStartDate(e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: '6px', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--glass-border)', color: 'white', colorScheme: 'dark' }} />
                </div>

                <div>
                  <label htmlFor="new-project-duration" style={{ display: 'block', marginBottom: '5px', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Duration (Days) <span style={{ opacity: 0.7 }}>(optional)</span></label>
                  {/* colorScheme dark: the number spinner was drawn as a white box on the dark field. */}
                  <input id="new-project-duration" type="number" name="durationDays" value={durationDays} onChange={e => setDurationDays(e.target.value ? Number(e.target.value) : '')} min={1} step={1} placeholder="e.g. 120" style={{ width: '100%', padding: '10px', borderRadius: '6px', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--glass-border)', color: 'white', colorScheme: 'dark' }} />
                </div>
                <p style={{ gridColumn: '1 / -1', margin: '-6px 0 0', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>Not known yet? Leave both blank and set them later in the Project Summary.</p>

                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={{ display: 'block', marginBottom: '5px', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Computed Completion Date</label>
                  <input type="date" value={computedCompletionDate} readOnly style={{ width: '100%', padding: '10px', borderRadius: '6px', background: 'rgba(0,0,0,0.4)', border: '1px solid var(--glass-border)', color: 'var(--text-secondary)', colorScheme: 'dark' }} />
                </div>

                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={{ display: 'block', marginBottom: '5px', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Total Contract Amount (Optional Override)</label>
                  <input type="number" name="contractAmountOverride" value={contractAmountOverride} onChange={e => setContractAmountOverride(e.target.value ? Number(e.target.value) : '')} step="0.01" placeholder="Leave blank to auto-calculate from BOQ sum" style={{ width: '100%', padding: '10px', borderRadius: '6px', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--glass-border)', color: 'white', colorScheme: 'dark' }} />
                </div>
              </div>

              <div style={{ 
                border: '2px dashed var(--glass-border)', 
                borderRadius: '8px', 
                padding: '20px 10px',
                backgroundColor: 'rgba(0, 0, 0, 0.2)'
              }}>
                <label htmlFor="boqFile" style={{ display: 'block', fontSize: '1.2rem', marginBottom: '15px', color: 'var(--text-primary)', cursor: 'pointer' }}>
                  Select Excel, PDF, or Image File
                </label>
                <input 
                  type="file" 
                  id="boqFile" 
                  name="boqFile" 
                  accept=".xlsx, .xls, .csv, application/pdf, image/*" 
                  required 
                  style={{
                    display: 'block',
                    margin: '0 auto',
                    color: 'var(--text-secondary)'
                  }}
                />
              </div>
            </div>
            <div className="modal-actions" style={{ justifyContent: 'center' }}>
              <button type="button" className="btn-secondary" onClick={closeModal}>Cancel</button>
              <button type="submit" className="btn-primary" disabled={isPending}>
                {isPending ? 'Processing...' : 'Upload & Create Project'}
              </button>
            </div>
          </form>
        )}
      </Modal>

      <style>{`
        .btn-primary {
          background-color: var(--accent-color);
          color: #000;
          border: none;
          padding: 8px 16px;
          border-radius: 6px;
          cursor: pointer;
          font-weight: 600;
          box-shadow: 0 0 10px var(--accent-glow);
          transition: all 0.2s;
        }
        .btn-primary:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 0 15px var(--accent-glow);
        }
        .btn-primary:disabled {
          opacity: 0.7;
          cursor: not-allowed;
        }
        .btn-secondary {
          background-color: transparent;
          color: var(--text-secondary);
          border: 1px solid var(--glass-border);
          padding: 8px 16px;
          border-radius: 6px;
          cursor: pointer;
          transition: all 0.2s;
        }
        .btn-secondary:hover {
          background-color: rgba(255, 255, 255, 0.05);
          color: var(--text-primary);
        }
      `}</style>
    </>
  );
}
