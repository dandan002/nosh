-- Extends the realtime publication (started in 0003_kitchen_realtime.sql
-- with order_items) to the floor plan and order-entry table picker: tables
-- for status/position changes, table_sessions for open/close. RLS on both
-- ("members can read tables" / "members can read table sessions") already
-- scopes what a subscriber can see.
alter publication supabase_realtime add table tables;
alter publication supabase_realtime add table table_sessions;
