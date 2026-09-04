## Table Index

| # | Table | Fields |
| ---: | --- | ---: |
| 1 | `dim_branch` | 18 |
| 2 | `fact_cash_position` | 16 |
| 3 | `fact_cash_flow_daily` | 13 |
| 4 | `fact_branch_denomination` | 13 |
| 5 | `dim_truck` | 6 |
| 6 | `dim_machine` | 10 |
| 7 | `fact_machine_position` | 16 |
| 8 | `fact_machine_denomination` | 20 |
| 9 | `fact_machine_flow_daily` | 13 |
| 10 | `fact_route_summary` | 37 |
| 11 | `fact_route_stop` | 20 |

---

## 1. `dim_branch`

**Workbook sheet:** `dim_branch`  
**Field count:** 18

| field | type | definition | source |
| --- | --- | --- | --- |
| branch_code | STRING | รหัสสาขา | br_master_channel.unit_code |
| branch_name | STRING | ชื่อสาขา | br_master_channel.br_data_name |
| center_id | STRING | รหัสศูนย์เงินสด (เช่น 006CC2) | br_master_channel.uc_center_id |
| province_name | STRING | ชื่อจังหวัด | br_master_channel.br_data_province |
| district_name | STRING | ชื่ออำเภอ/สำนักงาน | br_master_channel.br_district_office |
| latitude | DOUBLE | latitude | br_master_channel.br_lat |
| longitude | DOUBLE | longitude | br_master_channel.br_lon |
| cash_capacity_thb | DECIMAL(18,2) | วงเงินตู้เซฟสาขา (THB) | br_capacity.capacity |
| min_threshold_thb | DECIMAL(18,2) | ขั้นต่ำก่อน trigger replenish |  |
| window_start | STRING | เวลาเปิดสาขา (HH:MM) | extract จาก br_master_channel.br_weekday_hours |
| window_end | STRING | เวลาปิดสาขา (HH:MM) | extract จาก br_master_channel.br_weekday_hours |
| working_days | INT | จำนวนวันทำงาน/สัปดาห์ | extract จาก br_master_channel.br_working_days |
| branch_tier | STRING | tier | br_master_channel.br_tier |
| location_type | STRING | ประเภทที่ตั้ง (ชุมชน/ห้าง) | br_master_channel.br_loc_type |
| open_saturday | STRING | เวลาเปิดวันเสาร์ ("-" = ไม่เปิด) | br_master_channel.br_saturday |
| open_sunday | STRING | เวลาเปิดวันอาทิตย์ ("-" = ไม่เปิด) | br_master_channel.br_sunday |
| service_minutes | INT | เวลาที่ CIT truck ใช้ต่อจุด (นาที) |  |
| updated_at | TIMESTAMP | เวลาที่ record ถูกสร้าง/อัพเดท | current_timestamp() |

---

## 2. `fact_cash_position`

**Workbook sheet:** `fact_cash_position`  
**Field count:** 16

