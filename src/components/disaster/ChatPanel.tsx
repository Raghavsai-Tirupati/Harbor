import { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, X, MapPin, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

/* ── Shared types ─────────────────────────────────────────────────── */

export interface MapContext {
  type: 'location' | 'event';
  lat: number;
  lon: number;
  title?: string;
  category?: string;
  sources?: { url?: string }[];
}

export interface ToolCommand {
  tool: string;
  args: Record<string, any>;
}

export interface EventSummary {
  title: string;
  category: string;
  lat: number;
  lon: number;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

/* ── Gemini REST API call ─────────────────────────────────────────── */

async function callGemini(systemPrompt: string, messages: Message[]): Promise<string> {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  if (!apiKey) return 'Gemini API key not configured. Add VITE_GEMINI_API_KEY to your .env file.';

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: messages.map((m) => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: m.content }],
        })),
        generationConfig: { maxOutputTokens: 1024, temperature: 0.7 },
      }),
    },
  );

  if (!res.ok) {
    const errText = await res.text();
    console.error('Gemini error', res.status, errText);
    throw new Error(`Gemini API error (${res.status})`);
  }

  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || 'No response generated.';
}

/* ── System prompt (includes map-control tool protocol) ───────────── */

function buildSystemPrompt(
  ctx: MapContext | null,
  activeEvents: EventSummary[],
): string {
  const parts = [
    'You are Harbor AI, a disaster preparedness and safety assistant.',
    'Help users understand hazard risks, find safety resources, and stay informed.',
    '',
    'RULES:',
    '1. Never invent shelter addresses, phone numbers, or URLs.',
    '2. If unsure, say so clearly.',
    '3. Provide actionable safety advice.',
    '4. For immediate danger, advise calling emergency services (911 US, 112 EU).',
    '5. Be concise but thorough. Use markdown bold (**text**) and bullet lists.',
    '6. Prioritize safety information.',
    '',
    'MAP CONTROL:',
    'You can control the interactive globe map. When the user asks to show, find,',
    'locate, zoom to, or navigate to a place or disaster, append a special command',
    'line as the VERY LAST line of your response.',
    '',
    'Format (must be the last line, valid JSON):',
    'TOOL_COMMANDS:[{"tool":"<name>","args":{...}}]',
    '',
    'Available tools:',
    '- map.flyTo: Pan/zoom the globe. Args: {"lng":<number>,"lat":<number>,"zoom":<2-18>}',
    '  Use for cities, countries, or any coordinates.',
    '- map.highlightEvent: Zoom to a disaster event and open its info popup.',
    '  Args: {"title":"<exact title from ACTIVE EVENTS list>"}',
    '',
    'Rules for tool commands:',
    '- ALWAYS write your text response FIRST, then the TOOL_COMMANDS line at the end.',
    '- For map.highlightEvent, use an EXACT title from the ACTIVE EVENTS list below.',
    '- If no matching event exists for the user\'s request, use map.flyTo to the area and explain what is nearby.',
    '- Only emit TOOL_COMMANDS when the user asks to see/show/find/go to something on the map.',
    '- You can combine multiple commands: TOOL_COMMANDS:[{...},{...}]',
    '',
  ];

  if (activeEvents.length > 0) {
    parts.push('ACTIVE EONET EVENTS (use exact titles for map.highlightEvent):');
    for (const e of activeEvents) {
      parts.push(`- "${e.title}" | ${e.category} | ${e.lon.toFixed(1)}, ${e.lat.toFixed(1)}`);
    }
    parts.push('');
  }

  if (ctx?.type === 'event') {
    parts.push('CURRENTLY SELECTED EVENT:');
    if (ctx.title) parts.push(`- Title: ${ctx.title}`);
    if (ctx.category) parts.push(`- Category: ${ctx.category}`);
    parts.push(`- Coordinates: ${ctx.lat.toFixed(4)}, ${ctx.lon.toFixed(4)}`);
    if (ctx.sources?.length) {
      const urls = ctx.sources.filter((s) => s.url).map((s) => s.url);
      if (urls.length) parts.push(`- Official sources: ${urls.join(', ')}`);
    }
    parts.push('', 'Use this event context to provide relevant, specific advice.');
  } else if (ctx?.type === 'location') {
    parts.push(`SELECTED LOCATION: ${ctx.lat.toFixed(4)}, ${ctx.lon.toFixed(4)}`);
    parts.push('', 'Consider what disasters might affect this geographic area.');
  }

  return parts.join('\n');
}

