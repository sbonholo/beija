-- Phase post-N: push_platform column + reactivate_account RPC
--
-- push_platform: lets the notify_* edge functions know whether to use APNs (iOS)
-- or FCM (Android). The client writes it alongside push_token in registerPushNotifications.
--
-- reactivate_account: the user signs back in within the 30-day grace window and
-- chooses to cancel the deletion. Clears soft-delete + marks the request cancelled.

alter table profiles
  add column if not exists push_platform text
  check (push_platform in ('ios', 'android'));

create or replace function reactivate_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not_authenticated';
  end if;
  update profiles set deleted_at = null where id = uid;
  update deletion_requests
    set cancelled_at = now()
    where user_id = uid and cancelled_at is null;
end;
$$;

grant execute on function reactivate_account() to authenticated;
