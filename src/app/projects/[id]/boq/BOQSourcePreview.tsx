'use client';

import { useState } from 'react';
import styles from '../planning/planning.module.css';
import type { SourcePreviewPage } from '@/lib/boq/source-preview';

type Preview = SourcePreviewPage;

export default function BOQSourcePreview({projectId,versionId,initialSheet}:{projectId:string;versionId:string;initialSheet:string|null}) {
  const [preview,setPreview]=useState<Preview|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
  async function load(sheet:string|null,offset=0){
    setBusy(true);setError('');
    try{
      const query=new URLSearchParams({versionId,offset:String(offset)});if(sheet)query.set('sheet',sheet);
      const response=await fetch(`/api/projects/${projectId}/boq-review/source-preview?${query}`,{cache:'no-store'});
      const result=await response.json();if(!response.ok)throw Error(result.error||'The preserved source could not be previewed.');
      setPreview(result as Preview);
    }catch(cause){setError(cause instanceof Error?cause.message:'The preserved source could not be previewed.');}
    finally{setBusy(false);}
  }
  return <details className={styles.panel}><summary>Preserved worksheet · original rows and formulas</summary>
    <p className={styles.muted}>Read-only evidence, including annotations, subtotals and blank rows. Formula results are the values saved in the original file; nothing is recalculated.</p>
    {error&&<p className={styles.error} role="alert">{error}</p>}
    {!preview&&<button className={styles.secondary} disabled={busy} onClick={()=>void load(initialSheet)}>{busy?'Reading preserved source…':'Open preserved worksheet'}</button>}
    {preview&&<>
      <div className={styles.fields}><div><label htmlFor="evidence-source-sheet">Source worksheet</label><select id="evidence-source-sheet" value={preview.selectedSheet} disabled={busy} onChange={event=>void load(event.target.value)}>{preview.sheets.map(sheet=><option key={sheet.name} value={sheet.name}>{sheet.name} · {sheet.rowCount} rows{sheet.state!=='visible'?` · ${sheet.state}`:''}</option>)}</select></div><p className={styles.muted}>{preview.fileName} · {preview.totalRows} rows · {preview.totalColumns} columns</p></div>
      <div className={styles.actions}><span>Rows {preview.rows.length?preview.offset+1:0}–{preview.offset+preview.rows.length} of {preview.totalRows}</span><button className={styles.secondary} disabled={busy||preview.offset===0} onClick={()=>void load(preview.selectedSheet,Math.max(0,preview.offset-preview.pageSize))}>Previous source rows</button><button className={styles.secondary} disabled={busy||!preview.hasMore} onClick={()=>void load(preview.selectedSheet,preview.nextOffset??preview.offset+preview.pageSize)}>Next source rows</button></div>
      {preview.columnsTruncated&&<p className={styles.muted}>Preview shows the first {preview.columns.length} columns. Download the original workbook to inspect every column.</p>}
      <div className={styles.scroll} role="region" aria-label="Preserved worksheet cells" tabIndex={0}><table className={styles.table}><thead><tr><th>Source row</th>{preview.columns.map(column=><th key={column.index}>{column.letter}</th>)}</tr></thead><tbody>{preview.rows.map(row=><tr key={row.rowNumber}><th scope="row">{row.rowNumber}</th>{row.cells.map(cell=><td key={cell.column} style={{whiteSpace:'pre-wrap',minWidth:110,maxWidth:360,overflowWrap:'anywhere'}} title={cell.mergedInto?`Merged into ${cell.mergedInto}`:undefined}>{String(cell.value??'')}{cell.mergedInto&&<small className={styles.muted}> · merged into {cell.mergedInto}</small>}{cell.truncated&&<small className={styles.muted}> · text truncated in preview</small>}{cell.formula&&<details><summary>Stored formula</summary><code>{cell.formula}</code></details>}</td>)}</tr>)}</tbody></table></div>
    </>}
  </details>;
}