| field | type | definition | source | Additional note 1 |
| --- | --- | --- | --- | --- |
| business_date | DATE | วันที่วางแผน (planning date) |  | CAST(service_date AS DATE) จาก br_denom_plan_opth |
| center_id | STRING | รหัสศูนย์เงินสด | JOIN dim_branch |  |
| branch_code | STRING | รหัสสาขา (FK → dim_branch) | br_forecast_opth_rev.br_id |  |
| actual_cash_d_minus_1 | DECIMAL(18,2) | ยอดเงินคงเหลือ ณ วันล่าสุดที่มีข้อมูล | stockh.total (latest per branch) |  |
| predicted_deposit_d | DECIMAL(18,2) | Forecast ยอดลูกค้าฝากเงินวัน d | br_forecast_opth_rev.pred_dep |  |
| predicted_withdrawal_d | DECIMAL(18,2) | Forecast ยอดลูกค้าถอนเงินวัน d | br_forecast_opth_rev.pred_wd |  |
| predicted_cash_d | DECIMAL(18,2) | ยอดเงิน predicted ณ สิ้นวัน d (actual + deposit − withdrawal) | actual_cash_d_minus_1 + predicted_deposit_d - predicted_withdrawal_d |  |
| action_type | STRING | ผลจาก optimization model: DELIVERY / PICKUP / NO_ACTION | CASE from br_denom_plan_opth.fill_amount |  |
| delivery_amount_thb | DECIMAL(18,2) | จำนวนเงินที่ model แนะนำให้ส่งไปสาขา | br_denom_plan_opth.fill_amount |  |
| pickup_amount_thb | DECIMAL(18,2) | จำนวนเงินที่ model แนะนำให้เก็บกลับ |  |  |
| health_status | STRING | HEALTHY / WATCH / ACTION_NEEDED / CRITICAL | remaining[d] = actual_cash[d-1] + forecast_deposit[d] - forecast_withdrawal[d]<br>SS_low[d] = safety stock (lower bound)<br>SS_high[d] = safety stock (upper bound)<br>health[d] = (remaining[d] - SS_low[d]) / (SS_high[d] - SS_low[d])<br><br>Critical: health[d] < 0 หรือ > 1<br>Action Needed: health[d]< 0.15 หรือ > 0.85<br>Watch: health[d]< 0.30 หรือ > 0.70<br>Healthy: 0.30 ≤ health[d] ≤ 0.70<br><br>d=day<br>คำนวณยอดรวม ไม่ต้องแยก denom |  |
| emergency_flag | BOOLEAN | emergency |  |  |
| cost_of_fund_thb | DECIMAL(18,2) | cost of fund |  |  |
| model_id | STRING |  |  |  |
| model_version | STRING |  |  |  |
| updated_at | TIMESTAMP | เวลาที่ record ถูกสร้าง |  |  |

---

## 3. `fact_cash_flow_daily`

**Workbook sheet:** `fact_cash_flow_daily`  
**Field count:** 13

| field | type | definition | source | Additional note 1 |
| --- | --- | --- | --- | --- |
| business_date | DATE | planning date |  | target date |
| center_id | STRING | รหัสศูนย์เงินสด | JOIN dim_branch |  |
| branch_code | STRING | รหัสสาขา | br_daily_demand_2y.br_id หรือ br_forecast_opth_rev.br_id |  |
| series_date | DATE | วันที่ของ transaction/prediction | br_daily_demand_2y.txn_date |  |
| value_type | STRING | ACTUAL = ยอดจริง, FORECAST = model prediction |  |  |
| deposit_amount_thb | DECIMAL(18,2) | ยอดลูกค้าฝากเงิน (actual หรือ predicted) | br_daily_demand_2y.daily_deposit หรือ br_forecast_opth_rev.pred_dep |  |
| withdrawal_amount_thb | DECIMAL(18,2) | ยอดลูกค้าถอนเงิน (actual หรือ predicted) | br_daily_demand_2y.daily_withdrawal หรือ br_forecast_opth_rev.pred_wd |  |
| net_amount_thb | DECIMAL(18,2) | deposit − withdrawal | br_daily_demand_2y.net_cashflow หรือ br_forecast_opth_rev.net_demand |  |
| remaining_amount_thb | DECIMAL(18,2) | ยอดเงินคงเหลือ ณ สิ้นวัน | vault_balance + SUM(net_amount_thb) OVER (<br>  PARTITION BY branch_code <br>  ORDER BY series_date <br>  ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW<br>) AS remaining_amount_thb |  |
| cost_of_fund_thb | DECIMAL(18,2) | cost of fund |  |  |
| model_id | STRING |  |  |  |
| model_version | STRING |  |  |  |
| updated_at | TIMESTAMP | เวลาที่ record ถูกสร้าง |  |  |

---

## 4. `fact_branch_denomination`

**Workbook sheet:** `fact_branch_denomination`  
**Field count:** 13

