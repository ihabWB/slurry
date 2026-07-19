-- حجز جديد 10% على حصة البلدية (14%) في المطالبات المالية
-- يُشغَّل يدوياً في Supabase SQL Editor قبل نشر الكود
alter table public.disbursements
  add column if not exists municipality_retention_amount numeric not null default 0;
