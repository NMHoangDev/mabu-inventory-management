import { NextResponse } from "next/server";
import {
  getCashBookEntry,
  updateCashBookEntry,
  deleteCashBookEntry,
  type CreateCashBookEntryInput
} from "@/lib/cash-book/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const data = await getCashBookEntry(id);
    if (!data) return NextResponse.json({ error: "Không tìm thấy phiếu." }, { status: 404 });
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Không tải được phiếu." },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const body = (await request.json()) as Partial<CreateCashBookEntryInput>;
    if (body.amount !== undefined && body.amount < 0) {
      return NextResponse.json({ error: "Số tiền không được âm." }, { status: 400 });
    }
    const updated = await updateCashBookEntry(id, body);
    return NextResponse.json(updated);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Không cập nhật được phiếu." },
      { status: 500 }
    );
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    await deleteCashBookEntry(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Không xóa được phiếu." },
      { status: 500 }
    );
  }
}