| field | type | definition | source | Additional note 1 |
| --- | --- | --- | --- | --- |
| business_date | DATE | planning date |  | CAST(service_date AS DATE) จาก br_denom_plan_opth |
| center_id | STRING | รหัสศูนย์เงินสด |  |  |
| branch_code | STRING | รหัสสาขา | stockh_items SUBSTRING(stock_id, 4) หรือ br_denom_plan_opth.br_id |  |
| denomination_thb | INT | มูลค่าธนบัตร (1000/500/100/50) |  |  |
| actual_note_count_d_minus_1 | INT | จำนวน notes คงเหลือ (d-1) | stockh_items.qty ÷ denomination |  |
| actual_amount_thb_d_minus_1 | DECIMAL(18,2) | มูลค่า THB คงเหลือ per denomination | stockh_items.qty (qty = THB) |  |
| actual_mix_pct | DOUBLE | สัดส่วน % ของ denomination นี้ต่อ total vault | computed: amount ÷ total × 100 |  |
| delivery_note_count | INT | จำนวน notes ที่ optimization model แนะนำให้ deliver | br_denom_plan_opth.B{denom} ÷ denomination |  |
| delivery_amount_thb | DECIMAL(18,2) | THB ที่จะ deliver per denomination | br_denom_plan_opth.B{denom} |  |
| target_note_count | INT | จำนวน notes เป้าหมายหลัง delivery (actual + delivery) | computed: actual + delivery |  |
| target_amount_thb | DECIMAL(18,2) | THB เป้าหมายหลัง delivery | computed: actual_amount + delivery_amount |  |
| target_mix_pct | DOUBLE | สัดส่วน % เป้าหมายหลัง delivery | computed |  |
| updated_at | TIMESTAMP | เวลาที่ record ถูกสร้าง |  |  |

---

## 5. `dim_truck`

**Source:** `mdp_dev_dit.default.master_car_cc2`  
**Field count:** 6

| field | type | definition | source |
| --- | --- | --- | --- |
| truck_id | STRING | รหัสรถ (PK) = vehicle_code | master_car_cc2.vehicle_code |
| center_id | STRING | รหัสศูนย์เงินสดที่รถสังกัด | master_car_cc2.kcim_code |
| plate_number | STRING | เลขทะเบียนรถ | master_car_cc2.car_plate |
| cash_capacity_thb | DECIMAL(18,2) | วงเงินสูงสุดที่บรรทุกได้ (THB) | master_car_cc2.cash_capacity × 1,000,000 |
| is_available | BOOLEAN | ความพร้อมใช้งาน (user adjustable) | DEFAULT TRUE |
| updated_at | TIMESTAMP | เวลาอัพเดทล่าสุด | current_timestamp() |

---

## 6. `dim_machine`

**Workbook sheet:** `dim_machine`  
**Field count:** 10

| field | type | definition |
| --- | --- | --- |
| machine_id | STRING | รหัสตู้ (PK) |
| center_id | STRING | รหัสศูนย์เงินสด |
| machine_type | STRING | ATM / RCM / 3IN1 |
| location_name | STRING | ชื่อสถานที่ตั้ง |
| province_name | STRING | จังหวัด |
| district_name | STRING | อำเภอ |
| latitude | DOUBLE | ละติจูด |
| longitude | DOUBLE | ลองจิจูด |
| alltime_max_cash_thb | DECIMAL(18,2) | วงเงินรวมทุกกล่องเงิน (observed all-time max) |
| updated_at | TIMESTAMP | เวลาอัพเดท |

---

## 7. `fact_machine_position`

**Field count:** 16  
**Row count:** 520 (61 RCM + 24 3IN1 + 435 ATM)

