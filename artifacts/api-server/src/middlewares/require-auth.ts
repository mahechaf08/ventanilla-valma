import type { Request, Response, NextFunction } from "express";

declare module "express-session" {
  interface SessionData {
    userId: number;
    userRole: "admin" | "user";
    username: string;
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.session?.userId) {
    res.status(401).json({ error: "Autenticación requerida" });
    return;
  }
  next();
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.session?.userId) {
    res.status(401).json({ error: "Autenticación requerida" });
    return;
  }
  if (req.session.userRole !== "admin") {
    res.status(403).json({ error: "Acceso de administrador requerido" });
    return;
  }
  next();
}
