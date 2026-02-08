import { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, X, MapPin, AlertTriangle, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { findNearbyResources, RESOURCE_TYPE_LABELS, type NearbyResult } from '@/data/aidResources';

/* ── Shared types ─────────────────────────────────────────────────── */

export interface MapContext {
  type: 'location' | 'event' | 'user_location';
  lat: number;
  lon: number;
  title?: string;
  category?: string;
  sources?: { url?: string }[];
}

export interface UserLocation {
  lat: number;
  lon: number;
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

/* ── AI chat via edge function ─────────────────────────────────────── */

async function callAI(systemPrompt: string, messages: Message[]): Promise<string> {
  const { data, error } = await supabase.functions.invoke('chat-ai', {
    body: { systemPrompt, messages },
  });

  if (error) {
    console.error('Chat AI error', error);
    throw new Error('Chat AI error');
  }

  if (data?.error) {
    throw new Error(data.error);
  }

  return data?.text || 'No response generated.';
}

/* ── System prompt (includes map-control tool protocol) ───────────── */

function buildSystemPrompt(
  ctx: MapContext | null,
  activeEvents: EventSummary[],
  userLocation: UserLocation | null,
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
    '- resources.findNearby: Find nearby emergency aid resources.',
    '  Args: {"lat":<number>,"lon":<number>,"disasterType":"<optional: wildfire|flood|storm|hurricane|blizzard|earthquake>","maxKm":<optional, default 500>}',
    '  Use when user asks about shelters, aid, resources, help, or emergency services near a location.',
    '  If user has selected a location on the map, use those coordinates.',
    '  Returns structured resource list — include name, type, distance, phone, and website in your response.',
    '- resources.findNearbyFEMA: Find nearby FEMA Disaster Recovery Centers.',
    '  Args: {"lat":<number>,"lon":<number>,"maxKm":<optional, default 500>,"limit":<optional, default 10>}',
    '  Use when user specifically asks about FEMA help, FEMA centers, disaster recovery centers, or government disaster assistance.',
    '  If user has selected a location on the map, use those coordinates.',
    '  Returns FEMA DRC locations with name, address, hours, and status.',
    '  You can combine resources.findNearby and resources.findNearbyFEMA in one response for comprehensive results.',
    '',
    'Rules for tool commands:',
    '- ALWAYS write your text response FIRST, then the TOOL_COMMANDS line at the end.',
    '- For map.highlightEvent, use an EXACT title from the ACTIVE EVENTS list below.',
    '- If no matching event exists for the user\'s request, use map.flyTo to the area and explain what is nearby.',
    '- Only emit TOOL_COMMANDS when the user asks to see/show/find/go to something on the map.',
    '- You can combine multiple commands: TOOL_COMMANDS:[{...},{...}]',
    '',
  ];

  /* Always include user's real location so the AI can reason about proximity */
  if (userLocation) {
    parts.push(`USER\'S REAL-TIME LOCATION: ${userLocation.lat.toFixed(4)}, ${userLocation.lon.toFixed(4)}`);
    parts.push('Use this as the default location for any location-based queries unless the user');
    parts.push('has selected a different location on the map or mentioned a specific place.');
    parts.push('');
  }

  if (activeEvents.length > 0) {
    parts.push('ACTIVE EONET EVENTS (use exact titles for map.highlightEvent):');
    for (const e of activeEvents) {
      parts.push(`- "${e.title}" | ${e.category} | ${e.lon.toFixed(1)}, ${e.lat.toFixed(1)}`);
    }
    parts.push('');
  }

  if (ctx?.type === 'event') {
    parts.push('CURRENTLY SELECTED CONTEXT — an event the user clicked on the map:');
    if (ctx.title) parts.push(`- Title: ${ctx.title}`);
    if (ctx.category) parts.push(`- Category: ${ctx.category}`);
    parts.push(`- Coordinates: ${ctx.lat.toFixed(4)}, ${ctx.lon.toFixed(4)}`);
    if (ctx.sources?.length) {
      const urls = ctx.sources.filter((s) => s.url).map((s) => s.url);
      if (urls.length) parts.push(`- Official sources: ${urls.join(', ')}`);
    }
    parts.push('', 'Use this event context to provide relevant, specific advice.');
  } else if (ctx?.type === 'location' && ctx.type !== 'user_location') {
    parts.push(`CURRENTLY SELECTED CONTEXT — a location the user pinned on the map:`);
    parts.push(`- Coordinates: ${ctx.lat.toFixed(4)}, ${ctx.lon.toFixed(4)}`);
    parts.push('', 'The user pinned this different location. Use THESE coordinates (not their real-time location) for this conversation.');
  } else if (ctx?.type === 'user_location') {
    parts.push('CONTEXT: The user is asking about their current location.');
    parts.push(`- Coordinates: ${ctx.lat.toFixed(4)}, ${ctx.lon.toFixed(4)}`);
    parts.push('', 'Provide information relevant to where they physically are.');
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

function getQuickActions(ctx: MapContext | null, userLocation: UserLocation | null): { label: string; prompt: string }[] {
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
  /* Default: if we have user location, make prompts location-aware */
  if (userLocation) {
    return [
      { label: 'Risks near me', prompt: 'What natural disaster risks or active hazards are near my current location?' },
      { label: 'Shelters near me', prompt: 'Find emergency shelters and aid resources near my current location.' },
      { label: 'Active disasters', prompt: 'What major natural disasters are happening right now? Show me the closest one to my location.' },
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

/* ── FEMA nearby API call ─────────────────────────────────────────── */

const FEMA_API_BASE = 'http://localhost:3001';

interface FemaNearbyResource {
  name: string;
  type: string;
  lat: number;
  lon: number;
  distanceKm: number;
  address: string | null;
  phone: string | null;
  hours: string | null;
  status: string;
  drcType: string | null;
  url: string;
}

async function fetchFemaNearby(lat: number, lon: number, maxKm?: number, limit?: number): Promise<{ resources: FemaNearbyResource[]; fallback: any }> {
  const params = new URLSearchParams({
    lat: String(lat),
    lon: String(lon),
    maxKm: String(maxKm ?? 500),
    limit: String(limit ?? 10),
  });
  const res = await fetch(`${FEMA_API_BASE}/api/fema/nearby?${params}`);
  if (!res.ok) return { resources: [], fallback: null };
  return res.json();
}

function formatFemaResults(resources: FemaNearbyResource[], fallback: any): string {
  if (resources.length === 0 && fallback) {
    let text = '\n\n---\n**No FEMA Disaster Recovery Centers found nearby.** Here are national resources:\n\n';
    for (const s of fallback.suggestions || []) {
      text += `- **${s.name}**`;
      if (s.phone) text += ` — Phone: ${s.phone}`;
      if (s.url) text += `\n  ${s.url}`;
      text += '\n';
    }
    return text;
  }

  if (resources.length === 0) return '';

  let text = `\n\n---\n**Found ${resources.length} FEMA Disaster Recovery Center${resources.length > 1 ? 's' : ''}:**\n\n`;
  for (const r of resources) {
    const status = r.status === 'open' ? '(Open)' : r.status === 'closed' ? '(Closed)' : '';
    text += `- **${r.name}** ${status} — ${r.distanceKm} km away`;
    if (r.address) text += `\n  Address: ${r.address}`;
    if (r.hours) text += `\n  Hours: ${r.hours}`;
    if (r.drcType) text += `\n  Type: ${r.drcType}`;
    text += `\n  FEMA Assistance: ${r.url}`;
    text += '\n';
  }
  return text;
}

/* ── Format resource results for chat display ─────────────────────── */

function formatResourceResults(results: NearbyResult[]): string {
  if (results.length === 0) return '';

  const isFallback = results.every((r) => ['r01', 'r02', 'r03'].includes(r.id));
  let text = '\n\n---\n';

  if (isFallback) {
    text += '**No local resources found nearby.** Here are national resources that can help:\n\n';
  } else {
    text += `**Found ${results.length} nearby resource${results.length > 1 ? 's' : ''}:**\n\n`;
  }

  for (const r of results) {
    const typeLabel = RESOURCE_TYPE_LABELS[r.type] || r.type;
    text += `- **${r.name}** (${typeLabel}) — ${Math.round(r.distanceKm)} km away`;
    if (r.phone) text += `\n  Phone: ${r.phone}`;
    if (r.website) text += `\n  Website: ${r.website}`;
    text += '\n';
  }

  return text;
}

/* ════════════════════════════════════════════════════════════════════ */

interface ChatPanelProps {
  selectedContext: MapContext | null;
  onClearContext: () => void;
  onCommand: (cmd: ToolCommand) => void;
  activeEvents: EventSummary[];
  userLocation: UserLocation | null;
}

export default function ChatPanel({ selectedContext, onClearContext, onCommand, activeEvents, userLocation }: ChatPanelProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  /* keep latest callback in ref so async send() always has it */
  const onCommandRef = useRef(onCommand);
  onCommandRef.current = onCommand;

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  /* Auto-resize textarea as user types */
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 160) + 'px';
  }, [input]);

  const toggleExpand = () => {
    setIsExpanded((prev) => !prev);
    // Fire resize events during transition so the map redraws smoothly
    [0, 100, 200, 350].forEach((ms) =>
      setTimeout(() => window.dispatchEvent(new Event('resize')), ms),
    );
  };

  const send = async (text: string) => {
    if (!text.trim() || isLoading) return;
    const userMsg: Message = { role: 'user', content: text.trim() };
    const updated = [...messages, userMsg];
    setMessages(updated);
    setInput('');
    setIsLoading(true);

    try {
      const rawAnswer = await callAI(buildSystemPrompt(selectedContext, activeEvents, userLocation), updated);
      const { text: displayText, commands } = parseResponse(rawAnswer);

      /* If resource commands exist, run search client-side and append results */
      let finalText = displayText;
      for (const cmd of commands) {
        if (cmd.tool === 'resources.findNearby') {
          const { lat, lon, disasterType, maxKm } = cmd.args;
          if (typeof lat === 'number' && typeof lon === 'number') {
            const results = findNearbyResources(lat, lon, { disasterType, maxKm });
            finalText += formatResourceResults(results);
          }
        }
        if (cmd.tool === 'resources.findNearbyFEMA') {
          const { lat, lon, maxKm, limit } = cmd.args;
          if (typeof lat === 'number' && typeof lon === 'number') {
            try {
              const data = await fetchFemaNearby(lat, lon, maxKm, limit);
              finalText += formatFemaResults(data.resources, data.fallback);
            } catch {
              finalText += '\n\n*Could not reach FEMA data service. Make sure the API server is running (`npm run api`).*';
            }
          }
        }
      }

      setMessages((prev) => [...prev, { role: 'assistant', content: finalText }]);

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

  const quickActions = getQuickActions(selectedContext, userLocation);

  return (
    <div className={cn(
      'flex-shrink-0 flex flex-col h-full bg-card border-l border-border relative transition-all duration-300',
      isExpanded ? 'w-1/2' : 'w-1/4',
    )}>
      {/* Clickable left edge to expand/collapse */}
      <div
        onClick={toggleExpand}
        className="absolute left-0 top-0 bottom-0 w-1 bg-border hover:bg-primary/50 cursor-col-resize transition-colors z-20"
        title={isExpanded ? 'Click to collapse' : 'Click to expand'}
      />

      {/* Header */}
      <div className="px-4 py-3 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-primary/10 flex items-center justify-center">
            <Bot className="h-4 w-4 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-semibold">Harbor AI</h2>
            <p className="text-[10px] text-muted-foreground">Disaster assistant</p>
          </div>
          <button
            onClick={toggleExpand}
            className="w-6 h-6 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
            title={isExpanded ? 'Collapse' : 'Expand'}
          >
            {isExpanded ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>

      {/* Context chip */}
      {selectedContext && (
        <div className="px-3 py-2 border-b border-border shrink-0">
          <div className="flex items-center gap-2 px-2.5 py-1.5 bg-muted text-xs">
            {selectedContext.type === 'event' ? (
              <AlertTriangle className="h-3 w-3 text-disaster-amber shrink-0" />
            ) : selectedContext.type === 'user_location' ? (
              <MapPin className="h-3 w-3 text-disaster-green shrink-0" />
            ) : (
              <MapPin className="h-3 w-3 text-disaster-blue shrink-0" />
            )}
            <span className="truncate flex-1 text-foreground">
              {selectedContext.type === 'event'
                ? selectedContext.title || 'Disaster event'
                : selectedContext.type === 'user_location'
                  ? 'Your location'
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
            <div className="w-10 h-10 bg-primary/10 flex items-center justify-center">
              <Bot className="h-5 w-5 text-primary" />
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Ask about disasters, safety, or say <strong>&ldquo;show me a cyclone&rdquo;</strong> to control the map.
            </p>
            <div className="flex flex-col gap-1.5 w-full">
              {quickActions.map((a) => (
                <button
                  key={a.label}
                  onClick={() => send(a.prompt)}
                  className="px-3 py-2 border border-border text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors text-left"
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
              <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                <Bot className="h-3 w-3 text-primary" />
              </div>
            )}
            <div
              className={cn(
                'max-w-[85%] px-3 py-2 text-xs leading-relaxed',
                m.role === 'user'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted',
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
            <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <Bot className="h-3 w-3 text-primary" />
            </div>
            <div className="bg-muted px-3 py-2">
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
              className="px-2.5 py-1 border border-border text-[10px] text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-50"
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
          className="flex items-end gap-2 bg-muted px-3 py-2 border border-border focus-within:ring-1 focus-within:ring-primary/30"
        >
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send(input);
              }
            }}
            placeholder="Ask Harbor AI..."
            className="flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground min-w-0 resize-none leading-relaxed"
            rows={1}
            disabled={isLoading}
            style={{ maxHeight: '160px', overflowY: input.split('\n').length > 6 ? 'auto' : 'hidden' }}
          />
          <button
            type="submit"
            disabled={!input.trim() || isLoading}
            className="shrink-0 w-6 h-6 bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-40 hover:opacity-90 transition-opacity"
          >
            <Send className="h-3 w-3" />
          </button>
        </form>
      </div>
    </div>
  );
}
