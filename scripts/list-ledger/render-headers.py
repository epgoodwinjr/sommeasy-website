"""Draw scan-truth lists with and without a restaurant's printed header —
the measurement behind the scan prompt's metadata.restaurant (Nov 27, 2026).

    python3 scripts/list-ledger/render-headers.py <out-dir>
    node scripts/scan-truth/scan.mjs <out-dir> <out.json> 2

Every restaurant here is INVENTED. The images are only ever sent to the real
/api/parse-wine-list handler by scan.mjs; nothing reaches Supabase.
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "scan-truth"))
from render import render  # noqa: E402

# key: (list, heading or None for the list's own title, header lines)
CASES = {
    # name, city and website all printed
    "sept19-full": ("sept19", "WINE", [("SALT & CELLAR", 54), ("Hermanus  ·  Western Cape", 28), ("saltandcellar.co.za", 24)]),
    # name and city, no website
    "aug8-namecity": ("aug8", "WINE", [("Fynbos Kitchen", 50), ("Franschhoek", 28)]),
    # a name alone
    "mixed-name": ("mixed", None, [("The Long Table", 50)]),
    # nothing printed about the restaurant: the same lists bare
    "sept19-bare": ("sept19", "WINE", None),
    "aug8-bare": ("aug8", "WINE", None),
    "mixed-bare": ("mixed", None, None),
}

if __name__ == "__main__":
    out = sys.argv[1]
    os.makedirs(out, exist_ok=True)
    with open(os.path.join(HERE, "..", "scan-truth", "lists.json")) as f:
        lists = json.load(f)["lists"]
    for key, (name, heading, header) in CASES.items():
        render(key, lists[name], out, title=heading, header=header)
