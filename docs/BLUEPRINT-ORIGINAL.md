# 🎙️ Synthetix Engine: Complete Engineering & Architecture Blueprint

> An enterprise-grade, browser-based media production, AI transcription, and live streaming studio designed to run on **\$0/month free-tier cloud infrastructure** powered natively by **Neon (Database & Object Storage)**.

## 🏗️ System Architecture Overview

```
graph TD
    Client[Next.js 14 App Router on Vercel Free] -->|Auth Sessions| BetterAuth[Better Auth Engine]
    Client -->|WebRTC Tracks| SFU[LiveKit Cloud Free Tier]
    Client -->|Audio Processing| Worklet[Web Audio API / AudioWorklet - $0 Compute]
    Client -->|PCM Audio Chunks| Groq[Groq API - Free Whisper STT]
    Client -->|Direct S3 Presigned Uploads| NeonStore[Neon Object Storage - S3 Compatible]
    
    Groq -->|Live Transcripts| Client
    BetterAuth -->|Store Users/Sessions| NeonDB[(Neon Serverless Postgres Free)]
    Client -->|Server Actions / Queries| NeonDB
    NeonDB -->|Triggers / Webhooks| Redis[Upstash Redis Free Queue]

```

## 💸 \$0/Month Free-Tier Stack Breakdown

| Component | Service Provider / Tech | Free-Tier Limits & Capabilities | Cost | 
| ----- | ----- | ----- | ----- | 
| **Hosting & Edge** | **Vercel** | Unlimited static hosting, 100GB bandwidth/mo, Server Actions | **\$0** | 
| **Authentication** | **Better Auth** | Self-hosted TS auth engine running inside Next.js API routes | **\$0** | 
| **Database** | **Neon (Serverless Postgres)** | 0.5 GiB storage, auto-scaling to zero, native serverless driver & instant branching | **\$0** | 
| **Object Storage** | **Neon Object Storage** | S3-compatible native blob storage that automatically branches in lockstep with Neon Postgres | **\$0** | 
| **Real-Time WebRTC** | **LiveKit Cloud** | 50GB egress traffic/mo, 1k participant-minutes/mo | **\$0** | 
| **AI Transcription** | **Groq Cloud API** | Ultra-fast Whisper Large v3 inference with generous rate limits | **\$0** | 
| **Background Queues** | **Upstash Redis** | 10k requests/day, persistent Redis cluster | **\$0** | 

## 🧩 Core Architectural Modules

### 1. Unified Neon Data & Storage Layer (Neon Postgres + Neon Object Storage)

* **Database Strategy:** Use **Better Auth** connected to **Neon Serverless Postgres** via `@neondatabase/serverless` and Prisma.

* **Object Storage Strategy:** Use **Neon Object Storage** (S3-compatible bucket API integrated directly into Neon) for video and audio blob storage. 

* **The Branching Advantage:** When you branch your Neon Postgres database (e.g., creating a `preview` or `feature/xyz` environment), Neon Object Storage **branches in lockstep with copy-on-write semantics**. This means preview environments get full isolated access to copies of DB records *and* media files without duplicating actual storage costs or risking production data.

### 2. Multi-Guest Real-Time Room (WebRTC + SFU)

* **Strategy:** Use LiveKit Cloud Free Tier for signaling and SFU media routing.

* **Bandwidth Optimization:** Cap video stream resolutions dynamically (e.g., 720p at 30fps for active speakers, 360p for grid thumbnails) to conserve free tier quota.

* **Token Management:** Generate ephemeral JWT access tokens inside Next.js Server Actions after validating the user session via Better Auth.

### 3. Low-Latency Audio DSP & Processing (Client-Side)

* **Strategy:** Offload 100% of audio gain staging, noise cancellation, and EQ filters to native browser APIs.

* **Execution:** Run signal processing inside custom `AudioWorkletNode` background threads to prevent main-thread UI lag and guarantee 60 FPS rendering.

### 4. Real-Time Speech-to-Text Pipeline (Groq API)

* **Strategy:** Slice raw microphone PCM buffers into small 2-second `.wav` blobs in the browser and push them asynchronously to Groq's API endpoint running Whisper Large v3.

* **Broadcast:** Distribute generated transcript text frames to all room participants via WebRTC `RTCDataChannel` for real-time live captions.

