import { NextResponse } from "next/server";
import { z } from "zod";
import {
  createRule,
  listRules,
  runTrigger,
  seedDefaultRulesIfEmpty,
  type RuleTrigger,
} from "@/lib/automations/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const actionSchema = z.object({
  type: z.enum(["log", "mark_reorder_status", "send_webhook", "create_activity_log", "create_shipping"]),
  params: z.record(z.any()).optional(),
});

const conditionSchema = z.object({
  field: z.string().min(1),
  op: z.enum(["eq", "neq", "gt", "gte", "lt", "lte", "contains", "in"]),
  value: z.any(),
}).transform((c) => ({ field: c.field, op: c.op, value: c.value }));

const createSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  enabled: z.boolean().default(true),
  trigger: z.string().min(1),
  conditions: z.array(conditionSchema).default([]),
  actions: z.array(actionSchema).min(1),
});

const triggerSchema = z.object({
  trigger: z.string().min(1),
  payload: z.record(z.any()).default({}),
});

export async function GET() {
  try {
    await seedDefaultRulesIfEmpty();
    const rules = await listRules();
    return NextResponse.json({ rules });
  } catch (error) {
    console.error("GET /api/automations failed:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (body?.mode === "run_trigger") {
      const parsed = triggerSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json({ error: "Validation failed" }, { status: 400 });
      }
      const result = await runTrigger(parsed.data.trigger as RuleTrigger, parsed.data.payload);
      return NextResponse.json(result);
    }
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten().fieldErrors }, { status: 400 });
    }
    const rule = await createRule({
      name: parsed.data.name,
      description: parsed.data.description ?? "",
      enabled: parsed.data.enabled,
      trigger: parsed.data.trigger as any,
      conditions: parsed.data.conditions,
      actions: parsed.data.actions,
    });
    if (!rule) {
      return NextResponse.json({ error: "Database chưa cấu hình." }, { status: 400 });
    }
    return NextResponse.json({ rule });
  } catch (error) {
    console.error("POST /api/automations failed:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed" }, { status: 500 });
  }
}
