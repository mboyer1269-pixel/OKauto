import { MemoryRateLimitStore, setAuthRateLimitStoreForTests } from "@/lib/rate-limit";

setAuthRateLimitStoreForTests(new MemoryRateLimitStore());
