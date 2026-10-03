#!/usr/bin/env python3
"""Add GymMaster "Class Summary" reports to the attendance dataset.

Accepts any mix of:
  * the CSV export (.csv)
  * the emailed PDF report (.pdf)
  * a Gmail get_message RAW result saved as JSON (the PDF is pulled out of it)

Each report is normalised and written to data/weeks/<monday>.csv, one file per
Monday-to-Sunday week. Re-ingesting a week replaces that week's file, so runs
are safe to repeat.

Usage: python3 class-reports/ingest.py <file> [<file> ...]
"""
import base64
import csv
import email
import io
import json
import re
import sys
from datetime import date, datetime, timedelta
from email import policy
from pathlib import Path

HERE = Path(__file__).resolve().parent
WEEKS = HERE / "data" / "weeks"
FIELDS = ["date", "day", "time", "class", "staff", "room", "cap", "booked",
          "checked_in", "no_show", "cancelled", "waitlisted"]

# Names the PDF parser can recognise when a cell wraps onto two lines. Add new
# classes or coaches here when the timetable changes; the parser stops with a
# clear error if it meets one it does not know.
CLASSES = ["Upper Body Strength", "Lower Body Strength", "Full Body Strength",
           "Conditioning", "Game Day", "Flow Yoga", "Yin Yoga", "StretchFit",
           "Hyrox", "Run Club"]
STAFF = ["Ji Wallace", "Dana Coles", "Stephanie Chung", "Anthony Lett",
         "Harry Crawford", "Katie Dall"]
ROOMS = ["Functional Training Zone", "Group Fitness Room", "Gym Floor", "Run Club"]


def monday(d: date) -> date:
    return d - timedelta(days=d.weekday())


def hhmm(t: str) -> str:
    """'6:00:00 am' or '06:00:00' -> '06:00'."""
    t = t.strip().lower()
    m = re.match(r"(\d{1,2}):(\d{2})(?::\d{2})?\s*([ap]m)?", t)
    h, mi, ap = int(m[1]), m[2], m[3]
    if ap == "pm" and h != 12:
        h += 12
    if ap == "am" and h == 12:
        h = 0
    return f"{h:02d}:{mi}"


def from_csv(text: str) -> list[dict]:
    out = []
    for r in csv.DictReader(io.StringIO(text)):
        d = datetime.strptime(r["Booking Date"].strip(), "%Y-%m-%d").date()
        out.append({
            "date": d.isoformat(), "day": d.strftime("%a"),
            "time": hhmm(r["Booking Start Time"]),
            "class": r["Class Name"].strip(), "staff": r["Staff Name"].strip(),
            "room": r["Resource Name"].strip(),
            "cap": int(r["Class Maximum Students"]), "booked": int(r["Number Booked"]),
            "checked_in": int(r["Number Checked In"]), "no_show": int(r["Number No Showed"]),
            "cancelled": int(r["Number Canceled"]), "waitlisted": int(r["Number Waitlisted"]),
        })
    return out


ROW = re.compile(
    r"^\s*(?P<room>.+?)\s+(?P<time>\d{1,2}:\d{2}:\d{2}\s*[ap]m)\s+(?P<cap>\d+)\s+(?P<inn>\d+)\s+"
    r"(?P<ns>\d+)\s+(?P<canc>\d+)\s+(?P<booked>\d+)\s+(?P<wait>\d+)\s+Teneriffe\s+"
    r"(?P<dow>[A-Z][a-z]+day)\s+(?P<dm>\d{1,2} [A-Z][a-z]{2})(?: (?P<y>\d{4}))?\s+(?P<rest>.*)$")


def pick(words: str, names: list[str], what: str, line: str) -> str:
    norm = " ".join(words.split())
    hits = [n for n in names if all(w in norm.split() for w in n.split())]
    if not hits:
        sys.exit(f"Unknown {what} in report row: {line.strip()!r}\n"
                 f"Add it to {what.upper()} in class-reports/ingest.py and re-run.")
    return max(hits, key=len)


def from_pdf(data: bytes) -> list[dict]:
    from pypdf import PdfReader
    reader = PdfReader(io.BytesIO(data))
    text = "\n".join(p.extract_text(extraction_mode="layout") for p in reader.pages)
    period = re.search(r"Period starting (\d{4})-(\d{2})-(\d{2})", text)
    year = int(period[1]) if period else date.today().year
    expected = re.search(r"Report Count: (\d+)", text)
    lines = text.splitlines()
    out = []
    for i, line in enumerate(lines):
        m = ROW.match(line)
        if not m:
            continue
        nxt = lines[i + 1] if i + 1 < len(lines) else ""
        words = f"{m['rest']} {nxt}"
        room_words = f"{m['room']} {nxt}"
        d = datetime.strptime(f"{m['dm']} {m['y'] or year}", "%d %b %Y").date()
        out.append({
            "date": d.isoformat(), "day": d.strftime("%a"), "time": hhmm(m["time"]),
            "class": pick(words, CLASSES, "classes", line),
            "staff": pick(words, STAFF, "staff", line),
            "room": pick(room_words, ROOMS, "rooms", line),
            "cap": int(m["cap"]), "booked": int(m["booked"]), "checked_in": int(m["inn"]),
            "no_show": int(m["ns"]), "cancelled": int(m["canc"]), "waitlisted": int(m["wait"]),
        })
    if expected and int(expected[1]) != len(out):
        sys.exit(f"PDF says {expected[1]} records but {len(out)} were parsed. Check the layout.")
    return out


def from_gmail_json(text: str) -> list[dict]:
    raw = json.loads(text)["raw"]
    msg = email.message_from_bytes(base64.urlsafe_b64decode(raw + "=" * (-len(raw) % 4)),
                                   policy=policy.default)
    rows = []
    for part in msg.iter_attachments():
        name = (part.get_filename() or "").lower()
        if name.endswith(".pdf"):
            rows += from_pdf(part.get_content())
        elif name.endswith(".csv"):
            rows += from_csv(part.get_content().decode() if isinstance(part.get_content(), bytes)
                             else part.get_content())
    if not rows:
        sys.exit("No PDF or CSV attachment found in that email.")
    return rows


def load(path: Path) -> list[dict]:
    suffix = path.suffix.lower()
    if suffix == ".pdf":
        return from_pdf(path.read_bytes())
    text = path.read_text(encoding="utf-8-sig")
    if text.lstrip().startswith("{"):
        return from_gmail_json(text)
    return from_csv(text)


def main(paths: list[str]) -> None:
    if not paths:
        sys.exit(__doc__)
    rows = [r for p in paths for r in load(Path(p))]
    by_week: dict[str, list[dict]] = {}
    for r in rows:
        by_week.setdefault(monday(date.fromisoformat(r["date"])).isoformat(), []).append(r)
    WEEKS.mkdir(parents=True, exist_ok=True)
    for wk, rs in sorted(by_week.items()):
        rs.sort(key=lambda r: (r["date"], r["time"], r["class"]))
        target = WEEKS / f"{wk}.csv"
        status = "replaced" if target.exists() else "added"
        with target.open("w", newline="") as f:
            w = csv.DictWriter(f, fieldnames=FIELDS)
            w.writeheader()
            w.writerows(rs)
        print(f"{status} week of {wk}: {len(rs)} classes, "
              f"{sum(r['checked_in'] for r in rs)} check-ins, {sum(r['no_show'] for r in rs)} no-shows")


if __name__ == "__main__":
    main(sys.argv[1:])
