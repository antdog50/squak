import { useState, useEffect, useRef } from 'react'
import { Upload, Download, FolderOpen, CheckCircle, Clock, AlertCircle, X, File, Image, Archive, Film, PackageOpen } from 'lucide-react'
import { useSocket } from '../SocketContext'

const MAX_FILE_SIZE = 100 * 1024 * 1024 // 100MB
const CHUNK_SIZE    = 64 * 1024          // 64KB

const FILE_ICON = (name) => {
  const ext = (name || '').split('.').pop().toLowerCase()
  if (['mp4','mov','avi','mkv'].includes(ext))       return Film
  if (['png','jpg','jpeg','gif','webp'].includes(ext)) return Image
  if (['zip','tar','gz','rar','7z'].includes(ext))    return Archive
  return File
}

const STATUS_CONFIG = {
  done:        { color: 'var(--green)', icon: CheckCircle, label: 'Complete'     },
  sending:     { color: 'var(--cyan)',  icon: Clock,       label: 'Sending'      },
  receiving:   { color: 'var(--cyan)',  icon: Clock,       label: 'Receiving'    },
  queued:      { color: 'var(--amber)', icon: Clock,       label: 'Waiting'      },
  error:       { color: 'var(--red)',   icon: AlertCircle, label: 'Error'        },
  incoming:    { color: 'var(--amber)', icon: PackageOpen, label: 'Incoming'     },
}

function formatSize(bytes) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  if (bytes >= 1024)        return `${(bytes / 1024).toFixed(0)} KB`
  return `${bytes} B`
}

