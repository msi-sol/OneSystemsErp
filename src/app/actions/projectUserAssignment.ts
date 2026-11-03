'use server';

import { revalidatePath } from 'next/cache';

import { verifyOperationalSession } from '@/lib/dal/auth';

import { assignExistingUserToProject, updateProjectUserAssignmentRole } from '@/lib/services/ProjectUserAssignmentService';

import { prisma } from '@/lib/prisma';

export async function addProjectAssignment(data: {

  userId: string;

  projectId: string;

  projectRole: string;

  accessLevel: string;

  remarks?: string;

}) {

  try {

    const actor = await verifyOperationalSession();

    if (!actor) {

      return { success: false, error: 'UNAUTHORIZED: No valid session' };

    }

    const assignment = await assignExistingUserToProject({

      projectId: data.projectId,

      userId: data.userId,

      assignmentRoleOrPermission: data.projectRole,

      accessLevel: data.accessLevel,

      actorContext: {

        userId: actor.userId,

        role: actor.role,

      }

    });

    revalidatePath('/users/[id]', 'page');

    revalidatePath('/projects/[id]', 'page');

    return { success: true, data: assignment };

  } catch (error: any) {

    console.error('Error adding project assignment:', error.message);

    return { success: false, error: error.message };

  }

}

export async function updateProjectAssignment(assignmentId: string, data: {

  projectRole?: string;

  accessLevel?: string;

  assignmentStatus?: string;

}) {

  try {

    const actor = await verifyOperationalSession();

    if (!actor || actor.role !== 'SUPER_ADMIN') {

      return { success: false, error: 'UNAUTHORIZED' };

    }

    const result = await prisma.projectUserAssignment.update({

      where: { id: assignmentId },

      data

    });

    revalidatePath('/users/[id]', 'page');

    revalidatePath('/projects/[id]', 'page');

    return { success: true, data: result };

  } catch (error: any) {

    console.error('Error updating project assignment:', error.message);

    return { success: false, error: error.message };

  }

}

export async function deleteProjectAssignment(assignmentId: string) {

  try {

    const actor = await verifyOperationalSession();

    if (!actor || actor.role !== 'SUPER_ADMIN') {

      return { success: false, error: 'UNAUTHORIZED' };

    }

    const result = await prisma.projectUserAssignment.delete({

      where: { id: assignmentId }

    });

    revalidatePath('/users/[id]', 'page');

    revalidatePath('/projects/[id]', 'page');

    return { success: true, data: result };

  } catch (error: any) {

    console.error('Error deleting project assignment:', error.message);

    return { success: false, error: error.message };

  }

}

export async function updateProjectUserRoleAction(data: {

  assignmentId: string;

  expectedCurrentProjectRole: string;

  newProjectRole: string;

  reason: string;

}) {

  try {

    const actor = await verifyOperationalSession();

    if (!actor) {

      return { success: false, error: 'UNAUTHORIZED: No valid session' };

    }

    const assignment = await updateProjectUserAssignmentRole({

      ...data,

      actorContext: {

        userId: actor.userId,

        role: actor.role,

      }

    });

    revalidatePath('/users/[id]', 'page');

    revalidatePath('/projects/[id]', 'page');

    return { success: true, data: assignment };

  } catch (error: any) {

    console.error('Error updating project role:', error.message);

    return { success: false, error: error.message };

  }

}
