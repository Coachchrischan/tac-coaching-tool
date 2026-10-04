#!/usr/bin/env python3
"""Build the class attendance reports from data/weeks/*.csv.

Writes:
  out/dashboard.html     full history, published as the dashboard page
  out/weekly-email.html  the Sunday email (inline styles, table-based charts
                         so it renders in Gmail and Outlook)
  out/summary.txt        a few plain-text lines for the email's text part

Public holidays come from holidays.csv (Queensland, Brisbane). Weeks with a
holiday, the Christmas break or fewer classes than usual are labelled, shown
with a full-week equivalent (check-ins per class x the usual number of
classes), and holiday sessions are left out of the classes-to-watch flags.

Usage: python3 class-reports/build.py
"""
import csv
import html
from datetime import date, timedelta
from pathlib import Path

HERE = Path(__file__).resolve().parent
WEEKS = HERE / "data" / "weeks"
OUT = HERE / "out"

PROGRAM_START = date(2026, 9, 14)   # new programming, smaller caps, check-in reminders
LOW, WATCH = 5, 6                   # average check-ins per class
HIGH_NO_SHOW = 0.30                 # per class slot, over the flag window
FLAG_WEEKS = 4
HOLIDAYS_FILE = HERE / "holidays.csv"
CHRISTMAS_BREAK = ((12, 22), (1, 5))  # (month, day) range treated as the Christmas period

GROUPS = [("Strength", ["Upper Body Strength", "Lower Body Strength", "Full Body Strength"]),
          ("Conditioning", ["Conditioning"]), ("Hyrox", ["Hyrox"]),
          ("Yoga", ["Flow Yoga", "Yin Yoga"]), ("StretchFit", ["StretchFit"]),
          ("Game Day", ["Game Day"]), ("Run Club", ["Run Club"])]
DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

INK, INK2, MUTED, LINE, PANEL = "#292626", "#5a5a52", "#bbb8ac", "#e4e1d6", "#f5f3eb"
TEAL, ORANGE, GOOD, BAD, WARN, DEEP = "#00806a", "#d0692a", "#1c6b3a", "#b3261e", "#8a5a00", "#1c4a42"
RAMP = [(15, "#0f5446", "#fff"), (11, "#1f7f6b", "#fff"), (8, "#5fa896", "#fff"),
        (5, "#9fcabc", INK), (2, "#cfe3dc", INK), (0, "#eef3f0", INK)]
TEXT = f"font-size:14px;line-height:1.55;color:{INK};margin:0 0 10px"
H2 = f"font-size:18px;color:{INK};margin:30px 0 6px"
SUB = f"font-size:12px;color:{INK2};margin:0 0 10px"
TH = f"font-size:11px;color:{INK2};text-align:right;white-space:nowrap"
TD = "text-align:right;white-space:nowrap"


# ---------- data ----------

def load():
    rows = []
    for f in sorted(WEEKS.glob("*.csv")):
        for r in csv.DictReader(f.open()):
            for k in ("cap", "booked", "checked_in", "no_show", "cancelled", "waitlisted"):
                r[k] = int(r[k])
            r["d"] = date.fromisoformat(r["date"])
            r["wk"] = r["d"] - timedelta(days=r["d"].weekday())
            r["family"] = "Strength" if r["class"] in ("Upper Body Strength", "Lower Body Strength") else r["class"]
            h, m = map(int, r["time"].split(":"))
            r["mins"] = h * 60 + m
            r["slot"] = (r["day"], r["mins"], r["family"])
            rows.append(r)
    return rows


def load_holidays():
    if not HOLIDAYS_FILE.exists():
        return {}
    return {date.fromisoformat(r["date"]): r["name"] for r in csv.DictReader(HOLIDAYS_FILE.open())}


HOLIDAYS = load_holidays()


def in_christmas_break(d):
    (m1, d1), (m2, d2) = CHRISTMAS_BREAK
    return (d.month, d.day) >= (m1, d1) or (d.month, d.day) <= (m2, d2)


