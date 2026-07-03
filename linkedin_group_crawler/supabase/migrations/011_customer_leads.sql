-- Bảng lưu thông tin khách hàng (Customer Leads)
CREATE TABLE IF NOT EXISTS public.customer_leads (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_name TEXT NOT NULL,
    company_name TEXT,
    leaded_by UUID REFERENCES public.app_users(id), -- Người lead về
    is_assigned BOOLEAN DEFAULT false, -- Đã chuyển leader/admin xử lý chưa
    sdr_id UUID REFERENCES public.app_users(id), -- Admin/leader được giao xử lý
    conv_id TEXT, -- ID cuộc hội thoại để link nhanh tới FB Inbox
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'closed', 'rejected')), -- Trạng thái: đang chờ, đã chốt, từ chối
    note TEXT, -- Ghi chú liên lạc
    reject_reason TEXT, -- Lý do từ chối
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Trigger auto update updated_at
CREATE OR REPLACE FUNCTION update_customer_leads_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_customer_leads_updated_at
BEFORE UPDATE ON public.customer_leads
FOR EACH ROW
EXECUTE FUNCTION update_customer_leads_updated_at();

-- RLS Policies
ALTER TABLE public.customer_leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated full access to customer_leads"
ON public.customer_leads
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);
