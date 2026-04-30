-- RPC: يحسب كل إحصاءات الداشبورد من جدول trips على مستوى DB
-- يتجاوز مشكلة max_rows=1000 في PostgREST
create or replace function get_dashboard_aggregates(
  p_month_start      text,
  p_prev_month_start text,
  p_prev_month_end   text
)
returns json
language sql
security definer
as $$
  with
  all_stats as (
    select
      count(trip_cost)                                                                         as trips_with_cost,
      coalesce(sum(trip_cost), 0)                                                              as total_project_cost,
      count(*) filter (where payment_status = 'paid')                                         as paid_trips_count,
      coalesce(sum(factory_contribution) filter (where payment_status = 'paid'), 0)           as collected_factory_contribution,
      count(distinct factory_id)                                                               as active_factories_total,
      coalesce(sum(volume_m3), 0)                                                              as total_volume,
      count(*) filter (where waste_type = 'liquid')                                            as liquid_count,
      coalesce(sum(volume_m3) filter (where waste_type = 'liquid'), 0)                        as liquid_volume,
      count(*) filter (where waste_type = 'solid')                                             as dry_count,
      coalesce(sum(volume_m3) filter (where waste_type = 'solid'), 0)                         as dry_volume,
      count(*) filter (where dump_site = 'central_press')                                     as central_press_count,
      coalesce(sum(volume_m3) filter (where dump_site = 'central_press'), 0)                  as central_press_volume,
      count(*) filter (where dump_site = 'municipal_dump' and coalesce(distance_km,0) <= 7)   as khallet_count,
      coalesce(sum(volume_m3) filter (where dump_site = 'municipal_dump' and coalesce(distance_km,0) <= 7), 0) as khallet_volume,
      count(*) filter (where dump_site = 'municipal_dump' and coalesce(distance_km,0) > 7)    as sa3ir_count,
      coalesce(sum(volume_m3) filter (where dump_site = 'municipal_dump' and coalesce(distance_km,0) > 7), 0) as sa3ir_volume
    from trips
  ),
  month_stats as (
    select
      count(*)                                                                                 as month_trips_count,
      count(distinct factory_id)                                                               as active_factories_this_month,
      coalesce(sum(volume_m3), 0)                                                              as month_volume,
      count(*) filter (where waste_type = 'liquid')                                            as liquid_count_month,
      coalesce(sum(volume_m3) filter (where waste_type = 'liquid'), 0)                        as liquid_volume_month,
      count(*) filter (where waste_type = 'solid')                                             as dry_count_month,
      coalesce(sum(volume_m3) filter (where waste_type = 'solid'), 0)                         as dry_volume_month,
      count(*) filter (where dump_site = 'central_press')                                     as central_press_count_month,
      coalesce(sum(volume_m3) filter (where dump_site = 'central_press'), 0)                  as central_press_volume_month,
      count(*) filter (where dump_site = 'municipal_dump' and coalesce(distance_km,0) <= 7)   as khallet_count_month,
      coalesce(sum(volume_m3) filter (where dump_site = 'municipal_dump' and coalesce(distance_km,0) <= 7), 0) as khallet_volume_month,
      count(*) filter (where dump_site = 'municipal_dump' and coalesce(distance_km,0) > 7)    as sa3ir_count_month,
      coalesce(sum(volume_m3) filter (where dump_site = 'municipal_dump' and coalesce(distance_km,0) > 7), 0) as sa3ir_volume_month
    from trips
    where trip_date >= p_month_start::date
  ),
  prev_month_stats as (
    select count(*) as prev_month_trips_count
    from trips
    where trip_date >= p_prev_month_start::date
      and trip_date <= p_prev_month_end::date
  )
  select json_build_object(
    'trips_with_cost',                    a.trips_with_cost,
    'total_project_cost',                 a.total_project_cost,
    'paid_trips_count',                   a.paid_trips_count,
    'collected_factory_contribution',     a.collected_factory_contribution,
    'active_factories_total',             a.active_factories_total,
    'total_volume',                       a.total_volume,
    'liquid_count',                       a.liquid_count,
    'liquid_volume',                      a.liquid_volume,
    'dry_count',                          a.dry_count,
    'dry_volume',                         a.dry_volume,
    'central_press_count',                a.central_press_count,
    'central_press_volume',               a.central_press_volume,
    'khallet_count',                      a.khallet_count,
    'khallet_volume',                     a.khallet_volume,
    'sa3ir_count',                        a.sa3ir_count,
    'sa3ir_volume',                       a.sa3ir_volume,
    'month_trips_count',                  m.month_trips_count,
    'active_factories_this_month',        m.active_factories_this_month,
    'month_volume',                       m.month_volume,
    'liquid_count_month',                 m.liquid_count_month,
    'liquid_volume_month',                m.liquid_volume_month,
    'dry_count_month',                    m.dry_count_month,
    'dry_volume_month',                   m.dry_volume_month,
    'central_press_count_month',          m.central_press_count_month,
    'central_press_volume_month',         m.central_press_volume_month,
    'khallet_count_month',                m.khallet_count_month,
    'khallet_volume_month',               m.khallet_volume_month,
    'sa3ir_count_month',                  m.sa3ir_count_month,
    'sa3ir_volume_month',                 m.sa3ir_volume_month,
    'prev_month_trips_count',             p.prev_month_trips_count
  )
  from all_stats a, month_stats m, prev_month_stats p;
$$;