def week_events(wk):
    """Holidays and the Christmas break falling in the Monday-to-Sunday week."""
    days = [wk + timedelta(days=i) for i in range(7)]
    out = [f"{HOLIDAYS[d]} ({d.strftime('%a')} {fmt_d(d)})" for d in days if d in HOLIDAYS]
    if any(in_christmas_break(d) for d in days):
        out.append("Christmas period")
    return out


def usual_classes(weeks, W, before):
    """Median class count of up to four earlier weeks without holidays."""
    clean = [W[w]["n"] for w in weeks if w < before and not week_events(w)][-4:]
    if not clean:
        return None
    clean.sort()
    return clean[len(clean) // 2]


def adjust(W, weeks):
    """Attach labels and a full-week equivalent to weeks that were short."""
    for w in weeks:
        t = W[w]
        usual = usual_classes(weeks, W, w)
        notes = week_events(w)
        if usual and t["n"] < usual:
            notes.append(f"{t['n']} classes instead of the usual {usual}")
        t["notes"] = notes
        t["short"] = bool(notes)
        t["full"] = round(t["per"] * usual) if usual and t["short"] else t["in"]


def totals(rs):
    n = len(rs)
    inn = sum(r["checked_in"] for r in rs)
    booked = sum(r["booked"] for r in rs)
    ns = sum(r["no_show"] for r in rs)
    return {"n": n, "in": inn, "booked": booked, "ns": ns,
            "rate": ns / booked if booked else 0, "per": inn / n if n else 0,
            "wait": sum(r["waitlisted"] for r in rs), "canc": sum(r["cancelled"] for r in rs)}


# ---------- formatting helpers ----------

def fmt_d(d):
    return f"{d.day} {d.strftime('%b')}"


def t12(mins):
    h, m = divmod(mins, 60)
    return f"{h % 12 or 12}{':%02d' % m if m else ''}{'am' if h < 12 else 'pm'}"


def pct(x):
    return f"{round(x * 100)}%"


def delta(now, before, kind="num", lower_is_better=False):
    """Coloured change text, e.g. '+30 on last week'."""
    if before is None:
        return f'<span style="color:{INK2}">no earlier week</span>'
    diff = now - before
    if kind == "pct":
        txt = f"{'+' if diff >= 0 else '-'}{abs(round(diff * 100))} pts"
    elif kind == "dec":
        txt = f"{'+' if diff >= 0 else '-'}{abs(diff):.1f}"
    else:
        txt = f"{'+' if diff >= 0 else '-'}{abs(round(diff))}"
    if abs(diff) < 1e-9 or txt.lstrip("+-").split()[0] in ("0", "0.0"):
        return f'<span style="color:{INK2}">no change</span>'
    good = (diff < 0) if lower_is_better else (diff > 0)
    return f'<span style="color:{GOOD if good else BAD};font-weight:bold">{txt}</span>'


def bar(segs, maxv, width, h=14):
    cells, used = "", 0
    for v, c in segs:
        w = max(1, round(v / maxv * width)) if maxv else 1
        used += w
        cells += f'<td width="{w}" height="{h}" bgcolor="{c}"></td>'
    if width - used > 0:
        cells += f'<td width="{width - used}"></td>'
    return f'<table cellpadding="0" cellspacing="0" border="0" width="{width}"><tr>{cells}</tr></table>'


def swatch(c):
    return f'<span style="display:inline-block;width:10px;height:10px;background:{c};vertical-align:middle"></span>'


def heat(v):
    for th, bg, fg in RAMP:
        if v >= th:
            return bg, fg


# ---------- sections ----------

def kpis(this, last):
    if this["short"] or (last and last["short"]):
        lf = last and last["full"]
        first = (str(this["in"]), "check-ins this week",
                 f'<span style="color:{INK2}">about {this["full"]} on a full week</span><br>'
                 + delta(this["full"], lf) + " on last week, full-week basis")
    else:
        first = (str(this["in"]), "check-ins this week", delta(this["in"], last and last["in"]) + " on last week")
    tiles = [
        first,
        (f'{this["per"]:.1f}', "check-ins per class", delta(this["per"], last and last["per"], "dec") + " on last week"),
        (pct(this["rate"]), f'no-show rate ({this["ns"]} people)',
         delta(this["rate"], last and last["rate"], "pct", True) + " on last week"),
        (str(this["wait"]), "people waitlisted", f'<span style="color:{INK2}">{last["wait"] if last else "&ndash;"} last week</span>'),
    ]
    cells = "".join(
        f'<td width="25%" style="background:{PANEL};padding:12px;vertical-align:top;border:4px solid #fff">'
        f'<div style="font-size:26px;font-weight:bold;color:{INK}">{v}</div>'
        f'<div style="font-size:12px;color:{INK2}">{l}</div><div style="font-size:12px">{d}</div></td>'
        for v, l, d in tiles)
    return f'<table cellpadding="0" cellspacing="0" border="0" width="100%"><tr>{cells}</tr></table>'


def week_table(weeks, W, width):
    mx = max(W[w]["booked"] for w in weeks)
    head = (f'<tr><th style="{TH};text-align:left">Week of</th><th style="{TH}">Classes</th>'
            f'<th style="{TH};text-align:left">{swatch(TEAL)} Checked in {swatch(ORANGE)} No-show</th>'
            f'<th style="{TH}">Per class</th><th style="{TH}">No-show</th><th style="{TH}">Waitlist</th></tr>')
    body = ""
    for i, w in enumerate(weeks):
        t = W[w]
        if w == PROGRAM_START and i:
            body += (f'<tr><td colspan="6" style="font-size:12px;font-weight:bold;color:{TEAL};'
                     f'padding:6px 0 2px;border-top:1px dashed {MUTED}">New programming starts {fmt_d(w)}</td></tr>')
        latest = i == len(weeks) - 1
        wt = "font-weight:bold;" if latest else ""
        body += (f'<tr><td style="{TD};text-align:left;{wt}">{fmt_d(w)}</td>'
                 f'<td style="{TD}">{t["n"]}</td>'
                 f'<td style="{TD};text-align:left;white-space:normal">{bar([(t["in"], TEAL), (t["ns"], ORANGE)], mx, width)}'
                 f'<span style="font-size:12px"><b>{t["in"]}</b> + {t["ns"]}</span>'
                 + (f'<br><span style="font-size:11px;color:{WARN}">{html.escape("; ".join(t["notes"]))}. '
                    f'About {t["full"]} on a full week.</span>' if t["short"] else "")
                 + '</td>'
                 f'<td style="{TD};{wt}">{t["per"]:.1f}</td><td style="{TD};{wt}">{pct(t["rate"])}</td>'
                 f'<td style="{TD}">{t["wait"] or "&ndash;"}</td></tr>')
    return f'<table cellpadding="5" cellspacing="0" border="0" style="font-size:13px">{head}{body}</table>'


def month_of(wk):
    """A week belongs to the month its Thursday falls in, so months hold whole weeks."""
    th = wk + timedelta(days=3)
    return th.year, th.month


def month_table(rows, last_day):
    months = sorted({month_of(r["wk"]) for r in rows})
    head = (f'<tr><th style="{TH};text-align:left">Month</th><th style="{TH}">Weeks</th>'
            f'<th style="{TH}">Classes</th><th style="{TH}">Check-ins</th><th style="{TH}">Per week</th>'
            f'<th style="{TH}">Per class</th><th style="{TH}">No-show</th><th style="{TH}">Waitlist</th></tr>')

    def row(label, t, n, shade=""):
        bg = f";background:{PANEL}" if shade else ""
        return (f'<tr><td style="{TD};text-align:left{bg}">{label}</td><td style="{TD}{bg}">{n}</td>'
                f'<td style="{TD}{bg}">{t["n"]}</td><td style="{TD}{bg}">{t["in"]}</td>'
                f'<td style="{TD}{bg}"><b>{t["in"] / n:.0f}</b></td><td style="{TD}{bg}"><b>{t["per"]:.1f}</b></td>'
                f'<td style="{TD}{bg}">{pct(t["rate"])}</td><td style="{TD}{bg}">{t["wait"] or "&ndash;"}</td></tr>')

    body = ""
    for y, m in months:
        rs = [r for r in rows if month_of(r["wk"]) == (y, m)]
        wks = sorted({r["wk"] for r in rs})
        partial = month_of(wks[-1] + timedelta(days=7)) == (y, m)
        label = f'<b>{date(y, m, 1).strftime("%B %Y")}</b>'
        if partial:
            label += f' <span style="color:{INK2}">to date</span>'
        body += row(label, totals(rs), len(wks))
    for label, keep in ((f"Before {fmt_d(PROGRAM_START)}", lambda r: r["d"] < PROGRAM_START),
                        (f"Since {fmt_d(PROGRAM_START)}", lambda r: r["d"] >= PROGRAM_START)):
        rs = [r for r in rows if keep(r)]
        if rs:
            body += row(label, totals(rs), len({r["wk"] for r in rs}), shade=True)
    short = [w for w in sorted({r["wk"] for r in rows}) if week_events(w)]
    note = (f'<p style="{SUB}">Each week counts towards the month its Thursday falls in, so months are made of whole weeks.'
            + (f' Weeks with a public holiday or the Christmas break: {", ".join(fmt_d(w) for w in short)}.' if short else "")
            + '</p>')
    return f'{note}<table cellpadding="5" cellspacing="0" border="0" style="font-size:13px">{head}{body}</table>'


def coach_table(rows, this_wk, last_wk, width, show_bars=True):
    staff = sorted({r["staff"] for r in rows if r["wk"] == this_wk},
                   key=lambda s: -totals([r for r in rows if r["staff"] == s and r["wk"] == this_wk])["per"])
    head = (f'<tr><th style="{TH};text-align:left">Coach</th>'
            + (f'<th style="{TH};text-align:left">{swatch(MUTED)} Before {fmt_d(PROGRAM_START)} {swatch(TEAL)} This week</th>' if show_bars else '') +
            f'<th style="{TH}">Before</th><th style="{TH}">Last week</th><th style="{TH}">This week</th>'
            f'<th style="{TH}">No-show</th></tr>')
    body = ""
    for s in staff:
        mine = [r for r in rows if r["staff"] == s]
        before = [r for r in mine if r["d"] < PROGRAM_START]
        b = totals(before)["per"] if before else None
        lw = [r for r in mine if r["wk"] == last_wk]
        l = totals(lw)["per"] if lw else None
        t = totals([r for r in mine if r["wk"] == this_wk])
        classes = ", ".join(sorted({r["family"] for r in mine if r["wk"] == this_wk}))
        bars = (bar([(b or 0, MUTED)], 20, width, 8) + '<div style="height:3px;font-size:0;line-height:0">&nbsp;</div>'
                + bar([(t["per"], TEAL)], 20, width, 11))
        body += (f'<tr><td style="{TD};text-align:left"><b>{html.escape(s)}</b><br>'
                 f'<span style="font-size:11px;color:{INK2}">{html.escape(classes)}</span></td>'
                 + (f'<td style="{TD};text-align:left">{bars}</td>' if show_bars else '')
                 + f'<td style="{TD};color:{INK2}">{"&ndash;" if b is None else f"{b:.1f}"}</td>'
                 f'<td style="{TD};color:{INK2}">{"&ndash;" if l is None else f"{l:.1f}"}</td>'
                 f'<td style="{TD}"><b>{t["per"]:.1f}</b><br><span style="font-size:11px">'
                 f'{delta(t["per"], l, "dec") if l is not None else ""}</span></td>'
                 f'<td style="{TD}">{pct(t["rate"])}</td></tr>')
    return f'<table cellpadding="5" cellspacing="0" border="0" style="font-size:13px">{head}{body}</table>'


def slots(rows):
    S = {}
    for r in rows:
        s = S.setdefault(r["slot"], {"slot": r["slot"], "by": {}, "staff": r["staff"], "cap": r["cap"]})
        s["by"][r["wk"]] = r
        s["staff"], s["cap"] = r["staff"], r["cap"]
    return S


def ordered_slots(S):
    out = []
    for g, names in GROUPS:
        fam = {"Strength" if n in ("Upper Body Strength", "Lower Body Strength") else n for n in names}
        rs = sorted([s for s in S.values() if s["slot"][2] in fam],
                    key=lambda s: (DAYS.index(s["slot"][0]), s["slot"][1]))
        if rs:
            out.append((g, rs))
    known = {s["slot"] for _, rs in out for s in rs}
    other = sorted([s for s in S.values() if s["slot"] not in known],
                   key=lambda s: (DAYS.index(s["slot"][0]), s["slot"][1]))
    if other:
        out.append(("Other", other))
    return out


def class_grid(rows, weeks):
    S = slots([r for r in rows if r["wk"] in weeks])
    th = f"font-size:11px;color:{INK2};text-transform:uppercase;padding:0 0 6px;text-align:center"
    head = (f'<tr><th align="left" style="{th};text-align:left;padding-right:10px">Class</th>'
            + "".join(f'<th width="48" style="{th}">{fmt_d(w)}</th>' for w in weeks)
            + f'<th width="44" style="{th}">Avg</th></tr>')
    body = ""
    for g, rs in ordered_slots(S):
        body += (f'<tr><td colspan="{len(weeks) + 2}" style="font-size:12px;font-weight:bold;color:{DEEP};'
                 f'text-transform:uppercase;letter-spacing:1px;padding:12px 0 3px;border-bottom:2px solid {DEEP}">{g}</td></tr>')
        for s in rs:
            d, mins, fam = s["slot"]
            vals = [s["by"][w]["checked_in"] for w in weeks if w in s["by"]]
            body += f'<tr align="center"><td nowrap align="left"><b>{d} {t12(mins)} {html.escape(fam)}</b> <span style="color:{INK2}">{html.escape(s["staff"].split()[0])}</span></td>'
            for w in weeks:
                if w in s["by"]:
                    v = s["by"][w]["checked_in"]
                    bg, fg = heat(v)
                    body += f'<td bgcolor="{bg}">{v}</td>' if fg == INK else f'<td bgcolor="{bg}" style="color:#fff">{v}</td>'
                else:
                    body += f'<td style="color:{MUTED}">&ndash;</td>'
            body += f'<td>{sum(vals) / len(vals):.1f}</td></tr>'
    legend = " &nbsp;".join(f"{swatch(bg)} {lab}" for (_, bg, _), lab in
                            zip(RAMP[::-1], ["0-1", "2-4", "5-7", "8-10", "11-14", "15+"]))
    return (f'<p style="{SUB}">Check-ins per session, grouped by class type in timetable order. {legend}</p>'
            f'<table cellpadding="4" cellspacing="2" border="0" style="font-size:12px;font-weight:bold">{head}{body}</table>')


def no_show_list(rows, wk):
    rs = sorted([r for r in rows if r["wk"] == wk and r["no_show"]],
                key=lambda r: (-r["no_show"], -r["no_show"] / r["booked"]))[:6]
    if not rs:
        return f'<p style="{TEXT}">No no-shows this week.</p>'
    items = "".join(
        f'<tr><td style="{TD};text-align:left"><b>{r["day"]} {t12(r["mins"])}</b> {html.escape(r["class"])}</td>'
        f'<td style="{TD};text-align:left;color:{INK2}">{html.escape(r["staff"])}</td>'
        f'<td style="{TD}"><b>{r["no_show"]}</b> of {r["booked"]}</td>'
        f'<td style="{TD};{"color:" + BAD + ";font-weight:bold" if r["no_show"] / r["booked"] >= HIGH_NO_SHOW else ""}">'
        f'{pct(r["no_show"] / r["booked"])}</td></tr>' for r in rs)
    return f'<table cellpadding="5" cellspacing="0" border="0" style="font-size:13px">{items}</table>'


def flags(rows, weeks):
    win = weeks[-FLAG_WEEKS:]
    S = slots([r for r in rows if r["wk"] in win and r["d"] not in HOLIDAYS and not in_christmas_break(r["d"])])
    low, watch, ns = [], [], []
    for _, rs in ordered_slots(S):
        for s in rs:
            v = [x["checked_in"] for x in s["by"].values()]
            avg = sum(v) / len(v)
            name = f'{s["slot"][0]} {t12(s["slot"][1])} {s["slot"][2]} ({s["staff"].split()[0]})'
            seq = " &middot; ".join(str(s["by"][w]["checked_in"]) if w in s["by"] else "&ndash;" for w in win)
            if avg < LOW and sum(1 for x in v if x < LOW) >= len(v) / 2:
                low.append(f"{name}: {seq}")
            elif avg < WATCH:
                watch.append(f"{name}: {seq}")
            booked = sum(x["booked"] for x in s["by"].values())
            nos = sum(x["no_show"] for x in s["by"].values())
            if booked >= 8 and nos / booked >= HIGH_NO_SHOW:
                ns.append(f"{name}: {nos} of {booked} ({pct(nos / booked)})")
    out = (f'<p style="{SUB}">Last {len(win)} weeks, check-ins oldest to newest. '
           f'Sessions on public holidays and over Christmas are left out.</p>')
    for title, colour, items in ((f"Low numbers (averaging under {LOW})", BAD, low),
                                 (f"Watch list (averaging {LOW} to {WATCH})", WARN, watch),
                                 (f"High no-shows ({pct(HIGH_NO_SHOW)} or more of bookings)", BAD, ns)):
        body = "<br>".join(items) if items else f'<span style="color:{INK2}">None</span>'
        out += f'<p style="{TEXT}"><b style="color:{colour}">{title}:</b><br>{body}</p>'
    return out


NOTES = [
    "Class caps were reduced on 14 Sep (Conditioning 25 to 16, gym floor 30 to 20), so head count per class is a fairer comparison than fill %.",
    "From 14 Sep members are reminded to check in. Before that no one was prompting check-ins, so the earlier weeks undercount who actually trained.",
    "Upper and Lower Body Strength swap days between blocks, so they share one Strength row per time slot.",
    "Run Club check-ins were not being recorded consistently, so its numbers understate attendance.",
]


def build():
    rows = load()
    weeks = sorted({r["wk"] for r in rows})
    W = {w: totals([r for r in rows if r["wk"] == w]) for w in weeks}
    adjust(W, weeks)
    this_wk = weeks[-1]
    last_wk = weeks[-2] if len(weeks) > 1 else None
    last_day = max(r["d"] for r in rows)
    this, last = W[this_wk], W.get(last_wk)

    def body(email: bool):
        wk_list = weeks[-10:] if email else weeks
        grid_weeks = weeks[-4:] if email else weeks[-10:]
        parts = [
            f'<p style="{TEXT}">Week of <b>{fmt_d(this_wk)} to {fmt_d(this_wk + timedelta(days=6))}</b>. '
            f'{len(weeks)} weeks of data, programming started {fmt_d(PROGRAM_START)}.</p>',
            (f'<p style="font-size:13px;color:{WARN};background:#fbf0d9;padding:8px 12px;margin:0 0 8px">'
             f'<b>Short week:</b> {html.escape("; ".join(this["notes"]))}. Compare check-ins per class, '
             f'or the full-week equivalent of about {this["full"]} check-ins.</p>' if this["short"] else ""),
            kpis(this, last),
            f'<h3 style="{H2}">Week to week</h3>',
            f'<p style="{SUB}">Is it working? Check-ins and no-shows per week, with check-ins per class and no-show rate.</p>',
            week_table(wk_list, W, 200 if email else 320),
            f'<h3 style="{H2}">Monthly review</h3>',
            month_table(rows, last_day),
            f'<h3 style="{H2}">Coach tracker: check-ins per class</h3>',
            coach_table(rows, this_wk, last_wk, 260, show_bars=not email),
            f'<h3 style="{H2}">No-shows this week</h3>',
            no_show_list(rows, this_wk),
            f'<h3 style="{H2}">Every class, week by week</h3>',
            class_grid(rows, grid_weeks),
            f'<h3 style="{H2}">Classes to watch</h3>',
            flags(rows, weeks),
            f'<h3 style="{H2}">Notes</h3>',
            "".join(f'<p style="font-size:12px;color:{INK2};margin:0 0 6px">{n}</p>' for n in NOTES),
        ]
        return "\n".join(parts)

    OUT.mkdir(exist_ok=True)
    email_html = (f'<div style="max-width:680px;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:{INK}">'
                  f'<h2 style="font-size:22px;color:{INK};margin:0 0 6px">TAC class attendance</h2>'
                  f'{body(True)}</div>')
    (OUT / "weekly-email.html").write_text(email_html)

    page = f"""<title>TAC Class Attendance</title>
<style>
:root{{color-scheme:light}}
body{{background:#fdfcf9;color:{INK};font-family:Mulish,Arial,Helvetica,sans-serif;padding:0 16px}}
.wrap{{max-width:1040px;margin:0 auto;padding-block:28px 64px}}
.scroll{{overflow-x:auto}}
h1{{font-family:Fraunces,Georgia,serif;font-size:34px;margin:0 0 4px}}
</style>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600&family=Mulish:wght@400;700&display=swap">
<div class="wrap"><p style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;font-weight:bold;color:{INK2};margin:0">Teneriffe Athletic Club &middot; group classes</p>
<h1>Class attendance</h1><div class="scroll">{body(False)}</div>
<p style="font-size:12px;color:{INK2};margin-top:24px">Updated from the weekly Class Summary report. Data to {fmt_d(last_day)} {last_day.year}.</p></div>"""
    (OUT / "dashboard.html").write_text(page)

    lines = [
        f"Week of {fmt_d(this_wk)}: {this['in']} check-ins over {this['n']} classes ({this['per']:.1f} per class), "
        f"{this['ns']} no-shows ({pct(this['rate'])}), {this['wait']} waitlisted.",
    ]
    if last:
        lines.append(f"Last week: {last['in']} check-ins ({last['per']:.1f} per class), no-show rate {pct(last['rate'])}.")
    base = totals([r for r in rows if r["d"] < PROGRAM_START])
    if base["n"]:
        lines.append(f"Before programming: {base['per']:.1f} check-ins per class, no-show rate {pct(base['rate'])}.")
    if this["short"]:
        lines.append(f"Short week: {'; '.join(this['notes'])}. Full-week equivalent about {this['full']} check-ins.")
    upcoming = {(this_wk + timedelta(days=7 * k)).year for k in range(0, 60)}
    missing = sorted(y for y in upcoming if not any(d.year == y for d in HOLIDAYS))
    if missing:
        lines.append(f"WARNING: holidays.csv has no Queensland public holidays for {', '.join(map(str, missing))}. Add them.")
    (OUT / "summary.txt").write_text("\n".join(lines) + "\n")
    print("\n".join(lines))
    print(f"wrote {OUT / 'dashboard.html'}, {OUT / 'weekly-email.html'} ({len(email_html):,} chars)")


if __name__ == "__main__":
    build()
