import { NextResponse } from "next/server";
import {
  listSuppliers,
  createSupplier,
  getNextSupplierCode,
  type CreateSupplierInput
} from "@/lib/suppliers/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const search = url.searchParams.get("search") ?? undefined;
    const status = url.searchParams.get("status") ?? undefined;
    const productId = url.searchParams.get("productId") ?? undefined;
    const page = Number(url.searchParams.get("page")) || 1;
    const pageSize = Number(url.searchParams.get("pageSize")) || 20;
    const result = await listSuppliers({ search, status, page, pageSize, productId });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Không tải được danh sách nhà cung cấp." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as CreateSupplierInput;
    if (!body.name?.trim()) {
      return NextResponse.json({ error: "Tên nhà cung cấp là bắt buộc." }, { status: 400 });
    }
    const created = await createSupplier(body);
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Không tạo được nhà cung cấp." },
      { status: 500 }
    );
  }
}
