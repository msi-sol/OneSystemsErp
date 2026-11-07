import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { generateObject } from 'ai';
import { openAIModel } from '@/lib/ai/openai-model';
import { z } from 'zod';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: projectId } = await params;
    const body = await req.json();
    const { name, description, calendarDays, workDaysConfig, importBoq, consolidateBoq } = body;

    // Check if project exists
    const project = await prisma.project.findUnique({
      where: { id: projectId }
    });

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    // Check if schedule already exists
    const existingSchedule = await prisma.projectSchedule.findFirst({
      where: { projectId }
    });

    if (existingSchedule) {
      return NextResponse.json({ error: 'Schedule already exists for this project' }, { status: 400 });
    }

    // Create Schedule
    const newSchedule = await prisma.projectSchedule.create({
      data: {
        projectId,
        name,
        description,
        calendarDays,
        workDaysConfig,
        status: 'DRAFT'
      }
    });

    // If importBoq is true, generate WBS and Activities from BOQ
    if (importBoq) {
      let awardedBoqItems = await prisma.awardedBOQItem.findMany({
        where: { projectId },
        orderBy: { itemCode: 'asc' }
      });

      // Fallback to Procurement Benchmark if Awarded BOQ is empty
      if (awardedBoqItems.length === 0) {
        const benchmarkItems = await prisma.procurementBenchmarkItem.findMany({
          where: { projectId },
          orderBy: { itemCode: 'asc' }
        });
        
        // Map to the shape expected below
        awardedBoqItems = benchmarkItems.map(b => ({
          ...b,
          directCost: 0,
          indirectCost: 0,
          combinedUnitCost: b.unitCost
        })) as any;
      }

      if (awardedBoqItems.length > 0) {
        // Create Construction Phase root WBS
        const constructionWbs = await prisma.scheduleWBS.create({
          data: {
            scheduleId: newSchedule.id,
            code: 'CONST',
            name: 'Construction Phase',
            level: 1,
            orderIndex: 1
          }
        });

        if (consolidateBoq) {
          // AI SCHEDULE SIMULATION LOGIC
          
          // ── Extract project contractual boundaries ──
          let projectStartDate = new Date();
          let projectEndDate: Date;
          if (project.startDate) {
            projectStartDate = new Date(project.startDate);
          }
          if (project.originalCompletionDate) {
            projectEndDate = new Date(project.originalCompletionDate);
          } else if (project.endDate) {
            projectEndDate = new Date(project.endDate);
          } else {
            projectEndDate = new Date(projectStartDate);
            projectEndDate.setDate(projectEndDate.getDate() + (calendarDays || 180));
          }
          const totalProjectDays = Math.max(1, Math.ceil(Math.abs(projectEndDate.getTime() - projectStartDate.getTime()) / (1000 * 60 * 60 * 24)));

          // First, perform in-memory consolidation to reduce payload size to AI
          const groups = new Map<string, any>();
          for (const item of awardedBoqItems) {
            let oldItemCode = item.itemCode || 'N/A';
            if (oldItemCode === 'N/A' || oldItemCode.trim() === '') {
              oldItemCode = item.description.trim();
            }
            const normalizedDesc = item.description.trim().toLowerCase();
            const normalizedUnit = (item.unit || '').trim().toLowerCase();
            const key = `${oldItemCode.toLowerCase()}||${normalizedDesc}||${normalizedUnit}`;
            
            if (!groups.has(key)) {
              groups.set(key, {
                itemCode: oldItemCode,
                description: item.description,
                unit: item.unit || 'lot',
                quantity: 0,
                items: []
              });
            }
            const group = groups.get(key);
            group.quantity += (item.quantity || 1);
            group.items.push(item);
          }
          const consolidatedItems = Array.from(groups.values());

          // Build simplified payload for AI
          const payload = consolidatedItems.map((g, index) => ({
            id: `ITEM_${index}`,
            code: g.itemCode,
            description: g.description,
            quantity: g.quantity,
            unit: g.unit
          }));

          const prompt = `You are an expert construction project manager. 
We are building a project schedule for a construction project.
CONTRACT START DATE: ${projectStartDate.toISOString().split('T')[0]}
CONTRACT END DATE: ${projectEndDate.toISOString().split('T')[0]}
TOTAL PROJECT DURATION: ${totalProjectDays} calendar days.

CRITICAL CONSTRAINT: The total of ALL activity durations, when arranged within their phases, MUST fit within ${totalProjectDays} calendar days total. No individual activity duration should exceed 30% of the total project duration. Activities within each phase will run in PARALLEL (overlapping), not sequentially.

I have a pre-consolidated list of BOQ (Bill of Quantities) items. 
DO NOT CONSOLIDATE THEM FURTHER. Each item in this list MUST become exactly one distinct Schedule Activity.
Please do the following:
1. Define 3 to 6 logical construction sub-phases (e.g. Mobilization, Execution, Testing). Provide a unique 'code' for each sub-phase and a 'pct' (percentage of total project duration, must sum to 1.0). These will be nested under a master 'Construction Phase'.
2. For EACH item in the provided BOQ list, assign it to the most appropriate sub-phase (wbsCode) and estimate a realistic 'durationDays' (must not exceed ${Math.round(totalProjectDays * 0.3)} days). You MUST return an activity for every single item provided, using its exact 'id'.
3. Identify logical sequence dependencies between these items based on their descriptions. Use the item 'id' to link predecessor and successor.

BOQ Items:
${JSON.stringify(payload, null, 2)}`;

          const schema = z.object({
            phases: z.array(z.object({
              code: z.string().describe("Unique phase code e.g. WBS-1"),
              name: z.string().describe("Phase name"),
              pct: z.number().describe("Percentage of total project duration (0.0 to 1.0)"),
              orderIndex: z.number().describe("Index order of the phase (e.g. 1, 2, 3)")
            })).describe("Logical construction phases"),
            activities: z.array(z.object({
              id: z.string().describe("The exact id of the BOQ item e.g. ITEM_0"),
              wbsCode: z.string().describe("The phase code this activity belongs to"),
              durationDays: z.number().describe("Estimated duration in days")
            })).describe("The assigned phases and durations for each BOQ item"),
            dependencies: z.array(z.object({
              predecessorCode: z.string().describe("The id of the predecessor activity e.g. ITEM_0"),
              successorCode: z.string().describe("The id of the successor activity e.g. ITEM_1"),
              type: z.string().describe("Dependency type: FS, SS, FF, or SF. Default is FS.")
            })).describe("Logical dependencies between activities")
          });

          let result;
          try {
            const { object } = await generateObject({
              model: openAIModel(), // app-wide OpenAI model (gpt-6-luna by default)
              schema: schema,
              prompt: prompt,
            });
            result = object;
          } catch (aiError: any) {
            console.error("OpenAI schedule generation failed", aiError);
            throw new Error('Failed to generate schedule: ' + aiError.message);
          }

          const phases = result.phases || [];
          const activities = result.activities || [];
          const dependencies = result.dependencies || [];

          // 1. Create WBS Nodes
          const wbsMap = new Map();
          const wbsNodesToInsert = [];
          for (let i = 0; i < phases.length; i++) {
            const p = phases[i];
            const wbsId = crypto.randomUUID();
            wbsNodesToInsert.push({
              id: wbsId,
              scheduleId: newSchedule.id,
              parentId: constructionWbs.id,
              code: p.code,
              name: p.name,
              level: 2,
              orderIndex: p.orderIndex || i
            });
            wbsMap.set(p.code, wbsId);
          }

          if (wbsNodesToInsert.length > 0) {
            await prisma.scheduleWBS.createMany({ data: wbsNodesToInsert });
          }

          // Fallback WBS if mapping fails
          let fallbackWbsId = null;
          if (activities.length > 0 && !wbsMap.size) {
             fallbackWbsId = crypto.randomUUID();
             await prisma.scheduleWBS.create({
                data: { id: fallbackWbsId, scheduleId: newSchedule.id, parentId: constructionWbs.id, code: 'GEN', name: 'General', level: 2, orderIndex: 0 }
             });
          }

          // ── Phase-aware date distribution ──
          // Normalize AI phase percentages and compute phase date boundaries
          let totalPct = phases.reduce((sum: number, p: any) => sum + (p.pct || 0), 0);
          if (totalPct === 0) {
            phases.forEach((p: any) => p.pct = 1 / phases.length);
            totalPct = 1;
          }

          // Compute phase date windows within the project boundary
          const phaseWindows = new Map<string, { start: Date; end: Date; days: number }>();
          let phaseCursor = new Date(projectStartDate);
          let daysAllocated = 0;
          for (let i = 0; i < phases.length; i++) {
            const p = phases[i];
            let phaseDays: number;
            if (i === phases.length - 1) {
              phaseDays = totalProjectDays - daysAllocated;
            } else {
              const normalizedPct = (p.pct || 0) / totalPct;
              phaseDays = Math.max(1, Math.round(totalProjectDays * normalizedPct));
              daysAllocated += phaseDays;
            }
            const phaseStart = new Date(phaseCursor);
            const phaseEnd = new Date(phaseStart);
            phaseEnd.setDate(phaseEnd.getDate() + phaseDays - 1);
            // Clamp to project end
            if (phaseEnd > projectEndDate) phaseEnd.setTime(projectEndDate.getTime());
            phaseWindows.set(p.code, { start: phaseStart, end: phaseEnd, days: phaseDays });
            phaseCursor = new Date(phaseEnd);
            phaseCursor.setDate(phaseCursor.getDate() + 1);
          }

          // 2. Prepare Activities and Mappings — distribute within phase windows
          const activityMap = new Map();
          const activitiesToInsert: any[] = [];
          const mappingsToInsert: any[] = [];

          // Group AI activities by their phase code
          const actsByPhase = new Map<string, any[]>();
          for (const act of activities) {
            const phaseCode = act.wbsCode || phases[0]?.code || 'GEN';
            if (!actsByPhase.has(phaseCode)) actsByPhase.set(phaseCode, []);
            actsByPhase.get(phaseCode)!.push(act);
          }

          for (const [phaseCode, phaseActs] of actsByPhase) {
            // Fuzzy-match the phase code to a known WBS
            let wbsId = wbsMap.get(phaseCode);
            if (!wbsId) {
              const normalizedWbsCode = phaseCode.toLowerCase().replace(/[^a-z0-9]/g, '');
              const matchedPhase = phases.find((p: any) =>
                p.code.toLowerCase().replace(/[^a-z0-9]/g, '') === normalizedWbsCode ||
                p.name.toLowerCase().replace(/[^a-z0-9]/g, '').includes(normalizedWbsCode) ||
                normalizedWbsCode.includes(p.code.toLowerCase().replace(/[^a-z0-9]/g, ''))
              );
              if (matchedPhase) wbsId = wbsMap.get(matchedPhase.code);
            }
            wbsId = wbsId || Array.from(wbsMap.values())[0] || fallbackWbsId;
            if (!wbsId) continue;

            const window = phaseWindows.get(phaseCode) || phaseWindows.values().next().value;
            if (!window) continue;
            const phaseDays = window.days;
            const numActs = phaseActs.length;
            const staggerDays = numActs > 1 ? phaseDays / numActs : 0;

            for (let i = 0; i < numActs; i++) {
              const act = phaseActs[i];
              let duration = parseInt(act.durationDays);
              if (isNaN(duration) || duration < 1) duration = 1;
              // Cap duration: cannot exceed the phase window
              duration = Math.min(duration, phaseDays);

              const lagFromStart = Math.floor(i * staggerDays);
              const actStart = new Date(window.start);
              actStart.setDate(actStart.getDate() + lagFromStart);

              let actFinish = new Date(actStart);
              actFinish.setDate(actFinish.getDate() + duration - 1);
              // Clamp finish to phase end and project end
              if (actFinish > window.end) actFinish = new Date(window.end);
              if (actFinish > projectEndDate) actFinish = new Date(projectEndDate);

              // Find the consolidated group
              const groupIndex = parseInt(act.id.replace('ITEM_', ''));
              const group = consolidatedItems[groupIndex];
              if (!group) continue;

              const newActId = crypto.randomUUID();
              activitiesToInsert.push({
                id: newActId,
                scheduleId: newSchedule.id,
                wbsId: wbsId,
                activityCode: group.itemCode,
                name: group.description,
                plannedStartDate: actStart,
                plannedFinishDate: actFinish,
                plannedDuration: duration,
                plannedQuantity: group.quantity,
                unit: group.unit,
                status: 'NOT_STARTED'
              });
              activityMap.set(act.id, newActId);

              // Directly map the exact raw BOQ items from this group
              for (const item of group.items) {
                mappingsToInsert.push({
                  activityId: newActId,
                  awardedBoqItemId: item.id,
                  allocatedQuantity: item.quantity
                });
              }
            }
          }

          if (activitiesToInsert.length > 0) {
            await prisma.scheduleActivity.createMany({ data: activitiesToInsert });
          }
          if (mappingsToInsert.length > 0) {
            await prisma.scheduleBOQAllocation.createMany({ data: mappingsToInsert });
          }

          // 3. Create Dependencies — use SS (Start-to-Start) within each phase for overlap
          const depsToInsert: any[] = [];
          for (const [phaseCode, phaseActs] of actsByPhase) {
            for (let i = 1; i < phaseActs.length; i++) {
              const predId = activityMap.get(phaseActs[i - 1].id);
              const succId = activityMap.get(phaseActs[i].id);
              if (predId && succId && predId !== succId) {
                const window = phaseWindows.get(phaseCode);
                const staggerDays = window ? Math.max(1, Math.floor(window.days / phaseActs.length)) : 1;
                depsToInsert.push({
                  scheduleId: newSchedule.id,
                  predecessorId: predId,
                  successorId: succId,
                  type: 'SS',
                  lagDays: staggerDays
                });
              }
            }
          }
          if (depsToInsert.length > 0) {
            await prisma.scheduleDependency.createMany({ data: depsToInsert });
          }

        } else {
          // No AI consolidation, map 1-to-1 under Construction Phase WBS
          const actsToInsert = [];
          const mapsToInsert = [];

          for (const item of awardedBoqItems) {
            const actId = crypto.randomUUID();
            actsToInsert.push({
              id: actId,
              scheduleId: newSchedule.id,
              wbsId: constructionWbs.id,
              activityCode: item.itemCode,
              name: item.description || `BOQ Item ${item.itemCode}`,
              plannedQuantity: item.quantity,
              unit: item.unit,
              status: 'NOT_STARTED'
            });

            mapsToInsert.push({
              activityId: actId,
              awardedBoqItemId: item.id,
              allocatedQuantity: item.quantity
            });
          }

          if (actsToInsert.length > 0) {
            await prisma.scheduleActivity.createMany({ data: actsToInsert });
          }
          if (mapsToInsert.length > 0) {
            await prisma.scheduleBOQAllocation.createMany({ data: mapsToInsert });
          }
        }
      }
    }

    const fullSchedule = await prisma.projectSchedule.findUnique({
      where: { id: newSchedule.id },
      include: {
        wbsNodes: true,
        activities: { include: { boqAllocations: true } }
      }
    });

    return NextResponse.json({ success: true, schedule: fullSchedule });
  } catch (error: any) {
    console.error('Error initializing schedule:', error);

    // Rollback: If we fail anywhere after creating the schedule but before returning, delete it so the user isn't stuck.
    try {
      const { id: projectId } = await params;
      const stuckSchedule = await prisma.projectSchedule.findFirst({ where: { projectId, status: 'DRAFT' }, include: { activities: true } });
      if (stuckSchedule && stuckSchedule.activities.length === 0) {
        await prisma.projectSchedule.delete({ where: { id: stuckSchedule.id } });
      }
    } catch (cleanupError) {
      console.error('Failed to rollback schedule on error:', cleanupError);
    }
    
    // Translate AI provider errors (schedule generation runs on OpenAI) into user-facing messages.
    let errorMessage = error.message || 'Internal Server Error';
    if (errorMessage.includes('429') || /quota/i.test(errorMessage)) {
      errorMessage = 'The OpenAI API quota or rate limit was reached. Please wait about a minute before generating the schedule again, or ask your administrator to check API billing.';
    } else if (errorMessage.includes('503') || errorMessage.includes('overloaded')) {
      errorMessage = 'The OpenAI API is currently overloaded. Please try again in a few moments.';
    } else if (typeof errorMessage === 'string' && errorMessage.startsWith('{')) {
      try {
        const parsed = JSON.parse(errorMessage);
        if (parsed?.error?.message) {
          errorMessage = parsed.error.message;
        }
      } catch (e) {}
    }

    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
