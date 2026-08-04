import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import { SEED_USERS, USERS_SEED_VERSION } from '@/data/seed';
import { DEFAULT_NEXT_IDS, KEYS, load, remove, save, type NextIds } from '@/lib/storage';
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
}

interface AuthContextType {
  user: AuthUser | null;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  listUsers: () => User[];
  createUser: (input: CreateUserInput) => User;
  updateUser: (id: number, input: UpdateUserInput) => User;
  deleteUser: (id: number) => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

function ensureUsers(): User[] {
  const version = load<number>(KEYS.usersSeedVersion, 0);
  if (version < USERS_SEED_VERSION) {
    save(KEYS.users, SEED_USERS);
    save(KEYS.usersSeedVersion, USERS_SEED_VERSION);
    const ids = load<NextIds>(KEYS.nextIds, DEFAULT_NEXT_IDS);
    save(KEYS.nextIds, { ...ids, user: Math.max(ids.user, 3) });
    remove(KEYS.session);
    return SEED_USERS;
  }

  const existing = load<User[] | null>(KEYS.users, null);
  if (existing && existing.length > 0) return existing;
  save(KEYS.users, SEED_USERS);
  save(KEYS.usersSeedVersion, USERS_SEED_VERSION);
  const ids = load<NextIds>(KEYS.nextIds, DEFAULT_NEXT_IDS);
  if (ids.user < 3) {
    save(KEYS.nextIds, { ...ids, user: 3 });
  }
  return SEED_USERS;
}

function toAuthUser(u: User): AuthUser {
  return { id: u.id, username: u.username, role: u.role };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [users, setUsers] = useState<User[]>([]);

  useEffect(() => {
    const seeded = ensureUsers();
    setUsers(seeded);
    const session = load<AuthUser | null>(KEYS.session, null);
    if (session && seeded.some((u) => u.id === session.id)) {
      const fresh = seeded.find((u) => u.id === session.id)!;
      const auth = toAuthUser(fresh);
      save(KEYS.session, auth);
      setUser(auth);
    } else {
      remove(KEYS.session);
      setUser(null);
    }
    setIsLoading(false);
  }, []);

  const persistUsers = useCallback((next: User[]) => {
    setUsers(next);
    save(KEYS.users, next);
  }, []);

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
    const session = toAuthUser(found);
    save(KEYS.session, session);
    setUser(session);
  }, []);

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
      const newUser: User = {
        id: ids.user,
        username,
        password: input.password,
        role: input.role,
        createdAt: new Date().toISOString(),
      };
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
      const updated: User = {
        ...current,
        username: username ?? current.username,
        password: input.password ?? current.password,
        role: input.role ?? current.role,
      };

      const next = [...users];
      next[idx] = updated;
      persistUsers(next);

      if (user?.id === id) {
        const session = toAuthUser(updated);
        save(KEYS.session, session);
        setUser(session);
      }

      return updated;
    },
    [users, user, persistUsers],
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
        deleteUser,
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
