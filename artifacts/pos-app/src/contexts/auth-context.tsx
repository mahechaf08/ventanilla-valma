import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import { SEED_USERS, USERS_SEED_VERSION } from '@/data/seed';
import { DEFAULT_NEXT_IDS, KEYS, load, remove, save, type NextIds } from '@/lib/storage';
import {
  connectRealtime,
  publishPresence,
  publishUserUpdated,
  RealtimeEvents,
} from '@/lib/realtime';
import type { AuthUser, Role, User } from '@/types';

interface CreateUserInput {
  username: string;
  password: string;
  role: Role;
}

interface UpdateUserInput {
  username?: string;
  password?: string;
  role?: Role;
  enabled?: boolean;
  lastLoginAt?: string | null;
}

interface AuthContextType {
  user: AuthUser | null;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  listUsers: () => User[];
  createUser: (input: CreateUserInput) => User;
  updateUser: (id: number, input: UpdateUserInput) => User;
  setUserEnabled: (id: number, enabled: boolean) => User;
  deleteUser: (id: number) => void;
  /** Live presence from Socket.IO across terminals. */
  onlineUserIds: number[];
  /** Verify the signed-in admin's password for destructive actions. */
  verifyCurrentPassword: (password: string) => boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

function normalizeUser(u: User): User {
  return {
    ...u,
    enabled: u.enabled !== false,
    lastLoginAt: u.lastLoginAt ?? null,
  };
}

function ensureUsers(): User[] {
  const version = load<number>(KEYS.usersSeedVersion, 0);
  if (version < USERS_SEED_VERSION) {
    save(KEYS.users, SEED_USERS.map(normalizeUser));
    save(KEYS.usersSeedVersion, USERS_SEED_VERSION);
    const ids = load<NextIds>(KEYS.nextIds, DEFAULT_NEXT_IDS);
    save(KEYS.nextIds, { ...ids, user: Math.max(ids.user, 5) });
    remove(KEYS.session);
    return SEED_USERS.map(normalizeUser);
  }

  const existing = load<User[] | null>(KEYS.users, null);
  if (existing && existing.length > 0) {
    const normalized = existing.map(normalizeUser);
    save(KEYS.users, normalized);
    return normalized;
  }
  save(KEYS.users, SEED_USERS.map(normalizeUser));
  save(KEYS.usersSeedVersion, USERS_SEED_VERSION);
  const ids = load<NextIds>(KEYS.nextIds, DEFAULT_NEXT_IDS);
  if (ids.user < 5) {
    save(KEYS.nextIds, { ...ids, user: 5 });
  }
  return SEED_USERS.map(normalizeUser);
}

function toAuthUser(u: User): AuthUser {
  return { id: u.id, username: u.username, role: u.role };
}

function isUserEnabled(u: User): boolean {
  return u.enabled !== false;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [users, setUsers] = useState<User[]>([]);
  const [onlineUserIds, setOnlineUserIds] = useState<number[]>([]);

  const persistUsers = useCallback((next: User[]) => {
    const normalized = next.map(normalizeUser);
    setUsers(normalized);
    save(KEYS.users, normalized);
  }, []);

  useEffect(() => {
    const seeded = ensureUsers();
    setUsers(seeded);
    const session = load<AuthUser | null>(KEYS.session, null);
    if (session && seeded.some((u) => u.id === session.id)) {
      const fresh = seeded.find((u) => u.id === session.id)!;
      if (!isUserEnabled(fresh)) {
        remove(KEYS.session);
        setUser(null);
      } else {
        const auth = toAuthUser(fresh);
        save(KEYS.session, auth);
        setUser(auth);
      }
    } else {
      remove(KEYS.session);
      setUser(null);
    }
    setIsLoading(false);
  }, []);

  // Presence + cross-device user field sync
  useEffect(() => {
    const sock = connectRealtime();
    if (!sock) return;

    const onSnapshot = (payload: { onlineUserIds?: number[] }) => {
      setOnlineUserIds(
        Array.isArray(payload?.onlineUserIds)
          ? payload.onlineUserIds.map(Number).filter((n) => Number.isFinite(n))
          : [],
      );
    };

    const onUserUpdated = (payload: {
      userId?: number;
      enabled?: boolean;
      lastLoginAt?: string | null;
      username?: string;
      role?: Role;
    }) => {
      const userId = Number(payload?.userId);
      if (!Number.isFinite(userId)) return;
      setUsers((prev) => {
        const idx = prev.findIndex((u) => u.id === userId);
        if (idx < 0) return prev;
        const current = prev[idx];
        const updated: User = normalizeUser({
          ...current,
          ...(payload.enabled !== undefined ? { enabled: payload.enabled } : {}),
          ...(payload.lastLoginAt !== undefined
            ? { lastLoginAt: payload.lastLoginAt }
            : {}),
          ...(payload.username ? { username: payload.username } : {}),
          ...(payload.role ? { role: payload.role } : {}),
        });
        const next = [...prev];
        next[idx] = updated;
        save(KEYS.users, next);

        // Kick local session if this account was disabled
        const session = load<AuthUser | null>(KEYS.session, null);
        if (session?.id === userId && !isUserEnabled(updated)) {
          remove(KEYS.session);
          setUser(null);
        }
        return next;
      });
    };

    const announce = () => {
      const session = load<AuthUser | null>(KEYS.session, null);
      if (session) publishPresence(session.id, session.username);
    };

    sock.on(RealtimeEvents.PRESENCE_SNAPSHOT, onSnapshot);
    sock.on(RealtimeEvents.USER_UPDATED, onUserUpdated);
    sock.on('connect', announce);
    announce();

    const heartbeat = window.setInterval(announce, 25_000);

    return () => {
      window.clearInterval(heartbeat);
      sock.off(RealtimeEvents.PRESENCE_SNAPSHOT, onSnapshot);
      sock.off(RealtimeEvents.USER_UPDATED, onUserUpdated);
      sock.off('connect', announce);
    };
  }, []);

  // Keep announcing while logged in (covers login after mount)
  useEffect(() => {
    if (!user) return;
    publishPresence(user.id, user.username);
  }, [user]);

  const login = useCallback(async (username: string, password: string) => {
    const all = ensureUsers();
    setUsers(all);
    const found = all.find(
      (u) =>
        u.username.toLowerCase() === username.trim().toLowerCase() &&
        u.password === password,
    );
    if (!found) {
      throw new Error('Usuario o contraseña incorrectos');
    }
    if (!isUserEnabled(found)) {
      throw new Error('Esta cuenta está deshabilitada. Contacta a un administrador.');
    }

    const lastLoginAt = new Date().toISOString();
    const updated: User = normalizeUser({ ...found, lastLoginAt });
    const next = all.map((u) => (u.id === found.id ? updated : u));
    persistUsers(next);
    publishUserUpdated({
      userId: found.id,
      lastLoginAt,
      enabled: true,
      username: found.username,
      role: found.role,
    });

    const session = toAuthUser(updated);
    save(KEYS.session, session);
    setUser(session);
    publishPresence(session.id, session.username);
  }, [persistUsers]);

  const logout = useCallback(async () => {
    remove(KEYS.session);
    setUser(null);
  }, []);

  const listUsers = useCallback(() => users, [users]);

  const createUser = useCallback(
    (input: CreateUserInput): User => {
      const username = input.username.trim();
      if (!username || !input.password) {
        throw new Error('Completa todos los campos');
      }
      if (users.some((u) => u.username.toLowerCase() === username.toLowerCase())) {
        throw new Error('Ese nombre de usuario ya existe');
      }
      const ids = load<NextIds>(KEYS.nextIds, DEFAULT_NEXT_IDS);
      const newUser: User = normalizeUser({
        id: ids.user,
        username,
        password: input.password,
        role: input.role,
        enabled: true,
        lastLoginAt: null,
        createdAt: new Date().toISOString(),
      });
      persistUsers([...users, newUser]);
      save(KEYS.nextIds, { ...ids, user: ids.user + 1 });
      return newUser;
    },
    [users, persistUsers],
  );

  const updateUser = useCallback(
    (id: number, input: UpdateUserInput): User => {
      const idx = users.findIndex((u) => u.id === id);
      if (idx < 0) throw new Error('Usuario no encontrado');

      const username = input.username?.trim();
      if (username !== undefined && !username) {
        throw new Error('El nombre de usuario es obligatorio');
      }
      if (
        username &&
        users.some(
          (u) =>
            u.id !== id && u.username.toLowerCase() === username.toLowerCase(),
        )
      ) {
        throw new Error('Ese nombre de usuario ya existe');
      }
      if (input.password !== undefined && input.password.length === 0) {
        throw new Error('La contraseña no puede estar vacía');
      }

      const current = users[idx];
      const updated: User = normalizeUser({
        ...current,
        username: username ?? current.username,
        password: input.password ?? current.password,
        role: input.role ?? current.role,
        enabled:
          input.enabled !== undefined ? input.enabled : current.enabled !== false,
        lastLoginAt:
          input.lastLoginAt !== undefined
            ? input.lastLoginAt
            : current.lastLoginAt ?? null,
      });

      const next = [...users];
      next[idx] = updated;
      persistUsers(next);

      publishUserUpdated({
        userId: id,
        enabled: updated.enabled !== false,
        lastLoginAt: updated.lastLoginAt ?? null,
        username: updated.username,
        role: updated.role,
      });

      if (user?.id === id) {
        if (!isUserEnabled(updated)) {
          remove(KEYS.session);
          setUser(null);
        } else {
          const session = toAuthUser(updated);
          save(KEYS.session, session);
          setUser(session);
        }
      }

      return updated;
    },
    [users, user, persistUsers],
  );

  const setUserEnabled = useCallback(
    (id: number, enabled: boolean): User => {
      if (user?.id === id && !enabled) {
        throw new Error('No puedes deshabilitar tu propia sesión');
      }
      return updateUser(id, { enabled });
    },
    [user, updateUser],
  );

  const deleteUser = useCallback(
    (id: number) => {
      if (user?.id === id) {
        throw new Error('No puedes eliminar tu propia sesión');
      }
      persistUsers(users.filter((u) => u.id !== id));
    },
    [users, user, persistUsers],
  );

  const verifyCurrentPassword = useCallback(
    (password: string) => {
      if (!user) return false;
      const all = ensureUsers();
      const found = all.find((u) => u.id === user.id);
      if (!found || found.role !== 'admin') return false;
      return found.password === password;
    },
    [user],
  );

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        login,
        logout,
        listUsers,
        createUser,
        updateUser,
        setUserEnabled,
        deleteUser,
        onlineUserIds,
        verifyCurrentPassword,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
