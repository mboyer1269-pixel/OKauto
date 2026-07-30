import { startWorker } from "./worker.js";

startWorker().catch((err) => {
  console.error(err);
  process.exit(1);
});