export default function FilePanel({ contact }) {
  const { socket, username } = useSocket() || {}
  const [transfers, setTransfers]   = useState([])
  const [dragging, setDragging]     = useState(false)

  // Accumulate incoming chunks: { fileId -> { chunks[], received, total, meta } }
  const incomingRef = useRef({})

  // ── Socket listeners ─────────────────────────────────────────────────
  useEffect(() => {
    if (!socket) return

    // Someone wants to send us a file
    socket.on('file:offer', (meta) => {
      setTransfers(prev => [...prev, {
        id:          meta.fileId,
        name:        meta.name,
        size:        formatSize(meta.size),
        direction:   'in',
        status:      'incoming',
        progress:    0,
        from:        meta.fromUsername,
        fromId:      meta.fromId,
        mimeType:    meta.mimeType,
        totalBytes:  meta.size,
      }])
      // Auto-accept
      socket.emit('file:accept', { fileId: meta.fileId, toSocketId: meta.fromId })
      incomingRef.current[meta.fileId] = { chunks: [], received: 0, total: meta.size, name: meta.name, mimeType: meta.mimeType }
    })

    // Our offer was accepted — start sending
    socket.on('file:accepted', ({ fileId }) => {
      setTransfers(prev => prev.map(t => t.id === fileId ? { ...t, status: 'sending' } : t))
      // Grab the pending file from the ref and stream it
      if (pendingSends.current[fileId]) {
        streamFile(fileId, pendingSends.current[fileId])
        delete pendingSends.current[fileId]
      }
    })

    // Incoming chunk
    socket.on('file:chunk', ({ fileId, chunk, chunkIndex, totalChunks }) => {
      const entry = incomingRef.current[fileId]
      if (!entry) return
      entry.chunks[chunkIndex] = chunk
      entry.received += chunk.byteLength || chunk.length || 0

      const progress = Math.round((chunkIndex + 1) / totalChunks * 100)
      setTransfers(prev => prev.map(t => t.id === fileId ? { ...t, status: 'receiving', progress } : t))
    })

    // Transfer complete — assemble and offer download
    socket.on('file:done', ({ fileId }) => {
      const entry = incomingRef.current[fileId]
      if (!entry) return

      const blob = new Blob(entry.chunks, { type: entry.mimeType || 'application/octet-stream' })
      const url  = URL.createObjectURL(blob)

      setTransfers(prev => prev.map(t =>
        t.id === fileId ? { ...t, status: 'done', progress: 100, downloadUrl: url, downloadName: entry.name } : t
      ))
      delete incomingRef.current[fileId]
    })

    socket.on('file:error', ({ fileId, message }) => {
      setTransfers(prev => prev.map(t => t.id === fileId ? { ...t, status: 'error', errorMsg: message } : t))
    })

    return () => {
      socket.off('file:offer')
      socket.off('file:accepted')
      socket.off('file:chunk')
      socket.off('file:done')
      socket.off('file:error')
    }
  }, [socket])

  // ── Sending logic ─────────────────────────────────────────────────────
  const pendingSends = useRef({})

  const sendFile = (file) => {
    if (!socket || !contact) return
    if (file.size > MAX_FILE_SIZE) {
      alert('File exceeds 100MB limit')
      return
    }

    const fileId = `${Date.now()}-${Math.random().toString(36).slice(2)}`

    setTransfers(prev => [...prev, {
      id:        fileId,
      name:      file.name,
      size:      formatSize(file.size),
      direction: 'out',
      status:    'queued',
      progress:  0,
      from:      username,
    }])

    // Store file so we can stream after acceptance
    pendingSends.current[fileId] = file

    socket.emit('file:offer', {
      toSocketId: contact.socketId,
      fileId,
      name:       file.name,
      size:       file.size,
      mimeType:   file.type,
    })
  }

  const streamFile = async (fileId, file) => {
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE)

    for (let i = 0; i < totalChunks; i++) {
      const start  = i * CHUNK_SIZE
      const end    = Math.min(start + CHUNK_SIZE, file.size)
      const slice  = file.slice(start, end)
      const buffer = await slice.arrayBuffer()

      socket.emit('file:chunk', {
        toSocketId: contact.socketId,
        fileId,
        chunk:       buffer,
        chunkIndex:  i,
        totalChunks,
      })

      const progress = Math.round((i + 1) / totalChunks * 100)
      setTransfers(prev => prev.map(t => t.id === fileId ? { ...t, progress } : t))

      // Small yield so UI stays responsive
      await new Promise(r => setTimeout(r, 0))
    }

    socket.emit('file:done', { toSocketId: contact.socketId, fileId })
    setTransfers(prev => prev.map(t => t.id === fileId ? { ...t, status: 'done', progress: 100 } : t))
  }

  // ── Drag and drop ─────────────────────────────────────────────────────
  const onDrop = (e) => {
    e.preventDefault()
    setDragging(false)
    if (!contact) { alert('Select a contact first'); return }
    Array.from(e.dataTransfer.files).forEach(sendFile)
  }

  const onFileInput = (e) => {
    if (!contact) { alert('Select a contact first'); return }
    Array.from(e.target.files).forEach(sendFile)
    e.target.value = ''
  }

  const removeTransfer = (id) => setTransfers(t => t.filter(x => x.id !== id))

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{
        padding: '0 20px', height: 52,
        display: 'flex', alignItems: 'center', gap: 12,
        borderBottom: '1px solid var(--border)', background: 'var(--bg-surface)', flexShrink: 0,
      }}>
        <span style={{ fontSize: 14, fontWeight: 700 }}>File Transfers</span>
        {contact && (
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>→ {contact.username}</span>
        )}
        <div style={{ flex: 1 }} />
        <label style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '6px 14px', borderRadius: 6,
          background: contact ? 'var(--cyan)' : 'var(--bg-raised)',
          color: contact ? '#0e0f11' : 'var(--text-muted)',
          fontSize: 12, fontWeight: 700, cursor: contact ? 'pointer' : 'default',
          transition: 'opacity 0.1s',
        }}
        onMouseEnter={e => { if (contact) e.currentTarget.style.opacity = '0.85' }}
        onMouseLeave={e => e.currentTarget.style.opacity = '1'}
        >
          <Upload size={13} />
          Send File
          <input type="file" multiple onChange={onFileInput} style={{ display: 'none' }} />
        </label>
      </div>

      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {/* Drop zone */}
        <div
          onDragOver={e => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          style={{
            margin: '16px 20px 0',
            padding: '20px',
            border: `2px dashed ${dragging ? 'var(--cyan)' : 'var(--border)'}`,
            borderRadius: 'var(--radius-lg)',
            background: dragging ? 'var(--cyan-dim)' : 'var(--bg-raised)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12,
            transition: 'all 0.2s', flexShrink: 0,
          }}
        >
          <FolderOpen size={20} color={dragging ? 'var(--cyan)' : 'var(--text-muted)'} />
          <span style={{ fontSize: 13, color: dragging ? 'var(--cyan)' : 'var(--text-muted)' }}>
            {!contact
              ? 'Select a contact to send files'
              : dragging
                ? `Drop to send to ${contact.username}`
                : `Drag files here to send to ${contact.username} · max 100MB`
            }
          </span>
        </div>

        {/* Transfer list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 20px' }}>
          {transfers.length === 0 && (
            <div style={{ textAlign: 'center', marginTop: 40, color: 'var(--text-muted)', fontSize: 13 }}>
              No transfers yet — drag a file or click Send File
            </div>
          )}
          {[...transfers].reverse().map(t => {
            const cfg      = STATUS_CONFIG[t.status] || STATUS_CONFIG.queued
            const IconFile = FILE_ICON(t.name)
            return (
              <div key={t.id} style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '10px 14px', marginBottom: 6,
                background: 'var(--bg-raised)',
                border: `1px solid ${['sending','receiving'].includes(t.status) ? 'var(--border-lit)' : 'var(--border)'}`,
                borderRadius: 'var(--radius)',
                animation: 'slide-in-up 0.15s ease',
              }}>
                {/* Direction */}
                <div style={{
                  width: 32, height: 32, borderRadius: 7, flexShrink: 0,
                  background: t.direction === 'in' ? 'var(--green-dim)' : 'var(--cyan-dim)',
                  border: `1px solid ${t.direction === 'in' ? 'var(--green)' : 'var(--cyan)'}44`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: t.direction === 'in' ? 'var(--green)' : 'var(--cyan)',
                }}>
                  {t.direction === 'in' ? <Download size={14} /> : <Upload size={14} />}
                </div>

                {/* Info */}
                <div style={{ flex: 1, overflow: 'hidden', minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <IconFile size={11} color="var(--text-muted)" />
                    <span style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {t.name}
                    </span>
                    <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', flexShrink: 0 }}>
                      {t.size}
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                    <div style={{ flex: 1, height: 3, background: 'var(--bg-hover)', borderRadius: 2, overflow: 'hidden' }}>
                      <div style={{
                        height: '100%', width: `${t.progress}%`,
                        background: cfg.color, borderRadius: 2, transition: 'width 0.2s',
                        boxShadow: ['sending','receiving'].includes(t.status) ? `0 0 6px ${cfg.color}` : 'none',
                      }} />
                    </div>
                    <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: cfg.color, width: 28, textAlign: 'right' }}>
                      {t.progress}%
                    </span>
                  </div>

                  <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                    {t.direction === 'in' ? `from ${t.from}` : `to ${contact?.username ?? '?'}`} · {cfg.label}
                    {t.errorMsg && <span style={{ color: 'var(--red)' }}> — {t.errorMsg}</span>}
                  </div>
                </div>

                {/* Download button for completed incoming files */}
                {t.status === 'done' && t.downloadUrl && (
                  <a
                    href={t.downloadUrl}
                    download={t.downloadName}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 5,
                      padding: '5px 10px', borderRadius: 5, flexShrink: 0,
                      background: 'var(--green-dim)', border: '1px solid var(--green)',
                      color: 'var(--green)', fontSize: 11, fontWeight: 700, textDecoration: 'none',
                      transition: 'opacity 0.1s',
                    }}
                    onMouseEnter={e => e.currentTarget.style.opacity = '0.8'}
                    onMouseLeave={e => e.currentTarget.style.opacity = '1'}
                  >
                    <Download size={11} />
                    Save
                  </a>
                )}

                {/* Remove */}
                {t.status !== 'sending' && t.status !== 'receiving' && (
                  <button
                    onClick={() => removeTransfer(t.id)}
                    style={{ color: 'var(--text-muted)', padding: 4, borderRadius: 4, flexShrink: 0, transition: 'color 0.1s' }}
                    onMouseEnter={e => e.currentTarget.style.color = 'var(--red)'}
                    onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}
                  >
                    <X size={13} />
                  </button>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
