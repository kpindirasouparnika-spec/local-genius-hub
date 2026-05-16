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
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Loader2,
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
      { title: "Local Agent — Computer Control" },
      {
        name: "description",
        content:
          "Chat-based AI agent that controls your laptop's filesystem and shell via a local bridge.",
      },
    ],
  }),
});

const MESSAGES_KEY = "chat-messages";

const TOOL_META: Record<
  string,
  { icon: typeof Terminal; label: string; danger?: boolean }
> = {
  list_dir: { icon: FolderOpen, label: "List directory" },
  read_file: { icon: FileText, label: "Read file" },
  write_file: { icon: Pencil, label: "Write file", danger: true },
  search_files: { icon: Search, label: "Search files" },
  run_command: { icon: Terminal, label: "Run command", danger: true },
};

function Home() {
  const [bridge, setBridge] = useState<BridgeConfig | null>(null);
  const [bridgeStatus, setBridgeStatus] = useState<"unknown" | "ok" | "fail">(
    "unknown",
  );
  const [initial, setInitial] = useState<UIMessage[]>([]);
  const [ready, setReady] = useState(false);
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const pendingApprovals = useRef<
    Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void }>
  >(new Map());
  const [approvals, setApprovals] = useState<
    Array<{ toolCallId: string; toolName: string; input: Record<string, unknown> }>
  >([]);

  // Bootstrap from localStorage once
  useEffect(() => {
    setBridge(loadBridge());
    try {
      const raw = localStorage.getItem(MESSAGES_KEY);
      if (raw) setInitial(JSON.parse(raw));
    } catch {
      /* ignore */
    }
    setReady(true);
  }, []);

  const { messages, sendMessage, status, addToolResult, setMessages } = useChat({
    id: "single",
    messages: initial,
    transport: new DefaultChatTransport({ api: "/api/chat" }),
    sendAutomaticallyWhen: ({ messages: msgs }) => {
      const last = msgs[msgs.length - 1];
      if (!last || last.role !== "assistant") return false;
      // Auto-continue when all tool calls in the last assistant message have results
      const toolParts = last.parts.filter((p) =>
        p.type.startsWith("tool-"),
      ) as Array<{ state: string }>;
      if (toolParts.length === 0) return false;
      return toolParts.every(
        (p) => p.state === "output-available" || p.state === "output-error",
      );
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
      const meta = TOOL_META[toolCall.toolName];
      const needsApproval = meta?.danger === true;
      try {
        if (needsApproval) {
          await new Promise((resolve, reject) => {
            pendingApprovals.current.set(toolCall.toolCallId, { resolve, reject });
            setApprovals((a) => [
              ...a,
              {
                toolCallId: toolCall.toolCallId,
                toolName: toolCall.toolName,
                input: toolCall.input as Record<string, unknown>,
              },
            ]);
          });
        }
        const result = await callBridge(
          cfg,
          toolCall.toolName,
          toolCall.input as Record<string, unknown>,
        );
        addToolResult({
          tool: toolCall.toolName as never,
          toolCallId: toolCall.toolCallId,
          output: result,
        });
      } catch (e) {
        addToolResult({
          tool: toolCall.toolName as never,
          toolCallId: toolCall.toolCallId,
          output: { error: (e as Error).message },
        });
      }
    },
  });

  // Persist conversation
  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(MESSAGES_KEY, JSON.stringify(messages));
    } catch {
      /* ignore */
    }
  }, [messages, ready]);

  // Autoscroll + focus
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, status]);
  useEffect(() => {
    inputRef.current?.focus();
  }, [status]);

  async function checkBridge(cfg: BridgeConfig) {
    try {
      await callBridge(cfg, "ping");
      setBridgeStatus("ok");
    } catch {
      setBridgeStatus("fail");
    }
  }

  useEffect(() => {
    if (bridge) checkBridge(bridge);
  }, [bridge]);

  function approve(id: string, ok: boolean) {
    const p = pendingApprovals.current.get(id);
    if (!p) return;
    pendingApprovals.current.delete(id);
    setApprovals((a) => a.filter((x) => x.toolCallId !== id));
    if (ok) p.resolve(undefined);
    else p.reject(new Error("Rejected by user"));
  }

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
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex h-screen max-w-5xl flex-col">
        <Header
          bridge={bridge}
          bridgeStatus={bridgeStatus}
          onBridgeChange={(c) => {
            if (c) {
              saveBridge(c);
              setBridge(c);
            } else {
              clearBridge();
              setBridge(null);
              setBridgeStatus("unknown");
            }
          }}
          onClearChat={clearChat}
        />

        <main className="flex-1 overflow-y-auto px-4 py-6">
          {messages.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="space-y-6">
              {messages.map((m) => (
                <MessageView key={m.id} message={m} />
              ))}
              {(status === "submitted" || status === "streaming") &&
                messages[messages.length - 1]?.role === "user" && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Thinking…
                  </div>
                )}
            </div>
          )}
          <div ref={bottomRef} />
        </main>

        {approvals.length > 0 && (
          <div className="border-t border-destructive/40 bg-destructive/10 px-4 py-3">
            {approvals.map((a) => (
              <ApprovalCard key={a.toolCallId} {...a} onDecide={approve} />
            ))}
          </div>
        )}

        <form
          onSubmit={handleSubmit}
          className="border-t border-border bg-card px-4 py-3"
        >
          <div className="flex items-end gap-2">
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
                  ? "Ask the agent to do something on your laptop…"
                  : "Connect the bridge agent first, then ask anything…"
              }
              className="min-h-[44px] max-h-32 resize-none"
              rows={1}
            />
            <Button
              type="submit"
              size="icon"
              disabled={!input.trim() || status === "streaming" || status === "submitted"}
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Header({
  bridge,
  bridgeStatus,
  onBridgeChange,
  onClearChat,
}: {
  bridge: BridgeConfig | null;
  bridgeStatus: "unknown" | "ok" | "fail";
  onBridgeChange: (c: BridgeConfig | null) => void;
  onClearChat: () => void;
}) {
  const [open, setOpen] = useState(!bridge);
  const [url, setUrl] = useState(bridge?.url ?? "http://localhost:7777");
  const [token, setToken] = useState(bridge?.token ?? "");

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
    <header className="border-b border-border bg-card">
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          <Terminal className="h-5 w-5 text-primary" />
          <h1 className="text-base font-semibold">Local Agent</h1>
          <BridgeBadge status={bridgeStatus} />
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onClearChat}>
            Clear
          </Button>
          <Button variant="outline" size="sm" onClick={() => setOpen((o) => !o)}>
            <Plug className="mr-1 h-3.5 w-3.5" />
            {bridge ? "Bridge" : "Connect"}
          </Button>
        </div>
      </div>
      {open && (
        <div className="space-y-3 border-t border-border bg-muted/30 px-4 py-4">
          <div className="flex items-start gap-2 text-sm">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-yellow-600" />
            <p className="text-muted-foreground">
              Download and run the bridge agent on your laptop, then paste its URL and token here.
              Everything stays on your machine.
            </p>
          </div>
          <Button variant="secondary" size="sm" onClick={downloadBridge}>
            <Download className="mr-1 h-3.5 w-3.5" />
            Download bridge-agent.zip
          </Button>
          <div className="rounded-md bg-background p-3 font-mono text-xs">
            <div>$ unzip bridge-agent.zip && cd bridge-agent</div>
            <div>$ node bridge.mjs</div>
          </div>
          <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
            <Input
              placeholder="http://localhost:7777"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
            <Input
              placeholder="Token from console"
              value={token}
              onChange={(e) => setToken(e.target.value)}
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={() => {
                  onBridgeChange({ url: url.trim(), token: token.trim() });
                  setOpen(false);
                }}
                disabled={!url.trim() || !token.trim()}
              >
                Connect
              </Button>
              {bridge && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    onBridgeChange(null);
                    setOpen(true);
                  }}
                >
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
      <Badge variant="secondary" className="gap-1 bg-green-500/15 text-green-700 dark:text-green-400">
        <CheckCircle2 className="h-3 w-3" />
        Bridge connected
      </Badge>
    );
  if (status === "fail")
    return (
      <Badge variant="destructive" className="gap-1">
        <XCircle className="h-3 w-3" />
        Bridge unreachable
      </Badge>
    );
  return (
    <Badge variant="outline" className="gap-1">
      <XCircle className="h-3 w-3" />
      No bridge
    </Badge>
  );
}

