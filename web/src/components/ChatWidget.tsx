import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { MessageCircle, X, Maximize2, Minimize2, Send, Brain, Wrench, Activity, Pencil, Eye, Terminal, Search, ChevronRight, RefreshCw, Plus } from 'lucide-react';
import { loadChatThread, saveChatThread, deleteChatThread } from '../api';
import type { ChatThreadData } from '../api';
import './ChatWidget.css';

const WORKSPACE_URL = import.meta.env.VITE_OPENAGENTS_WORKSPACE_URL || '';
const DEFAULT_AGENT = import.meta.env.VITE_OPENAGENTS_AGENT_NAME || '';
const INSFORGE_BASE = import.meta.env.VITE_INSFORGE_BASE_URL || '';
const API_BASE = import.meta.env.DEV
  ? '/workspace-api'
  : `${INSFORGE_BASE}/functions/workspace-proxy`;

// ── Types ──

interface ChatMessage {
  id: string;
  senderType: 'human' | 'agent';
  senderName: string;
  content: string;
  messageType: 'chat' | 'status' | 'thinking' | 'loading';
  timestamp: number;
}

interface ParsedConfig {
  workspaceId: string;
  token: string;
}

// ── Step Parsing (mirrors workspace frontend) ──

interface ParsedStep {
  type: 'thinking' | 'tool_call' | 'status' | 'compacting';
  tool?: string;
  toolDisplay?: string;
  args?: string;
  summary?: string;
  text?: string;
}

