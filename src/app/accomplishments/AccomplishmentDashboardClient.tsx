"use client";

import React, { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { FiUpload, FiFileText, FiLock, FiUnlock, FiEdit2, FiTrash2, FiMoreVertical, FiDownload, FiDatabase, FiCpu, FiMaximize, FiPlus } from "react-icons/fi";
import { uploadAccomplishmentFileAction, deleteAccomplishmentFileAction, extractAccomplishmentDataAction, aiValidateAccomplishmentAction, createSuccessiveBillingAction } from "@/app/actions/accomplishmentFileActions";
import ApplicableRulesPanel from "@/components/ApplicableRulesPanel";

export default function AccomplishmentDashboardClient({ projects }: { projects: any[] }) {
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  const [showCreateBillingModal, setShowCreateBillingModal] = useState<string | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");

  const handleFileSelect = async (projectId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const file = e.target.files[0];
    
    if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
      toast.error("Please upload an Excel (.xlsx) file.");
      return;
    }

    const loadingToast = toast.loading("Uploading original Excel file securely...");

    try {
      const formData = new FormData();
      formData.append("file", file);
      
      const result = await uploadAccomplishmentFileAction(projectId, formData);
      if (result.success) {
        toast.success("File uploaded and secured as Locked Original!", { id: loadingToast });
      } else {
        toast.error(result.error || "Failed to upload file.", { id: loadingToast });
      }
    } catch (error) {
      toast.error("Network error during upload.", { id: loadingToast });
    }
    e.target.value = ""; 
  };

  const renderTemplateActions = (file: any) => {
    const baseBtnClass = "relative flex items-center justify-center font-bold text-white rounded-lg transition-all hover:translate-y-[2px] hover:shadow-inner active:border-b-0 active:translate-y-[4px] uppercase tracking-wider shadow-lg";

    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
        <button 
          onClick={() => window.location.href = `/accomplishments/view/${file.id}`}
          title="Open File"
          className={baseBtnClass}
          style={{ backgroundColor: '#10b981', borderBottom: '4px solid #047857', padding: '8px 16px', fontSize: '13px', marginRight: '10px' }}
        >
          <FiMaximize size={14} /> Open
        </button>
        
        <a 
          href={file.originalFilePath}
          download
          title="Download Original"
          className={`${baseBtnClass} no-underline`}
          style={{ backgroundColor: '#3b82f6', borderBottom: '4px solid #1d4ed8', padding: '8px 16px', fontSize: '13px', marginRight: '10px' }}
        >
          <FiDownload size={16} style={{ marginRight: '6px' }} /> DL
        </a>
        
        <button 
          onClick={async () => {
             toast.loading("Extracting Data...", { id: `ext-${file.id}` });
             const res = await extractAccomplishmentDataAction(file.id);
             if(res.success) toast.success(res.message, { id: `ext-${file.id}` });
             else toast.error(res.error, { id: `ext-${file.id}` });
          }}
          title="Extract Data"
          className={baseBtnClass}
          style={{ backgroundColor: '#06b6d4', borderBottom: '4px solid #0e7490', padding: '8px 16px', fontSize: '13px', marginRight: '10px' }}
        >
          <FiDatabase size={16} style={{ marginRight: '6px' }} /> Extract
        </button>
        
        <button 
          onClick={async () => {
             toast.loading("Running AI Validation...", { id: `ai-${file.id}` });
             const res = await aiValidateAccomplishmentAction(file.id);
             if(res.success) toast.success(res.message, { id: `ai-${file.id}` });
             else toast.error(res.error, { id: `ai-${file.id}` });
          }}
          title="AI Validate"
          className={baseBtnClass}
          style={{ backgroundColor: '#a855f7', borderBottom: '4px solid #7e22ce', padding: '8px 16px', fontSize: '13px', marginRight: '10px' }}
        >
          <FiCpu size={16} style={{ marginRight: '6px' }} /> Validate
        </button>
        
        <button 
          onClick={async () => {
             if(!confirm("Delete this locked file?")) return;
             await deleteAccomplishmentFileAction(file.id);
          }}
          title="Delete File"
          className={baseBtnClass}
          style={{ backgroundColor: '#ef4444', borderBottom: '4px solid #b91c1c', padding: '8px 16px', fontSize: '13px' }}
        >
          <FiTrash2 size={16} style={{ marginRight: '6px' }} /> Delete
        </button>
      </div>
    );
  };

  return (
    <div style={{ padding: '20px', maxWidth: '100%', margin: '0 auto' }} onClick={() => activeMenuId && setActiveMenuId(null)}>
      <ApplicableRulesPanel moduleName="Progress Billing" />
      
      <header style={{ marginBottom: '40px', borderBottom: '1px solid var(--glass-border)', paddingBottom: '20px' }}>
        <h1 style={{ margin: '0 0 10px 0', color: 'var(--text-primary)', fontSize: '2rem' }}>Project Accomplishments</h1>
        <p style={{ margin: 0, color: 'var(--text-secondary)' }}>Record engineering accomplishments, upload specific templates, and validate against the Awarded BOQ.</p>
      </header>

      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr',
        gap: '30px'
      }}>
        {projects.map((project) => {
          const activeFiles = project.projectAccomplishmentFiles?.filter((f: any) => f.status === "ACTIVE") || [];
          const billingFiles = project.projectAccomplishmentFiles?.filter((f: any) => f.status === "BILLING") || [];

          return (
            <div key={project.id} style={{
              background: 'var(--bg-secondary)',
              borderRadius: '16px',
              border: '1px solid var(--glass-border)',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 4px 20px rgba(0,0,0,0.2)',
              transition: 'all 0.3s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-5px)';
              e.currentTarget.style.borderColor = 'var(--accent-color)';
              e.currentTarget.style.boxShadow = '0 8px 30px rgba(0, 240, 255, 0.15)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'none';
              e.currentTarget.style.borderColor = 'var(--glass-border)';
              e.currentTarget.style.boxShadow = '0 4px 20px rgba(0,0,0,0.2)';
            }}>
              <div style={{ padding: '25px', flexGrow: 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '15px' }}>
                  <h3 style={{ margin: 0, color: 'var(--text-primary)', fontSize: '1.25rem', lineHeight: '1.4', paddingRight: '10px' }}>
                    {project.name}
                  </h3>
                  <span style={{ 
                    background: 'rgba(0, 240, 255, 0.1)', 
                    color: 'var(--accent-color)', 
                    padding: '4px 10px', 
                    borderRadius: '20px', 
                    fontSize: '0.75rem',
                    fontWeight: 'bold',
                    letterSpacing: '0.5px'
                  }}>
                    {project.status}
                  </span>
                </div>
                
                <div style={{ 
                  marginTop: '20px', 
                  padding: '15px', 
                  background: 'var(--glass-panel)', 
                  borderRadius: '8px',
                  border: '1px solid var(--glass-border)'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.9rem' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Contract Amount</span>
                    <span style={{ color: 'var(--accent-color)', fontWeight: 'bold' }}>
                      {new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(project.contractAmount)}
                    </span>
                  </div>
                </div>

                {/* Uploaded File List Section (Templates) */}
                <div style={{ marginTop: '35px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                    <h2 style={{ color: 'white', fontSize: '1.25rem', fontWeight: '900', letterSpacing: '2px', textTransform: 'uppercase', margin: 0 }}>
                      Uploaded Templates / Drafts
                    </h2>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px', background: 'rgba(59,130,246,0.15)', color: '#60a5fa', border: '1px solid rgba(59,130,246,0.3)', borderRadius: '8px', fontSize: '14px', fontWeight: 'bold', cursor: 'pointer', transition: 'all 0.2s' }} className="hover:bg-blue-500/30 hover:scale-105">
                      <FiUpload size={18} /> Upload File
                      <input type="file" style={{ display: 'none' }} accept=".xlsx,.xls" onChange={(e) => handleFileSelect(project.id, e)} />
                    </label>
                  </div>
                  
                  <div style={{ overflowX: 'auto', border: '1px solid rgba(156,163,175,0.3)', borderRadius: '12px', background: 'var(--bg-tertiary)' }}>
                    <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ background: 'rgba(0,0,0,0.4)', borderBottom: '1px solid rgba(156,163,175,0.3)', fontSize: '14px', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '1px' }}>
                          <th style={{ padding: '20px', fontWeight: 'bold' }}>File Name</th>
                          <th style={{ padding: '20px', fontWeight: 'bold' }}>Date Uploaded</th>
                          <th style={{ padding: '20px', fontWeight: 'bold' }}>Size</th>
                          <th style={{ padding: '20px', fontWeight: 'bold', textAlign: 'right' }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {activeFiles.map((file: any) => (
                          <tr key={file.id} style={{ borderBottom: '1px solid rgba(156,163,175,0.1)', transition: 'all 0.2s' }} className="hover:bg-white/5">
                            <td style={{ padding: '20px', fontSize: '17px', fontWeight: '600', color: 'white', display: 'flex', alignItems: 'center', gap: '12px' }}>
                              {file.isLockedOriginal ? <FiLock size={22} color="#eab308" style={{ flexShrink: 0 }}/> : <FiFileText size={22} style={{ flexShrink: 0 }} />}
                              <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={file.fileName}>{file.fileName}</span>
                            </td>
                            <td style={{ padding: '20px', fontSize: '17px', color: '#d1d5db', whiteSpace: 'nowrap' }}>{new Date(file.createdAt).toLocaleDateString()}</td>
                            <td style={{ padding: '20px', fontSize: '17px', color: '#d1d5db', whiteSpace: 'nowrap' }}>{(file.fileSize / 1024).toFixed(1)} KB</td>
                            <td style={{ padding: '20px', textAlign: 'right' }} onClick={e => e.stopPropagation()}>{renderTemplateActions(file)}</td>
                          </tr>
                        ))}
                        {activeFiles.length === 0 && (
                          <tr>
                            <td colSpan={4} style={{ padding: '30px', fontSize: '16px', color: '#6b7280', fontStyle: 'italic', textAlign: 'center' }}>No accomplishment templates uploaded yet.</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Progress Billings Section */}
                <div style={{ marginTop: '45px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                      <h2 style={{ color: '#60a5fa', fontSize: '1.25rem', fontWeight: '900', letterSpacing: '2px', textTransform: 'uppercase', margin: 0 }}>
                        Progress Billings
                      </h2>
                      <button 
                        onClick={() => {
                          setShowCreateBillingModal(project.id);
                          setSelectedTemplateId("");
                        }}
                        style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', background: 'rgba(59,130,246,0.15)', color: '#60a5fa', border: '1px solid rgba(59,130,246,0.3)', borderRadius: '6px', fontSize: '13px', fontWeight: 'bold', cursor: 'pointer', transition: 'all 0.2s' }} className="hover:bg-blue-500/30 hover:scale-105">
                        <FiPlus size={16} /> Create Billing
                      </button>
                    </div>
                  </div>
                  
                  <div style={{ overflowX: 'auto', border: '2px solid rgba(59,130,246,0.4)', borderRadius: '12px', background: 'rgba(30,58,138,0.15)' }}>
                    <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ background: 'rgba(30,58,138,0.3)', borderBottom: '2px solid rgba(59,130,246,0.4)', fontSize: '14px', color: '#93c5fd', textTransform: 'uppercase', letterSpacing: '1px' }}>
                          <th style={{ padding: '20px', fontWeight: 'bold' }}>Billing Name</th>
                          <th style={{ padding: '20px', fontWeight: 'bold' }}>Date Saved</th>
                          <th style={{ padding: '20px', fontWeight: 'bold' }}>Size</th>
                          <th style={{ padding: '20px', fontWeight: 'bold', textAlign: 'right' }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {billingFiles.map((file: any) => (
                          <tr key={file.id} style={{ borderBottom: '1px solid rgba(59,130,246,0.2)', transition: 'all 0.2s' }} className="hover:bg-blue-500/10">
                            <td style={{ padding: '20px', fontSize: '17px', fontWeight: '600', color: 'white', display: 'flex', alignItems: 'center', gap: '12px' }}>
                              {file.isLockedOriginal ? <FiLock size={22} color="#f97316" style={{ flexShrink: 0 }}/> : <FiFileText size={22} color="#60a5fa" style={{ flexShrink: 0 }} />}
                              <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={file.fileName}>{file.fileName}</span>
                            </td>
                            <td style={{ padding: '20px', fontSize: '17px', color: '#d1d5db', whiteSpace: 'nowrap' }}>{new Date(file.createdAt).toLocaleDateString()}</td>
                            <td style={{ padding: '20px', fontSize: '17px', color: '#d1d5db', whiteSpace: 'nowrap' }}>{(file.fileSize / 1024).toFixed(1)} KB</td>
                            <td style={{ padding: '20px', textAlign: 'right' }} onClick={e => e.stopPropagation()}>{renderTemplateActions(file)}</td>
                          </tr>
                        ))}
                        {(project.billings ?? []).map((billing: { id: string; billingNumber: string; billingDate: string | Date; currentBillingAmount: number; totalBillingToDate: number; status: string }) => (
                          <tr key={billing.id} style={{ borderBottom: '1px solid rgba(59,130,246,0.2)' }}>
                            <td style={{ padding: '20px', fontSize: '17px', fontWeight: '600', color: 'white' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <FiFileText size={22} color="#34d399" style={{ flexShrink: 0 }} />
                                <span>{billing.billingNumber}</span>
                              </div>
                              <div style={{ fontSize: '13px', fontWeight: 400, color: '#93c5fd', marginTop: '4px', paddingLeft: '34px' }}>
                                Billed ₱{Number(billing.currentBillingAmount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} · to date ₱{Number(billing.totalBillingToDate || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} · {String(billing.status).replaceAll('_', ' ').toLowerCase()}
                              </div>
                            </td>
                            <td style={{ padding: '20px', fontSize: '17px', color: '#d1d5db', whiteSpace: 'nowrap' }}>{new Date(billing.billingDate).toLocaleDateString()}</td>
                            <td style={{ padding: '20px', fontSize: '15px', color: '#9ca3af', whiteSpace: 'nowrap' }}>Billing record</td>
                            <td style={{ padding: '20px', textAlign: 'right' }}>
                              <a href="/progress-billings" style={{ color: '#60a5fa', fontWeight: 'bold', fontSize: '14px' }}>Open in Progress Billings</a>
                            </td>
                          </tr>
                        ))}
                        {billingFiles.length === 0 && !(project.billings ?? []).length && (
                          <tr>
                            <td colSpan={4} style={{ padding: '30px', fontSize: '16px', color: '#6b7280', fontStyle: 'italic', textAlign: 'center' }}>No progress billings saved yet.</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

              </div>
            </div>
          );
        })}
        {projects.length === 0 && (
          <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '40px', color: 'var(--text-muted)', border: '1px dashed var(--text-muted)', borderRadius: '16px' }}>
            No active projects found.
          </div>
        )}
      </div>

      {showCreateBillingModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0,0,0,0.7)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--glass-border)', borderRadius: '12px', padding: '30px', width: '500px', maxWidth: '90%' }}>
            <h3 style={{ margin: '0 0 20px 0', color: 'white', fontSize: '1.2rem' }}>Create Successive Billing</h3>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '15px' }}>Select the previously locked billing to use as a template:</p>
            
            <select 
              value={selectedTemplateId}
              onChange={e => setSelectedTemplateId(e.target.value)}
              style={{ width: '100%', padding: '12px', borderRadius: '8px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--glass-border)', color: 'white', marginBottom: '25px', outline: 'none' }}
            >
              <option value="">-- Select Template --</option>
              {(() => {
                const sp = projects.find(p => p.id === showCreateBillingModal);
                const billingFiles = sp?.projectAccomplishmentFiles?.filter((f: any) => f.status === "BILLING") || [];
                return billingFiles.map((f: any) => (
                  <option key={f.id} value={f.id}>{f.fileName} ({(f.fileSize / 1024).toFixed(1)} KB)</option>
                ));
              })()}
            </select>
            
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button 
                onClick={() => setShowCreateBillingModal(null)}
                style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid var(--glass-border)', background: 'transparent', color: 'white', cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button 
                disabled={!selectedTemplateId}
                onClick={async () => {
                  toast.loading("Creating Editable Draft...", { id: `succ-${showCreateBillingModal}` });
                  const res = await createSuccessiveBillingAction(showCreateBillingModal, selectedTemplateId);
                  if(res.success) {
                     toast.success(res.message, { id: `succ-${showCreateBillingModal}` });
                     setShowCreateBillingModal(null);
                  } else {
                     toast.error(res.error, { id: `succ-${showCreateBillingModal}` });
                  }
                }}
                style={{ padding: '8px 16px', borderRadius: '8px', border: 'none', background: '#3b82f6', color: 'white', cursor: selectedTemplateId ? 'pointer' : 'not-allowed', opacity: selectedTemplateId ? 1 : 0.5 }}
              >
                Create Editable Billing
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
