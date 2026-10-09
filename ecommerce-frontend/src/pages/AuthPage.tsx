import { useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { ArrowRight, CircleUserRound } from 'lucide-react'
import { toast } from 'sonner'
import { errorMessage } from '@/api/client'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { loginSchema, registerSchema } from '@/lib/validation'

type AuthMode = 'login' | 'register'
type AuthField = 'name' | 'email' | 'password'

export function AuthPage({ mode }: { mode: AuthMode }) {
  const isRegister = mode === 'register'
  const { user, login, register } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<AuthField, string>>>({})
  const destination = location.state?.from?.pathname
    ? `${location.state.from.pathname}${location.state.from.search || ''}`
    : '/'

  if (user) return <Navigate to={destination} replace />

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setFieldErrors({})
    const parsed = isRegister
      ? registerSchema.safeParse({ name, email, password })
      : loginSchema.safeParse({ email, password })
    if (!parsed.success) {
      const nextErrors: Partial<Record<AuthField, string>> = {}
      parsed.error.issues.forEach((issue) => {
        const field = issue.path[0]
        if (field === 'name' || field === 'email' || field === 'password') {
          nextErrors[field] = nextErrors[field] ? `${nextErrors[field]} ${issue.message}` : issue.message
        }
      })
      setFieldErrors(nextErrors)
      toast.error(parsed.error.issues[0].message)
      return
    }

    setBusy(true)
    try {
      if (isRegister) {
        if (!('name' in parsed.data) || typeof parsed.data.name !== 'string') throw new Error('Registration details are incomplete.')
        await register(parsed.data.name, parsed.data.email, parsed.data.password)
        toast.success('Account created successfully.')
      } else {
        await login(parsed.data.email, parsed.data.password)
        toast.success('Signed in successfully.')
      }
      navigate(destination, { replace: true })
    } catch (requestError) {
      const message = errorMessage(requestError)
      setError(message)
      toast.error(message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="auth-page simple-auth">
      <section className="auth-form-wrap simple-auth-panel">
          <Link to="/" className="simple-auth-brand"><span className="brand-mark">c.</span> common goods</Link>
          <span className="auth-icon"><CircleUserRound size={19} /></span>
          <p className="eyebrow">Your account</p>
          <h1>{isRegister ? 'Create your account' : 'Sign in'}</h1>
          <p className="auth-intro">{isRegister ? 'Enter your details to get started.' : 'Enter your email and password to continue.'}</p>
          <form className="auth-form" onSubmit={submit} noValidate>
            {isRegister && <label className="form-field"><span>Your name</span><Input autoComplete="name" value={name} onChange={(event) => { setName(event.target.value); setFieldErrors((current) => ({ ...current, name: '' })) }} placeholder="Alex Morgan" required aria-invalid={Boolean(fieldErrors.name)} />{fieldErrors.name && <small className="field-error">{fieldErrors.name}</small>}</label>}
            <label className="form-field"><span>Email address</span><Input type="email" autoComplete="email" value={email} onChange={(event) => { setEmail(event.target.value); setFieldErrors((current) => ({ ...current, email: '' })) }} placeholder="you@example.com" required aria-invalid={Boolean(fieldErrors.email)} />{fieldErrors.email && <small className="field-error">{fieldErrors.email}</small>}</label>
            <label className="form-field"><span>Password</span><Input type="password" autoComplete={isRegister ? 'new-password' : 'current-password'} value={password} onChange={(event) => { setPassword(event.target.value); setFieldErrors((current) => ({ ...current, password: '' })) }} placeholder={isRegister ? '8+ characters, one number and symbol' : 'Your password'} minLength={8} required aria-invalid={Boolean(fieldErrors.password)} />{fieldErrors.password && <small className="field-error">{fieldErrors.password}</small>}</label>
            {error && <p className="form-message error-text" role="alert">{error}</p>}
            <Button className="auth-submit" type="submit" disabled={busy}>{busy ? 'One moment...' : isRegister ? 'Create account' : 'Sign in'}<ArrowRight size={16} /></Button>
          </form>
          <p className="auth-switch">{isRegister ? 'Already have an account?' : 'New around here?'} <Link to={isRegister ? '/login' : '/register'}>{isRegister ? 'Sign in' : 'Create an account'}</Link></p>
          <p className="auth-terms">Your account is protected with secure sign-in.</p>
      </section>
    </main>
  )
}