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