**Source tables:**
- `atm_remaining_history` — actual cash d-1 (ALL machine types)
- `rcm_forecast_2026` — RCM/3IN1 forecast (per-denom, per-direction)
- `di_atm_cash_forecast_jan_apr` — ATM forecast (total withdrawal only, no per-denom)
- `br_opth_unified_rcm_denom_dev` — RCM replenishment plan (add + remove)
- `di_atm_cash_optimization` + `di_atm_cash_optimization_emer` — ATM replenishment plan (add only; regular + emergency combined)

**ATM-specific notes:**
- `predicted_deposit_d` = NULL (ATM is withdrawal-only, no deposit forecast source)
- `remove_amount_thb` = NULL (ATM source has no remove operation)
- `action_type`: ATM can only be "No Action" or "Swap (Near Empty)" (never "Near Full")
- `model_id` = 'di_atm_cash_forecast' for ATM rows, 'rcm_forecast_2026' for RCM/3IN1

| field | type | definition | Additional note 1 |
| --- | --- | --- | --- |
| business_date | DATE | วันที่วางแผน |  |
| center_id | STRING | รหัสศูนย์เงินสด |  |
| machine_id | STRING | รหัสตู้ (FK → dim_machine) |  |
| actual_cash_d_minus_1 | DECIMAL(18,2) | ยอดเงินคงเหลือรวมในตู้ ณ d-1 |  |
| predicted_cash_d | DECIMAL(18,2) | ยอดเงิน predicted ณ สิ้นวัน d |  |
| predicted_deposit_d | DECIMAL(18,2) | Forecast ยอดลูกค้าฝากเงินรวมวัน d |  |
| predicted_withdrawal_d | DECIMAL(18,2) | Forecast ยอดลูกค้าถอนเงินรวมวัน d |  |
| delivery_amount_thb | DECIMAL(18,2) | จำนวนเงินรวมที่ CIT จะ ADD เข้าตู้ (cassette swap in) |  |
| remove_amount_thb | DECIMAL(18,2) | จำนวนเงินรวมที่ CIT จะ REMOVE จากตู้ (cassette swap out) |  |
| action_type | STRING | Swap (Near Full), Swap (Near Empty), No Action | Near Full=remove>add, Near Empty=add>remove |
| health_status | STRING | HEALTHY / WATCH / ACTION_NEEDED / CRITICAL | remaining[d] = actual_cash[d-1] + forecast_deposit[d] - forecast_withdrawal[d]<br>SS_low[d] = safety stock (lower bound)<br>SS_high[d] = safety stock (upper bound)<br>health[d] = (remaining[d] - SS_low[d]) / (SS_high[d] - SS_low[d])<br><br>Critical: health[d] < 0 หรือ > 1<br>Action Needed: health[d]< 0.15 หรือ > 0.85<br>Watch: health[d]< 0.30 หรือ > 0.70<br>Healthy: 0.30 ≤ health[d] ≤ 0.70<br><br>d=day<br>คำนวณแยก denom แล้วเลือก worst |
| emergency_flag | BOOLEAN | emergency |  |
| cost_of_fund_thb | DECIMAL(18,2) | cost of fund |  |
| model_id | STRING |  |  |
| model_version | STRING |  |  |
| updated_at | TIMESTAMP | เวลาอัพเดท |  |

---

## 8. `fact_machine_denomination`

**Field count:** 20  
**Row count:** 1,560 (520 machines × 3 denoms)

**Source tables:**
- `atm_remaining_history` — actual per-denom + alltime max (ALL machine types)
- `rcm_forecast_2026` — RCM/3IN1 forecast per-denom (deposit + withdrawal)
- `br_opth_unified_rcm_denom_dev` — RCM delivery (add) + remove per-denom
- `di_atm_cash_optimization` + `di_atm_cash_optimization_emer` — ATM delivery per-denom (box_a+b=1000, box_c=500, box_d=100)

**ATM-specific notes:**
- `predicted_*` columns (deposit/withdrawal/remaining) = NULL (honest: ATM forecast has total amount only, no per-denom breakdown)
- `remove_note_count` / `remove_amount_thb` = NULL (ATM source has no remove operation)
- Actual per-denom and delivery per-denom ARE available for ATM

