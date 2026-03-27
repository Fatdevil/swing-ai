import { useState, useRef, useEffect } from 'react';
import { useLanguage } from '../i18n/LanguageContext';

export default function FloatingChat() {
  const { language } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) inputRef.current?.focus();
  }, [isOpen]);

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || loading) return;

    const userMsg = { role: 'user', content: text };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          history: messages,
          language,
        }),
      });

      const data = await response.json();

      if (data.error) {
        setMessages(prev => [...prev, { role: 'assistant', content: '⚠️ ' + data.error }]);
      } else {
        setMessages(prev => [...prev, { role: 'assistant', content: data.reply }]);
      }
    } catch (err) {
      setMessages(prev => [...prev, { role: 'assistant', content: '⚠️ Kunde inte nå servern' }]);
    }

    setLoading(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const quickQuestions = language === 'sv'
    ? ['Hur fixar jag en slice?', 'Bästa uppvärmningen?', 'Vad är X-Factor?']
    : ['How do I fix a slice?', 'Best warm-up?', 'What is X-Factor?'];

  return (
    <>
      {/* Chat Panel */}
      {isOpen && (
        <div className="fixed bottom-36 right-4 z-50 w-[340px] max-w-[calc(100vw-2rem)] bg-surface-container-high rounded-2xl shadow-2xl border border-outline-variant/15 flex flex-col overflow-hidden"
          style={{ maxHeight: 'min(500px, 70vh)' }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-surface-container border-b border-outline-variant/10">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-primary-fixed/15 flex items-center justify-center">
                <span className="text-sm">🏌️</span>
              </div>
              <div>
                <h4 className="font-headline font-bold text-xs text-on-surface">SWING AI Coach</h4>
                <p className="text-[9px] text-on-surface-variant">Gemini Flash · {language === 'sv' ? 'Alltid online' : 'Always online'}</p>
              </div>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="w-7 h-7 rounded-full hover:bg-surface-container-highest flex items-center justify-center transition-colors"
            >
              <span className="material-symbols-outlined text-on-surface-variant text-lg">close</span>
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3 min-h-[200px]">
            {messages.length === 0 && (
              <div className="space-y-3">
                <p className="text-on-surface-variant text-xs text-center py-2">
                  {language === 'sv'
                    ? 'Hej! Fråga mig vad som helst om golf 🏌️'
                    : 'Hi! Ask me anything about golf 🏌️'}
                </p>
                {/* Quick questions */}
                <div className="flex flex-wrap gap-1.5 justify-center">
                  {quickQuestions.map((q, i) => (
                    <button
                      key={i}
                      onClick={() => { setInput(q); inputRef.current?.focus(); }}
                      className="px-3 py-1.5 bg-primary-fixed/8 text-primary-fixed text-[10px] rounded-full border border-primary-fixed/15 hover:bg-primary-fixed/15 transition-colors"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] px-3 py-2 rounded-2xl text-xs leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-primary-fixed text-on-primary-fixed rounded-br-md'
                    : 'bg-surface-container text-on-surface rounded-bl-md'
                }`}>
                  {msg.content}
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex justify-start">
                <div className="bg-surface-container text-on-surface-variant px-3 py-2 rounded-2xl rounded-bl-md text-xs">
                  <span className="inline-flex gap-1">
                    <span className="w-1.5 h-1.5 bg-primary-fixed rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-1.5 h-1.5 bg-primary-fixed rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-1.5 h-1.5 bg-primary-fixed rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </span>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="px-3 py-2 border-t border-outline-variant/10 bg-surface-container/50">
            <div className="flex items-center gap-2">
              <input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={language === 'sv' ? 'Ställ en fråga...' : 'Ask a question...'}
                className="flex-1 bg-surface-container-highest text-on-surface text-xs rounded-full px-4 py-2.5 outline-none placeholder:text-on-surface-variant/40 border border-outline-variant/10 focus:border-primary-fixed/30 transition-colors"
                disabled={loading}
              />
              <button
                onClick={sendMessage}
                disabled={!input.trim() || loading}
                className="w-9 h-9 rounded-full bg-primary-fixed text-on-primary-fixed flex items-center justify-center disabled:opacity-30 transition-all active:scale-90 shrink-0"
              >
                <span className="material-symbols-outlined text-base">send</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FAB Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`fixed bottom-[5.5rem] right-4 z-50 w-14 h-14 rounded-full flex items-center justify-center shadow-lg transition-all active:scale-90 ${
          isOpen
            ? 'bg-surface-container-high border border-outline-variant/20 rotate-0'
            : 'kinetic-gradient shadow-[0_4px_20px_rgba(157,255,0,0.3)]'
        }`}
      >
        {isOpen ? (
          <span className="material-symbols-outlined text-on-surface text-xl">close</span>
        ) : (
          <span className="text-2xl">🏌️</span>
        )}
        {/* Notification dot */}
        {!isOpen && messages.length === 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 bg-secondary rounded-full border-2 border-surface animate-pulse" />
        )}
      </button>
    </>
  );
}