function parseStepContent(content: string): ParsedStep {
  if (content === 'thinking...' || content.toLowerCase() === 'thinking') {
    return { type: 'thinking', text: content };
  }
  const thinkingMatch = content.match(/^\*\*Thinking:\*\*\n([\s\S]+)$/);
  if (thinkingMatch) {
    return { type: 'thinking', text: thinkingMatch[1].trim() };
  }
  const toolMatch = content.match(/\*\*Using tool:\*\*\s*`([^`]+)`\s*```([\s\S]*?)```/);
  if (toolMatch) {
    const rawTool = toolMatch[1];
    const args = toolMatch[2].trim();
    const toolDisplay = cleanToolName(rawTool);
    const summary = extractToolSummary(toolDisplay, args);
    return { type: 'tool_call', tool: rawTool, toolDisplay, args, summary };
  }
  const runMatch = content.match(/\*\*Running:\*\*\s*`([^`]+)`/);
  if (runMatch) {
    return { type: 'tool_call', tool: 'Bash', toolDisplay: 'Bash', summary: runMatch[1] };
  }
  const editMatch = content.match(/\*\*Editing:\*\*\s*`([^`]+)`/);
  if (editMatch) {
    return { type: 'tool_call', tool: 'Edit', toolDisplay: 'Edit', summary: editMatch[1] };
  }
  if (/compact/i.test(content)) {
    return { type: 'compacting', text: content };
  }
  return { type: 'status', text: content };
}

function cleanToolName(name: string): string {
  const mcpMatch = name.match(/^mcp__[^_]+__(.+)$/);
  if (mcpMatch) return mcpMatch[1];
  return name;
}

function extractToolSummary(tool: string, args: string): string {
  const fileMatch = args.match(/'file_path':\s*'([^']+)'/);
  if (fileMatch && ['Write', 'Read', 'Edit'].includes(tool)) return fileMatch[1];
  const commandMatch = args.match(/'command':\s*'([^']+)'/);
  if (commandMatch && tool === 'Bash') return commandMatch[1].slice(0, 80);
  return args.length > 60 ? args.slice(0, 60) + '...' : args;
}

const TOOL_ICONS: Record<string, typeof Wrench> = {
  Write: Pencil, Edit: Pencil, Read: Eye, Bash: Terminal, Glob: Search, Grep: Search,
};

function getStepIcon(parsed: ParsedStep) {
  if (parsed.type === 'thinking') return Brain;
  if (parsed.type === 'compacting') return RefreshCw;
  if (parsed.type === 'status') return Activity;
  return TOOL_ICONS[parsed.toolDisplay || ''] || Wrench;
}

// ── Message Grouping ──

type MessageGroup =
  | { type: 'chat'; message: ChatMessage }
  | { type: 'steps'; messages: ChatMessage[] };

function groupMessages(messages: ChatMessage[]): MessageGroup[] {
  const groups: MessageGroup[] = [];
  let currentSteps: ChatMessage[] = [];
  const flushSteps = () => {
    if (currentSteps.length > 0) {
      groups.push({ type: 'steps', messages: [...currentSteps] });
      currentSteps = [];
    }
  };
  messages.forEach((msg) => {
    if (msg.messageType === 'status' || msg.messageType === 'thinking') {
      currentSteps.push(msg);
    } else {
      flushSteps();
      groups.push({ type: 'chat', message: msg });
    }
  });
  flushSteps();
  return groups;
}

// ── Step Item Component ──

function StepItem({ message }: { message: ChatMessage }) {
  const [expanded, setExpanded] = useState(false);
  const parsed = message.messageType === 'thinking'
    ? { type: 'thinking' as const, text: message.content }
    : parseStepContent(message.content);
  const Icon = getStepIcon(parsed);
  const hasDetail = parsed.type === 'tool_call' && !!parsed.args;
  const isThinkingWithContent = parsed.type === 'thinking' && !!parsed.text && parsed.text !== 'thinking...' && parsed.text.toLowerCase() !== 'thinking';

  if (isThinkingWithContent) {
    return (
      <div className="step-item">
        <div className="step-header">
          <Icon size={12} className="step-icon thinking" />
          <span className="step-label thinking-pulse">thinking</span>
        </div>
        <div className="step-thinking-content">{parsed.text}</div>
      </div>
    );
  }

  return (
    <div className="step-item">
      <button
        type="button"
        className={`step-header${hasDetail ? ' clickable' : ''}`}
        onClick={() => hasDetail && setExpanded(!expanded)}
        disabled={!hasDetail}
      >
        <Icon
          size={12}
          className={`step-icon${
            parsed.type === 'thinking' ? ' thinking pulse' :
            parsed.type === 'compacting' ? ' compacting spin' :
            parsed.type === 'tool_call' ? ' tool' :
            ' status'
          }`}
        />
        {parsed.type === 'thinking' && <span className="step-label thinking-pulse">thinking...</span>}
        {parsed.type === 'compacting' && <span className="step-label compacting-pulse">Vibing ...</span>}
        {parsed.type === 'tool_call' && (
          <span className="step-tool-info">
            <span className="step-tool-name">{parsed.toolDisplay}</span>
            {parsed.summary && (
              <>
                <span className="step-separator">&rsaquo;</span>
                <span className="step-tool-summary">{parsed.summary}</span>
              </>
            )}
          </span>
        )}
        {parsed.type === 'status' && <span className="step-label">{parsed.text}</span>}
        {hasDetail && (
          <ChevronRight size={10} className={`step-chevron${expanded ? ' expanded' : ''}`} />
        )}
      </button>
      {expanded && parsed.args && (
        <pre className="step-args">{parsed.args}</pre>
      )}
    </div>
  );
}

// ── Breathing Dots ──

function BreathingDots() {
  return (
    <div className="breathing-dots">
      <span className="dot" />
      <span className="dot" />
      <span className="dot" />
    </div>
  );
}

// ── Helpers ──

function parseWorkspaceUrl(url: string): ParsedConfig | null {
  try {
    const u = new URL(url);
    const workspaceId = u.pathname.replace(/^\//, '').split('/')[0];
    const token = u.searchParams.get('token') || '';
    if (!workspaceId) return null;
    return { workspaceId, token };
  } catch {
    return null;
  }
}

async function apiRequest<T>(
  path: string,
  config: ParsedConfig,
  options: RequestInit = {},
): Promise<T> {
  let res: Response;

  if (import.meta.env.DEV) {
    // Dev: Vite proxy forwards path directly
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (config.token) headers['X-Workspace-Token'] = config.token;
    res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  } else {
    // Prod: POST to edge function proxy with wrapped payload
    const proxyBody: Record<string, unknown> = {
      method: options.method || 'GET',
      path,
      workspaceToken: config.token,
    };
    if (options.body) {
      proxyBody.body = typeof options.body === 'string' ? JSON.parse(options.body) : options.body;
    }
    res = await fetch(API_BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(proxyBody),
    });
  }

  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
  const json = await res.json();
  return json.data;
}

function getAgentInitials(name: string): string {
  return name.slice(0, 2).toUpperCase();
}

// ── Main Widget ──

interface ChatWidgetProps {
  isOpen?: boolean;
  onToggle?: (open: boolean) => void;
  userId: string;
}

export function ChatWidget({ isOpen: controlledOpen, onToggle, userId }: ChatWidgetProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isOpen = controlledOpen !== undefined ? controlledOpen : internalOpen;
  const setIsOpen = useCallback((open: boolean) => {
    if (onToggle) onToggle(open);
    else setInternalOpen(open);
  }, [onToggle]);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [channelName, setChannelName] = useState<string | null>(null);
  const [initializing, setInitializing] = useState(false);
  const [waitingForAgent, setWaitingForAgent] = useState(false);
  const lastSeenIdRef = useRef<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const savePendingRef = useRef(false);
  const masterAgentRef = useRef<string | undefined>(undefined);

  const config = parseWorkspaceUrl(WORKSPACE_URL);

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, waitingForAgent]);

  // Focus input when panel opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [isOpen]);

  // Persist thread to DB (debounced — only saves when savePendingRef is set)
  const persistThread = useCallback(async () => {
    if (!userId || !channelName) return;
    try {
      await saveChatThread(userId, {
        channelName,
        lastSeenId: lastSeenIdRef.current,
        masterAgent: masterAgentRef.current,
        createdAt: Date.now(),
      });
    } catch (err) {
      console.error('Failed to persist chat thread:', err);
    }
  }, [userId, channelName]);

  // Convert raw events to ChatMessages
  const eventsToMessages = useCallback((events: any[]): ChatMessage[] => {
    return events.map((e: any) => {
      const payload = e.payload || {};
      const msgType = payload.message_type || 'chat';
      return {
        id: e.id,
        senderType: e.source.startsWith('human:') ? 'human' as const : 'agent' as const,
        senderName: e.source.replace(/^(openagents:|human:)/, ''),
        content: payload.content || '',
        messageType: msgType === 'thinking' ? 'thinking' : msgType === 'status' ? 'status' : 'chat',
        timestamp: e.timestamp,
      };
    });
  }, []);

  // Load full message history for an existing channel (no `after`, sort=asc)
  const loadHistory = useCallback(async (channel: string) => {
    if (!config) return;
    try {
      let allMsgs: ChatMessage[] = [];
      let cursor: string | undefined;
      let hasMore = true;

      while (hasMore) {
        const params = new URLSearchParams({
          network: config.workspaceId,
          channel,
          type: 'workspace.message',
          sort: 'asc',
          limit: '200',
        });
        if (cursor) params.set('after', cursor);

        const result = await apiRequest<{ events: any[]; has_more: boolean }>(
          `/v1/events?${params}`, config,
        );

        const msgs = eventsToMessages(result.events);
        allMsgs = [...allMsgs, ...msgs];
        hasMore = result.has_more && result.events.length > 0;
        if (result.events.length > 0) {
          cursor = result.events[result.events.length - 1].id;
        }
      }

      if (allMsgs.length > 0) {
        lastSeenIdRef.current = allMsgs[allMsgs.length - 1].id;
        setMessages(allMsgs);
        savePendingRef.current = true;
      }
    } catch (err) {
      console.error('Failed to load history:', err);
    }
  }, [config, eventsToMessages]);

  // Create a brand-new channel (used on first open or "New Chat")
  const createNewChannel = useCallback(async () => {
    if (!config) return;
    setInitializing(true);
    try {
      let agentNames: string[] = DEFAULT_AGENT ? [DEFAULT_AGENT] : [];
      let master: string | undefined = DEFAULT_AGENT || undefined;
      try {
        const discovery = await apiRequest<{ agents: { address: string; status: string }[] }>(
          `/v1/discover?network=${config.workspaceId}`, config,
        );
        const discovered = discovery.agents
          .map((a) => a.address.replace(/^openagents:/, ''))
          .filter((name) => name.length > 0);
        const nameSet = new Set(agentNames);
        for (const name of discovered) nameSet.add(name);
        agentNames = Array.from(nameSet);
        if (!master) {
          const onlineAgent = discovery.agents.find((a) => a.status === 'online');
          master = onlineAgent
            ? onlineAgent.address.replace(/^openagents:/, '')
            : agentNames[0] || undefined;
        }
      } catch { /* proceed with default */ }

      const event = await apiRequest<{ metadata?: { channel_name?: string } }>(
        '/v1/events', config, {
          method: 'POST',
          body: JSON.stringify({
            type: 'network.channel.create',
            source: 'human:user',
            target: 'core',
            payload: {
              title: 'Company OS Chat',
              participants: agentNames,
              ...(master && { master }),
            },
            network: config.workspaceId,
          }),
        },
      );
      const name = (event as any).metadata?.channel_name || '';
      if (name) {
        masterAgentRef.current = master;
        setChannelName(name);
        lastSeenIdRef.current = null;
        // Persist immediately
        try {
          await saveChatThread(userId, {
            channelName: name,
            lastSeenId: null,
            masterAgent: master,
            createdAt: Date.now(),
          });
        } catch (err) {
          console.error('Failed to persist new chat thread:', err);
        }
      }
    } catch (err) {
      console.error('Failed to create chat channel:', err);
    } finally {
      setInitializing(false);
    }
  }, [config, userId]);

  // Load saved thread or create new one
  const initChannel = useCallback(async () => {
    if (!config || channelName) return;
    setInitializing(true);
    try {
      const saved = await loadChatThread(userId);
      if (saved && saved.channelName) {
        masterAgentRef.current = saved.masterAgent;
        // Reset cursor so history loads from the beginning
        lastSeenIdRef.current = null;
        setChannelName(saved.channelName);
        // Load full message history before starting poll loop
        await loadHistory(saved.channelName);
        setInitializing(false);
        return;
      }
    } catch {
      // No saved thread, create new
    }
    setInitializing(false);
    await createNewChannel();
  }, [config, channelName, userId, createNewChannel, loadHistory]);

  // Handle "New Chat" — clear everything and create fresh channel
  const handleNewChat = useCallback(async () => {
    // Clear local state
    setChannelName(null);
    setMessages([]);
    setWaitingForAgent(false);
    lastSeenIdRef.current = null;
    masterAgentRef.current = undefined;
    // Clear persisted thread
    try {
      await deleteChatThread(userId);
    } catch { /* ignore */ }
    // Create new channel
    await createNewChannel();
  }, [userId, createNewChannel]);

  // Poll for new messages (incremental, uses `after` cursor)
  const poll = useCallback(async () => {
    if (!config || !channelName) return;
    try {
      const params = new URLSearchParams({
        network: config.workspaceId,
        channel: channelName,
        type: 'workspace.message',
        limit: '200',
      });
      if (lastSeenIdRef.current) params.set('after', lastSeenIdRef.current);

      const result = await apiRequest<{ events: any[]; has_more: boolean }>(
        `/v1/events?${params}`, config,
      );

      if (result.events.length > 0) {
        const newMsgs = eventsToMessages(result.events);

        lastSeenIdRef.current = newMsgs[newMsgs.length - 1].id;
        savePendingRef.current = true;

        setMessages((prev) => {
          // Remove optimistic messages once real ones arrive
          const withoutOptimistic = prev.filter((m) => !m.id.startsWith('opt-') || !newMsgs.some(
            (n) => n.senderType === m.senderType && n.content === m.content
          ));
          const existingIds = new Set(withoutOptimistic.map((m) => m.id));
          const unique = newMsgs.filter((m) => !existingIds.has(m.id));
          return unique.length > 0 ? [...withoutOptimistic, ...unique] : withoutOptimistic.length !== prev.length ? withoutOptimistic : prev;
        });

        // Check if agent has responded with a chat message
        const hasAgentChat = newMsgs.some((m) => m.senderType === 'agent' && m.messageType === 'chat');
        if (hasAgentChat) setWaitingForAgent(false);
      }
    } catch (err) {
      console.error('Poll error:', err);
    }
  }, [config, channelName, eventsToMessages]);

  // Fixed 5s polling loop
  useEffect(() => {
    if (!isOpen || !channelName) return;
    poll();
    pollTimerRef.current = setInterval(async () => {
      await poll();
      // Persist lastSeenId if new messages arrived
      if (savePendingRef.current) {
        savePendingRef.current = false;
        persistThread();
      }
    }, 5000);
    return () => { if (pollTimerRef.current) clearInterval(pollTimerRef.current); };
  }, [isOpen, channelName, poll, persistThread]);

  // Init channel when panel opens (covers both FAB click and external toggle)
  useEffect(() => {
    if (isOpen && !channelName && !initializing) initChannel();
  }, [isOpen, channelName, initializing, initChannel]);

  const handleOpen = () => {
    setIsOpen(true);
  };

  const handleSend = async () => {
    if (!input.trim() || !config || !channelName || sending) return;
    const text = input.trim();
    setInput('');
    setSending(true);
    setWaitingForAgent(true);

    const optimistic: ChatMessage = {
      id: `opt-${Date.now()}`,
      senderType: 'human',
      senderName: 'user',
      content: text,
      messageType: 'chat',
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, optimistic]);

    try {
      await apiRequest('/v1/events', config, {
        method: 'POST',
        body: JSON.stringify({
          type: 'workspace.message.posted',
          source: 'human:user',
          target: `channel/${channelName}`,
          payload: { content: text, sender_type: 'human' },
          visibility: 'channel',
          network: config.workspaceId,
        }),
      });
      setTimeout(() => poll(), 500);
    } catch (err) {
      console.error('Send failed:', err);
      setWaitingForAgent(false);
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Group messages for rendering
  const realMessages = useMemo(() => messages.filter((m) => m.messageType !== 'loading'), [messages]);

  // Filter: only show trailing status/thinking steps (not old ones buried in history)
  const filteredMessages = useMemo(() => {
    const isStep = (m: ChatMessage) => m.messageType === 'status' || m.messageType === 'thinking';
    let lastChatIndex = -1;
    for (let i = realMessages.length - 1; i >= 0; i--) {
      if (!isStep(realMessages[i])) { lastChatIndex = i; break; }
    }
    const lastIsStep = realMessages.length > 0 && isStep(realMessages[realMessages.length - 1]);
    return realMessages.filter((msg, index) => {
      if (!isStep(msg)) return true;
      if (msg.messageType === 'thinking') return true;
      return lastIsStep && index > lastChatIndex;
    });
  }, [realMessages]);

  const groups = useMemo(() => groupMessages(filteredMessages), [filteredMessages]);

  if (!config) return null;

  return (
    <>
      {!isOpen && (
        <button className="chat-fab" onClick={handleOpen} title="Chat with Agent">
          <MessageCircle size={22} />
        </button>
      )}

      {isOpen && (
        <div className={`chat-panel${isFullscreen ? ' fullscreen' : ''}`}>
          <div className="chat-panel-header">
            <span className="chat-panel-title">Agent Chat</span>
            <div className="chat-panel-actions">
              <button className="chat-header-btn" onClick={handleNewChat} title="New Chat">
                <Plus size={14} />
              </button>
              <button className="chat-header-btn" onClick={() => setIsFullscreen(!isFullscreen)}
                title={isFullscreen ? 'Minimize' : 'Fullscreen'}>
                {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
              </button>
              <button className="chat-header-btn"
                onClick={() => { setIsOpen(false); setIsFullscreen(false); }} title="Close">
                <X size={14} />
              </button>
            </div>
          </div>

          <div className="chat-panel-body">
            {initializing && <div className="chat-status">Connecting to agent...</div>}
            {messages.length === 0 && !initializing && (
              <div className="chat-status">Send a message to start chatting with the agent.</div>
            )}

            {groups.map((group) => {
              if (group.type === 'chat') {
                const msg = group.message;
                const isHuman = msg.senderType === 'human';
                return (
                  <div key={msg.id} className={`chat-msg ${msg.senderType}`}>
                    {!isHuman && (
                      <div className="chat-avatar">{getAgentInitials(msg.senderName)}</div>
                    )}
                    <div className={`chat-msg-body${isHuman ? ' human-body' : ''}`}>
                      <div className={`chat-msg-meta${isHuman ? ' human-meta' : ''}`}>
                        <span className="chat-msg-name">{isHuman ? 'You' : msg.senderName}</span>
                        <span className="chat-msg-time">
                          {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <div className={`chat-msg-content${isHuman ? ' human' : ' agent'}`}>{msg.content}</div>
                    </div>
                  </div>
                );
              }

              // Steps group
              const stepsKey = `steps-${group.messages[0].id}`;
              return (
                <div key={stepsKey} className="chat-steps">
                  <div className="steps-border">
                    {group.messages.map((step) => (
                      <StepItem key={step.id} message={step} />
                    ))}
                  </div>
                </div>
              );
            })}

            {waitingForAgent && <BreathingDots />}

            <div ref={messagesEndRef} />
          </div>

          <div className="chat-panel-input">
            <textarea
              ref={inputRef}
              className="chat-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type a message..."
              rows={1}
              disabled={!channelName || sending}
            />
            <button className="chat-send-btn" onClick={handleSend}
              disabled={!input.trim() || !channelName || sending} title="Send">
              <Send size={16} />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
