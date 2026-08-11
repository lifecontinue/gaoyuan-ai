import { FormEvent, useState } from 'react';
import { ToastViewport } from '../../components/ui/ToastViewport';
import { signInWithEmailPassword, type AuthSession } from '../../lib/auth-client';
import { notify } from '../../lib/notifications';

type LoginScreenProps = {
  onLogin: (session: AuthSession) => void;
};

export function LoginScreen({ onLogin }: LoginScreenProps) {
  const [email, setEmail] = useState('haidagy@gmail.com');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    try {
      const session = signInWithEmailPassword(email, password);
      notify('Signed in successfully.', 'success');
      onLogin(session);
    } catch (nextError) {
      const message = nextError instanceof Error ? nextError.message : 'Unable to sign in.';
      setError(message);
      notify(message, 'error');
    }
  }

  return (
    <main className="login-page">
      <div className="login-brand-panel">
        <span className="hero-badge">AI PM Growth Workspace</span>
        <h1>PM Growth OS</h1>
        <p>
          Sign in to continue your growth workflow: save evidence, learn with the
          Knowledge Tool, and turn weekly progress into a durable operating system.
        </p>
        <div className="login-proof-grid">
          <span>Guided practice</span>
          <span>Real web search</span>
          <span>Token tracking</span>
        </div>
      </div>

      <form className="login-card" onSubmit={handleSubmit}>
        <div>
          <p className="section-eyebrow">Secure workspace</p>
          <h2>Sign in</h2>
          <p>Use your workspace credentials to access PM Growth OS.</p>
        </div>

        <label className="login-field">
          <span>Email</span>
          <input
            autoComplete="email"
            autoFocus
            className="inline-input"
            onChange={(event) => setEmail(event.target.value)}
            type="email"
            value={email}
          />
        </label>

        <label className="login-field">
          <span>Password</span>
          <input
            autoComplete="current-password"
            className="inline-input"
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Enter your password"
            type="password"
            value={password}
          />
        </label>

        {error ? <div className="login-error">{error}</div> : null}

        <button className="solid-button login-submit" disabled={!email.trim() || !password} type="submit">
          Sign in to workspace
        </button>
      </form>
      <ToastViewport />
    </main>
  );
}
