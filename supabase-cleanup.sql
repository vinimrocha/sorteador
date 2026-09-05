-- ============================================================
-- SCRIPT DE LIMPEZA COMPLETA
-- Execute antes de rodar supabase-schema.sql novamente
-- Ordem correta: policies -> triggers -> functions -> tables
-- ============================================================

-- ============================================
-- PASSO 1: REMOVER TODAS AS POLITICAS RLS
-- (as policies dependem das functions, precisam ir primeiro)
-- ============================================

-- Grupos
DROP POLICY IF EXISTS "Grupos visiveis publicamente" ON public.grupos;
DROP POLICY IF EXISTS "Usuarios autenticados criam grupo" ON public.grupos;
DROP POLICY IF EXISTS "Admins atualizam grupos" ON public.grupos;
DROP POLICY IF EXISTS "Admins deletam grupos" ON public.grupos;

-- Usuarios_grupo
DROP POLICY IF EXISTS "Membros veem admins do grupo" ON public.usuarios_grupo;
DROP POLICY IF EXISTS "Admins adicionam admins" ON public.usuarios_grupo;
DROP POLICY IF EXISTS "Admins removem admins" ON public.usuarios_grupo;

-- Jogadores
DROP POLICY IF EXISTS "Jogadores visiveis publicamente" ON public.jogadores;
DROP POLICY IF EXISTS "Admins inserem jogadores" ON public.jogadores;
DROP POLICY IF EXISTS "Admins atualizam jogadores" ON public.jogadores;
DROP POLICY IF EXISTS "Admins deletam jogadores" ON public.jogadores;

-- ============================================
-- PASSO 2: REMOVER TRIGGERS
-- ============================================

DROP TRIGGER IF EXISTS trg_link_auth_user ON auth.users;
DROP TRIGGER IF EXISTS trg_check_limite_usuarios_grupo ON public.usuarios_grupo;
DROP TRIGGER IF EXISTS trg_check_limite_jogadores ON public.jogadores;

-- ============================================
-- PASSO 3: REMOVER FUNCOES
-- ============================================

DROP FUNCTION IF EXISTS public.link_user_to_group();
DROP FUNCTION IF EXISTS public.check_limite_usuarios_grupo();
DROP FUNCTION IF EXISTS public.check_limite_jogadores();
DROP FUNCTION IF EXISTS public.is_admin_do_grupo(uuid);

-- ============================================
-- PASSO 4: DESABILITAR RLS E REMOVER TABELAS
-- ============================================

ALTER TABLE IF EXISTS public.grupos DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.usuarios_grupo DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.jogadores DISABLE ROW LEVEL SECURITY;

DROP TABLE IF EXISTS public.jogadores CASCADE;
DROP TABLE IF EXISTS public.usuarios_grupo CASCADE;
DROP TABLE IF EXISTS public.grupos CASCADE;

-- ============================================
-- VERIFICACAO: todas as tabelas public devem estar vazias
-- SELECT tablename FROM pg_tables WHERE schemaname = 'public';
-- ============================================
