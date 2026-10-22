import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { base44 } from '@/api/base44Client';
import { AuthCard, AuthField, AuthButton, AuthStatus } from './AuthScreen';

export default function AccountScreen() {
  const { user, logout, checkUserAuth } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const perform = async (event, action) => {
    event.preventDefault(); setBusy(true); setError(''); setMessage('');
    const form = event.currentTarget;
    const data = form.tagName === 'FORM' ? Object.fromEntries(new FormData(form)) : {};
    try {
      if (action === 'logout') { await logout(); navigate('/login', { replace: true }); }
      else {
        const result = await base44.auth.action(action, action === 'resend-verification' ? { email: user.email } : data);
        form.reset?.(); setMessage(result.message);
        if (action === 'change-password') { await checkUserAuth(); navigate('/login'); }
      }
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  };
  return <AuthCard title="Mon compte">
    <p className="break-words">{user.email}</p>
    <p className="text-sm">{user.email_verified ? 'Adresse vérifiée' : 'Adresse non vérifiée — confirmez votre email.'}</p>
    {!user.email_verified && <AuthButton type="button" disabled={busy} onClick={event => perform(event, 'resend-verification')}>Envoyer la vérification</AuthButton>}
    <AuthStatus error={error} message={message} />
    <form className="space-y-4 border-t border-[#b8bdc4] pt-5" onSubmit={event => perform(event, 'change-password')} aria-busy={busy}>
      <h2 className="font-semibold">Changer le mot de passe</h2>
      <AuthField label="Mot de passe actuel" name="currentPassword" type="password" autoComplete="current-password" maxLength={128} />
      <AuthField label="Nouveau mot de passe (12 à 128 caractères)" name="password" type="password" autoComplete="new-password" minLength={12} maxLength={128} />
      <AuthField label="Confirmer le nouveau mot de passe" name="confirmPassword" type="password" autoComplete="new-password" minLength={12} maxLength={128} />
      <AuthButton disabled={busy}>Enregistrer et se déconnecter</AuthButton>
    </form>
    <form className="space-y-4 border-t border-[#b8bdc4] pt-5" onSubmit={event => perform(event, 'change-email')} aria-busy={busy}>
      <h2 className="font-semibold">Changer l’adresse email</h2>
      <AuthField label="Nouvelle adresse email" name="email" type="email" autoComplete="email" maxLength={254} />
      <AuthField label="Mot de passe actuel" name="currentPassword" id="emailCurrentPassword" type="password" autoComplete="current-password" maxLength={128} />
      <p className="text-xs">La nouvelle adresse doit être confirmée. Vos notes et simulations restent liées à votre compte.</p>
      <AuthButton disabled={busy}>Envoyer la confirmation</AuthButton>
    </form>
    <AuthButton type="button" disabled={busy} onClick={event => perform(event, 'logout')}>Se déconnecter</AuthButton>
    <Link to="/" className="block text-center underline">Retour à mes notes</Link>
  </AuthCard>;
}
