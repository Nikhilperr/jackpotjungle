import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import process from "node:process";
import fs from "node:fs";
import path from "node:path";

function loadEnvFile() {
  try {
    let dir = process.cwd();
    for (let i = 0; i < 5; i++) {
      const envPath = path.join(dir, ".env");
      if (fs.existsSync(envPath)) {
        const content = fs.readFileSync(envPath, "utf-8");
        content.split("\n").forEach((line) => {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith("#")) return;
          const index = trimmed.indexOf("=");
          if (index === -1) return;
          const key = trimmed.substring(0, index).trim();
          let val = trimmed.substring(index + 1).trim();
          if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.substring(1, val.length - 1);
          }
          if (!process.env[key]) {
            process.env[key] = val;
          }
        });
        console.log(`[Super AI] Successfully loaded env variables from: ${envPath}`);
        return;
      }
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  } catch (e) {
    console.error("[Super AI Warning] Failed to read .env file from disk:", e);
  }
}

const SystemPrompt = `You are "Jackpot Jungle AI", a professional internal administrative assistant for the Jackpot Jungle online casino platform.
Your role is to help administrators and moderators analyze game logs, support threads, VIP metrics, wallet ledgers, and other backend operations.

Follow these communication guidelines:
1. Present yourself only as "Jackpot Jungle AI" or "Jackpot Jungle Assistant".
2. Never introduce yourself as ChatGPT, OpenAI, GPT, or any external AI model provider.
3. Be professional, friendly, clear, helpful, and concise. Use a tone appropriate for internal jackpot jungle corporate communications.
4. Keep your answers brand-focused and structured (use markdown, lists, tables, and code snippets where appropriate).
5. Never disclose system passwords, service account structures, or database connection strings unless asked by a verified administrator with clear technical authorization.

If the administrator requests an action that affects players (e.g. sending a broadcast, direct message, custom push notification, or scheduling/modifying follow-ups/re-engagement campaigns):
1. Check if you have all required parameters (e.g. text content, targets, VIP groups). Ask clarifying questions if anything is missing. Do not guess.
2. Write a professional markdown summary layout detailing the action parameters (e.g. Recipients, campaign name, channels).
3. Include a JSON block at the bottom of your response with the exact parameters. The schema of the JSON block must match:
   * For sending a broadcast:
     \`\`\`json
     {
       "action": "send_broadcast",
       "targetType": "all" | "tag" | "selected",
       "tagId": "UUID" (optional),
       "content": "casino announcement text"
     }
     \`\`\`
   * For sending custom push notifications to all users:
     \`\`\`json
     {
       "action": "send_push",
       "title": "🎰 Casino Notification Title",
       "message": "Notification details..."
     }
     \`\`\`
   * For sending a single user direct message:
     \`\`\`json
     {
       "action": "send_message",
       "userId": "UUID",
       "username": "recipient username",
       "content": "message body text"
     }
     \`\`\`
   * For scheduling a user follow-up:
     \`\`\`json
     {
       "action": "schedule_followup",
       "userId": "UUID",
       "username": "recipient username",
       "days": 1 | 3 | 7 | 14,
       "message": "message template content"
     }
     \`\`\`
   * For updating automatic re-engagement parameters:
     \`\`\`json
     {
       "action": "configure_reengagement",
       "inactivity_days": number,
       "enabled": boolean,
       "message_template": "campaign message text template"
     }
     \`\`\`

Always wrap templates in casino-themed aesthetics and tasteful emojis. Respect existing administrator permissions.
If the administrator requests to send a broadcast, campaign, message, or notification, ALWAYS draft the promotional content immediately and output the corresponding action JSON block. Do not write warning explanations or troubleshoot unless there is a database query error.`;

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
    // Load local environment variables dynamically if not present
    loadEnvFile();

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

    // Prepare conversational history payload (only keep role & content)
    const apiMessages: any[] = [
      { role: "system", content: SystemPrompt },
      ...data.messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
    ];

    // Expose platform knowledge database lookup functions
    const tools = [
      {
        type: "function" as const,
        function: {
          name: "get_users_list",
          description: "Search user profiles by username or email, and view their balances, VIP status, activity status, or block status.",
          parameters: {
            type: "object",
            properties: {
              searchQuery: { type: "string", description: "Partial username or email search string" },
              vipStatus: { type: "string", description: "Filter by VIP tier (none, bronze, silver, gold, platinum, diamond)" },
              limit: { type: "number", default: 20 },
            },
          },
        },
      },
      {
        type: "function" as const,
        function: {
          name: "get_user_tags",
          description: "List all custom user tags (e.g. VIP levels, categories) and see which user IDs are mapped to them.",
          parameters: {
            type: "object",
            properties: {},
          },
        },
      },
      {
        type: "function" as const,
        function: {
          name: "get_recent_broadcasts",
          description: "Get the history of recently sent group broadcast announcements.",
          parameters: {
            type: "object",
            properties: {
              limit: { type: "number", default: 10 },
            },
          },
        },
      },
      {
        type: "function" as const,
        function: {
          name: "get_followups_list",
          description: "Check the list of currently scheduled follow-up reminders and inactivity messages.",
          parameters: {
            type: "object",
            properties: {
              limit: { type: "number", default: 10 },
            },
          },
        },
      },
      {
        type: "function" as const,
        function: {
          name: "get_system_settings",
          description: "Retrieve system configurations such as re-engagement campaign thresholds and templates.",
          parameters: {
            type: "object",
            properties: {},
          },
        },
      }
    ];

    console.info(`[Super AI] Dispatching completion request to OpenAI (Model: ${modelName})`);

    try {
      const orgId = process.env.OPENAI_ORGANIZATION;
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      };
      if (orgId) {
        headers["OpenAI-Organization"] = orgId;
      }

      let runs = 0;
      while (runs < 5) {
        const response = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers,
          body: JSON.stringify({
            model: modelName,
            messages: apiMessages,
            tools: tools,
            tool_choice: "auto",
            temperature: 0.7,
          }),
        });

        if (!response.ok) {
          const errorBody = await response.json().catch(() => ({}));
          const status = response.status;
          console.error(`[Super AI Error] OpenAI API request failed with status ${status}:`, errorBody);

          if (status === 401) {
            return { error: "OpenAI Authentication Failed: The server-side API key configured by the administrator appears to be invalid or deactivated." };
          } else if (status === 429) {
            return { error: "OpenAI Rate Limit Exceeded: Too many requests. Please wait a few moments before trying again." };
          } else {
            return { error: `OpenAI Service Error (HTTP ${status}): ${errorBody?.error?.message || "An unexpected error occurred during message completion."}` };
          }
        }

        const result = await response.json();
        const choice = result?.choices?.[0];
        const assistantMessage = choice?.message;

        if (!assistantMessage) {
          console.error("[Super AI Error] OpenAI response parsing returned empty choice context:", result);
          return { error: "Received an empty response envelope from the AI model service." };
        }

        // Push message to conversational stack for memory
        apiMessages.push(assistantMessage);

        if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
          runs++;
          for (const call of assistantMessage.tool_calls) {
            const name = call.function.name;
            const args = JSON.parse(call.function.arguments || "{}");
            let toolResult: any;

            console.info(`[Super AI Tool Execution] Executing function: ${name}`);

            try {
              if (name === "get_users_list") {
                let query = context.supabase
                  .from("profiles")
                  .select("id, username, first_name, last_name, email, wallet_balance, credit_balance, last_seen, vip_status, is_blocked, created_at");

                if (args.searchQuery) {
                  query = query.or(`username.ilike.%${args.searchQuery}%,email.ilike.%${args.searchQuery}%`);
                }
                if (args.vipStatus) {
                  query = query.eq("vip_status", args.vipStatus);
                }
                const { data, error } = await query.limit(args.limit || 20);
                toolResult = error ? { error: error.message } : data;
              } else if (name === "get_user_tags") {
                const [tagsRes, userTagsRes] = await Promise.all([
                  context.supabase.from("tags").select("*"),
                  context.supabase.from("user_tags").select("*"),
                ]);
                toolResult = (tagsRes.error || userTagsRes.error)
                  ? { error: (tagsRes.error?.message || userTagsRes.error?.message) }
                  : { tags: tagsRes.data, userTags: userTagsRes.data };
              } else if (name === "get_recent_broadcasts") {
                const { data, error } = await context.supabase
                  .from("broadcasts")
                  .select("*")
                  .order("created_at", { ascending: false })
                  .limit(args.limit || 10);
                toolResult = error ? { error: error.message } : data;
              } else if (name === "get_followups_list") {
                const { data, error } = await context.supabase
                  .from("followups")
                  .select("*")
                  .order("scheduled_at", { ascending: true })
                  .limit(args.limit || 10);
                toolResult = error ? { error: error.message } : data;
              } else if (name === "get_system_settings") {
                const { data, error } = await context.supabase
                  .from("system_settings")
                  .select("*");
                toolResult = error ? { error: error.message } : data;
              } else {
                toolResult = { error: `Tool ${name} not found.` };
              }
            } catch (err: any) {
              toolResult = { error: err.message || "Execution exception occurred." };
            }

            apiMessages.push({
              role: "tool",
              tool_call_id: call.id,
              name: name,
              content: JSON.stringify(toolResult),
            });
          }
        } else {
          // No more tool calls, return final text content
          return {
            content: assistantMessage.content || "",
          };
        }
      }

      // If loop finished without response
      const lastMsg = apiMessages[apiMessages.length - 1];
      return {
        content: lastMsg?.content || "Executed tools successfully, but no completion response was compiled.",
      };
    } catch (e: any) {
      console.error("[Super AI Error] Network exception during OpenAI fetch request:", e.message || e);
      return {
        error: "Network Connection Timeout: The server was unable to reach the OpenAI gateway. Please verify server internet routing or try again.",
      };
    }
  });
