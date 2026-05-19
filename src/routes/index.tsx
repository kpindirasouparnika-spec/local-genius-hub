import { createFileRoute } from "@tanstack/react-router";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Terminal,
  FolderOpen,
  FileText,
  Pencil,
  Search,
  Send,
  Plug,
  Download,
  CheckCircle2,
  XCircle,
  Loader2,
  Radar,
  Lock,
  LogOut,
  Sparkles,
} from "lucide-react";
import {
  callBridge,
  clearBridge,
  loadBridge,
  saveBridge,
  type BridgeConfig,
} from "@/lib/bridge";

export const Route = createFileRoute("/")({
  component: Home,
  head: () => ({
    meta: [
      { title: "DataScout by AAGNEY" },
      {
        name: "description",
        content:
          "DataScout by AAGNEY — your personal local AI agent. Control files and shell on your laptop with natural language.",
      },
    ],
  }),
});

const MESSAGES_KEY = "datascout-messages";
const AUTH_KEY = "datascout-auth";
const PASSWORD = "123456789";

const TOOL_META: Record<string, { icon: typeof Terminal; label: string; danger?: boolean }> = {
  list_dir: { icon: FolderOpen, label: "List directory" },
  read_file: { icon: FileText, label: "Read file" },
  write_file: { icon: Pencil, label: "Write file", danger: true },
  search_files: { icon: Search, label: "Search files" },
  run_command: { icon: Terminal, label: "Run command", danger: true },
};

function Home() {
  const [unlocked, setUnlocked] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    setUnlocked(sessionStorage.getItem(AUTH_KEY) === "1");
    setAuthChecked(true);
  }, []);

  if (!authChecked) return null;
  if (!unlocked)
    return (
      <LockScreen
        onUnlock={() => {
          sessionStorage.setItem(AUTH_KEY, "1");
          setUnlocked(true);
        }}
      />
    );
  return <Panel onLogout={() => {
    sessionStorage.removeItem(AUTH_KEY);
    setUnlocked(false);
  }} />;
}

function LockScreen({ onUnlock }: { onUnlock: () => void }) {
  const [pw, setPw] = useState("");
  const [err, setErr] = useState(false);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pw === PASSWORD) onUnlock();
    else {
      setErr(true);
      setPw("");
    }
  }

  return (
    <div
      className="flex min-h-screen items-center justify-center px-4"
      style={{ background: "var(--gradient-bg)" }}
    >
      <Card className="w-full max-w-md border-border/50 bg-card/60 p-8 backdrop-blur-xl" style={{ boxShadow: "var(--shadow-glow)" }}>
        <div className="flex flex-col items-center text-center">
          <div
            className="flex h-14 w-14 items-center justify-center rounded-2xl"
            style={{ background: "var(--gradient-brand)" }}
          >
            <Radar className="h-7 w-7 text-primary-foreground" />
          </div>
          <h1 className="mt-5 text-2xl font-bold tracking-tight">DataScout</h1>
          <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">by AAGNEY</p>
          <p className="mt-4 text-sm text-muted-foreground">
            Enter the access password to continue.
          </p>
        </div>
        <form onSubmit={submit} className="mt-6 space-y-3">
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="password"
              autoFocus
              placeholder="Password"
              value={pw}
              onChange={(e) => {
                setPw(e.target.value);
                setErr(false);
              }}
              className="h-11 pl-9"
            />
          </div>
          {err && (
            <p className="text-xs text-destructive">Incorrect password. Try again.</p>
          )}
          <Button type="submit" className="h-11 w-full font-semibold" disabled={!pw}>
            Unlock Panel
          </Button>
        </form>
      </Card>
    </div>
  );
}