| field | type | definition |
| --- | --- | --- |
| business_date | DATE | planning date |
| center_id | STRING | รหัสศูนย์เงินสด |
| machine_id | STRING | รหัสตู้ |
| denomination_thb | INT | มูลค่าธนบัตร (1000/500/100) |
| alltime_max_note_count | INT | จำนวน notes สูงสุดที่เคยพบในกล่องเงินนี้ (observed max) |
| actual_note_count_d_minus_1 | INT | จำนวน notes คงเหลือในกล่องเงิน (d-1) |
| actual_amount_thb_d_minus_1 | DECIMAL(18,2) | มูลค่า THB คงเหลือ คำนวณจาก note_count × denomination |
| predicted_deposit_note_count | INT | forecast จำนวน notes ที่ลูกค้าจะฝาก |
| predicted_deposit_amount_thb | DECIMAL(18,2) | มูลค่า forecast เงินฝาก |
| predicted_withdrawal_note_count | INT | forecast จำนวน notes ที่ลูกค้าจะถอน |
| predicted_withdrawal_amount_thb | DECIMAL(18,2) | มูลค่า forecast เงินถอน |
| predicted_remaining_note_count | INT | predicted จำนวน notes ณ สิ้นวัน d |
| predicted_remaining_amount_thb | DECIMAL(18,2) | มูลค่า predicted คงเหลือ |
| delivery_note_count | INT | จำนวน notes ที่ optimizer แนะนำให้ ADD เข้าตู้ |
| delivery_amount_thb | DECIMAL(18,2) | มูลค่า ADD (cassette swap in) per denom |
| remove_note_count | INT | จำนวน notes ที่ optimizer แนะนำให้ REMOVE จากตู้ |
| remove_amount_thb | DECIMAL(18,2) | มูลค่า REMOVE (cassette swap out) per denom |
| gap_note_count | INT | gap (shortfall) — NULL for daily, have value for realtime |
| gap_amount_thb | DECIMAL(18,2) | gap in THB — NULL for daily |
| updated_at | TIMESTAMP | เวลาอัพเดท |

---

## 9. `fact_machine_flow_daily`

**Field count:** 13  
**Row count:** 4,087

**Source tables:**
- `v_atm_txn_denom_base24` — ACTUAL daily transactions (RCM/3IN1 only; ATM NOT in this source yet)
- `atm_remaining_history` — ACTUAL daily remaining (ALL machine types)
- `rcm_forecast_2026` — RCM/3IN1 FORECAST (per-denom deposit + withdrawal)
- `di_atm_cash_forecast_jan_apr` — ATM FORECAST (total withdrawal only)

