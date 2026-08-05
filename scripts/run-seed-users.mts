import { seedDefaultUsers } from "../artifacts/api-server/src/seed-users.ts";

await seedDefaultUsers();
console.log("Seed done");
process.exit(0);