function Panel({ onLogout }: { onLogout: () => void }) {
  const [bridge, setBridge] = useState<BridgeConfig | null>(null);
  const [bridgeStatus, setBridgeStatus] = useState<"unknown" | "ok" | "fail">("unknown");
  const [initial, setInitial] = useState<UIMessage[]>([]);
  const [ready, setReady] = useState(false);
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    let cfg = loadBridge();
    if (!cfg) {
      cfg = { url: "http://localhost:7777", token: "123456789" };
      saveBridge(cfg);
    }
    setBridge(cfg);
    try {
      const raw = localStorage.getItem(MESSAGES_KEY);
      if (raw) setInitial(JSON.parse(raw));
    } catch { /* ignore */ }
    setReady(true);
  }, []);

  const { messages, sendMessage, status, addToolResult, setMessages } = useChat({
    id: "single",
    messages: initial,
    transport: new DefaultChatTransport({ api: "/api/chat" }),
    sendAutomaticallyWhen: ({ messages: msgs }) => {
      const last = msgs[msgs.length - 1];
      if (!last || last.role !== "assistant") return false;
      const toolParts = last.parts.filter((p) => p.type.startsWith("tool-")) as Array<{ state: string }>;
      if (toolParts.length === 0) return false;
      return toolParts.every((p) => p.state === "output-available" || p.state === "output-error");
    },
    onToolCall: async ({ toolCall }) => {
      const cfg = loadBridge();
      if (!cfg) {
        addToolResult({
          tool: toolCall.toolName as never,
          toolCallId: toolCall.toolCallId,
          output: { error: "Bridge not connected. Connect the local agent first." },
        });
        return;
      }
      // Auto-approve all commands — execute immediately.
      try {
        const result = await callBridge(cfg, toolCall.toolName, toolCall.input as Record<string, unknown>);
        addToolResult({ tool: toolCall.toolName as never, toolCallId: toolCall.toolCallId, output: result });
      } catch (e) {
        addToolResult({
          tool: toolCall.toolName as never,
          toolCallId: toolCall.toolCallId,
          output: { error: (e as Error).message },
        });
      }
    },
  });

  useEffect(() => {
    if (!ready) return;
    try { localStorage.setItem(MESSAGES_KEY, JSON.stringify(messages)); } catch { /* ignore */ }
  }, [messages, ready]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, status]);
  useEffect(() => { inputRef.current?.focus(); }, [status]);

  useEffect(() => {
    if (!bridge) return;
    let cancelled = false;
    const tick = async () => {
      if (cancelled || document.hidden) return;
      try { await callBridge(bridge, "ping"); if (!cancelled) setBridgeStatus("ok"); }
      catch { if (!cancelled) setBridgeStatus("fail"); }
    };
    tick();
    const id = setInterval(tick, 3000);
    const onVis = () => { if (!document.hidden) tick(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { cancelled = true; clearInterval(id); document.removeEventListener("visibilitychange", onVis); };
  }, [bridge]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || status === "streaming" || status === "submitted") return;
    sendMessage({ text });
    setInput("");
  }

  function clearChat() {
    setMessages([]);
    localStorage.removeItem(MESSAGES_KEY);
  }

  return (
    <div className="min-h-screen text-foreground" style={{ background: "var(--gradient-bg)" }}>
      <div className="mx-auto flex h-screen max-w-5xl flex-col">
        <Header
          bridge={bridge}
          bridgeStatus={bridgeStatus}
          onBridgeChange={(c) => {
            if (c) { saveBridge(c); setBridge(c); }
            else { clearBridge(); setBridge(null); setBridgeStatus("unknown"); }
          }}
          onClearChat={clearChat}
          onLogout={onLogout}
        />

        <main className="flex-1 overflow-y-auto px-4 py-6">
          {messages.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="space-y-6">
              {messages.map((m) => <MessageView key={m.id} message={m} />)}
              {(status === "submitted" || status === "streaming") &&
                messages[messages.length - 1]?.role === "user" && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Scouting…
                  </div>
                )}
            </div>
          )}
          <div ref={bottomRef} />
        </main>

        <form
          onSubmit={handleSubmit}
          className="border-t border-border/60 bg-card/60 px-4 py-3 backdrop-blur-xl"
        >
          <div className="mx-auto flex max-w-3xl items-end gap-2">
            <Textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit(e as unknown as React.FormEvent);
                }
              }}
              placeholder={
                bridgeStatus === "ok"
                  ? "Ask DataScout to do something on your laptop…"
                  : "Connect the bridge agent, then ask anything…"
              }
              className="min-h-[48px] max-h-32 resize-none rounded-xl border-border/60 bg-background/50"
              rows={1}
            />
            <Button
              type="submit"
              size="icon"
              className="h-12 w-12 rounded-xl"
              style={{ background: "var(--gradient-brand)" }}
              disabled={!input.trim() || status === "streaming" || status === "submitted"}
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
          <p className="mx-auto mt-2 max-w-3xl text-center text-[10px] text-muted-foreground">
            Auto-approve is ON · all commands execute instantly on your machine
          </p>
        </form>
      </div>
    </div>
  );
}

