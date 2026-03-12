import { useState, useEffect } from 'react'
import { Search, Settings, ChevronDown, UserPlus, Check, X, Users } from 'lucide-react'
import { useSocket, API } from '../SocketContext'

export function nameToColor(name) {
  const colors = ['#00d4ff','#00ff88','#ffaa00','#c084fc','#ff6b9d','#4ade80','#f59e0b','#60a5fa']
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return colors[Math.abs(hash) % colors.length]
}

function Avatar({ name, color, size = 32 }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: size * 0.25,
      background: `${color}22`, border: `1px solid ${color}55`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.38, fontWeight: 700, color, fontFamily: 'var(--font-mono)', flexShrink: 0,
    }}>
      {name?.[0]?.toUpperCase()}
    </div>
  )
}

function ContactRow({ contact, active, onClick, unread }) {
  const [hover, setHover] = useState(false)
  return (
    <button onClick={onClick}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{
        width: '100%', padding: '7px 12px',
        display: 'flex', alignItems: 'center', gap: 10,
        background: active ? 'var(--bg-hover)' : hover ? 'var(--bg-raised)' : 'transparent',
        borderLeft: active ? '2px solid var(--cyan)' : '2px solid transparent',
        transition: 'all 0.1s', textAlign: 'left',
      }}>
      <div style={{ position: 'relative' }}>
        <Avatar name={contact.username} color={contact.color} size={32} />
        <div style={{
          position: 'absolute', bottom: -1, right: -1, width: 9, height: 9, borderRadius: '50%',
          background: 'var(--green)', border: '2px solid var(--bg-surface)',
        }} />
      </div>
      <div style={{ flex: 1, overflow: 'hidden' }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: active ? 'var(--text-primary)' : 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {contact.username}
        </div>
        <div style={{ fontSize: 10, color: 'var(--green)', fontFamily: 'var(--font-mono)' }}>online</div>
      </div>
      {unread > 0 && (
        <div style={{
          minWidth: 18, height: 18, borderRadius: 9, padding: '0 5px',
          background: 'var(--red)', color: '#fff',
          fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {unread > 9 ? '9+' : unread}
        </div>
      )}
    </button>
  )
}

function SectionHeader({ label, count, color, open, onToggle }) {
  return (
    <button onClick={onToggle} style={{
      width: '100%', padding: '5px 14px',
      display: 'flex', alignItems: 'center', gap: 6,
      color: 'var(--text-muted)', transition: 'color 0.1s',
    }}>
      <ChevronDown size={10} style={{ transform: open ? 'none' : 'rotate(-90deg)', transition: 'transform 0.15s', color }} />
      <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', fontFamily: 'var(--font-mono)', color }}>{label}</span>
      {count != null && <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>({count})</span>}
    </button>
  )
}

export default function Sidebar({ activeContact, setActiveContact, user, unread }) {
  const { onlineUsers, connected } = useSocket() || {}
  const [search, setSearch]         = useState('')
  const [focused, setFocused]       = useState(false)
  const [friends, setFriends]       = useState([])
  const [pendingIn, setPendingIn]   = useState([])
  const [addUsername, setAddUsername] = useState('')
  const [showAdd, setShowAdd]       = useState(false)
  const [addMsg, setAddMsg]         = useState('')
  const [sections, setSections]     = useState({ online: true, friends: true, requests: true })

  const myColor = nameToColor(user?.username || '')

  const loadFriends = () => {
    if (!user?.token) return
    fetch(`${API}/friends`, { headers: { Authorization: `Bearer ${user.token}` } })
      .then(r => r.json())
      .then(data => {
        setFriends(data.friends || [])
        setPendingIn(data.pendingIn || [])
      })
      .catch(() => {})
  }

  useEffect(() => { loadFriends() }, [user?.token])

  const sendFriendRequest = async () => {
    if (!addUsername.trim()) return
    setAddMsg('')
    try {
      const res  = await fetch(`${API}/friends/add`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${user.token}` },
        body: JSON.stringify({ username: addUsername.trim() }),
      })
      const data = await res.json()
      setAddMsg(res.ok ? `✅ Request sent to ${data.target?.username}` : `❌ ${data.error}`)
      if (res.ok) { setAddUsername(''); loadFriends() }
    } catch { setAddMsg('❌ Server error') }
  }

  const acceptFriend = async (fromId) => {
    await fetch(`${API}/friends/accept`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${user.token}` },
      body: JSON.stringify({ fromId }),
    })
    loadFriends()
  }

  const removeFriend = async (friendId) => {
    await fetch(`${API}/friends/remove`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${user.token}` },
      body: JSON.stringify({ friendId }),
    })
    loadFriends()
  }

  const toggle = (key) => setSections(s => ({ ...s, [key]: !s[key] }))

  // Online users with color + merged with friend data
  const online = (onlineUsers || [])
    .filter(u => u.username?.toLowerCase().includes(search.toLowerCase()))
    .map(u => ({ ...u, socketId: u.socketId || u.id, color: nameToColor(u.username) }))

  // Friends who are online — show in online section, not duplicated
  const onlineIds = new Set(online.map(u => u.username))
  const offlineFriends = friends.filter(f => !onlineIds.has(f.username))

  return (
    <aside style={{
      width: 'var(--sidebar-w)', background: 'var(--bg-surface)',
      borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column',
      flexShrink: 0, overflow: 'hidden',
    }}>
      {/* Search */}
      <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)' }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          background: focused ? 'var(--bg-hover)' : 'var(--bg-raised)',
          border: `1px solid ${focused ? 'var(--border-lit)' : 'transparent'}`,
          borderRadius: 'var(--radius-sm)', padding: '6px 10px', transition: 'all 0.15s',
        }}>
          <Search size={12} color="var(--text-muted)" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
            placeholder="Search..."
            style={{ flex: 1, fontSize: 12, color: 'var(--text-secondary)', background: 'none' }} />
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', paddingTop: 4 }}>

        {/* ONLINE */}
        <SectionHeader label="ONLINE" count={online.length} color="var(--green)"
          open={sections.online} onToggle={() => toggle('online')} />
        {sections.online && (
          online.length === 0
            ? <div style={{ padding: '8px 16px 4px', fontSize: 11, color: 'var(--text-muted)' }}>Nobody else online</div>
            : online.map(u => (
                <ContactRow key={u.socketId} contact={u} active={activeContact?.socketId === u.socketId}
                  unread={unread?.[u.socketId] || 0}
                  onClick={() => setActiveContact(u)} />
              ))
        )}

        {/* FRIEND REQUESTS */}
        {pendingIn.length > 0 && (
          <>
            <SectionHeader label="REQUESTS" count={pendingIn.length} color="var(--amber)"
              open={sections.requests} onToggle={() => toggle('requests')} />
            {sections.requests && pendingIn.map(f => (
              <div key={f.id} style={{
                padding: '6px 12px', display: 'flex', alignItems: 'center', gap: 8,
              }}>
                <Avatar name={f.username} color={nameToColor(f.username)} size={28} />
                <span style={{ flex: 1, fontSize: 12, color: 'var(--text-secondary)' }}>{f.username}</span>
                <button onClick={() => acceptFriend(f.id)} style={{
                  width: 22, height: 22, borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: 'var(--green-dim)', color: 'var(--green)', border: '1px solid var(--green)',
                }}>
                  <Check size={11} />
                </button>
                <button onClick={() => removeFriend(f.id)} style={{
                  width: 22, height: 22, borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: 'var(--red-dim)', color: 'var(--red)', border: '1px solid var(--red)',
                }}>
                  <X size={11} />
                </button>
              </div>
            ))}
          </>
        )}

        {/* FRIENDS (offline) */}
        {offlineFriends.length > 0 && (
          <>
            <SectionHeader label="FRIENDS" count={offlineFriends.length} color="var(--text-muted)"
              open={sections.friends} onToggle={() => toggle('friends')} />
            {sections.friends && offlineFriends.map(f => (
              <div key={f.id} style={{ padding: '6px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ position: 'relative' }}>
                  <Avatar name={f.username} color={nameToColor(f.username)} size={32} />
                  <div style={{ position: 'absolute', bottom: -1, right: -1, width: 9, height: 9, borderRadius: '50%', background: 'var(--text-muted)', border: '2px solid var(--bg-surface)' }} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 500 }}>{f.username}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>offline</div>
                </div>
              </div>
            ))}
          </>
        )}

        {/* Add friend */}
        <div style={{ padding: '8px 12px', marginTop: 4 }}>
          <button onClick={() => { setShowAdd(s => !s); setAddMsg('') }} style={{
            width: '100%', padding: '7px 10px', borderRadius: 6,
            border: '1px dashed var(--border)', color: 'var(--text-muted)',
            fontSize: 11, display: 'flex', alignItems: 'center', gap: 6,
            transition: 'all 0.15s',
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--cyan)'; e.currentTarget.style.color = 'var(--cyan)' }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-muted)' }}>
            <UserPlus size={12} /> Add Friend
          </button>

          {showAdd && (
            <div style={{ marginTop: 8 }}>
              <div style={{ display: 'flex', gap: 4 }}>
                <input value={addUsername} onChange={e => setAddUsername(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && sendFriendRequest()}
                  placeholder="Username..."
                  style={{
                    flex: 1, padding: '6px 8px', borderRadius: 4, fontSize: 12,
                    background: 'var(--bg-raised)', border: '1px solid var(--border-lit)',
                    color: 'var(--text-primary)', fontFamily: 'var(--font-mono)',
                  }} />
                <button onClick={sendFriendRequest} style={{
                  padding: '6px 10px', borderRadius: 4, background: 'var(--cyan)', color: '#0e0f11',
                  fontSize: 11, fontWeight: 700,
                }}>
                  Add
                </button>
              </div>
              {addMsg && (
                <div style={{ fontSize: 11, marginTop: 6, color: addMsg.startsWith('✅') ? 'var(--green)' : 'var(--red)', fontFamily: 'var(--font-mono)' }}>
                  {addMsg}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div style={{ borderTop: '1px solid var(--border)', padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{
          width: 28, height: 28, borderRadius: 6,
          background: `${myColor}22`, border: `1px solid ${myColor}44`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 11, fontWeight: 700, color: myColor, fontFamily: 'var(--font-mono)',
        }}>
          {user?.username?.[0]?.toUpperCase()}
        </div>
        <div style={{ flex: 1, overflow: 'hidden' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {user?.username}
          </div>
          <div style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: connected ? 'var(--green)' : 'var(--red)' }}>
            {connected ? '● connected' : '● offline'}
          </div>
        </div>
      </div>
    </aside>
  )
}