/* ── Parse response: extract display text + tool commands ─────────── */

function parseResponse(raw: string): { text: string; commands: ToolCommand[] } {
  const marker = 'TOOL_COMMANDS:';
  const idx = raw.lastIndexOf(marker);
  if (idx === -1) return { text: raw.trim(), commands: [] };

  const text = raw.slice(0, idx).replace(/```\s*$/, '').trim();
  const jsonStr = raw.slice(idx + marker.length).replace(/```/g, '').trim();

  try {
    const parsed = JSON.parse(jsonStr);
    return { text, commands: Array.isArray(parsed) ? parsed : [parsed] };
  } catch {
    return { text: raw.trim(), commands: [] };
  }
}

/* ── Quick action buttons ─────────────────────────────────────────── */

function getQuickActions(ctx: MapContext | null): { label: string; prompt: string }[] {
  if (ctx?.type === 'event') {
    const cat = ctx.category || 'this disaster';
    return [
      { label: 'What should I do?', prompt: `What should I do during ${cat}? Give me immediate action steps.` },
      { label: 'Find shelters', prompt: 'Where can I find nearby emergency shelters and resources?' },
      { label: 'Safety tips', prompt: `What are the key safety tips for ${cat}?` },
    ];
  }
  if (ctx?.type === 'location') {
    return [
      { label: 'Risks here?', prompt: 'What kinds of natural disasters or hazards could affect this location?' },
      { label: 'Find shelters', prompt: 'How can I find emergency shelters near this location?' },
      { label: 'Prepare', prompt: 'How should I prepare for emergencies in this area?' },
    ];
  }
  return [
    { label: 'Show me a cyclone', prompt: 'Find and show me an active tropical cyclone on the map.' },
    { label: 'Active disasters', prompt: 'What major natural disasters are happening right now? Show me the most significant one.' },
    { label: 'Emergency kit', prompt: 'What should I include in a basic emergency preparedness kit?' },
  ];
}

/* ── Simple markdown → HTML ───────────────────────────────────────── */

function renderMd(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/(?<!\*)\*(?!\*)(.*?)(?<!\*)\*(?!\*)/g, '<em>$1</em>')
    .replace(/^[-•]\s+(.+)$/gm, '<li>$1</li>')
    .replace(/\n/g, '<br/>');
}

/* ════════════════════════════════════════════════════════════════════ */

interface ChatPanelProps {
  selectedContext: MapContext | null;
  onClearContext: () => void;
  onCommand: (cmd: ToolCommand) => void;
  activeEvents: EventSummary[];
}

