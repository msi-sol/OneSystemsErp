'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { 
  FileEdit, AlertTriangle, CheckCircle, 
  Clock, PlusCircle 
} from 'lucide-react';
import { getAllClientVariationOrders } from '@/app/actions/variationOrderActions';
import styles from './variation.module.css';

export default function VariationOrderDashboard() {
  const [projectId, setProjectId] = useState(''); // Could be passed as a prop or query later
  const [vos, setVos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const data = await getAllClientVariationOrders();
      setVos(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const totalVOs = vos.length;
  // Drafts and VOs returned for revision are not awaiting approval.
  const pendingVOs = vos.filter(v => !['APPROVED', 'REJECTED', 'DRAFT', 'FOR_REVISION'].includes(v.currentStatus)).length;
  const highRiskVOs = vos.filter(v => v.aiRiskRating === 'HIGH' || v.aiRiskRating === 'CRITICAL').length;
  const approvedVOs = vos.filter(v => v.currentStatus === 'APPROVED').length;

  const metrics = [
    { title: 'Total VOs', value: totalVOs, icon: <FileEdit size={20} color="var(--primary)" /> },
    { title: 'Pending Approval', value: pendingVOs, icon: <Clock size={20} color="var(--warning-color)" /> },
    { title: 'High Risk', value: highRiskVOs, icon: <AlertTriangle size={20} color="#f87171" /> },
    { title: 'Approved', value: approvedVOs, icon: <CheckCircle size={20} color="#34d399" /> },
  ];

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>AI-Assisted Variation Orders</h1>
          <p className={styles.subtitle}>Manage, analyze, and approve all contract changes with AI validation.</p>
        </div>
        <Link href={`/variation-orders/create${projectId ? `?projectId=${projectId}` : ''}`}>
          <button className={styles.createButton}>
            <PlusCircle size={18} /> New Variation Order
          </button>
        </Link>
      </header>

      <div className={styles.dashboardGrid}>
        {metrics.map((m, i) => (
          <div key={i} className={styles.metricCard}>
            <div className={styles.metricHeader}>
              <h3 className={styles.metricTitle}>{m.title}</h3>
              {m.icon}
            </div>
            <p className={styles.metricValue}>{m.value}</p>
          </div>
        ))}
      </div>

      <div className={styles.dashboardSection}>
        <h2>Recent Variation Orders</h2>
        <div className={styles.tableContainer}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>VO Number</th>
                <th>Type</th>
                <th>Date</th>
                <th>Net Amount</th>
                <th>AI Risk</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} style={{ textAlign: 'center' }}>Loading records...</td></tr>
              ) : vos.length === 0 ? (
                <tr><td colSpan={7} style={{ textAlign: 'center' }}>No variation orders found. Click "New Variation Order" to create one.</td></tr>
              ) : (
                vos.map(vo => (
                  <tr key={vo.id}>
                    <td>{vo.voNumber}</td>
                    <td>{vo.variationType}</td>
                    <td>{new Date(vo.createdAt).toLocaleDateString()}</td>
                    <td style={{fontFamily: 'monospace', fontWeight: 600, color: vo.netVariationAmount < 0 ? '#f87171' : 'inherit'}}>
                      {vo.netVariationAmount < 0 ? '-' : ''}₱ {Math.abs(vo.netVariationAmount).toLocaleString()}
                    </td>
                    <td>
                      <span className={`${styles.badge} ${vo.aiRiskRating === 'HIGH' || vo.aiRiskRating === 'CRITICAL' ? styles.badgeDanger : vo.aiRiskRating === 'MEDIUM' ? styles.badgeWarning : styles.badgeSuccess}`}>
                        {vo.aiRiskRating || 'PENDING'}
                      </span>
                    </td>
                    <td>
                      <span className={`${styles.badge} ${vo.currentStatus === 'APPROVED' ? styles.badgeSuccess : styles.badgeWarning}`}>
                        {vo.currentStatus.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td>
                      <Link href={`/variation-orders/${vo.id}`}>
                        <button className={styles.actionBtn}>View</button>
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
