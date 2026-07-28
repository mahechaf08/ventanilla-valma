import bcrypt from "bcryptjs";
import { db, usersTable } from "@workspace/db";

export async function seedDefaultUsers(): Promise<void> {
  const existing = await db.select({ id: usersTable.id }).from(usersTable).limit(1);
  if (existing.length > 0) return;

  const [adminHash, userHash] = await Promise.all([
    bcrypt.hash("admin123", 10),
    bcrypt.hash("empleado123", 10),
  ]);

  await db.insert(usersTable).values([
    { username: "admin", passwordHash: adminHash, role: "admin" },
    { username: "empleado", passwordHash: userHash, role: "user" },
  ]);

  console.log("✓ Usuarios por defecto creados: admin / empleado");
}
