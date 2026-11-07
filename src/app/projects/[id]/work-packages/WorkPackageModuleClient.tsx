'use client';
import { useState, useTransition, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Decimal from 'decimal.js';
import WorkPackageWorkspace from '../scheduling/WorkPackageWorkspace';
import WorkPackageDetailsPanel from './WorkPackageDetailsPanel';
import PackageBreakdownPanel from './PackageBreakdownPanel';
import WorkPackageLocationsPanel from './WorkPackageLocationsPanel';
import AiCheckPanel from '@/components/ai/AiCheckPanel';
import WorkPackageExecutionPanel from './WorkPackageExecutionPanel';
import WorkPackageCapacities from './WorkPackageCapacities';
import WorkPackageMaterialsPanel from './WorkPackageMaterialsPanel';
import WorkPackageAssumptions from './WorkPackageAssumptions';
import { deriveWorkPackageReadiness } from '@/lib/scheduling/work-package-readiness';
import { formatLocationPath } from '@/lib/scheduling/work-package-location';
import type { WorkPackageModuleProps, ModuleActivity } from './module-types';
import styles from '../planning/planning.module.css';
import NextStepCard from '@/components/boq/NextStepCard';
import { deriveWpsLifecycle } from '@/lib/planning/lifecycle';
import { WPS_VIEW_ALIASES } from '@/lib/scheduling/wps-overview';
import WpsStepNav from './WpsStepNav';
import WpsPlanSummary from './WpsPlanSummary';
import DupaGuide from './DupaGuide';

const RULES = 'BOQ_WPS_WORKSPACE_V1';
const PACKAGE_TABS = ['scope', 'schedule', 'resources', 'dupa'] as const;
type PackageTab = typeof PACKAGE_TABS[number];
const money = (value: string | number | null) => new Intl.NumberFormat('en-PH',{style:'currency',currency:'PHP'}).format(Number(value || 0));
const humanError = (value: unknown) => typeof value === 'string' ? ({
  SCHEDULE_VERSION_CONFLICT:'This plan changed. Refresh before saving again.',
  ALLOCATION_EXCEEDS_BOQ_QUANTITY:'This allocation exceeds the available BOQ quantity. Reduce another allocation first.',
  CURRENT_ENGINEER_REVIEW_REQUIRED:'An engineer must review the current plan before PM approval.',
  ALL_ACTIVITIES_MUST_BE_DATED:'Set start and finish dates for every work package.',
  BOQ_QUANTITIES_MUST_BE_FULLY_ALLOCATED:'Allocate the full quantity of every approved BOQ item before approval.',
  WORK_PACKAGE_WEIGHTS_MUST_SUM_TO_ONE:'Completion weights must total 100%.',
  OPEN_BLOCKING_CONSTRAINTS:'Resolve the blocking constraints before approval.',
  SCHEDULE_NOT_IN_BOQ_WORKSPACE:'Prepare this draft in the Work Packages module before editing it.',
} as Record<string,string>)[value] || value.replaceAll('_',' ').toLowerCase() : 'The change could not be saved.';

export default function WorkPackageModuleClient({ projectId, projectStartDate, approvedBOQ, boqItems, schedule, summary, capacity, members, initialView = 'schedule', initialPackage, initialPackageTab, revisionComparison = [], executionWarning = '', executionActivityId, hasOpenDraft = false }: WorkPackageModuleProps) {
  const router = useRouter();
  const [view, setView] = useState(WPS_VIEW_ALIASES[initialView] ?? initialView);
  const [packageTab, setPackageTab] = useState<PackageTab>(PACKAGE_TABS.includes(initialPackageTab as PackageTab) ? initialPackageTab as PackageTab : 'scope');
  const [selectedId, setSelectedId] = useState(initialPackage || '');
  const [busy, setBusy] = useState(false);
  const [refreshing, startRefresh] = useTransition();
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [suggestConfirm, setSuggestConfirm] = useState(false);
  const [clearConfirm, setClearConfirm] = useState(false);
  const [bulkLocation, setBulkLocation] = useState('');
  const [suggestedStart, setSuggestedStart] = useState(() => { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`; });
  const [reviewComments, setReviewComments] = useState('');
  const [approvalConfirm, setApprovalConfirm] = useState(false);
  const [approvalReason,setApprovalReason]=useState('');
  const [revisionReason, setRevisionReason] = useState('');
  const [cancelRevision, setCancelRevision] = useState(false);
  const [removePackage, setRemovePackage] = useState(false);
  const [newPackage, setNewPackage] = useState({activityCode:'',name:'',plannedStartDate:'',plannedFinishDate:'',weight:'0'});
  const [editedPackage, setEditedPackage] = useState<{id:string;activityCode:string;name:string;start:string;finish:string;weight:string;duration:string}|null>(() => {
    const activity = schedule?.activities.find(item => item.id === initialPackage);
    return activity ? { id:activity.id, activityCode:activity.activityCode || '', name:activity.name, start:activity.plannedStartDate?.slice(0,10)||'', finish:activity.plannedFinishDate?.slice(0,10)||'', weight:String(Number((activity.plannedWeight*100).toFixed(6))),duration:String(activity.plannedDuration) } : null;
  });
  const [allocation, setAllocation] = useState({boqItemId:boqItems[0]?.id || '',activityId:'',quantity:'',locationId:''});
  const [sequence, setSequence] = useState({predecessorId:'',successorId:'',type:'FS',lag:'0'});
  const pending = busy || refreshing;
  const immutable = schedule?.workflowStatus === 'ACTIVE_BASELINE' || schedule?.workflowStatus === 'SUPERSEDED_BASELINE' || schedule?.workflowStatus === 'ARCHIVED_BASELINE';
  const adopted = schedule?.generationRulesVersion === RULES;
  const canEdit = approvedBOQ && capacity.canEdit && !immutable && adopted;
  const selected = schedule?.activities.find(activity=>activity.id===selectedId);
  const refresh = () => startRefresh(()=>router.refresh());
  function openPackage(activity: ModuleActivity, tab: PackageTab = 'scope') {
    // The tab travels in the URL so it survives the package page loading.
    router.push(`/projects/${projectId}/work-packages/${activity.id}${tab === 'scope' ? '' : `?tab=${tab}`}`);
    setSelectedId(activity.id); setView('package'); setError(''); setRemovePackage(false);
    setPackageTab(tab);
    setEditedPackage({id:activity.id,activityCode:activity.activityCode || '',name:activity.name,start:activity.plannedStartDate?.slice(0,10)||'',finish:activity.plannedFinishDate?.slice(0,10)||'',weight:String(Number((activity.plannedWeight*100).toFixed(6))),duration:String(activity.plannedDuration)});
  }
  async function request(endpoint:string,body:Record<string,unknown>,method='POST') {
    if (pending) return null;
    setBusy(true);setError('');setMessage('');
    try {
      const response = await fetch(endpoint,{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
      const data = await response.json();
      if (!response.ok) throw new Error(humanError(data.error));
      setMessage('Plan updated.');refresh();return data;
    } catch(caught) {setError(caught instanceof Error?caught.message:'The change could not be saved.');return null;}
    finally {setBusy(false);}
  }
  const plan = (action:string,values:Record<string,unknown>={}) => request(`/api/projects/${projectId}/work-packages`,{action,...(schedule?{currentScheduleId:schedule.id}:{}),expectedRowVersion:schedule?.rowVersion||0,...values});
  const review = (action:string,values:Record<string,unknown>={}) => schedule ? request(`/api/projects/${projectId}/work-packages/review`,{action,scheduleId:schedule.id,expectedRowVersion:schedule.rowVersion,...values}):Promise.resolve(null);
  function duration(start:string,finish:string) {return start&&finish?Math.max(1,Math.round((new Date(finish).getTime()-new Date(start).getTime())/86400000)+1):0;}
  async function createPackage(event:FormEvent) {
    event.preventDefault();
    const result=await plan('create',{activityCode:newPackage.activityCode || null,name:newPackage.name,plannedStartDate:newPackage.plannedStartDate||null,plannedFinishDate:newPackage.plannedFinishDate||null,plannedDuration:duration(newPackage.plannedStartDate,newPackage.plannedFinishDate),plannedWeight:Number(newPackage.weight)/100});
    if(result){setShowCreate(false);setNewPackage({activityCode:'',name:'',plannedStartDate:'',plannedFinishDate:'',weight:'0'});}
  }
  async function savePackage(event:FormEvent) {
    event.preventDefault();if(!schedule||!editedPackage)return;
    const result=await request(`/api/projects/${projectId}/scheduling/activities/${editedPackage.id}`,{expectedRowVersion:schedule.rowVersion,activityCode:editedPackage.activityCode||null,name:editedPackage.name,plannedStartDate:editedPackage.start||null,plannedFinishDate:editedPackage.finish||null,plannedDuration:Number(editedPackage.duration),plannedWeight:Number(editedPackage.weight)/100},'PUT');
    if(result){setEditedPackage(null);router.push(`/projects/${projectId}/work-packages`);setView('schedule');}
  }
  const goView = (next:string) => {setView(next);setError('');setApprovalConfirm(false);router.push(`/projects/${projectId}/work-packages?view=${encodeURIComponent(next)}${immutable?'&baseline=active':''}`);};
  const openById = (id: string, tab: PackageTab = 'scope') => { const activity = schedule?.activities.find(item => item.id === id); if (activity) openPackage(activity, tab); };
  const boqTotal = boqItems.reduce((sum, item) => sum + Number(item.totalCost || 0), 0);
  const readiness=schedule?deriveWorkPackageReadiness({activities:schedule.activities.map(activity=>({...activity,boqAllocations:schedule.allocations.filter(row=>row.activityId===activity.id)})),dependencies:schedule.dependencies,details:schedule.details,contractAmount:summary?.contractAmount||'0',scopeReconciled:!!summary&&summary.coverage.every(row=>row.status==='planned')}):null;
  const weightTotal=schedule?.activities.reduce((sum,activity)=>sum.plus(String(activity.plannedWeight)),new Decimal(0)).times(100).toDecimalPlaces(4).toString()||'0';
  const packageName = selected ? `${selected.activityCode || 'Work package'} · ${selected.name}` : 'Work package';
  const lifecycle = deriveWpsLifecycle({
    projectId, approvedBOQ, hasPlan: !!schedule, adopted: !!adopted, packageCount: schedule?.activities.length || 0,
    checks: readiness?.checks || [], reviewCurrent: !!schedule?.review?.current, reviewStale: !!schedule?.review && !schedule.review.current,
    baselineApproved: !!immutable, hasOpenRevision: !!immutable && hasOpenDraft,
    canEdit: capacity.canEdit, canReview: capacity.canEngineerReview, canApprove: capacity.canApprove,
  });
  if(!approvedBOQ)return <NextStepCard lifecycle={lifecycle} stepsLabel="Work-package steps" />;
  return <>
    <NextStepCard lifecycle={lifecycle} stepsLabel="Work-package steps" />
    <WorkPackageCapacities projectId={projectId}/><div className={styles.titleRow}><div><h2>Work Packages</h2><p>{schedule?`${schedule.workflowStatus==='ACTIVE_BASELINE'?'Approved baseline · ':schedule.workflowStatus==='SUPERSEDED_BASELINE'?'Superseded baseline · ':schedule.workflowStatus==='ARCHIVED_BASELINE'?'Archived plan · ':''}${schedule.baselineCode||schedule.revisionCode||'Draft plan'}`:'Prepare a draft plan from the approved BOQ.'}</p></div>{schedule&&canEdit&&view!=='package'&&<button className={styles.button} disabled={pending} onClick={()=>setShowCreate(!showCreate)}>Add work package</button>}</div>
    {executionWarning&&<p className={styles.status}>{executionWarning}</p>}
    {error&&<p role="alert" className={styles.error}>{error}</p>}{message&&<p role="status" className={styles.success}>{message}</p>}
    {(!schedule||(!adopted&&!immutable))&&<div className={styles.empty}><h3>{schedule?'Prepare this draft in Work Packages':'No work-package plan yet'}</h3><p className={styles.muted}>Start manually or prepare suggestions from approved BOQ items. Dates and assumptions remain for the planner to confirm.</p>{capacity.canEdit&&<button className={styles.button} disabled={pending} onClick={()=>plan('start')}>{pending?'Preparing…':schedule?'Prepare existing draft':'Start work-package plan'}</button>}</div>}
    {schedule&&(adopted||immutable)&&<>
      {immutable&&hasOpenDraft&&<div className={styles.status}>A separate revision proposal is open. <Link className={styles.link} href={`/projects/${projectId}/work-packages`}>Open revision proposal</Link></div>}
      {schedule.previousBaselineId&&!immutable&&<div className={styles.status}><strong>Revision draft</strong><p>The previous approved baseline remains active until this revision is reviewed and approved.</p><Link className={styles.link} href={`/projects/${projectId}/work-packages?baseline=active`}>View the active execution baseline</Link></div>}
      {view!=='package'&&<>
        {readiness&&schedule.activities.length>0&&<WpsPlanSummary boqTotal={boqTotal} packageTotal={summary?.allocatedAmount??null} packageCount={schedule.activities.length} datedCount={summary?.datedCount??0} weightTotal={weightTotal}
          checksPassed={readiness.checks.filter(check=>check.passed).length} checksTotal={readiness.checks.length} statusLabel={immutable?`Approved baseline${schedule.baselineCode?` · ${schedule.baselineCode}`:''}`:schedule.previousBaselineId?`Revision draft${schedule.revisionCode?` · ${schedule.revisionCode}`:''}`:'Draft plan'}/>}
        <WpsStepNav view={view} checks={readiness?.checks||[]} packageCount={schedule.activities.length} readOnly={!!immutable} showSiteWork={!!immutable||!!schedule.previousBaselineId} onSelect={goView}/>
      </>}
      {view!=='package'&&['look-ahead','weekly','site-logs','operational-constraints'].includes(view)&&<WorkPackageExecutionPanel projectId={projectId} view={view==='operational-constraints'?'constraints':view as 'look-ahead'|'weekly'|'site-logs'} canPrepare={capacity.canEdit} canWeekly={capacity.canManageWeekly} canRecord={capacity.canRecordSiteLogs} members={members} activityId={executionActivityId}/>}
      {view!=='package'&&showCreate&&canEdit&&<form className={styles.panel} onSubmit={createPackage}><h3>New work package</h3><div className={styles.fields}><div><label htmlFor="new-package-code">Package code</label><input id="new-package-code" required value={newPackage.activityCode} onChange={e=>setNewPackage({...newPackage,activityCode:e.target.value})} maxLength={40}/></div><div><label htmlFor="new-package-name">Package name</label><input id="new-package-name" required minLength={3} value={newPackage.name} onChange={e=>setNewPackage({...newPackage,name:e.target.value})} maxLength={180}/></div><div><label htmlFor="new-package-start">Planned start</label><input id="new-package-start" type="date" value={newPackage.plannedStartDate} onChange={e=>setNewPackage({...newPackage,plannedStartDate:e.target.value})}/></div><div><label htmlFor="new-package-finish">Planned finish</label><input id="new-package-finish" type="date" min={newPackage.plannedStartDate} value={newPackage.plannedFinishDate} onChange={e=>setNewPackage({...newPackage,plannedFinishDate:e.target.value})}/></div><div><label htmlFor="new-package-weight">Completion weight (%)</label><input id="new-package-weight" type="number" required min="0.0001" max="100" step="any" value={newPackage.weight} onChange={e=>setNewPackage({...newPackage,weight:e.target.value})}/></div></div><div className={styles.actions}><button className={styles.button} disabled={pending}>Create work package</button><button type="button" className={styles.secondary} onClick={()=>setShowCreate(false)}>Cancel</button></div></form>}
      {view==='schedule'&&<>{readiness&&<details className={styles.history}><summary>Package readiness · {readiness.packages.filter(row=>row.state==='blocked').length} blocked · {readiness.packages.filter(row=>row.state==='attention').length} need attention</summary>{readiness.packages.map(row=><div key={row.id} className={styles.status}><strong>{schedule.activities.find(activity=>activity.id===row.id)?.activityCode} · {row.state}</strong><ul>{row.reasons.map(reason=><li key={reason}>{reason}</li>)}</ul></div>)}</details>}
        {canEdit&&schedule.activities.length===0&&<div className={styles.panel}><h3>Plan from the approved BOQ</h3><p className={styles.muted}>Section-based suggestions are a starting point. Split quantities across packages or combine items from different sections in the Scope planner. Suggestions include scope, offsets, duration, crew and materials/labor/equipment budgets. Calendar dates and resource review remain human decisions.</p><div className={styles.actions}><button className={styles.button} disabled={pending} onClick={()=>{if(suggestConfirm){void plan('suggest');setSuggestConfirm(false);}else setSuggestConfirm(true);}}>{suggestConfirm?'Confirm suggested packages':'Generate suggested work packages'}</button>{suggestConfirm&&<button className={styles.secondary} onClick={()=>setSuggestConfirm(false)}>Cancel</button>}</div></div>}
        {/* One-step dates: fills only undated packages from a start date plus each package's suggested offset and duration. */}
        {canEdit&&schedule.activities.some(activity=>!activity.plannedStartDate||!activity.plannedFinishDate)&&<div className={styles.panel}><h3>Fill missing package dates</h3><p className={styles.muted}>{schedule.activities.filter(activity=>!activity.plannedStartDate||!activity.plannedFinishDate).length} of {schedule.activities.length} packages have no planned dates. Set them in one step from the project start, using each package&apos;s suggested start offset and duration. Dates you already entered are kept, and every date stays editable.</p><div className={styles.actions}><label>Project start <input type="date" value={suggestedStart} onChange={event=>setSuggestedStart(event.target.value)} /></label><button className={styles.button} disabled={pending||!suggestedStart} onClick={()=>void plan('apply-suggested-dates',{startDate:suggestedStart})}>Apply suggested dates</button></div></div>}
        {/* Start over: clears every package of an unreviewed draft so suggestions can be regenerated (BOQ unaffected). */}
        {canEdit&&schedule.activities.length>0&&(schedule.workflowStatus==='AI_GENERATED_DRAFT'||schedule.workflowStatus==='INVALID_GENERATED_DRAFT')&&<details className={styles.panel}><summary>Start the package plan over</summary><p className={styles.muted}>Removes all {schedule.activities.length} draft packages with their scope, budgets and sequence links so you can generate suggestions again or add packages yourself. The approved BOQ is not changed. Not available once a package has progress, procurement or DUPA records.</p><div className={styles.actions}><button className={styles.secondary} disabled={pending} onClick={()=>{if(clearConfirm){void plan('clear-packages');setClearConfirm(false);}else setClearConfirm(true);}}>{clearConfirm?`Confirm: remove all ${schedule.activities.length} draft packages`:'Clear all draft packages'}</button>{clearConfirm&&<button className={styles.secondary} onClick={()=>setClearConfirm(false)}>Cancel</button>}</div></details>}
        {/* Optional AI Check: grouping, sequence and plan insights; nothing changes unless accepted. */}
        <AiCheckPanel projectId={projectId} scope="work-packages"/>
        {summary&&<WorkPackageWorkspace projectId={projectId} summary={summary} workflowStatus={schedule.workflowStatus} baselineCode={schedule.baselineCode} boqLocked onPlan={()=>goView('scope')} onReview={()=>goView('review')} canEditDraft={canEdit} rowVersion={schedule.rowVersion} onRefresh={refresh} moduleMode onOpenPackage={id=>{const activity=schedule.activities.find(item=>item.id===id);if(activity)openPackage(activity);}} completionWeights={Object.fromEntries(schedule.activities.map(activity=>[activity.id,activity.plannedWeight]))}/>}
      </>}
      {view === 'package' && selected && <section className={styles.packageWorkspace} aria-label={`Work package details for ${packageName}`}>
        <div className={styles.packageHeading}>
          <div><p className={styles.packageEyebrow}>Selected work package</p><h3>{packageName}</h3><p className={styles.muted}>{selected.plannedStartDate?.slice(0, 10) || 'Not dated'} – {selected.plannedFinishDate?.slice(0, 10) || 'Not dated'} · completion weight {Number((selected.plannedWeight * 100).toFixed(4))}%</p></div>
          <button type="button" className={styles.secondary} onClick={() => goView('schedule')}>Back to package list</button>
        </div>
        <nav className={styles.packageTabs} role="tablist" aria-label={`${packageName} workspace`}>
          {([ ['scope', 'Scope'], ['schedule', 'Schedule'], ['resources', 'Resources & budgets'], ['dupa', 'DUPA'] ] as const).map(([key, label]) => <button key={key} type="button" role="tab" id={`package-tab-${key}`} aria-controls={`package-panel-${key}`} aria-selected={packageTab === key} className={packageTab === key ? styles.button : styles.secondary} onClick={() => setPackageTab(key)}>{label}</button>)}
        </nav>

        <section className={styles.packagePanel} role="tabpanel" id="package-panel-scope" aria-labelledby="package-tab-scope" hidden={packageTab !== 'scope'}>
          <div className={styles.panel}><h4>BOQ allocations for this package</h4>
            {schedule.allocations.filter(row => row.activityId === selected.id).length ? <ul>{schedule.allocations.filter(row => row.activityId === selected.id).map(row => { const item = boqItems.find(candidate => candidate.id === row.awardedBoqItemId); return <li key={row.id} className={styles.packageAllocation}><strong>{item?.itemCode || 'BOQ item'} · {item?.description || 'Description unavailable'}</strong><span>{row.allocatedQuantity} {item?.unit || ''} · {money(row.allocatedAmount)} · {schedule.details.locations.find(location => location.id === schedule.details.allocationLocations[row.id])?.name || 'Location not set'}</span></li>; })}</ul> : <p className={styles.muted}>No approved BOQ quantities are allocated to this package yet.</p>}
            <button type="button" className={styles.button} onClick={() => goView('scope')}>Open full scope planner</button>
          </div>
          <WorkPackageLocationsPanel projectId={projectId} canEdit={capacity.canEdit} onSaved={refresh}/>
        </section>

        <section className={styles.packagePanel} role="tabpanel" id="package-panel-schedule" aria-labelledby="package-tab-schedule" hidden={packageTab !== 'schedule'}>
          <WorkPackageAssumptions key={selected.id} projectId={projectId} scheduleId={schedule.id} activityId={selected.id} rowVersion={schedule.rowVersion} details={schedule.details} canEdit={!!canEdit}/>
          <section className={styles.panel}>
            {canEdit ? <form onSubmit={savePackage}>
              <div className={styles.fields}>
                <div><label htmlFor="package-code">Package code</label><input id="package-code" value={editedPackage?.activityCode ?? selected.activityCode ?? ''} onChange={e => setEditedPackage({...editedPackage!, activityCode:e.target.value})} maxLength={40}/></div>
                <div><label htmlFor="package-name">Package name</label><input id="package-name" required minLength={3} value={editedPackage?.name ?? selected.name} onChange={e => setEditedPackage({...editedPackage!, name:e.target.value})} maxLength={180}/></div>
                <div><label htmlFor="package-start">Planned start</label><input id="package-start" type="date" value={editedPackage?.start ?? selected.plannedStartDate?.slice(0, 10) ?? ''} onChange={e => setEditedPackage({...editedPackage!, start:e.target.value})}/></div>
                <div><label htmlFor="package-finish">Planned finish</label><input id="package-finish" type="date" min={editedPackage?.start} value={editedPackage?.finish ?? selected.plannedFinishDate?.slice(0, 10) ?? ''} onChange={e => setEditedPackage({...editedPackage!, finish:e.target.value})}/></div>
                <div><label htmlFor="package-duration">Planned duration (days)</label><input id="package-duration" type="number" min="1" required value={editedPackage?.duration ?? selected.plannedDuration} onChange={e => setEditedPackage({...editedPackage!, duration:e.target.value})}/></div>
                <div><label htmlFor="package-weight">Completion weight (%)</label><input id="package-weight" type="number" min="0.0001" max="100" step="any" value={editedPackage?.weight ?? String(selected.plannedWeight * 100)} onChange={e => setEditedPackage({...editedPackage!, weight:e.target.value})}/></div>
              </div>
              {projectStartDate && <p className={styles.muted}>Project start: {projectStartDate.slice(0, 10)}. {editedPackage?.start && editedPackage.finish ? `${duration(editedPackage.start, editedPackage.finish)} calendar days entered.` : 'Dates are planner-entered.'}</p>}
              <div className={styles.actions}><button className={styles.button} disabled={pending}>Save package</button><button type="button" className={styles.secondary} disabled={pending} onClick={async () => { if (!removePackage) { setRemovePackage(true); return; } const result = await request(`/api/projects/${projectId}/scheduling/activities/${selected.id}`, { expectedRowVersion:schedule.rowVersion }, 'DELETE'); if (result) { setSelectedId(''); setView('schedule'); setRemovePackage(false); } }}>{removePackage ? 'Confirm package deletion' : 'Delete draft package'}</button></div>
            </form> : <div className={styles.status}><strong>Locked package</strong><p>{selected.plannedStartDate?.slice(0, 10) || 'Not dated'} – {selected.plannedFinishDate?.slice(0, 10) || 'Not dated'} · completion weight {Number((selected.plannedWeight * 100).toFixed(4))}% · {money(selected.allocatedAmount)}</p><p>Measured progress: {summary?.packages.find(row => row.id === selected.id)?.recordedProgressPercent == null ? 'Not available for this baseline' : `${summary.packages.find(row => row.id === selected.id)?.recordedProgressPercent}%`}. Changes require an approved plan revision.</p></div>}
          </section>
          <WorkPackageDetailsPanel key={`constraints-${selected.id}`} projectId={projectId} scheduleId={schedule.id} rowVersion={schedule.rowVersion} details={{...schedule.details, constraints: schedule.details.constraints.filter(row => !row.activityId || row.activityId === selected.id)}} activities={[selected]} members={members} canEdit={!!canEdit} view="constraints" packageScoped onSaved={refresh}/>
        </section>

        <section className={styles.packagePanel} role="tabpanel" id="package-panel-resources" aria-labelledby="package-tab-resources" hidden={packageTab !== 'resources'}>
          <p className={styles.muted}>Resources and allowances for this package. Open the plan’s Resources & budgets view to review all packages or create plan-wide suggestions.</p>
          <WorkPackageDetailsPanel key={`resources-${selected.id}`} projectId={projectId} scheduleId={schedule.id} rowVersion={schedule.rowVersion} details={{...schedule.details, resources: schedule.details.resources.filter(row => row.activityId === selected.id)}} activities={[selected]} members={members} canEdit={!!canEdit} view="resources" packageScoped onSaved={refresh}/>
          {immutable && <WorkPackageMaterialsPanel projectId={projectId} activityId={selected.id}/>}
          {immutable && <div className={styles.actions}>
            <a className={styles.link} href="#package-materials">Review material requirements</a>
            {capacity.canRecordSiteLogs && <><Link className={styles.link} href={`/projects/${projectId}/work-packages?view=site-logs&activity=${selected.id}#record-work`}>Record physical work</Link><Link className={styles.link} href={`/projects/${projectId}/work-packages?view=site-logs&activity=${selected.id}#record-labor`}>Log labor</Link><Link className={styles.link} href={`/projects/${projectId}/work-packages?view=site-logs&activity=${selected.id}#record-equipment`}>Record equipment use</Link></>}
          </div>}
          {immutable && <WorkPackageExecutionPanel projectId={projectId} view="operations" canPrepare={capacity.canEdit} canWeekly={capacity.canManageWeekly} canRecord={capacity.canRecordSiteLogs} members={members} activityId={selected.id}/>}
        </section>

        <section className={styles.packagePanel} role="tabpanel" id="package-panel-dupa" aria-labelledby="package-tab-dupa" hidden={packageTab !== 'dupa'}>
          <PackageBreakdownPanel key={`breakdown-${selected.id}`} projectId={projectId} scheduleId={schedule.id} activityId={selected.id} packageName={`${selected.activityCode || ''} ${selected.name}`} rowVersion={schedule.rowVersion} uploads={(schedule.details.breakdownUploads || []).filter(upload => upload.activityId === selected.id)} existingResourceCount={schedule.details.resources.filter(resource => resource.activityId === selected.id).length} existingResources={schedule.details.resources.filter(resource => resource.activityId === selected.id)} canEdit={!!canEdit} onSaved={refresh}/>
        </section>
      </section>}
      {view==='scope'&&<section><div className={styles.titleRow}><div><h3>BOQ scope planner</h3><p>Allocate every approved BOQ pay item across work packages. A quantity can be split between packages.</p></div></div>{canEdit&&<form className={styles.panel} onSubmit={async e=>{e.preventDefault();const result=await plan('allocate',{boqItemId:allocation.boqItemId,activityId:allocation.activityId,allocatedQuantity:allocation.quantity,locationId:allocation.locationId||null});if(result)setAllocation({...allocation,quantity:''});}}><div className={styles.fields}><div><label htmlFor="scope-boq">BOQ pay item</label><select id="scope-boq" required value={allocation.boqItemId} onChange={e=>setAllocation({...allocation,boqItemId:e.target.value})}>{boqItems.map(item=><option value={item.id} key={item.id}>{item.itemCode} · {item.description}</option>)}</select></div><div><label htmlFor="scope-package">Work package</label><select id="scope-package" required value={allocation.activityId} onChange={e=>setAllocation({...allocation,activityId:e.target.value})}><option value="">Choose package</option>{schedule.activities.map(activity=><option value={activity.id} key={activity.id}>{activity.activityCode} · {activity.name}</option>)}</select></div><div><label htmlFor="scope-location">Location</label><select id="scope-location" value={allocation.locationId} onChange={e=>setAllocation({...allocation,locationId:e.target.value})}><option value="">Not stated</option>{schedule.details.locations.filter(row=>row.isActive!==false).map(row=><option key={row.id} value={row.id}>{formatLocationPath(schedule.details.locations,row.id)}</option>)}</select></div><div><label htmlFor="scope-quantity">Total quantity for this item in this package</label><input id="scope-quantity" type="number" min="0" step="any" required value={allocation.quantity} onChange={e=>setAllocation({...allocation,quantity:e.target.value})}/></div></div><button className={styles.button} disabled={pending||!schedule.activities.length}>Save allocation</button></form>}
        <div className={styles.scroll} role="region" aria-label="BOQ quantity coverage" tabIndex={0}><table className={styles.table}><thead><tr><th>BOQ item</th><th>Approved quantity</th><th>Planned</th><th>Unplanned</th><th>Standing</th></tr></thead><tbody>{summary?.coverage.map(line=><tr key={line.id}><th scope="row">{line.itemCode}<br/>{line.description}</th><td>{line.approvedQuantity} {line.unit}</td><td>{line.allocatedQuantity}</td><td>{line.remainingQuantity}</td><td>{line.status==='planned'?'Fully planned':line.status==='overallocated'?'Overallocated':'Scope remaining'}</td></tr>)}</tbody></table></div>
        <h3 style={{marginTop:28}}>Package allocations</h3><div className={styles.scroll}><table className={styles.table}><thead><tr><th>BOQ item</th><th>Work package</th><th>Quantity</th><th>Value</th><th>Location</th><th>Action</th></tr></thead><tbody>{schedule.allocations.map(row=><tr key={row.id}><th scope="row">{boqItems.find(item=>item.id===row.awardedBoqItemId)?.itemCode}</th><td>{schedule.activities.find(activity=>activity.id===row.activityId)?.name}</td><td>{row.allocatedQuantity}</td><td>{money(row.allocatedAmount)}</td><td>{canEdit?<select aria-label={`Location for allocation ${row.id}`} disabled={pending} value={schedule.details.allocationLocations[row.id]||''} onChange={e=>request(`/api/projects/${projectId}/work-packages/details`,{scheduleId:schedule.id,expectedRowVersion:schedule.rowVersion,action:'allocation-location',allocationId:row.id,locationId:e.target.value||null})}><option value="">No location</option>{schedule.details.locations.filter(location=>location.isActive!==false).map(location=><option value={location.id} key={location.id}>{location.name}</option>)}</select>:schedule.details.locations.find(location=>location.id===schedule.details.allocationLocations[row.id])?.name||'Not set'}</td><td>{canEdit&&<button className={styles.secondary} disabled={pending} onClick={()=>plan('remove-allocation',{allocationId:row.id})}>Remove allocation</button>}</td></tr>)}</tbody></table></div>
      </section>}
      {view==='sequence'&&<section className={styles.panel} aria-labelledby="package-dates-heading"><h3 id="package-dates-heading">Package dates and weights</h3><p className={styles.muted}>Every package needs a start and finish date, and completion weights must total 100% (now {weightTotal}%). Open a package to change them.</p>
        <div className={styles.scroll} role="region" aria-label="Package dates and weights" tabIndex={0}><table className={styles.table}><thead><tr><th scope="col">Package</th><th scope="col">Start</th><th scope="col">Finish</th><th scope="col">Weight</th><th scope="col">Open</th></tr></thead><tbody>{schedule.activities.map(activity=><tr key={activity.id}><th scope="row">{activity.activityCode?`${activity.activityCode} · `:''}{activity.name}</th><td>{activity.plannedStartDate?.slice(0,10)||<span className={styles.warningText}>Not set</span>}</td><td>{activity.plannedFinishDate?.slice(0,10)||<span className={styles.warningText}>Not set</span>}</td><td>{Number((activity.plannedWeight*100).toFixed(4))}%</td><td><button type="button" className={styles.secondary} onClick={()=>openPackage(activity,'schedule')}>{canEdit?'Edit dates':'View'}</button></td></tr>)}</tbody></table></div>
      </section>}
      {view==='sequence'&&<section className={styles.panel}><h3>Package sequence</h3><p className={styles.muted}>Record package relationships explicitly. These links describe planning intent and do not claim actual progress.</p>{canEdit&&<form onSubmit={e=>{e.preventDefault();void plan('dependency',{predecessorId:sequence.predecessorId,successorId:sequence.successorId,dependencyType:sequence.type,lagDays:Number(sequence.lag)});}}><div className={styles.fields}><div><label htmlFor="sequence-before">Predecessor package</label><select id="sequence-before" required value={sequence.predecessorId} onChange={e=>setSequence({...sequence,predecessorId:e.target.value})}><option value="">Choose package</option>{schedule.activities.map(activity=><option value={activity.id} key={activity.id}>{activity.activityCode} · {activity.name}</option>)}</select></div><div><label htmlFor="sequence-after">Successor package</label><select id="sequence-after" required value={sequence.successorId} onChange={e=>setSequence({...sequence,successorId:e.target.value})}><option value="">Choose package</option>{schedule.activities.map(activity=><option value={activity.id} key={activity.id}>{activity.activityCode} · {activity.name}</option>)}</select></div><div><label htmlFor="sequence-type">Relationship</label><select id="sequence-type" value={sequence.type} onChange={e=>setSequence({...sequence,type:e.target.value})}><option value="FS">Finish to start</option><option value="SS">Start to start</option><option value="FF">Finish to finish</option><option value="SF">Start to finish</option></select></div><div><label htmlFor="sequence-lag">Lag days</label><input id="sequence-lag" type="number" min="0" value={sequence.lag} onChange={e=>setSequence({...sequence,lag:e.target.value})}/></div></div><button className={styles.button} disabled={pending}>Add sequence link</button></form>}<ul>{schedule.dependencies.map(row=><li key={row.id} className={styles.muted}>{schedule.activities.find(activity=>activity.id===row.predecessorId)?.name} → {schedule.activities.find(activity=>activity.id===row.successorId)?.name} · {row.type} +{row.lagDays} days {canEdit&&<button className={styles.secondary} disabled={pending} onClick={()=>plan('dependency',{remove:true,dependencyId:row.id})}>Remove link</button>}</li>)}</ul></section>}
      {view==='locations'&&<>
        <p className={styles.muted}>Say where each package’s work happens, and record anything that could hold it up, with an owner and a needed-by date.</p>
        <WorkPackageLocationsPanel projectId={projectId} canEdit={capacity.canEdit} onSaved={refresh}/>
        {canEdit&&(()=>{
          // Bulk location: assigning a location line by line was the only option (326 lines for the PGH BOQ).
          const unlocated=schedule.allocations.filter(row=>!schedule.details.allocationLocations[row.id]).length;
          const active=schedule.details.locations.filter(row=>row.isActive!==false);
          if(!unlocated)return null;
          return <div className={styles.panel}><h3>Assign a location to all unlocated scope</h3><p className={styles.muted}>{unlocated} of {schedule.allocations.length} BOQ scope lines have no location. For a single-site project, assign one location to all of them; lines that already have a location keep it, and you can still change any line in the Scope planner.</p>{active.length?<div className={styles.actions}><select aria-label="Location for unlocated scope" value={bulkLocation||active[0].id} onChange={event=>setBulkLocation(event.target.value)}>{active.map(row=><option key={row.id} value={row.id}>{row.code?`${row.code} · `:''}{row.name}</option>)}</select><button className={styles.button} disabled={pending} onClick={()=>void plan('locate-unlocated',{locationId:bulkLocation||active[0].id})}>Assign to {unlocated} lines</button></div>:<p className={styles.muted}>Add a project location above first.</p>}</div>;
        })()}
        <WorkPackageDetailsPanel projectId={projectId} scheduleId={schedule.id} rowVersion={schedule.rowVersion} details={schedule.details} activities={schedule.activities} members={members} canEdit={!!canEdit} view="constraints" onSaved={refresh}/>
      </>}
      {view==='resources'&&<>
        <DupaGuide schedule={schedule} onOpenPackage={id=>openById(id,'dupa')}/>
        <WorkPackageDetailsPanel projectId={projectId} scheduleId={schedule.id} rowVersion={schedule.rowVersion} details={schedule.details} activities={schedule.activities} members={members} canEdit={!!canEdit} view="resources" onSaved={refresh}/>
      </>}
      {view==='review'&&<section id="plan-review" className={styles.panel}><h3>Engineer review → PM approval</h3>{readiness&&<ul className={styles.muted}>{readiness.checks.map(check=><li key={check.key}>{check.passed?'Passed':'Action required'}: {check.label}{!check.passed&&check.detail?` · ${check.detail}`:''}</li>)}</ul>}<p className={styles.muted}>The engineering review covers the exact package scope, dates, weights, sequence, constraints and resource assumptions. Any edit requires a fresh review before approval.</p><div className={styles.status}><strong>{immutable?'Approved, locked baseline':schedule.review?.current?'Engineering review is current':schedule.review?'Plan changed — engineering review is stale':'Engineering review required'}</strong>{schedule.review&&<p>{schedule.review.reviewerName} · {new Date(schedule.review.decidedAt).toLocaleString('en-PH')}<br/>{schedule.review.comments}</p>}{schedule.activatedAt&&<p>Baseline approved {new Date(schedule.activatedAt).toLocaleString('en-PH')} · {schedule.baselineCode}</p>}</div>
        {!immutable&&<><ul className={styles.muted}><li>{schedule.activities.length} packages · {summary?.datedCount||0} fully dated</li><li>{summary?.coverage.filter(row=>row.status!=='planned').length||0} BOQ items still need scope review</li><li>Completion weights total {weightTotal}%</li><li>{schedule.details.constraints.filter(row=>row.blocking&&row.status==='OPEN').length} open constraints (owner and needed-by required)</li></ul>{capacity.canEngineerReview&&<><label htmlFor="plan-review-comments">Engineering review comments</label><textarea id="plan-review-comments" rows={4} maxLength={500} value={reviewComments} onChange={e=>setReviewComments(e.target.value)}/><button className={styles.secondary} disabled={pending||reviewComments.trim().length<5||!readiness?.ready} onClick={async()=>{const result=await review('review',{comments:reviewComments});if(result)setReviewComments('');}}>Record engineering review</button></>}{capacity.canApprove&&<div><label htmlFor='pm-approval-reason'>PM approval reason (5–300 characters)</label><textarea id='pm-approval-reason' value={approvalReason} maxLength={300} onChange={e=>setApprovalReason(e.target.value)}/><div className={styles.actions} style={{marginTop:20}}><button className={styles.button} disabled={pending||!schedule.review?.current||!readiness?.ready||approvalReason.trim().length<5} onClick={async()=>{if(!approvalConfirm){setApprovalConfirm(true);return;}const result=await review('approve',{reason:approvalReason});if(result){setApprovalConfirm(false);router.push(`/projects/${projectId}/work-packages`);setView('schedule');}}}>{approvalConfirm?'Confirm PM approval & lock':'Approve work-package baseline'}</button>{approvalConfirm&&<button className={styles.secondary} onClick={()=>setApprovalConfirm(false)}>Cancel approval</button>}</div></div>}</>}
        {immutable&&(capacity.canEdit||capacity.canApprove)&&schedule.workflowStatus==='ACTIVE_BASELINE'&&!hasOpenDraft&&<><label htmlFor="revision-reason">Reason for plan revision</label><textarea id="revision-reason" rows={3} minLength={5} maxLength={500} value={revisionReason} onChange={e=>setRevisionReason(e.target.value)}/><button className={styles.button} disabled={pending||revisionReason.trim().length<5} onClick={async()=>{const result=await review('start-revision',{reason:revisionReason});if(result){setRevisionReason('');router.push(`/projects/${projectId}/work-packages`);setView('schedule');}}}>Start plan revision</button></>}
        {!immutable&&schedule.previousBaselineId&&<><h3 style={{marginTop:28}}>Revision impact</h3><p className={styles.muted}>Compare the draft with the previous approved baseline. The baseline remains active during this review.</p>{revisionComparison.length?<div className={styles.scroll}><table className={styles.table}><thead><tr><th>Package / scope</th><th>Approved baseline</th><th>Revision draft</th></tr></thead><tbody>{revisionComparison.map((row,index)=><tr key={index}><th scope="row">{row.name}</th><td>{row.before}</td><td>{row.after}</td></tr>)}</tbody></table></div>:<p className={styles.muted}>No package or allocation changes recorded yet.</p>}<button className={styles.secondary} disabled={pending} onClick={async()=>{if(!cancelRevision){setCancelRevision(true);return;}const result=await review('cancel-revision',{reason:revisionReason||'Revision cancelled by preparer.'});if(result){setCancelRevision(false);setView('schedule');}}}>{cancelRevision?'Confirm cancellation':'Cancel revision'}</button></>}
      </section>}
    </>}
  </>;
}
