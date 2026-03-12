import { useState, useEffect } from 'react'
import { SocketProvider } from './SocketContext'
import LoginScreen from './components/LoginScreen'
import TitleBar from './components/TitleBar'
import Sidebar from './components/Sidebar'
import ChatPanel from './components/ChatPanel'
import VoicePanel from './components/VoicePanel'
import FilePanel from './components/FilePanel'
import NotificationSystem from './components/NotificationSystem'

export default function App() {
  const [user, setUser]                   = useState(null)
  const [activeContact, setActiveContact] = useState(null)
  const [activePanel, setActivePanel]     = useState('chat')
  const [unread, setUnread]               = useState({})

  useEffect(() => {
    const token    = localStorage.getItem('comms_token')
    const username = localStorage.getItem('comms_username')
    const id       = localStorage.getItem('comms_userId')
    if (token && username) {
      setUser({ token, username, id: id })
    }
  }, [])

  const handleLogin = (userData) => setUser(userData)

  const handleLogout = () => {
    localStorage.removeItem('comms_token')
    localStorage.removeItem('comms_username')
    localStorage.removeItem('comms_userId')
    setUser(null)
    setActiveContact(null)
  }

  const addUnread = (socketId) => {
    if (activeContact?.socketId === socketId) return
    setUnread(u => ({ ...u, [socketId]: (u[socketId] || 0) + 1 }))
  }

  const clearUnread = (socketId) => {
    setUnread(u => { const n = { ...u }; delete n[socketId]; return n })
  }

  if (!user) return <LoginScreen onLogin={handleLogin} />

  return (
    <SocketProvider user={user}>
      <NotificationSystem activeContact={activeContact} />
      <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'var(--bg-base)' }}>
        <TitleBar activePanel={activePanel} setActivePanel={setActivePanel} onLogout={handleLogout} username={user.username} />
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          <Sidebar
            activeContact={activeContact}
            setActiveContact={(contact) => { setActiveContact(contact); if (contact) clearUnread(contact.socketId) }}
            user={user}
            unread={unread}
          />
          <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ display: activePanel === 'chat' ? 'flex' : 'none', flex: 1, overflow: 'hidden' }}>
              <ChatPanel contact={activeContact} user={user} onNewMessage={addUnread} />
            </div>
            <div style={{ display: activePanel === 'voice' ? 'flex' : 'none', flex: 1, overflow: 'hidden' }}>
              <VoicePanel user={user} />
            </div>
            <div style={{ display: activePanel === 'files' ? 'flex' : 'none', flex: 1, overflow: 'hidden' }}>
              <FilePanel contact={activeContact} />
            </div>
          </main>
        </div>
      </div>
    </SocketProvider>
  )
}
