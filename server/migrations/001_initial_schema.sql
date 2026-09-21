-- =============================================================================
-- MERAKI ARTES DIGITAIS — Schema Inicial do Banco de Dados (Supabase / PostgreSQL)
-- Execute este script no SQL Editor do Supabase Dashboard
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Extensões necessárias
-- ---------------------------------------------------------------------------
create extension if not exists "uuid-ossp";

-- ---------------------------------------------------------------------------
-- Tabela: profiles
-- Estende a tabela auth.users do Supabase com dados da aplicação
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
    id              uuid primary key references auth.users(id) on delete cascade,
    name            text not null,
    user_type       text not null default 'client' check (user_type in ('client', 'pro', 'admin')),
    daily_count     integer not null default 0,
    monthly_count   integer not null default 0,
    last_reset_date date,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now()
);

-- RLS: usuários só veem o próprio perfil
alter table public.profiles enable row level security;

create policy "Usuário vê próprio perfil"
    on public.profiles for select
    using (auth.uid() = id);

create policy "Usuário atualiza próprio perfil"
    on public.profiles for update
    using (auth.uid() = id);

-- ---------------------------------------------------------------------------
-- Tabela: projects
-- Armazena todos os projetos de identidade visual gerados
-- ---------------------------------------------------------------------------
create table if not exists public.projects (
    id              uuid primary key default uuid_generate_v4(),
    user_id         uuid references auth.users(id) on delete set null,
    type            text not null default 'infantil' check (type in ('infantil', 'debutante', 'adulto')),
    name            text not null,
    age             text,
    date            text,
    time            text,
    location        text,
    phrase          text,
    theme           text,
    notes           text,
    initial_letter  text,
    bg_template     text,
    status          text not null default 'draft' check (status in ('draft', 'generating', 'preview', 'paid', 'delivered', 'failed')),
    watermarked     boolean not null default true,
    assets_urls     jsonb not null default '{}',
    payment_id      text,
    payment_method  text,
    paid_at         timestamptz,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now()
);

-- RLS: usuários veem/editam apenas seus próprios projetos
alter table public.projects enable row level security;

create policy "Usuário vê próprios projetos"
    on public.projects for select
    using (auth.uid() = user_id);

create policy "Usuário cria projetos"
    on public.projects for insert
    with check (auth.uid() = user_id or user_id is null);

create policy "Usuário atualiza próprios projetos"
    on public.projects for update
    using (auth.uid() = user_id);

create policy "Usuário deleta próprios projetos"
    on public.projects for delete
    using (auth.uid() = user_id);

-- Índices para performance
create index if not exists projects_user_id_idx on public.projects(user_id);
create index if not exists projects_status_idx  on public.projects(status);
create index if not exists projects_created_idx on public.projects(created_at desc);

-- ---------------------------------------------------------------------------
-- Função: incrementar contadores de geração
-- ---------------------------------------------------------------------------
create or replace function increment_generation_count(user_uuid uuid)
returns void
language plpgsql
security definer
as $$
begin
    update public.profiles
    set
        daily_count   = daily_count + 1,
        monthly_count = monthly_count + 1,
        updated_at    = now()
    where id = user_uuid;
end;
$$;

-- ---------------------------------------------------------------------------
-- Função: trigger para atualizar updated_at automaticamente
-- ---------------------------------------------------------------------------
create or replace function update_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

create trigger projects_updated_at
    before update on public.projects
    for each row execute function update_updated_at();

create trigger profiles_updated_at
    before update on public.profiles
    for each row execute function update_updated_at();

-- ---------------------------------------------------------------------------
-- Storage: bucket para os kits gerados
-- Execute separadamente se necessário
-- ---------------------------------------------------------------------------
-- insert into storage.buckets (id, name, public)
-- values ('meraki-kits', 'meraki-kits', true)
-- on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Dados de exemplo (opcional — descomente para testar)
-- ---------------------------------------------------------------------------
-- Inserções de exemplo devem ser feitas após cadastrar usuários reais via Auth
