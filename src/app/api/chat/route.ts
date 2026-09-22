import { NextRequest, NextResponse } from "next/server";
import { getEnv } from "@/lib/env";
import { investigate, planInvestigation } from "@/lib/ai";
import type { ChatMessage } from "@/lib/types";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      messages?: ChatMessage[];
      eventContext?: Record<string, unknown>;
    };

    if (!Array.isArray(body.messages)) {
      return NextResponse.json({ error: "messages must be an array." }, { status: 400 });
    }

    const messages = body.messages
      .filter(
        (message) =>
          message &&
          (message.role === "user" || message.role === "assistant") &&
          typeof message.content === "string",
      )
      .slice(-20);

    if (messages.length === 0) {
      return NextResponse.json({ error: "At least one message is required." }, { status: 400 });
    }

    const env = getEnv();
    const plan = await planInvestigation(messages, body.eventContext);

    if (plan.status === "clarification_needed") {
      const questionsText = plan.questions
        .map((question, index) => {
          const options = question.options.length
            ? "\n" + question.options.map((option) => "- " + option).join("\n")
            : "";
          return (index + 1) + ". " + question.question + options;
        })
        .join("\n\n");

      return NextResponse.json({
        status: "clarification_needed",
        message: {
          role: "assistant",
          content:
            "Before I search Splunk, I need to narrow the investigation so I don't scan unnecessary data.\n\n" +
            questionsText,
        },
        questions: plan.questions,
        scope: plan.scope,
        searches: [],
        demo: env.demoMode,
      });
    }

    if (env.aiProvider === "mock") {
      return NextResponse.json({
        status: "ready",
        message: {
          role: "assistant",
          content:
            "The scope is specific enough to investigate. Mock mode does not execute live AI searches. Configure AI_PROVIDER=openai and OPENAI_API_KEY to run the investigator.",
        },
        questions: [],
        scope: plan.scope,
        searches: [],
        demo: env.demoMode,
      });
    }

    const result = await investigate(messages, body.eventContext, plan.scope);

    return NextResponse.json({
      status: "investigating",
      message: result.message,
      questions: [],
      scope: plan.scope,
      searches: result.searches,
      demo: env.demoMode,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Chat request failed." },
      { status: 500 },
    );
  }
}
