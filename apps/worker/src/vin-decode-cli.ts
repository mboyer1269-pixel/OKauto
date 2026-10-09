/**
 * Optional manual catch-up for VIN decode (NHTSA vPIC).
 *
 * The worker already runs this automatically on boot and every minute.
 * Use this command only if you need to drain the backlog without waiting:
 *
 *   pnpm --filter @okauto/worker build && pnpm --filter @okauto/worker vin-decode
 *   # image prod : node dist/vin-decode-cli.js
 *
 * Idempotent: vehicles with vinDecodedAt for the current NIV are skipped.
 */
import { prisma } from "@okauto/database";
import {
  countPendingVinDecodes,
  processVinDecodeUntilIdle,
} from "./vin-decode.js";

const pending = await countPendingVinDecodes();
console.log(`VIN decode catch-up: ${pending} vehicle(s) pending`);
const results = await processVinDecodeUntilIdle();
console.log(JSON.stringify(results, null, 2));
await prisma.$disconnect();
