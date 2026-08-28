-- A signed contract stops being editable.
--
-- The body was already a snapshot — the person's job title and fee are written
-- into it when it is sent, so changing their profile afterwards has never
-- rewritten what they signed. But nothing enforced that. An admin, or a
-- careless script, could still update body_html on a contract somebody had
-- already put their name to, and the signature would then sit under different
-- words than the ones agreed.
--
-- What a signature attests to has to be immutable, or it attests to nothing.

create or replace function public.freeze_signed_contract()
returns trigger
language plpgsql
as $$
begin
  if old.signed_at is null then
    return new;                      -- not signed yet: still a draft in flight
  end if;

  -- Everything the signature stands over.
  if new.body_html      is distinct from old.body_html
  or new.title          is distinct from old.title
  or new.template_id    is distinct from old.template_id
  or new.recipient_user_id is distinct from old.recipient_user_id
  or new.recipient_name is distinct from old.recipient_name
  or new.recipient_email is distinct from old.recipient_email
  or new.signed_at      is distinct from old.signed_at
  or new.signed_name    is distinct from old.signed_name
  or new.signature_image_url is distinct from old.signature_image_url
  or new.signature_ip   is distinct from old.signature_ip
  or new.status         is distinct from old.status
  then
    raise exception
      'This contract was signed on % and cannot be changed. Issue a new one instead.',
      to_char(old.signed_at, 'DD Mon YYYY')
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists freeze_signed_contract on public.contracts;
create trigger freeze_signed_contract
  before update on public.contracts
  for each row
  execute function public.freeze_signed_contract();

-- Deleting one is refused for the same reason: the signed copy is the record.
create or replace function public.keep_signed_contract()
returns trigger
language plpgsql
as $$
begin
  if old.signed_at is not null then
    raise exception
      'This contract was signed on % and cannot be deleted.',
      to_char(old.signed_at, 'DD Mon YYYY')
      using errcode = 'check_violation';
  end if;
  return old;
end;
$$;

drop trigger if exists keep_signed_contract on public.contracts;
create trigger keep_signed_contract
  before delete on public.contracts
  for each row
  execute function public.keep_signed_contract();
