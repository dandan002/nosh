-- Kitchen display needs to see new tickets and status changes live rather
-- than on a manual refresh. order_items is the only table that needs to be
-- on the realtime publication for this: a new ticket firing inserts
-- order_items rows (with restaurant_id and order_id already on the row, so
-- the client can filter/re-fetch without a join), and advancing a ticket
-- updates order_items.status. RLS on order_items ("members can read order
-- items") already scopes what a subscriber can see.
alter publication supabase_realtime add table order_items;
