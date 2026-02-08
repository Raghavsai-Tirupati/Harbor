import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Bot, User, MapPin, Loader2, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';

const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;

const SYSTEM_PROMPT = `You are Harbor AI, a disaster aid assistant embedded in an interactive disaster map powered by NASA EONET real-time data. Your role is to help people find emergency aid, shelters, food, medical help, and evacuation routes during natural disasters globally.

CRITICAL: You have ACCESS to real, live disaster event data from NASA EONET. This data is provided to you at the start of each message in [CURRENT EVENTS ON MAP] blocks. These are REAL active events - use them! When a user asks about storms, wildfires, floods, etc., look through the provided events and reference the actual ones by name and location. Do NOT say you don't have access to data.

Guidelines:
- Be concise, compassionate, and actionable
- When asked about current disasters/storms/events, ALWAYS check the [CURRENT EVENTS ON MAP] data and reference specific real events by name
- When the user clicks on the map, you also receive their clicked location and nearby events
- Provide specific resources: emergency numbers, Red Cross, FEMA, local disaster relief organizations, UN OCHA for international disasters
- Suggest types of aid available: shelters, food banks, medical aid stations, evacuation centers
- Always remind users to call local emergency services (911 in the US, or equivalent) if they are in immediate danger
- Format responses with clear structure using bullet points
- Keep responses under 200 words unless the user asks for more detail
- Focus on CURRENT EVENTS mode by default. Only discuss seasonal predictions if the user specifically asks about them.

MAP INTERACTION (MANDATORY):
You MUST include a map action at the very end of your response whenever:
1. The user mentions a specific location, city, or region
2. You reference or discuss a specific disaster event from the [CURRENT EVENTS ON MAP] data
3. The user asks you to "take me to", "show me", "zoom to", or anything implying navigation

Use the EXACT coordinates from the event data when referencing a disaster event. The format is:
<<MAP_ACTION:{"lat":NUMBER,"lng":NUMBER,"zoom":NUMBER}>>

- For disaster events: use the EXACT lat/lng from the event data provided to you, zoom 8
- For cities: zoom 12
- For countries: zoom 5
- For regions/states: zoom 7
- For neighborhoods: zoom 14
- Only include ONE map action per response
- Place it as the very last line
- NEVER discuss an event without zooming to it if the user is asking about it

Examples:
- If event data says "Tropical Cyclone at lat 25.50, lng -71.20": <<MAP_ACTION:{"lat":25.50,"lng":-71.20,"zoom":8}>>
- Dallas Texas: <<MAP_ACTION:{"lat":32.7767,"lng":-96.7970,"zoom":12}>>
- Japan: <<MAP_ACTION:{"lat":36.2048,"lng":138.2529,"zoom":5}>>
`;

type Message = {
  role: 'user' | 'assistant';
  content: string;
};

type MapContext = {
  lat: number;
  lng: number;
  nearbyEvents?: { title: string; category: string }[];
} | null;

type ActiveEvent = { title: string; category: string; lat: number; lng: number };

async function callGemini(messages: Message[], mapContext: MapContext, activeEvents: ActiveEvent[] = []): Promise<string> {
  let contextPrefix = '';

  // Always include current map events
  if (activeEvents && activeEvents.length > 0) {
    const eventsList = activeEvents.slice(0, 50).map(
      (e) => `- ${e.title} (${e.category}) at lat ${e.lat.toFixed(2)}, lng ${e.lng.toFixed(2)}`
    ).join('\n');
    contextPrefix += `[CURRENT EVENTS ON MAP - These are real, active NASA EONET disaster events happening right now:\n${eventsList}\n]\n\n`;
  }

  if (mapContext) {
    const eventsText = mapContext.nearbyEvents?.length
      ? mapContext.nearbyEvents.map((e) => `- ${e.title} (${e.category})`).join('\n')
      : 'No known active events near this location.';
    contextPrefix += `[User clicked on map at lat ${mapContext.lat.toFixed(4)}, lng ${mapContext.lng.toFixed(4)}.\nNearby disasters:\n${eventsText}]\n\n`;
  }

  const contents = [
    { role: 'user', parts: [{ text: SYSTEM_PROMPT }] },
    { role: 'model', parts: [{ text: 'Understood. I am Harbor AI, ready to help people find disaster aid. How can I help?' }] },
    ...messages.map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.role === 'user' && m === messages[messages.length - 1] ? contextPrefix + m.content : m.content }],
    })),
  ];

  const res = await fetch(GEMINI_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents,
      generationConfig: { temperature: 0.7, maxOutputTokens: 512 },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error('Gemini error status:', res.status, err);
    let parsed: { error?: { message?: string } } = {};
    try { parsed = JSON.parse(err); } catch { /* ignore */ }
    const msg = parsed?.error?.message || `HTTP ${res.status}`;
    throw new Error(msg);
  }

  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || 'Sorry, I could not generate a response.';
}

type MapAction = { lat: number; lng: number; zoom: number };

function parseMapAction(text: string): { cleanText: string; action: MapAction | null } {
  const regex = /<<MAP_ACTION:\s*(\{[^}]+\})\s*>>/;
  const match = text.match(regex);
  if (!match) return { cleanText: text, action: null };
  try {
    const action = JSON.parse(match[1]) as MapAction;
    if (typeof action.lat === 'number' && typeof action.lng === 'number' && typeof action.zoom === 'number') {
      return { cleanText: text.replace(regex, '').trim(), action };
    }
  } catch { /* ignore */ }
  return { cleanText: text.replace(regex, '').trim(), action: null };
}

