import { prisma } from '../lib/prisma';
// @ts-nocheck
import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { CognitoIdentityProviderClient, InitiateAuthCommand } from "@aws-sdk/client-cognito-identity-provider";

const router = Router();

router.post('/login', async (req, res) => {
  const { email, password } = req.body; // Extract arguments from req.body

  if (!email || !password) {
    return res.status(400).json({ success: false, error: 'Email and password are required' });
  }

  try {
    if (process.env.COGNITO_CLIENT_ID) {
      const client = new CognitoIdentityProviderClient({ region: process.env.AWS_REGION || 'us-east-1' });
      
      // Authenticate with Amazon Cognito
      const command = new InitiateAuthCommand({
        AuthFlow: "USER_PASSWORD_AUTH",
        ClientId: process.env.COGNITO_CLIENT_ID,
        AuthParameters: {
          USERNAME: email,
          PASSWORD: password,
        },
      });

      await client.send(command);
    } else {
      console.log('Bypassing Cognito authentication for local development (no COGNITO_CLIENT_ID set)');
    }

    // Authentication successful in Cognito, now get internal user mapping
    const user = await prisma.user.findUnique({
      where: { email }
    });

    if (!user) {
      return res.status(404).json({ success: false, error: 'User authenticated in AWS but not found in ERP system' });
    }

    // Return necessary user info for Next.js to handle session cookie and redirection
    res.json({ success: true, user: { id: user.id, role: user.role } });

  } catch (error: any) {
    console.error("Auth Error (AWS Backend):", error);
    // Handle Cognito specific errors
    if (error.name === 'NotAuthorizedException' || error.name === 'UserNotFoundException') {
        return res.status(401).json({ success: false, error: 'Invalid email or password' });
    }
    return res.status(500).json({ success: false, error: 'Authentication error: ' + (error.message || 'Unknown error') });
  }
});

router.post('/logout', async (req, res) => {
  // In the original file, logout only dealt with client-side cookies and redirects.
  // There's no Prisma or Cognito specific backend logic needed here for this simple flow.
  // We'll return a success status to acknowledge the call.
  try {
    res.json({ success: true, message: 'Logout request received by backend' });
  } catch (error: any) {
    console.error("Logout Error (AWS Backend):", error);
    res.status(500).json({ success: false, error: 'Backend logout error: ' + (error.message || 'Unknown error') });
  }
});

export default router;
