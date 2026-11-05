import { AsyncLocalStorage } from 'async_hooks';
import { prismaBase } from './prisma-base';

const globalForPrisma = globalThis as unknown as {
  prisma: ReturnType<typeof createPrismaClient> | undefined;
  prismaTransactionContext: AsyncLocalStorage<{ sourceProvenance?: string }> | undefined;
};
export const transactionContext = globalForPrisma.prismaTransactionContext ?? new AsyncLocalStorage<{ sourceProvenance?: string }>();
if (process.env.NODE_ENV !== 'production') globalForPrisma.prismaTransactionContext = transactionContext;

function createPrismaClient() {
  return prismaBase.$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          const targetModels = [
            'ProjectSchedule',
            'ScheduleWBS',
            'ScheduleActivity',
            'ScheduleDependency',
            'ScheduleBOQAllocation',
            'ScheduleReviewComment',
            'ScheduleApproval',
            'BaselineActivation',
            'ScheduleWorkflowTransition'
          ];
          const writeOps = ['create', 'createMany', 'update', 'updateMany', 'delete', 'deleteMany', 'upsert'];

          if (model && targetModels.includes(model as string) && writeOps.includes(operation)) {
            const ctx = transactionContext.getStore();
            if (ctx?.sourceProvenance !== 'GATE9_WORKFLOW_ENGINE') {
              throw new Error('GATE9D_DIRECT_MUTATION_REJECTED');
            }
          }
          return query(args);
        },
      },
    },
  });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
