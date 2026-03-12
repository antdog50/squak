import { MessageSquare, Radio, FolderUp, Minus, Square, X, Zap, LogOut } from 'lucide-react'

const NAV = [
  { id: 'chat',  icon: MessageSquare, label: 'Messages' },
  { id: 'voice', icon: Radio,         label: 'Voice'    },
  { id: 'files', icon: FolderUp,      label: 'Files'    },
]

export default function TitleBar({ activePanel, setActivePanel, onLogout, username }) {
  const api = window.electronAPI

  return (
    <div style={{
      height: 'var(--titlebar-h)', background: 'var(--bg-surface)',
      borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center',
      WebkitAppRegion: 'drag', flexShrink: 0, position: 'relative', zIndex: 100,
    }}>
      {/* Logo */}
      <div style={{ width: 'var(--sidebar-w)', display: 'flex', alignItems: 'center', gap: 8, padding: '0 16px', flexShrink: 0 }}>
        <div style={{
          width: 22, height: 22, background: 'var(--cyan)', borderRadius: 4,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Zap size={13} color="#0e0f11" strokeWidth={2.5} />
        </div>
        <span style={{ fontWeight: 800, fontSize: 13, letterSpacing: '0.08em' }}>COMMS</span>
      </div>

      {/* Nav */}
      <div style={{ display: 'flex', gap: 2, WebkitAppRegion: 'no-drag' }}>
        {NAV.map(({ id, icon: Icon, label }) => (
          <button key={id} onClick={() => setActivePanel(id)} style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '0 14px',
            height: 'var(--titlebar-h)', fontSize: 12, fontWeight: 600, letterSpacing: '0.06em',
            color: activePanel === id ? 'var(--cyan)' : 'var(--text-muted)',
            borderBottom: activePanel === id ? '2px solid var(--cyan)' : '2px solid transparent',
            background: activePanel === id ? 'var(--cyan-dim)' : 'transparent', transition: 'all 0.15s',
          }}>
            <Icon size={13} />{label}
          </button>
        ))}
      </div>

      <div style={{ flex: 1 }} />

      {/* Logout */}
      {onLogout && (
        <button onClick={onLogout} style={{
          display: 'flex', alignItems: 'center', gap: 5,
          padding: '4px 12px', marginRight: 8, borderRadius: 4,
          color: 'var(--text-muted)', fontSize: 11, fontFamily: 'var(--font-mono)',
          WebkitAppRegion: 'no-drag', transition: 'color 0.1s',
        }}
        onMouseEnter={e => e.currentTarget.style.color = 'var(--red)'}
        onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}>
          <LogOut size={12} /> Sign out
        </button>
      )}

      {/* Window controls */}
      <div style={{ display: 'flex', WebkitAppRegion: 'no-drag' }}>
        {[
          { icon: Minus,  action: api?.minimizeWindow, hover: 'var(--bg-hover)' },
          { icon: Square, action: api?.maximizeWindow, hover: 'var(--bg-hover)' },
          { icon: X,      action: api?.closeWindow,    hover: 'var(--red)'      },
        ].map(({ icon: Icon, action, hover }, i) => (
          <button key={i} onClick={action} style={{
            width: 46, height: 'var(--titlebar-h)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--text-muted)', transition: 'background 0.1s, color 0.1s',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = hover; if (i === 2) e.currentTarget.style.color = '#fff' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-muted)' }}>
            <Icon size={12} />
          </button>
        ))}
      </div>
    </div>
  )
}
