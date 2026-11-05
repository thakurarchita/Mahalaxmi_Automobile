import { useEffect, useRef, useState } from 'react'
import { Bot, MessageCircle, Send, Trash2, X } from 'lucide-react'
import { api } from '../../api/client'
import './chatbot.css'

const SUGGESTIONS = ["Today's sales", 'Sales this month', 'Low stock items', 'Who owes the most?', 'Last 5 invoices', 'Best selling parts']
const WELCOME = { from: 'bot', text: 'Hello! I\'m your business assistant. Ask me about stock, sales, profit or dues — or tap a suggestion below.' }

export default function Chatbot() {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState([WELCOME])
  const [input, setInput] = useState('')
  const [typing, setTyping] = useState(false)
  const endRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }) }, [messages, typing, open])
  useEffect(() => { if (open) inputRef.current?.focus() }, [open])

  async function send(text) {
    const message = text.trim()
    if (!message || typing) return
    setMessages((list) => [...list, { from: 'user', text: message }])
    setInput('')
    setTyping(true)
    try {
      const { reply } = await api('/chat', { method: 'POST', body: JSON.stringify({ message }) })
      setMessages((list) => [...list, { from: 'bot', text: reply }])
    } catch (cause) {
      setMessages((list) => [...list, { from: 'bot', text: cause.message, error: true }])
    } finally {
      setTyping(false)
    }
  }

  function submit(event) {
    event.preventDefault()
    send(input)
  }

  return (
    <div className="chatbot">
      {open && (
        <section className="chat-panel" role="dialog" aria-label="Business assistant">
          <header className="chat-head">
            <span className="chat-avatar"><Bot size={18} /></span>
            <div><b>Business assistant</b><small>Answers from your own records</small></div>
            <button type="button" className="chat-icon" title="Clear chat" aria-label="Clear chat" onClick={() => setMessages([WELCOME])}><Trash2 size={15} /></button>
            <button type="button" className="chat-icon" title="Close" aria-label="Close chat" onClick={() => setOpen(false)}><X size={17} /></button>
          </header>
          <div className="chat-body" aria-live="polite">
            {messages.map((message, index) => (
              <div key={index} className={`chat-row ${message.from}`}>
                <div className={`chat-bubble ${message.error ? 'error' : ''}`}>{message.text}</div>
              </div>
            ))}
            {typing && <div className="chat-row bot"><div className="chat-bubble typing" aria-label="Assistant is typing"><i /><i /><i /></div></div>}
            <div ref={endRef} />
          </div>
          <div className="chat-chips">
            {SUGGESTIONS.map((item) => <button key={item} type="button" disabled={typing} onClick={() => send(item)}>{item}</button>)}
          </div>
          <form className="chat-input" onSubmit={submit}>
            <input ref={inputRef} value={input} onChange={(event) => setInput(event.target.value)} maxLength={300} placeholder="Ask about stock, sales, dues…" aria-label="Your question" />
            <button type="submit" disabled={!input.trim() || typing} aria-label="Send"><Send size={16} /></button>
          </form>
        </section>
      )}
      <button type="button" className="chat-fab" onClick={() => setOpen((value) => !value)} aria-label={open ? 'Close assistant' : 'Open assistant'}>
        {open ? <X size={22} /> : <><MessageCircle size={20} /><span>Assistant</span></>}
      </button>
    </div>
  )
}
