import bcrypt from "bcryptjs";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const ADMIN_SEEDS: Array<{
  username: string;
  password: string;
  email?: string | null;
}> = [
  {
    username: "Felipe Mahecha",
    password: "05051997Fm08",
    email: "Ventanilla Valma",
  },
  {
    username: "Darney",
    password: "Valma2026",
    email: null,
  },
  {
    username: "Martha",
    password: "Valma2026",
    email: null,
  },
];

export async function seedDefaultUsers(): Promise<void> {
  for (const admin of ADMIN_SEEDS) {
    const [existing] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.username, admin.username));

    if (existing) {
      console.log(`↷ Administrador ya existe: ${admin.username}`);
      continue;
    }

    const passwordHash = await bcrypt.hash(admin.password, 10);
    await db.insert(usersTable).values({
      username: admin.username,
      email: admin.email ?? null,
      passwordHash,
      role: "admin",
    });
    console.log(`✓ Administrador creado: ${admin.username}`);
  }
}
