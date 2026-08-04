import { Router } from "express";
import bcrypt from "bcryptjs";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAdmin } from "../middlewares/require-auth";

const router = Router();

router.get("/users", requireAdmin, async (_req, res): Promise<void> => {
  const users = await db
    .select({
      id: usersTable.id,
      username: usersTable.username,
      role: usersTable.role,
      createdAt: usersTable.createdAt,
    })
    .from(usersTable)
    .orderBy(usersTable.createdAt);
  res.json(users);
});

router.post("/users", requireAdmin, async (req, res): Promise<void> => {
  const { username, password, role } = req.body;

  if (!username || !password || !role) {
    res.status(400).json({ error: "Usuario, contraseña y rol son requeridos" });
    return;
  }
  if (!["admin", "user"].includes(String(role))) {
    res.status(400).json({ error: "Rol inválido" });
    return;
  }

  const existing = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.username, String(username)));

  if (existing.length > 0) {
    res.status(409).json({ error: "El nombre de usuario ya existe" });
    return;
  }

  const passwordHash = await bcrypt.hash(String(password), 10);
  const [newUser] = await db
    .insert(usersTable)
    .values({ username: String(username), passwordHash, role: role as "admin" | "user" })
    .returning({
      id: usersTable.id,
      username: usersTable.username,
      role: usersTable.role,
      createdAt: usersTable.createdAt,
    });

  res.status(201).json(newUser);
});

router.delete("/users/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  if (req.session.userId === id) {
    res.status(400).json({ error: "No puedes eliminar tu propia cuenta" });
    return;
  }
  await db.delete(usersTable).where(eq(usersTable.id, id));
  res.status(204).send();
});

export default router;
