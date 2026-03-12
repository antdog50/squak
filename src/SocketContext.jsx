import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { io } from 'socket.io-client'

const SocketContext = createContext(null)
export const API = 'http://localhost:3001'

export function SocketProvider({ user, children }) {
  const socketRef  = useRef(null)
  const [connected, setConnected]   = useState(false)
  const [onlineUsers, setOnlineUsers] = useState([])

  useEffect(() => {
    if (!user) return
    const socket = io(API, { autoConnect: true })
    socketRef.current = socket

    socket.on('connect', () => {
      setConnected(true)
      socket.emit('user:register', { username: user.username, token: user.token, userId: user.id })
    })
    socket.on('disconnect', () => setConnected(false))

    socket.on('users:list', (users) => {
      setOnlineUsers(users.filter(u => u.username !== user.username))
    })
    socket.on('user:joined', (u) => {
      if (u.username === user.username) return
      setOnlineUsers(prev => prev.find(x => x.socketId === u.socketId) ? prev : [...prev, u])
    })
    socket.on('user:left', ({ id }) => {
      setOnlineUsers(prev => prev.filter(u => u.socketId !== id))
    })

    return () => socket.disconnect()
  }, [user?.username])

  return (
    <SocketContext.Provider value={{ socket: socketRef.current, connected, onlineUsers, user }}>
      {children}
    </SocketContext.Provider>
  )
}

export const useSocket = () => useContext(SocketContext)