function Header({
  bridge, bridgeStatus, onBridgeChange, onClearChat, onLogout,
}: {
  bridge: BridgeConfig | null;
  bridgeStatus: "unknown" | "ok" | "fail";
  onBridgeChange: (c: BridgeConfig | null) => void;
  onClearChat: () => void;
  onLogout: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState(bridge?.url ?? "http://localhost:7777");
  const [token, setToken] = useState(bridge?.token ?? "123456789");

  function downloadBridge() {
    fetch("/bridge-agent.zip")
      .then((r) => r.blob())
      .then((blob) => {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "bridge-agent.zip";
        a.click();
        URL.revokeObjectURL(a.href);
      });
  }

  return (
    <header className="border-b border-border/60 bg-card/40 backdrop-blur-xl">
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-3">
          <div
            className="flex h-9 w-9 items-center justify-center rounded-lg"
            style={{ background: "var(--gradient-brand)" }}
          >
            <Radar className="h-5 w-5 text-primary-foreground" />
          </div>
          <div className="leading-tight">
            <h1 className="text-sm font-bold tracking-tight">DataScout</h1>
            <p className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">by AAGNEY</p>
          </div>
          <BridgeBadge status={bridgeStatus} />
          {bridgeStatus === "fail" && (
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="hidden text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline sm:inline"
            >
              Start the bridge →
            </button>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <Button variant="ghost" size="sm" onClick={onClearChat}>Clear</Button>
          <Button variant="ghost" size="icon" onClick={() => setOpen((o) => !o)} title="Bridge settings">
            <Plug className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={onLogout} title="Lock panel">
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </div>
      {open && (
        <div className="space-y-3 border-t border-border/60 bg-background/30 px-4 py-4">
          <p className="text-xs text-muted-foreground">
            Run the bridge agent locally, then paste the URL & token. Default token: <code className="rounded bg-muted px-1.5 py-0.5 font-mono">123456789</code>
          </p>
          <Button variant="secondary" size="sm" onClick={downloadBridge}>
            <Download className="mr-1 h-3.5 w-3.5" />
            Download bridge-agent.zip
          </Button>
          <div className="rounded-lg border border-border/60 bg-background/60 p-3 font-mono text-xs">
            <div className="text-muted-foreground">$ unzip bridge-agent.zip && cd bridge-agent</div>
            <div className="text-primary">$ node bridge.mjs</div>
          </div>
          <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
            <Input placeholder="http://localhost:7777" value={url} onChange={(e) => setUrl(e.target.value)} />
            <Input placeholder="Token" value={token} onChange={(e) => setToken(e.target.value)} />
            <div className="flex gap-2">
              <Button size="sm" onClick={() => { onBridgeChange({ url: url.trim(), token: token.trim() }); setOpen(false); }} disabled={!url.trim() || !token.trim()}>
                Connect
              </Button>
              {bridge && (
                <Button size="sm" variant="ghost" onClick={() => { onBridgeChange(null); setOpen(true); }}>
                  Disconnect
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </header>
  );
}

function BridgeBadge({ status }: { status: "unknown" | "ok" | "fail" }) {
  if (status === "ok")
    return (
      <Badge variant="secondary" className="gap-1 border-primary/30 bg-primary/10 text-primary">
        <CheckCircle2 className="h-3 w-3" /> Online
      </Badge>
    );
  if (status === "fail")
    return (
      <Badge variant="destructive" className="gap-1">
        <XCircle className="h-3 w-3" /> Offline
      </Badge>
    );
  return (
    <Badge variant="outline" className="gap-1 text-muted-foreground">
      <XCircle className="h-3 w-3" /> No bridge
    </Badge>
  );
}

function EmptyState() {
  return (
    <div className="mx-auto mt-12 max-w-2xl text-center">
      <div
        className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl"
        style={{ background: "var(--gradient-brand)", boxShadow: "var(--shadow-glow)" }}
      >
        <Sparkles className="h-8 w-8 text-primary-foreground" />
      </div>
      <h2 className="mt-6 text-3xl font-bold tracking-tight">Welcome to DataScout</h2>
      <p className="mt-3 text-muted-foreground">
        Your personal AI agent with full access to your laptop. Just ask — files, code, shell, all yours.
      </p>
      <div className="mt-8 grid gap-2 text-left text-sm sm:grid-cols-2">
        {[
          "List the files in ~/Downloads",
          "Find every TODO in this folder",
          "Create a python script that prints today's date",
          "Show me what's using port 3000",
        ].map((s) => (
          <Card key={s} className="border-border/50 bg-card/40 px-4 py-3 text-muted-foreground transition hover:border-primary/40 hover:text-foreground">
            {s}
          </Card>
        ))}
      </div>
    </div>
  );
}

type ToolPart = {
  type: string;
  toolCallId?: string;
  state?: string;
  input?: Record<string, unknown>;
  output?: unknown;
  errorText?: string;
};

function MessageView({ message }: { message: UIMessage }) {
  const isUser = message.role === "user";
  return (
    <div className={isUser ? "flex justify-end" : ""}>
      <div
        className={
          isUser
            ? "max-w-[80%] rounded-2xl px-4 py-2.5 text-primary-foreground shadow-lg"
            : "max-w-[90%] space-y-3"
        }
        style={isUser ? { background: "var(--gradient-brand)" } : undefined}
      >
        {message.parts.map((part, i) => {
          if (part.type === "text") {
            return (
              <div key={i} className="whitespace-pre-wrap text-sm leading-relaxed">
                {part.text}
              </div>
            );
          }
          if (part.type.startsWith("tool-")) {
            return <ToolView key={i} part={part as ToolPart} />;
          }
          return null;
        })}
      </div>
    </div>
  );
}

function ToolView({ part }: { part: ToolPart }) {
  const name = part.type.replace(/^tool-/, "");
  const meta = TOOL_META[name] || { icon: Terminal, label: name };
  const Icon = meta.icon;
  const [open, setOpen] = useState(false);

  const state = part.state;
  const statusLabel =
    state === "input-streaming" || state === "input-available"
      ? "Running…"
      : state === "output-available" ? "Done"
      : state === "output-error" ? "Error"
      : state || "";

  return (
    <Card className="overflow-hidden border-border/60 bg-card/60 backdrop-blur">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-muted/50"
      >
        <div className="flex items-center gap-2">
          <Icon className={`h-4 w-4 ${meta.danger ? "text-accent" : "text-primary"}`} />
          <span className="text-sm font-medium">{meta.label}</span>
          {part.input?.path ? (
            <span className="font-mono text-xs text-muted-foreground">{String(part.input.path)}</span>
          ) : part.input?.command ? (
            <span className="font-mono text-xs text-muted-foreground">{String(part.input.command).slice(0, 60)}</span>
          ) : null}
        </div>
        <Badge variant="outline" className="text-[10px]">
          {state === "input-streaming" || state === "input-available" ? (
            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
          ) : null}
          {statusLabel}
        </Badge>
      </button>
      {open && (
        <div className="space-y-2 border-t border-border/60 bg-background/30 px-3 py-2 text-xs">
          {part.input && (
            <div>
              <div className="mb-1 font-semibold text-muted-foreground">Input</div>
              <pre className="overflow-x-auto rounded bg-background/60 p-2 font-mono">
                {JSON.stringify(part.input, null, 2)}
              </pre>
            </div>
          )}
          {part.output !== undefined && (
            <div>
              <div className="mb-1 font-semibold text-muted-foreground">Output</div>
              <pre className="max-h-64 overflow-auto rounded bg-background/60 p-2 font-mono">
                {typeof part.output === "string" ? part.output : JSON.stringify(part.output, null, 2)}
              </pre>
            </div>
          )}
          {part.errorText && <div className="text-destructive">{part.errorText}</div>}
        </div>
      )}
    </Card>
  );
}
