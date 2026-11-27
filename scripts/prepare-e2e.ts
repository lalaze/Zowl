import { rm } from "node:fs/promises";
import { resolve } from "node:path";

const databasePath = resolve(".data/zowl-e2e.sqlite");
const storagePath = resolve("storage/e2e");

for (const path of [databasePath, `${databasePath}-shm`, `${databasePath}-wal`]) {
  await rm(path, { force: true });
}
await rm(storagePath, { recursive: true, force: true });

console.log("Dedicated Playwright data cleared.");
