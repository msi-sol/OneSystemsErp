import NextAuth from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { authConfig } from './auth.config';

// Module augmentation to add custom fields to NextAuth Session
declare module 'next-auth' {
  interface User {
    id: string;
    role: string;
    sessionVersion: number;
    mustChangePassword: boolean;
  }
  interface Session {
    user: {
      id: string;
      role: string;
      sessionVersion: number;
      mustChangePassword: boolean;
    };
  }
}

// Module augmentation for JWT
declare module '@auth/core/jwt' {
  interface JWT {
    id: string;
    role: string;
    sessionVersion: number;
    mustChangePassword: boolean;
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  session: { strategy: 'jwt' },
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'text' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        const email = (credentials.email as string).trim();
        const password = credentials.password as string;

        const user = await prisma.user.findFirst({
          // MySQL applies the configured case-insensitive collation to email.
          where: { email: { equals: email } },
        });

        console.log("LOGIN ATTEMPT:", email, "Found user:", !!user);

        if (!user) {
          return null;
        }

        if (user.status !== 'ACTIVE') {
          console.log("LOGIN FAILED: NOT ACTIVE");
          return null;
        }

        if (user.lockedUntil && user.lockedUntil > new Date()) {
          console.log("LOGIN FAILED: LOCKED");
          return null;
        }

        const isValid = await bcrypt.compare(password, user.passwordHash || '');
        console.log("LOGIN FAILED? Password valid:", isValid);
        if (!isValid) {
          // Increment failed login attempts
          await prisma.user.update({
            where: { id: user.id },
            data: { failedLoginAttempts: { increment: 1 } },
          });
          return null;
        }

        // On success, reset failed login attempts
        if ((user.failedLoginAttempts || 0) > 0) {
          await prisma.user.update({
            where: { id: user.id },
            data: { failedLoginAttempts: 0 },
          });
        }

        // Return minimal safe object
        return {
          id: user.id,
          role: user.role,
          sessionVersion: user.sessionVersion || 0,
          mustChangePassword: user.mustChangePassword || false,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.sessionVersion = user.sessionVersion;
        token.mustChangePassword = user.mustChangePassword;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as string;
        session.user.sessionVersion = token.sessionVersion as number;
        session.user.mustChangePassword = token.mustChangePassword as boolean;
      }
      return session;
    },
  },
});