**ATM-specific notes:**
- ATM has FORECAST rows only (no ACTUAL rows — `v_atm_txn_denom_base24` doesn't include ATM data yet)
- ATM forecast: `deposit_amount_thb` = NULL (no deposit for ATM), `withdrawal_amount_thb` from forecast amount
- Remaining calculated via cumulative window from actual_d_minus_1

| field | type | definition |
| --- | --- | --- |
| business_date | DATE | planning date |
| center_id | STRING | รหัสศูนย์เงินสด |
| machine_id | STRING | รหัสตู้ |
| series_date | DATE | วันที่ของ transaction/prediction |
| value_type | STRING | ACTUAL / FORECAST |
| deposit_amount_thb | DECIMAL(18,2) | ยอดลูกค้าฝากเงิน |
| withdrawal_amount_thb | DECIMAL(18,2) | ยอดลูกค้าถอนเงิน |
| net_amount_thb | DECIMAL(18,2) | deposit − withdrawal |
| remaining_amount_thb | DECIMAL(18,2) | ยอดเงินคงเหลือในตู้ ณ สิ้นวัน |
| cost_of_fund_thb | DECIMAL(18,2) | cost of fund |
| model_id | STRING |  |
| model_version | STRING |  |
| updated_at | TIMESTAMP | เวลาอัพเดท |

---

## 10. `fact_route_summary`

**Source:** Route_result Excel ("Cost by Car" + "Routes" sheets, aggregated per vehicle)  
**Field count:** 37  
**PK:** (business_date, route_plan_type, plan_version, truck_id)

| field | type | definition | source |
| --- | --- | --- | --- |
| business_date | DATE | วันที่วางแผน | Routes.route_date |
| center_id | STRING | รหัสศูนย์เงินสด | Routes.cluster ('CC2') |
| route_plan_type | STRING | OPTIMIZED / ADJUSTED / ACTUAL | hardcoded per source |
| plan_version | INT | version ของแผน (OPTIMIZED/ADJUSTED) | default 1 |
| truck_id | STRING | รหัสรถ (PK member, FK → dim_truck) | Cost by Car.vehicle_code |
| route_status | STRING | ON_TRACK / DELAYED / AT_RISK (ต้อง GPS/realtime) | NULL |
| depot_code | STRING | รหัส depot ต้นทาง | 'KCIM_CC2' |
| depot_name | STRING | ชื่อ depot | master_node_cc2 node_id=1 |
| depot_latitude | DOUBLE | lat depot | master_node_cc2.lat |
| depot_longitude | DOUBLE | lon depot | master_node_cc2.lon |
| total_stops | INT | จำนวนจุดทั้งหมด (ไม่นับ depot) | Cost by Car.total_stops |
| completed_stops | INT | จำนวนจุดที่ส่งเสร็จแล้ว (ต้อง realtime) | NULL |
| remaining_stops | INT | จำนวนจุดที่ยังไม่ส่ง (ต้อง realtime) | NULL |
| total_distance_km | DOUBLE | ระยะทางรวม (km) | Cost by Car.total_km |
| distance_left_km | DOUBLE | ระยะทางที่เหลือ (ต้อง GPS) | NULL |
| total_duration_minutes | INT | เวลาเดินทางรวม (นาที) | (return_arrival_sec − start_depart_sec)/60 |
| etd_start | STRING | เวลาออกจาก depot (HH:MM:SS) | Routes.depart_time WHERE seq=0 |
| eta_return | STRING | เวลากลับ depot (HH:MM:SS) | Cost by Car.return_time |
| vehicle_capacity_thb | DECIMAL(18,2) | วงเงินบรรทุกสูงสุด | Cost by Car.capacity_thb |
| cash_on_board_thb | DECIMAL(18,2) | เงินบนรถ ณ ปัจจุบัน (ต้อง realtime) | NULL |
| delivery_amount_thb_branch | DECIMAL(18,2) | รวมเงินส่งสาขา+OTB | SUM(demand_baht) WHERE loc_category IN ('1_br','3_others') |
| delivery_amount_thb_machine | DECIMAL(18,2) | รวมเงินส่งตู้ ATM/RCM | SUM(demand_baht) WHERE loc_category='2_machine' |
| pickup_amount_thb_branch | DECIMAL(18,2) | รวมเงินเก็บกลับจากสาขา | NULL (no pickup in current plan) |
| vehicle_utilization_pct | DOUBLE | % capacity ที่ใช้จริง | Cost by Car.utilization_pct |
| sla_achievement_pct | DOUBLE | % จุดที่ arrive ภายใน SLA | NULL |
| cit_cost_thb | DECIMAL(18,2) | ต้นทุน CIT รวม (cost of fund + cost of transport) | NULL (ต้อง cost of fund) |
| cost_of_transport | DECIMAL(18,2) | ต้นทุนขนส่งรวม (fuel+repair+maintenance+wage+OT) | Cost by Car.total_cost |
| normal_hours | DOUBLE | ชั่วโมงทำงานปกติ | Cost by Car.normal_hours |
| ot_hours | DOUBLE | ชั่วโมงล่วงเวลา | Cost by Car.ot_hours |
| fuel_cost_thb | DECIMAL(18,2) | ค่าเชื้อเพลิง | Cost by Car.fuel_cost |
| repair_cost_thb | DECIMAL(18,2) | ค่าซ่อมบำรุง | Cost by Car.repair_cost |
| maintenance_cost_thb | DECIMAL(18,2) | ค่าบำรุงรักษา | Cost by Car.maintenance |
| normal_wage_thb | DECIMAL(18,2) | ค่าแรงปกติ | Cost by Car.normal_wage |
| ot_wage_thb | DECIMAL(18,2) | ค่าล่วงเวลา | Cost by Car.ot_wage |
| machine_stops | INT | จำนวนจุดที่เป็นตู้ ATM/RCM | Cost by Car.machine_stops |
| updated_at | TIMESTAMP | เวลาอัพเดท | current_timestamp() |
| updated_by | STRING | ผู้อัพเดท (user/system) | 'system' |

---

## 11. `fact_route_stop`

**Source:** Route_result Excel ("Routes" sheet, 1 row per stop)  
**Field count:** 20  
**PK:** (business_date, route_plan_type, plan_version, truck_id, stop_sequence, stop_code)

| field | type | definition | source |
| --- | --- | --- | --- |
| business_date | DATE | วันที่วางแผน | Routes.route_date |
| center_id | STRING | รหัสศูนย์เงินสด | Routes.cluster ('CC2') |
| route_plan_type | STRING | OPTIMIZED / ADJUSTED / ACTUAL | hardcoded per source |
| truck_id | STRING | รหัสรถ (FK → fact_route_summary) | Routes.vehicle_code |
| stop_sequence | INT | ลำดับจุดจอด (0=depot start, N+1=depot return) | Routes.seq |
| stop_code | STRING | รหัสจุด (machine_code, comma-sep for merged) | Routes.machine_code |
| stop_name | STRING | ชื่อจุดจอด | Routes.location_name |
| stop_type | STRING | Depot / Branch / ATM / RCM / 3IN1 / Other Bank | mapped from loc_category + machine_type |
| action_type | STRING | START / DELIVERY / PICKUP / SWAP / BOTH / RETURN | derived from seq + loc_category |
| stop_status | STRING | PENDING / COMPLETED | 'PENDING' for plan |
| etd | STRING | เวลาออกจากจุดนี้ (HH:MM:SS) | Routes.depart_time |
| eta | STRING | เวลาถึงจุดนี้ (HH:MM:SS) | Routes.arrival_time |
| delivery_amount_thb | DECIMAL(18,2) | เงินรวมที่ส่ง ณ จุดนี้ (ตู้+สาขา+OTB) | Routes.demand_baht |
| pickup_amount_thb | DECIMAL(18,2) | เงินรวมที่เก็บ ณ จุดนี้ | NULL (no pickup in current plan) |
| latitude | DOUBLE | ละติจูดจุดจอด | Routes.lat |
| longitude | DOUBLE | ลองจิจูดจุดจอด | Routes.lon |
| leg_km | DOUBLE | ระยะทางจากจุดก่อนหน้าถึงจุดนี้ | current − prev route_dist_km |
| cumulative_km | DOUBLE | ระยะทางสะสมจาก depot | Routes.route_dist_km |
| plan_version | INT | version (for OPTIMIZED/ADJUSTED) | default 1 |
| updated_at | TIMESTAMP | เวลาอัพเดท | current_timestamp() |

**stop_type mapping:**

| loc_category | machine_type | → stop_type |
| --- | --- | --- |
| 0_kcim / DEPOT | — | Depot |
| 1_br | — | Branch |
| 2_machine | ATM | ATM |
| 2_machine | RCM | RCM |
| 2_machine | 3IN1 | 3IN1 |
| 3_others | — | Other Bank |

---
