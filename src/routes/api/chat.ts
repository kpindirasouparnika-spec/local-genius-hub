import "@tanstack/react-start";
import { createFileRoute } from "@tanstack/react-router";
import {
  convertToModelMessages,
  streamText,
  stepCountIs,
  tool,
  type UIMessage,
} from "ai";
import { z } from "zod";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway";

const SYSTEM = `You are a local computer agent. The user runs a bridge agent on their laptop and you control it via tools.

Available tools (all execute on the user's machine through the bridge):
- list_dir(path)
- read_file(path)
- write_file(path, content)
- search_files(path, query)
- run_command(command, cwd?) — DANGEROUS, requires user approval in the UI

Rules:
- Use absolute paths when possible. The bridge's working root is the directory the user started it in.
- Prefer read_file / list_dir before writing.
- For shell commands, explain what the command does before calling run_command. Never chain destructive commands without confirmation.
- Be concise. Show results, don't dump huge files unless asked.
- Render code, paths, and command output in markdown.`;

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        const { messages } = (await request.json()) as { messages?: UIMessage[] };
        if (!Array.isArray(messages)) {
          return new Response("Messages are required", { status: 400 });
        }

        const key = process.env.LOVABLE_API_KEY;
        if (!key) return new Response("Missing LOVABLE_API_KEY", { status: 500 });

        const gateway = createLovableAiGatewayProvider(key);
        const model = gateway("google/gemini-3-flash-preview");

        // Tools defined WITHOUT execute — the browser executes them by calling the local bridge.
        const tools = {
          list_dir: tool({
            description: "List the contents of a directory on the user's machine.",
            inputSchema: z.object({
              path: z.string().describe("Absolute or relative directory path"),
            }),
          }),
          read_file: tool({
            description: "Read the contents of a text file on the user's machine.",
            inputSchema: z.object({
              path: z.string(),
            }),
          }),
          write_file: tool({
            description: "Write (or overwrite) a text file on the user's machine.",
            inputSchema: z.object({
              path: z.string(),
              content: z.string(),
            }),
          }),
          search_files: tool({
            description:
              "Recursively search file contents in a directory for a substring or regex.",
            inputSchema: z.object({
              path: z.string(),
              query: z.string(),
            }),
          }),
          run_command: tool({
            description:
              "Run a shell command on the user's machine. DANGEROUS — the user must approve each call in the UI.",
            inputSchema: z.object({
              command: z.string().describe("Shell command to execute"),
              cwd: z.string().optional().describe("Working directory"),
            }),
          }),
        };

        const result = streamText({
          model,
          system: SYSTEM,
          tools,
          stopWhen: stepCountIs(50),
          messages: await convertToModelMessages(messages),
        });

        return result.toUIMessageStreamResponse({ originalMessages: messages });
      },
    },
  },
});
