import re

files = {
    "voltreport (3).sql": r"C:\Users\Pongo\Downloads\voltreport (3).sql",
    "asset_restore.sql": r"C:\Users\Pongo\Downloads\asset_restore.sql",
    "scada_gardu.sql": r"C:\Users\Pongo\Downloads\scada_gardu.sql",
    "voltreport_scada.sql (BE)": r"D:\VoltReport\BE\database\voltreport_scada.sql"
}

for name, path in files.items():
    print(f"\n=== {name} ===")
    counts = {}
    with open(path, 'r', encoding='utf-8', errors='ignore') as f:
        for line in f:
            m = re.search(r'INSERT\s+INTO\s+`?(\w+)`?', line, re.IGNORECASE)
            if m:
                table = m.group(1)
                # count how many values/rows
                # A simple count of occurrences is fine or parsing the values.
                # Since one line can have one INSERT with multiple rows, let's count commas/rows if possible,
                # or just count the number of INSERT statement lines.
                counts[table] = counts.get(table, 0) + 1
    for tbl, cnt in sorted(counts.items()):
        print(f"  {tbl}: {cnt} INSERT statement(s)")
