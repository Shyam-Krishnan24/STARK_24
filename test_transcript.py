import urllib.request, json

def test(label, vid):
    url = f"http://localhost:8000/transcript/{vid}"
    try:
        with urllib.request.urlopen(url, timeout=25) as r:
            d = json.loads(r.read())
            print(f"[{label}]")
            print(f"  was_translated : {d.get('was_translated')}")
            print(f"  source_language: {d.get('source_language')}")
            print(f"  segments       : {len(d['transcript'])}")
            print(f"  sample         : {d['transcript'][0]}")
    except Exception as e:
        print(f"[{label}] ERROR: {e}")
    print()

# English: Fireship — 100 Seconds of Python
test("English", "x7X9w_GIm1s")

# Hindi: popular Hindi educational video
test("Hindi", "BkcidfRSOkY")
