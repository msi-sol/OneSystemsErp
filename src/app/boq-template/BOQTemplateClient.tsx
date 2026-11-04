"use client";

import React, { useEffect, useRef, useState } from "react";
import { generateBOQTemplate } from "@/app/actions/boqTemplateService";
import { uploadAndParseBOQ, checkBoqUploadStatus, approveBOQUpload } from "@/app/actions/boqUploadParser";
import { validateBOQUploadFile } from "@/lib/boq/upload-input";
import { Download, Upload, FileSpreadsheet, CheckCircle, AlertTriangle, XCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";
import styles from "./boqTemplate.module.css";

type BOQUploadError = {
  row: number | string;
  field: string;
  issue: string;
  suggested: string;
};

type BOQUploadReport = {
  fileUrl?: string;
  fileName: string;
  validRowsCount: number;
  errorRowsCount: number;
  warningRowsCount: number;
  grandTotal: number;
  errors: BOQUploadError[];
};

type BOQUploadResult = {
  success: true;
  uploadId: string;
  status: string;
  report: BOQUploadReport;
};

export default function BOQTemplateClient({ projects }: { projects: { id: string, name: string }[] }) {
  const [projectId, setProjectId] = useState<string>("");

  const [isDownloading, setIsDownloading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  
  const [uploadResult, setUploadResult] = useState<BOQUploadResult | null>(null);
  const mountedRef = useRef(true);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    };
  }, []);

  const handleDownload = async () => {
    setIsDownloading(true);
    try {
      const res = await generateBOQTemplate(projectId || undefined);
      if (!res.success) {
        toast.error(res.error || "Download failed");
        return;
      }
      const byteCharacters = atob(res.data!);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = res.fileName!;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast.success("Template downloaded successfully");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsDownloading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validationError = validateBOQUploadFile({ name: file.name, size: file.size });
    if (validationError) {
      toast.error(validationError);
      e.target.value = "";
      return;
    }

    setIsUploading(true);
    setUploadResult(null);

    try {
      const formData = new FormData();
      formData.set("projectId", projectId);
      formData.set("file", file);
      const res = await uploadAndParseBOQ(formData);
      if (!mountedRef.current) return;

      if (!res.success || !res.jobId) {
        toast.error(res.error || "Upload could not be started. Please try again.");
        setIsUploading(false);
        e.target.value = "";
        return;
      }

      const jobId = res.jobId;
      const pollStartedAt = Date.now();
      const poll = async () => {
        if (!mountedRef.current) return;

        if (Date.now() - pollStartedAt >= 5 * 60 * 1000) {
          toast.error("BOQ processing is taking longer than expected. Check the upload status or try again later.");
          setIsUploading(false);
          e.target.value = "";
          return;
        }

        try {
          const statusRes = await checkBoqUploadStatus(jobId);
          if (!mountedRef.current) return;

          if (!statusRes.success) {
            toast.error(statusRes.error || "Could not check upload status. Please try again.");
            setIsUploading(false);
            e.target.value = "";
            return;
          }

          if (statusRes.status === "COMPLETED") {
            const finalResult = statusRes.result;
            if (!finalResult?.success) {
              toast.error(finalResult?.error || "BOQ processing failed. Please check the file and try again.");
            } else {
              setUploadResult(finalResult);
            }
            if (finalResult?.status === "VALIDATION_FAILED") {
              toast.error("Validation failed. Please review the errors.");
            } else if (finalResult?.success) {
              toast.success("File uploaded and validated successfully!");
            }
            setTimeout(() => {
              if (mountedRef.current) window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
            }, 100);
            setIsUploading(false);
            e.target.value = "";
            return;
          }

          if (statusRes.status === "FAILED") {
            toast.error(statusRes.error || "BOQ processing failed. Please check the file and try again.");
            setIsUploading(false);
            e.target.value = "";
            return;
          }

          pollTimerRef.current = setTimeout(poll, 3000);
        } catch {
          if (!mountedRef.current) return;
          toast.error("Could not check upload status. Please try again.");
          setIsUploading(false);
          e.target.value = "";
        }
      };
      pollTimerRef.current = setTimeout(poll, 3000);
    } catch {
      toast.error("Upload could not be completed. Please try again.");
      setIsUploading(false);
      e.target.value = "";
    }
  };

  const handleApprove = async () => {
    if (!uploadResult?.uploadId) return;
    setIsApproving(true);
    try {
      const res = await approveBOQUpload(uploadResult.uploadId);
      if (res.success) {
        toast.success("BOQ successfully approved and activated!");
        setUploadResult({ ...uploadResult, status: "APPROVED" });
      } else {
        toast.error("Failed to approve");
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsApproving(false);
    }
  };

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div>
          <Link href="/projects" className={styles.backLink}>&larr; Back to Projects</Link>
          <h1 className={styles.title}>BOQ Template Center</h1>
          <p className={styles.subtitle}>Download the official blank BOQ Excel template, encode data offline, and upload the completed template back to the ERP.</p>
        </div>
      </header>

      <div className={styles.card}>
        <div className={styles.projectSelector}>
          <label className={styles.label}>Target Project (Optional: Leave blank to auto-create a new project)</label>
          <select 
            value={projectId} 
            onChange={(e) => setProjectId(e.target.value)}
            className={styles.select}
          >
            <option value="">-- Create a New Project automatically from uploaded file --</option>
            {projects.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
      </div>

      <div className={styles.panels}>
        <div className={styles.panel}>
          <div className={`${styles.iconWrapper} ${styles.blue}`}>
            <FileSpreadsheet size={32} />
          </div>
          <h3 className={styles.panelTitle}>1. Download Template</h3>
          <p className={styles.panelDesc}>Get the official Excel template pre-filled with project details.</p>
          <button
            onClick={handleDownload}
            disabled={isDownloading}
            className={styles.primaryBtn}
          >
            {isDownloading ? <Loader2 size={18} className={styles.spin} /> : <Download size={18} style={{ marginRight: '8px' }} />}
            Download Final BOQ Template
          </button>
        </div>

        <div className={styles.panel}>
          <div className={`${styles.iconWrapper} ${styles.green}`}>
            <Upload size={32} />
          </div>
          <h3 className={styles.panelTitle}>2. Upload Completed BOQ</h3>
          <p className={styles.panelDesc}>Upload your encoded .xlsx file for validation and extraction.</p>
          
          <div className={styles.uploadArea}>
            <label className={`${styles.uploadLabel} ${isUploading ? styles.disabled : ''}`}>
              {isUploading ? (
                <Loader2 size={32} className={styles.spin} color="#10b981" />
              ) : (
                <>
                  <Upload size={32} color="#10b981" />
                  <span className={styles.uploadText}>Click to browse (.xlsx only)</span>
                </>
              )}
              <input type="file" className={styles.hiddenInput} accept=".xlsx" onChange={handleFileUpload} disabled={isUploading} />
            </label>
          </div>
        </div>
      </div>

      {uploadResult && (
        <div className={styles.card}>
          <div className={styles.preservationBox}>
            <h3 className={styles.preservationTitle}>Original Excel File Preserved</h3>
            <p className={styles.preservationDesc}>
              <strong>Original uploaded Excel file is preserved and unchanged.</strong> The system has securely saved your file in its exact original format, preserving all cell protections, formulas, letterheads, and layout settings.
            </p>
            {uploadResult.report.fileUrl && (
              <a 
                href={uploadResult.report.fileUrl} 
                download={uploadResult.report.fileName}
                className={styles.preservationBtn}
                target="_blank"
                rel="noreferrer"
              >
                <Download size={16} style={{ marginRight: '8px' }} />
                Download Original Excel File
              </a>
            )}
          </div>

          <div className={styles.reportHeader}>
            <h2 className={styles.reportTitle}>Validation Report</h2>
            {uploadResult.status === "VALIDATION_FAILED" ? (
              <span className={`${styles.badge} ${styles.failed}`}>
                <XCircle size={16} style={{ marginRight: '8px' }} /> Validation Failed
              </span>
            ) : uploadResult.status === "APPROVED" ? (
              <span className={`${styles.badge} ${styles.approved}`}>
                <CheckCircle size={16} style={{ marginRight: '8px' }} /> Approved
              </span>
            ) : (
              <span className={`${styles.badge} ${styles.ready}`}>
                <CheckCircle size={16} style={{ marginRight: '8px' }} /> Ready for Import
              </span>
            )}
          </div>

          <div className={styles.statsGrid}>
            <div className={styles.statCard}>
              <div className={styles.statLabel}>Valid Rows</div>
              <div className={`${styles.statValue} ${styles.green}`}>{uploadResult.report.validRowsCount}</div>
            </div>
            <div className={styles.statCard}>
              <div className={styles.statLabel}>Errors</div>
              <div className={`${styles.statValue} ${styles.red}`}>{uploadResult.report.errorRowsCount}</div>
            </div>
            <div className={styles.statCard}>
              <div className={styles.statLabel}>Warnings</div>
              <div className={`${styles.statValue} ${styles.yellow}`}>{uploadResult.report.warningRowsCount}</div>
            </div>
            <div className={styles.statCard}>
              <div className={styles.statLabel}>Grand Total</div>
              <div className={styles.statValue}>₱{uploadResult.report.grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
            </div>
          </div>

          {uploadResult.report.errors.length > 0 && (
            <div className={styles.errorsSection}>
              <h3 className={styles.errorsTitle}><AlertTriangle size={16} style={{ marginRight: '8px' }} /> Critical Errors</h3>
              <div className={styles.tableWrapper}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Row</th>
                      <th>Field</th>
                      <th>Issue</th>
                      <th>Suggested Correction</th>
                    </tr>
                  </thead>
                  <tbody>
                    {uploadResult.report.errors.map((err, idx) => (
                      <tr key={idx}>
                        <td>{err.row}</td>
                        <td className={styles.highlight}>{err.field}</td>
                        <td>{err.issue}</td>
                        <td>{err.suggested}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className={styles.actions}>
            <button className={styles.secondaryBtn} onClick={() => setUploadResult(null)}>
              Cancel
            </button>
            <button className={styles.warningBtn} onClick={() => setUploadResult(null)}>
              Return for Correction
            </button>
            <button className={styles.submitBtn} disabled={uploadResult.status === "VALIDATION_FAILED" || uploadResult.status === "APPROVED"} onClick={() => toast.success("Submitted for review!")}>
              Submit for Review
            </button>
            <button 
              className={styles.successBtn}
              disabled={uploadResult.status === "VALIDATION_FAILED" || uploadResult.status === "APPROVED" || isApproving}
              onClick={handleApprove}
            >
              {isApproving && <Loader2 size={16} className={styles.spin} />}
              {uploadResult.status === "APPROVED" ? "BOQ Activated" : "Approve and Import"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
