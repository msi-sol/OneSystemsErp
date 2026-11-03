'use server';

import { signIn, signOut } from '@/auth';
import { AuthError } from 'next-auth';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';

export async function login(formData: FormData) {
  const email = formData.get('email') as string;
  const password = formData.get('password') as string;

  if (!email || !password) {
    return { error: 'Email and password are required' };
  }

  try {
    const user = await prisma.user.findFirst({
      // MySQL applies the configured case-insensitive collation to email.
      where: { email: { equals: email } },
      select: { role: true },
    });

    await signIn('credentials', {
      email,
      password,
      redirect: false,
    });

    const role = user?.role;
    let redirectPath = role === 'DIRECTORS' ? '/executive/home' : '/';
    return { redirect: redirectPath };

  } catch (error: any) {
    if (error instanceof AuthError) {
      switch (error.type) {
        case 'CredentialsSignin':
          return { error: 'Invalid email or password' };
        default:
          return { error: 'Authentication error: Unknown error' };
      }
    }
    throw error;
  }
}

export async function logout() {
  const cookieStore = await cookies();
  cookieStore.delete('session'); // Clear legacy session cookie if it exists
  cookieStore.delete('simulatedRole');
  await signOut({ redirectTo: '/login' });
}
