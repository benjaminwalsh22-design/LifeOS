"""Load a Natural Cycles export into cycle_days — phases only.

    python3 tools/load_cycle.py "<export folder>/Fertility Days.csv" <user uuid> out.sql

Reads only the derived per-day file (cycle day, cycle number, menstruation and
confirmed-ovulation flags, goal). Temperatures, notes, sex, mucus, libido and
mood flags are never loaded. Rows dated after today (predictions) are dropped.

Phase: menstrual on flagged days in the first ten days of a cycle; ovulatory on
the confirmed ovulation day ±1; follicular before it, luteal after. When a
completed cycle has no confirmed ovulation, ovulation is estimated as the cycle
length minus the average luteal length (11 days) and phase_est is set. Cycles
with goal PREGNANT are 'pregnant'; days beyond 45 of an untracked stretch are
'unknown'. Apply out.sql as the service role; re-running is an upsert.
"""
import csv, collections, sys, datetime
src, uid, out = sys.argv[1], sys.argv[2], sys.argv[3]
today = datetime.date.today().isoformat()
LUTEAL = 11
r = [x for x in csv.DictReader(open(src)) if x['Date'] <= today]
cyc = collections.defaultdict(list)
for x in r: cyc[int(x['Cycle Number'])].append(x)
rows = []
for n, rs in sorted(cyc.items()):
    L = len(rs); complete = n < max(cyc)
    od = [int(x['Cycle Day']) for x in rs if x['Ovulation'] == 'true']
    if od: O, est = od[0], False
    elif complete and 20 <= L <= 45: O, est = L - LUTEAL, True
    else: O, est = None, True
    start = rs[0]['Cycle Start Date'] or rs[0]['Date']
    for x in rs:
        cd = int(x['Cycle Day']); goal = x['Goal']; mens = x['Menstruation'] == 'true'
        if goal == 'PREGNANT': ph = 'pregnant'
        elif mens and cd <= 10: ph = 'menstrual'
        elif O is None: ph = 'unknown' if cd > 45 else ('follicular' if cd <= 13 else 'luteal' if cd >= 17 else 'ovulatory')
        elif cd < O - 1: ph = 'follicular'
        elif cd <= O + 1: ph = 'ovulatory'
        elif cd > 45 and not od: ph = 'unknown'
        else: ph = 'luteal'
        rows.append(f"('{uid}','{x['Date']}',{n},{cd},'{start}','{ph}',{str(mens).lower()},{str(x['Ovulation']=='true').lower()},'{goal.lower()}',{str(est and ph in ('follicular','ovulatory','luteal')).lower()})")
sql = []
for i in range(0, len(rows), 500):
    sql.append("insert into public.cycle_days (user_id, day, cycle_no, cycle_day, cycle_start, phase, menstruation, ovulation, goal, phase_est) values\n"
               + ",\n".join(rows[i:i+500])
               + "\non conflict (user_id, person, day) do update set cycle_no=excluded.cycle_no, cycle_day=excluded.cycle_day, cycle_start=excluded.cycle_start, phase=excluded.phase, menstruation=excluded.menstruation, ovulation=excluded.ovulation, goal=excluded.goal, phase_est=excluded.phase_est;")
open(out, 'w').write("\n".join(sql))
print(len(rows), 'days →', out, collections.Counter(x.split(',')[5].strip("'") for x in rows))
