import { Router } from "express";
import bcrypt from "bcryptjs";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

router.post("/auth/login", async (req, res): Promise<void> => {
  const { username, password } = req.body;

  if (!username || !password) {
    res.status(400).json({ error: "Usuario y contraseña son requeridos" });
    return;
  }

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.username, String(username)));

  if (!user) {
    res.status(401).json({ error: "Credenciales inválidas" });
    return;
  }

  const valid = await bcrypt.compare(String(password), user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "Credenciales inválidas" });
    return;
  }

  req.session.userId = user.id;
  req.session.userRole = user.role as "admin" | "user";
  req.session.username = user.username;

  res.json({ id: user.id, username: user.username, role: user.role });
});

router.post("/auth/logout", (req, res): void => {
  req.session.destroy(() => {
    res.clearCookie("connect.sid");
    res.json({ ok: true });
  });
});

router.get("/auth/me", (req, res): void => {
  if (!req.session?.userId) {
    res.status(401).json({ error: "No autenticado" });
    return;
  }
  res.json({
    id: req.session.userId,
    username: req.session.username,
    role: req.session.userRole,
  });
});

export default router;
