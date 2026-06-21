import { NextResponse } from "next/server";
import { createSupplier, searchSuppliers, type Supplier } from "@/lib/purchase-orders/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const q = url.searchParams.get("q") ?? "";
    const list = await searchSuppliers(q);
    return NextResponse.json(list);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Không tải được danh sách nhà cung cấp." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Partial<Supplier>;
    if (!body.name || !String(body.name).trim()) {
      return NextResponse.json({ error: "Tên nhà cung cấp là bắt buộc." }, { status: 400 });
    }
    const created = await createSupplier(body);
    return NextResponse.json(created);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Không tạo được nhà cung cấp." },
      { status: 500 }
    );
  }
}