### 5. Media Ingestion & Uploads (Neon S3 Presigned URLs)

* **Strategy:** Use browser `MediaRecorder` API to progressively capture track streams locally, uploading them via presigned URLs directly to **Neon Object Storage** using `@aws-sdk/client-s3`.

## 🗄️ Database Schema Design (Better Auth + Prisma ORM for Neon)

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

// ==========================================
// Better Auth Schema Models
// ==========================================

model User {
  id            String    @id @default(uuid())
  name          String
  email         String    @unique
  emailVerified Boolean   @default(false)
  image         String?
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
  sessions      Session[]
  accounts      Account[]
  rooms         Room[]
}

model Session {
  id        String   @id @default(uuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  token     String   @unique
  expiresAt DateTime
  ipAddress String?
  userAgent String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

model Account {
  id                    String    @id @default(uuid())
  userId                String
  user                  User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  accountId             String
  providerId            String
  accessToken           String?
  refreshToken          String?
  accessTokenExpiresAt  DateTime?
  refreshTokenExpiresAt DateTime?
  scope                 String?
  password              String?
  createdAt             DateTime  @default(now())
  updatedAt             DateTime  @updatedAt
}

model Verification {
  id         String   @id @default(uuid())
  identifier String
  value      String
  expiresAt  DateTime
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt
}

// ==========================================
// Synthetix Application Models
// ==========================================

model Room {
  id          String       @id @default(uuid())
  slug        String       @unique
  name        String
  hostId      String
  host        User         @relation(fields: [hostId], references: [id], onDelete: Cascade)
  transcripts Transcript[]
  recordings  Recording[]
  createdAt   DateTime     @default(now())
}

model Transcript {
  id        String   @id @default(uuid())
  roomId    String
  room      Room     @relation(fields: [roomId], references: [id], onDelete: Cascade)
  speaker   String
  text      String
  timestamp Float
  createdAt DateTime @default(now())
}

model Recording {
  id          String   @id @default(uuid())
  roomId      String
  room        Room     @relation(fields: [roomId], references: [id], onDelete: Cascade)
  storageKey  String   // Object key stored in Neon Object Storage bucket
  fileUrl     String   // Resolved endpoint URL
  duration    Float
  createdAt   DateTime @default(now())
}
```

## 📁 Repository Directory Layout

```
synthetix-engine/
├── app/
│   ├── (auth)/
│   │   └── login/page.tsx
│   ├── (dashboard)/
│   │   └── dashboard/page.tsx
│   ├── studio/[roomSlug]/
│   │   ├── page.tsx                 # Main WebRTC Studio Interface
│   │   └── loading.tsx
│   ├── api/
│   │   ├── auth/[...all]/route.ts  # Better Auth Dynamic Catch-All Route
│   │   ├── livekit/token/route.ts  # Token Generator (Protected by Session)
│   │   ├── storage/presigned/route.ts # Neon Object Storage Presigned URL Generator
│   │   └── stt/transcribe/route.ts # Groq Speech API Proxy
│   ├── layout.tsx
│   └── page.tsx                     # Landing Page
├── components/
│   ├── studio/
│   │   ├── VideoGrid.tsx
│   │   ├── AudioMixer.tsx
│   │   ├── TranscriptPanel.tsx
│   │   └── ControlBar.tsx
│   └── ui/                          # Radix UI / Shadcn Components
├── lib/
│   ├── auth.ts                      # Better Auth Server Instance
│   ├── auth-client.ts               # Better Auth Client Helpers
│   ├── audio-worklet.ts             # Custom Web Audio API Worklet
│   ├── livekit.ts                   # Client Media Setup
│   ├── prisma.ts                    # Prisma Client configured for Neon Serverless
│   └── neon-storage.ts              # Neon Object Storage (AWS S3 SDK Client)
├── prisma/
│   └── schema.prisma
├── public/
│   └── worklets/
│       └── audio-processor.js       # Background Audio Thread
├── package.json
└── tailwind.config.js
```

## 🛠️ Step-by-Step Deployment & Configuration Guide

1. **Clone & Install Dependencies:**

   ```bash
   npx create-next-app@latest synthetix-engine --typescript --tailwind --app
   cd synthetix-engine
   npm install better-auth @livekit/components-react livekit-client livekit-server-sdk @prisma/client @neondatabase/serverless @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
   npm install -D prisma
   ```

2. **Configure Neon Serverless DB Client (`lib/prisma.ts`):**

   ```typescript
   import { PrismaClient } from '@prisma/client'
   import { Pool, neonConfig } from '@neondatabase/serverless'
   import { PrismaNeon } from '@prisma/adapter-neon'
   import ws from 'ws'

   neonConfig.webSocketConstructor = ws

   const connectionString = process.env.DATABASE_URL!
   const pool = new Pool({ connectionString })
   const adapter = new PrismaNeon(pool)

   const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

   export const prisma = globalForPrisma.prisma || new PrismaClient({ adapter })

   if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
   ```

3. **Configure Neon Object Storage Helper (`lib/neon-storage.ts`):**

   ```typescript
   import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
   import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

   // Standard S3 SDK pointed directly at Neon Object Storage Endpoint
   export const neonS3Client = new S3Client({
     region: process.env.NEON_STORAGE_REGION || 'us-east-1',
     endpoint: process.env.NEON_STORAGE_ENDPOINT, // e.g. https://storage.<branch-id>.neon.tech
     credentials: {
       accessKeyId: process.env.NEON_STORAGE_ACCESS_KEY_ID!,
       secretAccessKey: process.env.NEON_STORAGE_SECRET_ACCESS_KEY!,
     },
     forcePathStyle: true,
   })

   export async function generateUploadUrl(key: string, contentType: string) {
     const command = new PutObjectCommand({
       Bucket: process.env.NEON_STORAGE_BUCKET_NAME || 'recordings',
       Key: key,
       ContentType: contentType,
     })
     
     // Generates a presigned URL valid for 15 minutes
     return await getSignedUrl(neonS3Client, command, { expiresIn: 900 })
   }
   ```

4. **Configure Better Auth (`lib/auth.ts`):**

   ```typescript
   import { betterAuth } from "better-auth";
   import { prismaAdapter } from "better-auth/adapters/prisma";
   import { prisma } from "@/lib/prisma";

   export const auth = betterAuth({
       database: prismaAdapter(prisma, {
           provider: "postgresql",
       }),
       emailAndPassword: {
           enabled: true,
       },
       socialProviders: {
           github: {
               clientId: process.env.GITHUB_CLIENT_ID!,
               clientSecret: process.env.GITHUB_CLIENT_SECRET!,
           },
       },
   });
   ```

5. **Mount Route Handler (`app/api/auth/[...all]/route.ts`):**

   ```typescript
   import { auth } from "@/lib/auth";
   import { toNextJsHandler } from "better-auth/next-js";

   export const { GET, POST } = toNextJsHandler(auth);
   ```

6. **Configure Environment Variables (`.env.local`):**

   ```env
   BETTER_AUTH_SECRET="your-super-secret-random-key"
   BETTER_AUTH_URL="http://localhost:3000"

   # Neon PostgreSQL pooled connection string
   DATABASE_URL="postgresql://user:password@ep-cool-name-123456.us-east-2.aws.neon.tech/neondb?sslmode=require"

   # Neon Object Storage (S3-compatible) Config
   NEON_STORAGE_ENDPOINT="https://storage.us-east-1.neon.tech"
   NEON_STORAGE_ACCESS_KEY_ID="your-neon-storage-access-key"
   NEON_STORAGE_SECRET_ACCESS_KEY="your-neon-storage-secret-key"
   NEON_STORAGE_BUCKET_NAME="synthetix-recordings"
   NEON_STORAGE_REGION="us-east-1"

   LIVEKIT_API_KEY="your-livekit-api-key"
   LIVEKIT_API_SECRET="your-livekit-api-secret"
   NEXT_PUBLIC_LIVEKIT_URL="wss://your-app.livekit.cloud"

   GROQ_API_KEY="gsk_your_groq_api_key"
   ```

7. **Initialize Neon Database:**

   ```bash
   npx prisma db push
   ```

8. **Deploy to Vercel:**

   * Import repo into Vercel.
   * Add Environment Variables to Vercel settings (ensuring `BETTER_AUTH_URL` matches your deployed URL).
   * Deploy!