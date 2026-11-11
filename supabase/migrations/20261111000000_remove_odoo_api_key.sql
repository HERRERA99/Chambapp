begin;

-- The Odoo API key is no longer used anywhere: the browser extension talks to Odoo
-- with the user's own Odoo session. Remove the RPC, its private implementation and
-- the stored keys, so no secret is kept that nothing needs.
drop function if exists public.chambapp_configurar_odoo(text, boolean);
drop function if exists chambapp_private.configurar_odoo(text, boolean);
drop table if exists chambapp_private.odoo_credenciales;

notify pgrst, 'reload schema';
commit;
