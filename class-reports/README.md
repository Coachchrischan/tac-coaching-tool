# Class attendance reports

Weekly and monthly attendance reviews built from GymMaster's **Class Summary**
report, which emails to chris@coachchrischan.com.au every Sunday morning
(from team@thetac.com, subject `Generated Report: Class Summary <dates>`).

## Layout

- `data/weeks/<monday>.csv`: one file per Monday-to-Sunday week, normalised.
  This is the dataset. Re-ingesting a week replaces its file.
- `ingest.py`: reads the CSV export, the PDF report, or a Gmail
  `get_message` RAW result saved as JSON, and writes the week files.
- `build.py`: builds `out/dashboard.html` (full history), `out/weekly-email.html`
  (the Sunday email, inline styles and table-based charts) and `out/summary.txt`.

## Weekly run

```sh
pip install -r class-reports/requirements.txt
python3 class-reports/ingest.py <report.pdf | report.csv | gmail-raw.json>
python3 class-reports/build.py
```

The scheduled Sunday task does this automatically: it finds the newest Class
Summary email, saves the RAW message, ingests it, rebuilds, commits the new
week, republishes the dashboard and emails the weekly review.

## When the timetable changes

The PDF wraps class and coach names over two lines, so `ingest.py` matches
them against the `CLASSES`, `STAFF` and `ROOMS` lists. A new class or coach
stops the run with a message naming the row; add the name to the list and
re-run. Class groupings for the week-by-week grid are in `GROUPS` in
`build.py`. Thresholds for the flags (`LOW`, `WATCH`, `HIGH_NO_SHOW`) and the
programming start date are at the top of `build.py`.

## Public holidays and the Christmas break

`holidays.csv` lists Queensland (Brisbane) public holidays. Any week with one,
or with days in the Christmas break (22 Dec to 5 Jan, set in `build.py`), or
with fewer classes than usual is labelled as a short week. The report then
shows a full-week equivalent (check-ins per class times the usual number of
classes) and compares on that basis, and sessions on those days are left out
of the classes-to-watch flags. `build.py` prints a warning in `summary.txt`
when the coming year has no holidays listed; add them from
qld.gov.au/recreation/travel/holidays/public before the year starts.