export default function ChatPanel({ selectedContext, onClearContext, onCommand, activeEvents }: ChatPanelProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  /* keep latest callback in ref so async send() always has it */
  const onCommandRef = useRef(onCommand);
  onCommandRef.current = onCommand;

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const send = async (text: string) => {
    if (!text.trim() || isLoading) return;
    const userMsg: Message = { role: 'user', content: text.trim() };
    const updated = [...messages, userMsg];
    setMessages(updated);
    setInput('');
    setIsLoading(true);

    try {
      const rawAnswer = await callGemini(buildSystemPrompt(selectedContext, activeEvents), updated);
      const { text: displayText, commands } = parseResponse(rawAnswer);
      setMessages((prev) => [...prev, { role: 'assistant', content: displayText }]);

      /* execute tool commands from the model */
      for (const cmd of commands) {
        onCommandRef.current(cmd);
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: 'Sorry, I encountered an error. For immediate help, contact your local emergency services.' },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const quickActions = getQuickActions(selectedContext);

  return (
    <div className="w-1/4 flex-shrink-0 flex flex-col h-full bg-card border-l border-border">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-disaster-purple/20 flex items-center justify-center">
            <Bot className="h-4 w-4 text-disaster-purple" />
          </div>
          <div>
            <h2 className="text-sm font-semibold">Harbor AI</h2>
            <p className="text-[10px] text-muted-foreground">Disaster assistant &middot; Map control</p>
          </div>
        </div>
      </div>

      {/* Context chip */}
      {selectedContext && (
        <div className="px-3 py-2 border-b border-border shrink-0">
          <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-muted text-xs">
            {selectedContext.type === 'event' ? (
              <AlertTriangle className="h-3 w-3 text-disaster-amber shrink-0" />
            ) : (
              <MapPin className="h-3 w-3 text-disaster-blue shrink-0" />
            )}
            <span className="truncate flex-1 text-foreground">
              {selectedContext.type === 'event'
                ? selectedContext.title || 'Disaster event'
                : `${selectedContext.lat.toFixed(2)}, ${selectedContext.lon.toFixed(2)}`}
            </span>
            <button onClick={onClearContext} className="shrink-0 hover:text-foreground text-muted-foreground">
              <X className="h-3 w-3" />
            </button>
          </div>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3 min-h-0">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center gap-4 px-2">
            <div className="w-10 h-10 rounded-2xl bg-disaster-purple/10 flex items-center justify-center">
              <Bot className="h-5 w-5 text-disaster-purple" />
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Ask about disasters, safety, or say <strong>&ldquo;show me a cyclone&rdquo;</strong> to control the map.
            </p>
            <div className="flex flex-col gap-1.5 w-full">
              {quickActions.map((a) => (
                <button
                  key={a.label}
                  onClick={() => send(a.prompt)}
                  className="px-3 py-2 rounded-lg border border-border text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors text-left"
                >
                  {a.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={cn('flex gap-2', m.role === 'user' ? 'justify-end' : 'justify-start')}>
            {m.role === 'assistant' && (
              <div className="w-6 h-6 rounded-full bg-disaster-purple/10 flex items-center justify-center shrink-0 mt-0.5">
                <Bot className="h-3 w-3 text-disaster-purple" />
              </div>
            )}
            <div
              className={cn(
                'max-w-[85%] rounded-xl px-3 py-2 text-xs leading-relaxed',
                m.role === 'user'
                  ? 'bg-primary text-primary-foreground rounded-br-sm'
                  : 'bg-muted rounded-bl-sm',
              )}
            >
              <div
                className="whitespace-pre-wrap [&_strong]:font-semibold [&_ul]:mt-1 [&_li]:ml-3"
                dangerouslySetInnerHTML={{ __html: renderMd(m.content) }}
              />
            </div>
            {m.role === 'user' && (
              <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                <User className="h-3 w-3 text-primary" />
              </div>
            )}
          </div>
        ))}

        {isLoading && (
          <div className="flex gap-2">
            <div className="w-6 h-6 rounded-full bg-disaster-purple/10 flex items-center justify-center shrink-0">
              <Bot className="h-3 w-3 text-disaster-purple" />
            </div>
            <div className="bg-muted rounded-xl rounded-bl-sm px-3 py-2">
              <div className="flex gap-1">
                <div className="w-1.5 h-1.5 bg-muted-foreground/40 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-1.5 h-1.5 bg-muted-foreground/40 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-1.5 h-1.5 bg-muted-foreground/40 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* Quick actions when there are messages */}
      {messages.length > 0 && (
        <div className="px-3 pb-1 flex flex-wrap gap-1 shrink-0">
          {quickActions.slice(0, 2).map((a) => (
            <button
              key={a.label}
              onClick={() => send(a.prompt)}
              disabled={isLoading}
              className="px-2.5 py-1 rounded-full border border-border text-[10px] text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-50"
            >
              {a.label}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="px-3 pb-3 pt-1 shrink-0">
        <form
          onSubmit={(e) => { e.preventDefault(); send(input); }}
          className="flex items-center gap-2 bg-muted rounded-xl px-3 py-2 border border-border focus-within:ring-1 focus-within:ring-primary/30"
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask Harbor AI..."
            className="flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground min-w-0"
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={!input.trim() || isLoading}
            className="shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-40 hover:opacity-90 transition-opacity"
          >
            <Send className="h-3 w-3" />
          </button>
        </form>
      </div>
    </div>
  );
}