function EmptyState() {
  return (
    <div className="mx-auto mt-16 max-w-xl text-center">
      <Terminal className="mx-auto h-10 w-10 text-primary" />
      <h2 className="mt-4 text-2xl font-semibold">Your local computer agent</h2>
      <p className="mt-2 text-muted-foreground">
        Connect the bridge agent on your laptop and ask the AI to browse files, edit them, search
        your code, or run shell commands. You approve every command before it runs.
      </p>
      <div className="mt-6 grid gap-2 text-left text-sm">
        {[
          "List the files in ~/Downloads",
          "Find every TODO in this folder",
          "Create a python script that prints today's date",
          "Show me what's using port 3000",
        ].map((s) => (
          <Card key={s} className="px-3 py-2 text-muted-foreground">
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
            ? "max-w-[80%] rounded-2xl bg-primary px-4 py-2 text-primary-foreground"
            : "max-w-[90%] space-y-3"
        }
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
      : state === "output-available"
        ? "Done"
        : state === "output-error"
          ? "Error"
          : state || "";

  return (
    <Card className="overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-muted/50"
      >
        <div className="flex items-center gap-2">
          <Icon
            className={`h-4 w-4 ${meta.danger ? "text-destructive" : "text-primary"}`}
          />
          <span className="text-sm font-medium">{meta.label}</span>
          {part.input?.path ? (
            <span className="font-mono text-xs text-muted-foreground">
              {String(part.input.path)}
            </span>
          ) : part.input?.command ? (
            <span className="font-mono text-xs text-muted-foreground">
              {String(part.input.command).slice(0, 60)}
            </span>
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
        <div className="space-y-2 border-t border-border bg-muted/30 px-3 py-2 text-xs">
          {part.input && (
            <div>
              <div className="mb-1 font-semibold text-muted-foreground">Input</div>
              <pre className="overflow-x-auto rounded bg-background p-2 font-mono">
                {JSON.stringify(part.input, null, 2)}
              </pre>
            </div>
          )}
          {part.output !== undefined && (
            <div>
              <div className="mb-1 font-semibold text-muted-foreground">Output</div>
              <pre className="max-h-64 overflow-auto rounded bg-background p-2 font-mono">
                {typeof part.output === "string"
                  ? part.output
                  : JSON.stringify(part.output, null, 2)}
              </pre>
            </div>
          )}
          {part.errorText && (
            <div className="text-destructive">{part.errorText}</div>
          )}
        </div>
      )}
    </Card>
  );
}

function ApprovalCard({
  toolCallId,
  toolName,
  input,
  onDecide,
}: {
  toolCallId: string;
  toolName: string;
  input: Record<string, unknown>;
  onDecide: (id: string, ok: boolean) => void;
}) {
  const meta = TOOL_META[toolName] || { icon: Terminal, label: toolName };
  const Icon = meta.icon;
  return (
    <Card className="mb-2 border-destructive/40 bg-card p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Icon className="h-4 w-4 text-destructive" />
            Approve {meta.label}?
          </div>
          <pre className="mt-2 max-h-32 overflow-auto rounded bg-muted p-2 text-xs font-mono">
            {JSON.stringify(input, null, 2)}
          </pre>
        </div>
        <div className="flex flex-col gap-2">
          <Button size="sm" onClick={() => onDecide(toolCallId, true)}>
            Approve
          </Button>
          <Button size="sm" variant="outline" onClick={() => onDecide(toolCallId, false)}>
            Reject
          </Button>
        </div>
      </div>
    </Card>
  );
}