export default function MapChatbot({
  mapContext,
  onClearContext,
  onMapAction,
  activeEvents = [],
}: {
  mapContext: MapContext;
  onClearContext: () => void;
  onMapAction?: (action: MapAction) => void;
  activeEvents?: ActiveEvent[];
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const prevContextRef = useRef<MapContext>(null);
  const activeEventsRef = useRef<ActiveEvent[]>(activeEvents);
  activeEventsRef.current = activeEvents;

  // Scroll to bottom when messages change
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  // When map context changes, auto-send a contextual message
  useEffect(() => {
    if (!mapContext) return;
    if (
      prevContextRef.current &&
      prevContextRef.current.lat === mapContext.lat &&
      prevContextRef.current.lng === mapContext.lng
    ) return;
    prevContextRef.current = mapContext;

    const eventsText = mapContext.nearbyEvents?.length
      ? mapContext.nearbyEvents.map((e) => e.title).join(', ')
      : 'no known active events';

    const autoMsg = `I clicked on the map at coordinates (${mapContext.lat.toFixed(2)}, ${mapContext.lng.toFixed(2)}). Active events nearby: ${eventsText}. What aid resources are available in this area?`;
    sendMessage(autoMsg);
  }, [mapContext]);

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || loading) return;
      const userMsg: Message = { role: 'user', content: text.trim() };
      setMessages((prev) => [...prev, userMsg]);
      setInput('');
      setLoading(true);

      try {
        const allMessages = [...messages, userMsg];
        const rawReply = await callGemini(allMessages, mapContext, activeEventsRef.current);
        const { cleanText, action } = parseMapAction(rawReply);
        setMessages((prev) => [...prev, { role: 'assistant', content: cleanText }]);
        if (action && onMapAction) {
          onMapAction(action);
        }
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : 'Unknown error';
        console.error('Chat error:', errMsg);
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: `Sorry, I encountered an error: ${errMsg}` },
        ]);
      } finally {
        setLoading(false);
      }
    },
    [messages, mapContext, loading]
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  const clearChat = () => {
    setMessages([]);
    prevContextRef.current = null;
    onClearContext();
  };

  return (
    <div className="flex flex-col h-full bg-[#1a1f2e] border-l border-white/10">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-[#141827]">
        <div className="flex items-center gap-2">
          <Bot className="h-4 w-4 text-indigo-400" />
          <span className="text-sm font-medium text-white">Harbor AI</span>
        </div>
        <button
          onClick={clearChat}
          className="p-1.5 rounded hover:bg-white/10 transition-colors text-slate-400 hover:text-white"
          title="Clear chat"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Map context badge */}
      {mapContext && (
        <div className="px-3 py-2 bg-indigo-500/10 border-b border-indigo-500/20 flex items-center gap-2">
          <MapPin className="h-3 w-3 text-indigo-400 flex-shrink-0" />
          <span className="text-xs text-indigo-300 truncate">
            {mapContext.lat.toFixed(2)}, {mapContext.lng.toFixed(2)}
            {mapContext.nearbyEvents?.length
              ? ` — ${mapContext.nearbyEvents.length} event${mapContext.nearbyEvents.length > 1 ? 's' : ''} nearby`
              : ''}
          </span>
        </div>
      )}

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-4 space-y-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center px-4 gap-3">
            <Bot className="h-8 w-8 text-indigo-400/50" />
            <p className="text-xs text-slate-400 leading-relaxed">
              Click anywhere on the map to get disaster aid info for that area, or ask me a question.
            </p>
            <div className="flex flex-col gap-1.5 w-full mt-2">
              {[
                'How do I find nearby shelters?',
                'What should I do during a wildfire?',
                'Where can I get emergency food?',
              ].map((q) => (
                <button
                  key={q}
                  onClick={() => sendMessage(q)}
                  className="text-left text-xs px-3 py-2 rounded-lg bg-white/5 text-slate-300 hover:bg-white/10 transition-colors border border-white/5"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={cn('flex gap-2', m.role === 'user' ? 'justify-end' : 'justify-start')}>
            {m.role === 'assistant' && (
              <div className="flex-shrink-0 w-6 h-6 rounded-full bg-indigo-500/20 flex items-center justify-center mt-0.5">
                <Bot className="h-3 w-3 text-indigo-400" />
              </div>
            )}
            <div
              className={cn(
                'max-w-[85%] rounded-lg px-3 py-2 text-xs leading-relaxed',
                m.role === 'user'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-white/5 text-slate-200 border border-white/5'
              )}
            >
              <div className="whitespace-pre-wrap">{m.content}</div>
            </div>
            {m.role === 'user' && (
              <div className="flex-shrink-0 w-6 h-6 rounded-full bg-indigo-600/30 flex items-center justify-center mt-0.5">
                <User className="h-3 w-3 text-indigo-300" />
              </div>
            )}
          </div>
        ))}
        {loading && (
          <div className="flex gap-2 justify-start">
            <div className="flex-shrink-0 w-6 h-6 rounded-full bg-indigo-500/20 flex items-center justify-center">
              <Bot className="h-3 w-3 text-indigo-400" />
            </div>
            <div className="bg-white/5 border border-white/5 rounded-lg px-3 py-2 text-xs text-slate-400 flex items-center gap-2">
              <Loader2 className="h-3 w-3 animate-spin" />
              Thinking…
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="px-3 py-3 border-t border-white/10 bg-[#141827]">
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about disaster aid…"
            disabled={loading}
            className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-500/50 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={!input.trim() || loading}
            className="p-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-500 transition-colors disabled:opacity-30 disabled:hover:bg-indigo-600"
          >
            <Send className="h-3.5 w-3.5" />
          </button>
        </div>
      </form>
    </div>
  );
}
