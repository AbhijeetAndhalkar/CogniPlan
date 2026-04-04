-- Create the table
create table public.profiles (
  id uuid references auth.users on delete cascade not null primary key,
  full_name text,
  age int,
  bio text,
  target_goal text,
  about text,
  updated_at timestamp with time zone default timezone('utc'::text, now())
);

-- Enable RLS (Security)
alter table public.profiles enable row level security;

create policy "Users can view own profile" on profiles for select using (auth.uid() = id);
create policy "Users can update own profile" on profiles for update using (auth.uid() = id);
create policy "Users can insert own profile" on profiles for insert with check (auth.uid() = id);

-- Trigger to auto-create profile when a user signs up
create function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, new.raw_user_meta_data->>'full_name');
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ========================================================
-- MULTI-TENANCY DATA ISOLATION (RLS & USER_ID)
-- ========================================================

-- 1. Add user_id to existing tables
alter table public.todos add column user_id uuid references auth.users not null;
alter table public.habits add column user_id uuid references auth.users not null;
alter table public.habit_logs add column user_id uuid references auth.users not null;

-- 2. Enable Row Level Security
alter table public.todos enable row level security;
alter table public.habits enable row level security;
alter table public.habit_logs enable row level security;

-- 3. Restrict access heavily (Only the logged-in user can access their rows)
create policy "Users can only select their own todos" on public.todos for select using (auth.uid() = user_id);
create policy "Users can only insert their own todos" on public.todos for insert with check (auth.uid() = user_id);
create policy "Users can only update their own todos" on public.todos for update using (auth.uid() = user_id);
create policy "Users can only delete their own todos" on public.todos for delete using (auth.uid() = user_id);

create policy "Users can only select their own habits" on public.habits for select using (auth.uid() = user_id);
create policy "Users can only insert their own habits" on public.habits for insert with check (auth.uid() = user_id);
create policy "Users can only update their own habits" on public.habits for update using (auth.uid() = user_id);
create policy "Users can only delete their own habits" on public.habits for delete using (auth.uid() = user_id);

create policy "Users can only select their own logs" on public.habit_logs for select using (auth.uid() = user_id);
create policy "Users can only insert their own logs" on public.habit_logs for insert with check (auth.uid() = user_id);
create policy "Users can only update their own logs" on public.habit_logs for update using (auth.uid() = user_id);
create policy "Users can only delete their own logs" on public.habit_logs for delete using (auth.uid() = user_id);
