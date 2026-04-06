-- Doctors marketplace directory (future doctor portal)

create extension if not exists pgcrypto;

create table if not exists public.doctors (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  title text,
  primary_specialty text not null,
  tags text[] not null default '{}',
  languages text[] not null default '{}',
  hospital_name text not null,
  location text not null,
  about text not null,
  contact_phone text,
  contact_url text,
  price_guide jsonb not null default '[]'::jsonb,

  -- Store only a hash. Never expose this field to clients.
  password_hash text,

  sort_rank int not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.doctors enable row level security;

create index if not exists doctors_sort_rank_idx on public.doctors(sort_rank);

-- Keep updated_at fresh
drop trigger if exists set_updated_at_on_doctors on public.doctors;
create trigger set_updated_at_on_doctors
before update on public.doctors
for each row execute procedure public.set_updated_at();

-- Seed a few sample doctors for the marketplace
insert into public.doctors (
  name,
  title,
  primary_specialty,
  tags,
  languages,
  hospital_name,
  location,
  about,
  contact_phone,
  contact_url,
  price_guide,
  password_hash,
  sort_rank
) values
(
  'Dr. Amina Yusuf',
  'MBBS',
  'Family Medicine',
  array['Women's Health','Hypertension'],
  array['English','Hausa'],
  'CityCare Hospital',
  'Abuja',
  'General practitioner focused on primary care, women’s health, and chronic disease follow-ups. Works with patients to clarify symptoms and next steps.',
  '+2348000000000',
  null,
  jsonb_build_array(
    jsonb_build_object('label','Consultation (typical)','range','₦10,000–₦25,000'),
    jsonb_build_object('label','Basic labs (typical)','range','₦5,000–₦20,000')
  ),
  crypt('change-me', gen_salt('bf')),
  10
),
(
  'Dr. Chinedu Okafor',
  'MBBS',
  'Internal Medicine',
  array['Diabetes','Respiratory'],
  array['English','Igbo'],
  'Lakeside Medical Centre',
  'Lagos',
  'Internal medicine clinician with experience in adult care, metabolic conditions, and common respiratory complaints. Coordinates referrals when needed.',
  null,
  'https://example.com',
  jsonb_build_array(
    jsonb_build_object('label','Consultation (typical)','range','₦15,000–₦35,000')
  ),
  crypt('change-me', gen_salt('bf')),
  20
),
(
  'Dr. Fatima Bello',
  'MBBS',
  'Pediatrics',
  array['Fever','Cough'],
  array['English','Yorùbá'],
  'Sunrise Clinic',
  'Ibadan',
  'Pediatric clinician focused on common childhood symptoms, preventative care, and caregiver education. Helps families decide when urgent in-person care is needed.',
  '+2348000000000',
  null,
  '[]'::jsonb,
  crypt('change-me', gen_salt('bf')),
  30
)
on conflict do nothing;
