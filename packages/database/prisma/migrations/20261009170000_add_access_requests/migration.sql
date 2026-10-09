-- Additive: table for public access requests. No account is created.

CREATE TABLE "access_requests" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "dealership" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "message" TEXT NOT NULL,
    "consentAt" TIMESTAMP(3) NOT NULL,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "access_requests_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "access_requests_createdAt_idx" ON "access_requests"("createdAt");
CREATE INDEX "access_requests_email_idx" ON "access_requests"("email");
