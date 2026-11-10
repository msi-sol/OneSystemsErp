'use client';

import { useRef, useState, type ReactNode } from 'react';
import { FileSpreadsheet, UploadCloud, X } from 'lucide-react';
import styles from './UploadDropzone.module.css';

const size = (bytes: number) => bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(2)} MB`;

/**
 * The BOQ Workspace upload, shared: a centered drop area (icon, file name or prompt, size or accepted types, "Choose
 * file" button, ✕ to clear) with the action button below it on the right. Used by the procurement benchmark, the
 * Master Materials List and the DUPA uploads so every upload looks and behaves the same.
 */
export default function UploadDropzone({ prompt, hint, accept, files, onFiles, multiple = false, disabled = false, status, action, inputLabel, name }: {
  prompt: string; hint: string; accept: string;
  files: File[]; onFiles: (files: File[]) => void;
  multiple?: boolean; disabled?: boolean;
  /** Text under the file name once chosen, e.g. "ready to upload". */
  status?: string;
  /** The action button shown below the drop area (on the right). */
  action?: ReactNode;
  inputLabel: string;
  /** Form field name, when the file input is submitted with a form. */
  name?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const choose = (list: FileList | null | undefined) => {
    const chosen = [...(list ?? [])].slice(0, multiple ? undefined : 1);
    if (!chosen.length || disabled) return;
    // Keep the input in step with a dropped file, so a surrounding form submits it.
    if (input.current) { const transfer = new DataTransfer(); chosen.forEach(file => transfer.items.add(file)); input.current.files = transfer.files; }
    onFiles(chosen);
  };
  const clear = () => { if (input.current) input.current.value = ''; onFiles([]); };
  const title = !files.length ? prompt : files.length === 1 ? files[0].name : `${files.length} files`;
  const detail = !files.length ? hint : `${size(files.reduce((sum, file) => sum + file.size, 0))}${status ? ` · ${status}` : ''}`;

  return <>
    <div className={`${styles.dropzone} ${dragging ? styles.dragging : ''}`}
      onDragOver={event => { event.preventDefault(); if (!disabled) setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={event => { event.preventDefault(); setDragging(false); choose(event.dataTransfer.files); }}>
      <div className={styles.uploadIcon}><UploadCloud size={28} strokeWidth={1.6} /></div>
      <h2>{title}</h2>
      <p>{detail}</p>
      <label className={styles.fileButton}><FileSpreadsheet size={18} /> {files.length ? (multiple ? 'Choose other files' : 'Choose another file') : (multiple ? 'Choose files' : 'Choose file')}
        <input ref={input} aria-label={inputLabel} className={styles.fileInput} type="file" name={name} accept={accept} multiple={multiple} disabled={disabled} onChange={event => choose(event.target.files)} />
      </label>
      {files.length > 0 && !disabled && <button type="button" className={styles.clearFile} onClick={clear} aria-label="Remove selected file"><X size={16} /></button>}
    </div>
    {action && <div className={styles.actionBar}>{action}</div>}
  </>;
}
