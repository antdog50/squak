import { useState } from 'react'
import { Zap, ArrowRight, UserPlus, LogIn, Eye, EyeOff } from 'lucide-react'

const API = 'http://localhost:3001'

export default function LoginScreen({ onLogin }) {
  const [mode, setMode]         = useState('login')   // 'login' | 'register'
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')

  const submit = async () => {
    if (!username.trim() || !password.trim()) return
    setLoading(true); setError('')

    try {
      const res  = await fetch(`${API}/auth/${mode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password }),
      })
      const data = await res.json()

      if (!res.ok) { setError(data.error || 'Something went wrong'); return }

      // Persist token
      localStorage.setItem('comms_token',    data.token)
      localStorage.setItem('comms_username', data.username)
      localStorage.setItem('comms_userId',   data.id)
      onLogin({ token: data.token, username: data.username, id: data.id })
    } catch {
      setError('Cannot reach server — is it running?')
    } finally {
      setLoading(false)
    }
  }

  const onKey = e => { if (e.key === 'Enter') submit() }

  return (
    <div style={{
      height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg-base)',
      backgroundImage: 'radial-gradient(ellipse at 50% 40%, #00d4ff08 0%, transparent 60%)',
    }}>
      <div style={{
        width: 380, background: 'var(--bg-surface)',
        border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)',
        padding: '40px 36px', display: 'flex', flexDirection: 'column', alignItems: 'center',
        boxShadow: '0 0 60px #00000060', animation: 'slide-in-up 0.3s ease',
      }}>
        <div style={{
          width: 48, height: 48, borderRadius: 12,
          background: 'var(--cyan-dim)', border: '1px solid var(--cyan-glow)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          marginBottom: 20, boxShadow: '0 0 24px var(--cyan-glow)',
        }}>
          <Zap size={22} color="var(--cyan)" strokeWidth={2.5} />
        </div>

        <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 4 }}>COMMS</div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 28 }}>
          {mode === 'login' ? 'Sign in to your account' : 'Create a new account'}
        </div>

        {/* Mode toggle */}
        <div style={{
          display: 'flex', width: '100%', marginBottom: 24,
          background: 'var(--bg-raised)', borderRadius: 'var(--radius)', padding: 3,
        }}>
          {[['login', 'Sign In', LogIn], ['register', 'Register', UserPlus]].map(([m, label, Icon]) => (
            <button key={m} onClick={() => { setMode(m); setError('') }} style={{
              flex: 1, padding: '8px', borderRadius: 6,
              background: mode === m ? 'var(--bg-hover)' : 'transparent',
              border: mode === m ? '1px solid var(--border-lit)' : '1px solid transparent',
              color: mode === m ? 'var(--text-primary)' : 'var(--text-muted)',
              fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              transition: 'all 0.15s',
            }}>
              <Icon size={13} />{label}
            </button>
          ))}
        </div>

        {/* Username */}
        <div style={{ width: '100%', marginBottom: 10 }}>
          <label style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', display: 'block', marginBottom: 5 }}>
            USERNAME
          </label>
          <input
            autoFocus value={username} onChange={e => setUsername(e.target.value)} onKeyDown={onKey}
            placeholder="your_username" maxLength={24}
            style={{
              width: '100%', padding: '10px 12px', borderRadius: 'var(--radius)',
              background: 'var(--bg-raised)', border: '1px solid var(--border-lit)',
              fontSize: 13, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)',
              boxSizing: 'border-box',
            }}
          />
        </div>

        {/* Password */}
        <div style={{ width: '100%', marginBottom: 20 }}>
          <label style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', display: 'block', marginBottom: 5 }}>
            PASSWORD
          </label>
          <div style={{ position: 'relative' }}>
            <input
              type={showPass ? 'text' : 'password'}
              value={password} onChange={e => setPassword(e.target.value)} onKeyDown={onKey}
              placeholder="••••••••" minLength={4}
              style={{
                width: '100%', padding: '10px 40px 10px 12px', borderRadius: 'var(--radius)',
                background: 'var(--bg-raised)', border: '1px solid var(--border-lit)',
                fontSize: 13, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)',
                boxSizing: 'border-box',
              }}
            />
            <button onClick={() => setShowPass(s => !s)} style={{
              position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
              color: 'var(--text-muted)',
            }}>
              {showPass ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div style={{
            width: '100%', padding: '8px 12px', marginBottom: 14,
            background: 'var(--red-dim)', border: '1px solid var(--red)',
            borderRadius: 'var(--radius-sm)', fontSize: 12, color: 'var(--red)',
            fontFamily: 'var(--font-mono)',
          }}>
            {error}
          </div>
        )}

        {/* Submit */}
        <button onClick={submit} disabled={loading || !username.trim() || !password.trim()} style={{
          width: '100%', padding: '11px', borderRadius: 'var(--radius)',
          background: (!loading && username.trim() && password.trim()) ? 'var(--cyan)' : 'var(--bg-hover)',
          color: (!loading && username.trim() && password.trim()) ? '#0e0f11' : 'var(--text-muted)',
          fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          transition: 'all 0.15s', cursor: loading ? 'wait' : 'pointer',
        }}>
          {loading ? 'Please wait...' : <><ArrowRight size={15} />{mode === 'login' ? 'Sign In' : 'Create Account'}</>}
        </button>

        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 16, fontFamily: 'var(--font-mono)' }}>
          connecting to localhost:3001
        </div>
      </div>
    </div>
  )
}
