import { NextResponse } from "next/server";
import {
  listCashBookEntries,
  createCashBookEntry,
  type CreateCashBookEntryInput,
  type VoucherType,
  type VoucherStatus
} from "@/lib/cash-book/repository";
import { requireAnyPermission, requirePermission } from "@/lib/auth/permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function voucherPermissionModule(voucherType: VoucherType): "receipt_vouchers" | "payment_vouchers" {
  return voucherType === "payment" ? "payment_vouchers" : "receipt_vouchers";
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const voucher_type = url.searchParams.get("voucher_type") as VoucherType | null || undefined;
    const guard = voucher_type
      ? await requirePermission(`${voucherPermissionModule(voucher_type)}.view`)
      : await requireAnyPermission(["receipt_vouchers.view", "payment_vouchers.view"]);
    if (guard) return guard;
    const status = url.searchParams.get("status") as VoucherStatus | null || undefined;
    const search = url.searchParams.get("search") || undefined;
    const page = Number(url.searchParams.get("page")) || 1;
    const pageSize = Number(url.searchParams.get("pageSize")) || 20;
    const result = await listCashBookEntries({ voucher_type, status, search, page, pageSize });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Không tải được danh sách phiếu." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as CreateCashBookEntryInput;
    const guard = await requirePermission(`${voucherPermissionModule(body.voucher_type ?? "receipt")}.create`);
    if (guard) return guard;
    if (body.amount !== undefined && body.amount < 0) {
      return NextResponse.json({ error: "Số tiền không được âm." }, { status: 400 });
    }
    const created = await createCashBookEntry(body);
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Không tạo được phiếu." },
      { status: 500 }
    );
  }
}
