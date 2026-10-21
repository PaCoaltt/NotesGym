import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';

export function AuthCard({ title, children }) {
  return <main className="min-h-screen flex items-center justify-center p-4 bg-[#e0e5eb] text-[#5a6a7a]">
    <section className="w-full max-w-md rounded-3xl p-6 sm:p-8 space-y-5 shadow-[20px_20px_40px_#b8bdc4,-20px_-20px_40px_#ffffff]">
      <header className="text-center"><Link to="/" className="text-4xl font-bold">NotesGym</Link><h1 className="mt-3 text-xl font-semibold">{title}</h1></header>
      {children}
    </section>
  </main>;
}
export function AuthField({ label, name, id = name, type = 'text', ...props }) {
  return <label className="block text-sm font-medium space-y-2" htmlFor={id}><span>{label}</span>
    <input id={id} name={name} type={type} required className="w-full min-h-12 px-4 py-3 rounded-xl bg-[#e0e5eb] text-[#394b5c] shadow-[inset_4px_4px_8px_#b8bdc4,inset_-4px_-4px_8px_#ffffff] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#394b5c]" {...props} />
  </label>;
}
export function AuthButton({ children, ...props }) {
  return <button className="w-full min-h-12 px-4 py-3 rounded-xl font-bold shadow-[8px_8px_16px_#b8bdc4,-8px_-8px_16px_#ffffff] disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#394b5c]" {...props}>{children}</button>;
}
export function AuthStatus({ error, message }) {
  return <div aria-live="polite" aria-atomic="true">{error && <p role="alert" className="text-sm text-red-800">{error}</p>}{message && <p role="status" className="text-sm text-[#394b5c]">{message}</p>}</div>;
}
const titles = { login: 'Connexion', register: 'Créer un compte', 'forgot-password': 'Mot de passe oublié', 'reset-password': 'Nouveau mot de passe', 'verify-email': 'Vérifier mon adresse email' };
export default function AuthScreen({ mode = 'login' }) {
  const { login, checkUserAuth } = useAuth();
  const navigate = useNavigate();
  const readLink = () => {
    const params = new URLSearchParams(window.location.hash.slice(1));
    return { token: params.get('token') || '', kind: params.get('kind') || '' };
  };
  const [link, setLink] = useState(readLink);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [done, setDone] = useState(false);
  useEffect(() => {
    const capture = () => {
      const next = readLink();
      if (!next.token) return;
      setLink(next); setDone(false); setError(''); setMessage('');
      window.history.replaceState(window.history.state, '', window.location.pathname);
    };
    capture();
    window.addEventListener('hashchange', capture);
    return () => window.removeEventListener('hashchange', capture);
  }, []);
  const tokenMode = ['verify-email', 'reset-password'].includes(mode);
  const passwordMode = ['login', 'register', 'reset-password'].includes(mode);
  const newPasswordMode = ['register', 'reset-password'].includes(mode);
  const submit = async (event, action = mode) => {
    event.preventDefault(); setError(''); setMessage('');
    if (newPasswordMode && action !== 'resend-verification' && password !== confirmPassword) { setError('Les mots de passe ne correspondent pas.'); return; }
    setBusy(true);
    try {
      if (action === 'login') { await login(email, password); navigate('/', { replace: true }); }
      else {
        const result = await base44.auth.action(action, { email, password, confirmPassword, ...link });
        setMessage(result.message); setPassword(''); setConfirmPassword('');
        if (tokenMode) { setDone(true); await checkUserAuth(true); }
      }
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  };
  return <AuthCard title={titles[mode]}>
    {mode === 'register' && <p className="text-sm">Après l’inscription, confirmez votre email pour accéder à vos notes.</p>}
    {tokenMode && !link.token && <p role="alert" className="text-sm">Lien manquant. Ouvrez le lien de votre email. Pour un lien expiré ou déjà utilisé, demandez un nouveau message.</p>}
    <form onSubmit={submit} className="space-y-5" aria-busy={busy}>
      {!tokenMode && <AuthField label="Adresse email" name="email" type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="username" maxLength={254} />}
      {passwordMode && !done && <AuthField label="Mot de passe" name="password" type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete={newPasswordMode ? 'new-password' : 'current-password'} minLength={newPasswordMode ? 12 : undefined} maxLength={128} />}
      {newPasswordMode && !done && <><p id="password-help" className="text-xs">Entre 12 et 128 caractères. Utilisez un mot de passe unique.</p><AuthField label="Confirmer le mot de passe" name="confirmPassword" type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} autoComplete="new-password" minLength={12} maxLength={128} aria-describedby="password-help" /></>}
      <AuthStatus error={error} message={message} />
      {!done && <AuthButton type="submit" disabled={busy || (tokenMode && !link.token)}>{busy ? 'Veuillez patienter…' : mode === 'login' ? 'Se connecter' : mode === 'register' ? 'Créer mon compte' : mode === 'verify-email' ? 'Confirmer mon adresse' : mode === 'reset-password' ? 'Enregistrer le mot de passe' : 'Envoyer le lien'}</AuthButton>}
      {['login', 'register'].includes(mode) && <AuthButton type="button" disabled={busy || !email} onClick={event => submit(event, 'resend-verification')}>Renvoyer l’email de vérification</AuthButton>}
    </form>
    <nav aria-label="Authentification" className="flex flex-wrap justify-center gap-x-5 gap-y-3 text-sm underline underline-offset-4">
      {mode !== 'login' && <Link to="/login">Se connecter</Link>}
      {mode !== 'register' && <Link to="/register">Créer un compte</Link>}
      {mode !== 'forgot-password' && <Link to="/forgot-password">Mot de passe oublié</Link>}
    </nav>
  </AuthCard>;
}
