import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import process from "node:process";

const SystemPrompt = `You are "Jackpot Jungle AI", a professional internal administrative assistant for the Jackpot Jungle online casino platform.
Your role is to help administrators and moderators analyze game logs, support threads, VIP metrics, wallet ledgers, and other backend operations.

Follow these communication guidelines:
1. Present yourself only as "Jackpot Jungle AI" or "Jackpot Jungle Assistant".
2. Never introduce yourself as ChatGPT, OpenAI, GPT, or any external AI model provider.
3. Be professional, friendly, clear, helpful, and concise. Use a tone appropriate for internal jackpot jungle corporate communications.
4. Keep your answers brand-focused and structured (use markdown, lists, tables, and code snippets where appropriate).
5. Never disclose system passwords, service account structures, or database connection strings unless asked by a verified administrator with clear technical authorization.`;

const MessageSchema = z.object({
  id: z.string().optional(),
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1),
  createdAt: z.string().optional(),
});

export const getAIResponse = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(z.object({
    messages: z.array(MessageSchema),
  }))
  .handler(async ({ data, context }) => {
    // 1. Authenticate that the user has admin/super_admin role permissions
    const { data: roleRows, error: roleError } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);

    if (roleError) {
      console.error("[Super AI Error] Role verification query failed:", roleError.message);
      throw new Error("Internal authorization error. Could not query user role.");
    }

    const isAdmin = (roleRows ?? []).some(
      (r: any) => r.role === "admin" || r.role === "super_admin"
    );

    if (!isAdmin) {
      console.warn(`[Super AI Warning] Blocked non-admin user ${context.userId} from invoking AI completion.`);
      throw new Error("Unauthorized: AI Chat access is restricted to Administrators only.");
    }

    // 2. Load and validate server-side configurations
    const apiKey = process.env.OPENAI_API_KEY;
    const modelName = process.env.OPENAI_MODEL || "gpt-4o-mini";

    if (!apiKey) {
      console.warn("[Super AI Warning] Missing OPENAI_API_KEY env variable on the server.");
      return {
        error: "OpenAI API key is missing on the server. Please manually add the `OPENAI_API_KEY` environment variable to your server or hosting panel configurations.",
      };
    }

    // Prepare conversational history payload (only keep role & content to clean up local parameters)
    const apiMessages = [
      { role: "system", content: SystemPrompt },
      ...data.messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
    ];

    console.info(`[Super AI] Dispatching completion request to OpenAI (Model: ${modelName})`);

    // 3. Make fetch request to OpenAI API
    try {
      const orgId = process.env.OPENAI_ORGANIZATION;
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      };
      if (orgId) {
        headers["OpenAI-Organization"] = orgId;
      }

      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers,
        body: JSON.stringify({
          model: modelName,
          messages: apiMessages,
          temperature: 0.7,
        }),
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        const status = response.status;
        console.error(`[Super AI Error] OpenAI API request failed with status ${status}:`, errorBody);

        if (status === 401) {
          return {
            error: "OpenAI Authentication Failed: The server-side API key configured by the administrator appears to be invalid or deactivated.",
          };
        } else if (status === 429) {
          return {
            error: "OpenAI Rate Limit Exceeded: Too many requests. Please wait a few moments before trying again.",
          };
        } else {
          return {
            error: `OpenAI Service Error (HTTP ${status}): ${errorBody?.error?.message || "An unexpected error occurred during message completion."}`,
          };
        }
      }

      const result = await response.json();
      const assistantMessage = result?.choices?.[0]?.message?.content;

      if (!assistantMessage) {
        console.error("[Super AI Error] OpenAI response parsing returned empty choice context:", result);
        return {
          error: "Received an empty response envelope from the AI model service.",
        };
      }

      // Return generated text response
      return {
        content: assistantMessage,
      };
    } catch (e: any) {
      console.error("[Super AI Error] Network exception during OpenAI fetch request:", e.message || e);
      return {
        error: "Network Connection Timeout: The server was unable to reach the OpenAI gateway. Please verify server internet routing or try again.",
      };
    }
  });
