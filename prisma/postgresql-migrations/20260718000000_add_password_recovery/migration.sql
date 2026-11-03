-- CreateTable
CREATE TABLE "PasswordRecoveryToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "purpose" TEXT NOT NULL DEFAULT 'PASSWORD_RESET',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "requestedIpHash" TEXT,
    "requestedUserAgentHash" TEXT,

    CONSTRAINT "PasswordRecoveryToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PasswordRecoveryRateLimit" (
    "id" TEXT NOT NULL,
    "identifierHash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 1,
    "lastAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "blockedUntil" TIMESTAMP(3),

    CONSTRAINT "PasswordRecoveryRateLimit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PasswordRecoveryToken_tokenHash_key" ON "PasswordRecoveryToken"("tokenHash");

-- CreateIndex
CREATE INDEX "PasswordRecoveryToken_userId_idx" ON "PasswordRecoveryToken"("userId");

-- CreateIndex
CREATE INDEX "PasswordRecoveryToken_purpose_expiresAt_idx" ON "PasswordRecoveryToken"("purpose", "expiresAt");

-- CreateIndex
CREATE INDEX "PasswordRecoveryToken_tokenHash_consumedAt_revokedAt_idx" ON "PasswordRecoveryToken"("tokenHash", "consumedAt", "revokedAt");

-- CreateIndex
CREATE INDEX "PasswordRecoveryRateLimit_identifierHash_idx" ON "PasswordRecoveryRateLimit"("identifierHash");

-- AddForeignKey
ALTER TABLE "PasswordRecoveryToken" ADD CONSTRAINT "PasswordRecoveryToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
