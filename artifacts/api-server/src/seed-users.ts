import bcrypt from "bcryptjs";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

export async function seedDefaultUsers(): Promise<void> {
  // Always ensure the main administrator account exists.
  const [existing] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.username, "Felipe Mahecha"));

  if (!existing) {
    const passwordHash = await bcrypt.hash("05051997Fm08", 10);
    await db.insert(usersTable).values({
      username: "Felipe Mahecha",
      email: "Fuego Verde",
      passwordHash,
      role: "admin",
    });
    console.log("✓ Administrador principal creado: Felipe Mahecha");
  }
}
