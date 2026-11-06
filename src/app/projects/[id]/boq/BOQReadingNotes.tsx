'use client';

import { useState } from 'react';
import styles from '../planning/planning.module.css';

export default function BOQReadingNotes({notes}:{notes:{row:string|number;field:string;message:string}[]}){
  const [page,setPage]=useState(0),[query,setQuery]=useState('');
  const filtered=notes.filter(note=>`${note.row} ${note.field} ${note.message}`.toLowerCase().includes(query.trim().toLowerCase()));
  const safePage=Math.min(page,Math.max(0,Math.ceil(filtered.length/25)-1));
  return <details className={styles.panel}><summary>Preserved reading notes · {notes.length}</summary><p className={styles.muted}>Observations saved with this upload, including display rounding and non-priced rows. These source notes are separate from approval decisions.</p><label htmlFor="source-note-search">Search reading notes</label><input id="source-note-search" type="search" value={query} onChange={event=>{setQuery(event.target.value);setPage(0);}}/><div className={styles.actions}><span>{filtered.length} matching notes</span><button className={styles.secondary} disabled={!safePage} onClick={()=>setPage(safePage-1)}>Previous notes</button><button className={styles.secondary} disabled={(safePage+1)*25>=filtered.length} onClick={()=>setPage(safePage+1)}>Next notes</button></div><ul>{filtered.slice(safePage*25,(safePage+1)*25).map((note,index)=><li key={`${safePage}:${index}`}><strong>Source row {note.row} · {note.field}</strong><p>{note.message}</p></li>)}</ul>{!filtered.length&&<p>No reading notes match this search.</p>}</details>;
}
