-- Migration: Provision Griham Realty and Nextgen Realty Tenants with Credentials and Dynamic Profiles
-- Date: 2026-10-24

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. Upsert Griham Realty in clients table
INSERT INTO public.clients (
  id,
  name,
  city,
  office_address,
  bot_token,
  notification_channel,
  is_active,
  company_name
)
VALUES (
  'c0000000-0000-0000-0000-000000000001'::uuid,
  'Griham Realty',
  'Vadodara',
  'Vadodara, Gujarat',
  '8931392683:AAHgKCxxVOtLQQxyh1SjU1PWJv_fylXCS5s',
  'telegram',
  true,
  'Griham Realty'
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  city = EXCLUDED.city,
  bot_token = EXCLUDED.bot_token,
  notification_channel = EXCLUDED.notification_channel,
  is_active = true,
  company_name = EXCLUDED.company_name,
  updated_at = now();

-- 2. Ensure Nextgen Realty is active
UPDATE public.clients
SET is_active = true,
    company_name = COALESCE(company_name, 'Nextgen Realty'),
    updated_at = now()
WHERE id = '8699dca1-2b97-4367-85b8-8a0db2fd51f5'::uuid;

-- 3. Provision Users and Profiles
DO $$
DECLARE
  v_griham_client_id uuid := 'c0000000-0000-0000-0000-000000000001'::uuid;
  v_nextgen_client_id uuid := '8699dca1-2b97-4367-85b8-8a0db2fd51f5'::uuid;
  v_griham_user_id uuid;
  v_nextgen_user_id uuid;
BEGIN
  -- A. Griham Realty User: kashyap@gmail.com
  SELECT id INTO v_griham_user_id FROM auth.users WHERE email = 'kashyap@gmail.com';
  
  IF v_griham_user_id IS NULL THEN
    v_griham_user_id := gen_random_uuid();
    INSERT INTO auth.users (
      id,
      instance_id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      confirmed_at,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at
    ) VALUES (
      v_griham_user_id,
      '00000000-0000-0000-0000-000000000000',
      'authenticated',
      'authenticated',
      'kashyap@gmail.com',
      crypt('Admin@12345', gen_salt('bf')),
      now(),
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('sub', v_griham_user_id::text, 'email', 'kashyap@gmail.com', 'full_name', 'Kashyap', 'email_verified', true, 'phone_verified', false),
      now(),
      now()
    );
  ELSE
    UPDATE auth.users
    SET encrypted_password = crypt('Admin@12345', gen_salt('bf')),
        email_confirmed_at = COALESCE(email_confirmed_at, now()),
        confirmed_at = COALESCE(confirmed_at, now()),
        raw_app_meta_data = '{"provider":"email","providers":["email"]}'::jsonb,
        raw_user_meta_data = jsonb_build_object('sub', v_griham_user_id::text, 'email', 'kashyap@gmail.com', 'full_name', 'Kashyap', 'email_verified', true, 'phone_verified', false),
        updated_at = now()
    WHERE id = v_griham_user_id;
  END IF;

  -- Griham Identity
  DELETE FROM auth.identities WHERE user_id = v_griham_user_id OR (identity_data->>'email' = 'kashyap@gmail.com');
  INSERT INTO auth.identities (
    id,
    user_id,
    identity_data,
    provider,
    provider_id,
    last_sign_in_at,
    created_at,
    updated_at
  ) VALUES (
    gen_random_uuid(),
    v_griham_user_id,
    jsonb_build_object('sub', v_griham_user_id::text, 'email', 'kashyap@gmail.com', 'full_name', 'Kashyap', 'email_verified', true, 'phone_verified', false),
    'email',
    v_griham_user_id::text,
    now(),
    now(),
    now()
  );

  -- Griham Profile
  INSERT INTO public.profiles (
    id,
    email,
    full_name,
    role,
    client_id,
    phone_verified,
    created_at,
    updated_at
  ) VALUES (
    v_griham_user_id::text,
    'kashyap@gmail.com',
    'Kashyap',
    'admin',
    v_griham_client_id,
    true,
    now(),
    now()
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = EXCLUDED.full_name,
    role = 'admin',
    client_id = v_griham_client_id,
    phone_verified = true,
    updated_at = now();

  -- B. Nextgen Realty User: admin@nextgenrealty.com
  SELECT id INTO v_nextgen_user_id FROM auth.users WHERE email = 'admin@nextgenrealty.com';

  IF v_nextgen_user_id IS NULL THEN
    v_nextgen_user_id := gen_random_uuid();
    INSERT INTO auth.users (
      id,
      instance_id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      confirmed_at,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at
    ) VALUES (
      v_nextgen_user_id,
      '00000000-0000-0000-0000-000000000000',
      'authenticated',
      'authenticated',
      'admin@nextgenrealty.com',
      crypt('Admin@12345', gen_salt('bf')),
      now(),
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('sub', v_nextgen_user_id::text, 'email', 'admin@nextgenrealty.com', 'full_name', 'Nextgen Admin', 'email_verified', true, 'phone_verified', false),
      now(),
      now()
    );
  ELSE
    UPDATE auth.users
    SET encrypted_password = crypt('Admin@12345', gen_salt('bf')),
        email_confirmed_at = COALESCE(email_confirmed_at, now()),
        confirmed_at = COALESCE(confirmed_at, now()),
        raw_app_meta_data = '{"provider":"email","providers":["email"]}'::jsonb,
        raw_user_meta_data = jsonb_build_object('sub', v_nextgen_user_id::text, 'email', 'admin@nextgenrealty.com', 'full_name', 'Nextgen Admin', 'email_verified', true, 'phone_verified', false),
        updated_at = now()
    WHERE id = v_nextgen_user_id;
  END IF;

  -- Nextgen Identity
  DELETE FROM auth.identities WHERE user_id = v_nextgen_user_id OR (identity_data->>'email' = 'admin@nextgenrealty.com');
  INSERT INTO auth.identities (
    id,
    user_id,
    identity_data,
    provider,
    provider_id,
    last_sign_in_at,
    created_at,
    updated_at
  ) VALUES (
    gen_random_uuid(),
    v_nextgen_user_id,
    jsonb_build_object('sub', v_nextgen_user_id::text, 'email', 'admin@nextgenrealty.com', 'full_name', 'Nextgen Admin', 'email_verified', true, 'phone_verified', false),
    'email',
    v_nextgen_user_id::text,
    now(),
    now(),
    now()
  );

  -- Nextgen Profile
  INSERT INTO public.profiles (
    id,
    email,
    full_name,
    role,
    client_id,
    phone_verified,
    created_at,
    updated_at
  ) VALUES (
    v_nextgen_user_id::text,
    'admin@nextgenrealty.com',
    'Nextgen Admin',
    'admin',
    v_nextgen_client_id,
    true,
    now(),
    now()
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = EXCLUDED.full_name,
    role = 'admin',
    client_id = v_nextgen_client_id,
    phone_verified = true,
    updated_at = now();

  -- Clean up legacy demo mock profile if it exists
  DELETE FROM public.profiles WHERE id = 'demo-admin-id';

END $$;
