const AUTH_SESSION_KEY = 'pm-growth-os.auth-session.v1';
const AUTH_RESET_KEY = 'pm-growth-os.auth-reset.v2';
const ALLOWED_EMAIL = 'haidagy@gmail.com';
const ALLOWED_PASSWORD = 'password1';

export type AuthSession = {
  email: string;
  signedInAt: string;
};

export function readAuthSession(): AuthSession | null {
  applyAuthResetOnce();

  const storage = getStorage();
  if (!storage) return null;

  const raw = storage.getItem(AUTH_SESSION_KEY);
  if (!raw) return null;

  try {
    const session = JSON.parse(raw) as Partial<AuthSession>;

    if (session.email === ALLOWED_EMAIL && session.signedInAt) {
      return {
        email: session.email,
        signedInAt: session.signedInAt,
      };
    }
  } catch {
    clearAuthSession();
  }

  return null;
}

export function signInWithEmailPassword(email: string, password: string): AuthSession {
  const normalizedEmail = email.trim().toLowerCase();

  if (normalizedEmail !== ALLOWED_EMAIL || password !== ALLOWED_PASSWORD) {
    throw new Error('Invalid email or password.');
  }

  const session = {
    email: normalizedEmail,
    signedInAt: new Date().toISOString(),
  };

  getStorage()?.setItem(AUTH_SESSION_KEY, JSON.stringify(session));
  return session;
}

export function clearAuthSession() {
  getStorage()?.removeItem(AUTH_SESSION_KEY);
}

function applyAuthResetOnce() {
  const storage = getStorage();
  if (!storage || storage.getItem(AUTH_RESET_KEY) === 'done') return;

  storage.removeItem(AUTH_SESSION_KEY);
  storage.setItem(AUTH_RESET_KEY, 'done');
}

function getStorage() {
  if (typeof window === 'undefined') return null;

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
