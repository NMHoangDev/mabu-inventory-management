import { NextResponse } from "next/server";
import { z } from "zod";
import { getSiteSettings, updateSiteSettings } from "@/lib/storefront/settings";
import { requirePermission } from "@/lib/auth/permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const guard = await requirePermission("settings.manage_storefront");
  if (guard) return guard;
  try {
    const settings = await getSiteSettings();
    return NextResponse.json({ settings });
  } catch (error) {
    console.error("GET /api/settings/storefront failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load settings." },
      { status: 500 }
    );
  }
}

const updateSchema = z.object({
  store_name: z.string().optional(),
  banner_url: z.string().optional(),
  hero_title: z.string().optional(),
  hero_subtitle: z.string().optional(),
  announcement: z.string().optional(),
  contact_phone: z.string().optional(),
  contact_address: z.string().optional(),
  featured_category_ids: z.array(z.string()).optional(),
  featured_product_ids: z.array(z.string()).optional(),
});

export async function PATCH(request: Request) {
  const guard = await requirePermission("settings.manage_storefront");
  if (guard) return guard;
  try {
    const body = await request.json();
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }
    const settings = await updateSiteSettings(parsed.data);
    return NextResponse.json({ settings });
  } catch (error) {
    console.error("PATCH /api/settings/storefront failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to save settings." },
      { status: 500 }
    );
  }
}
