import json, glob, os
for f in sorted(glob.glob("diag/out/lh2/*.json")):
    try: d = json.load(open(f))
    except Exception as e: print(os.path.basename(f), "ERROR", e); continue
    A, C = d.get("audits", {}), d.get("categories", {})
    sc = {k: round((v.get("score") or 0) * 100) for k, v in C.items()}
    m = lambda k: A.get(k, {}).get("displayValue")
    rs = (A.get("resource-summary", {}).get("details") or {}).get("items") or []
    print(f"=== {os.path.basename(f)[:-5]} {sc} | FCP {m('first-contentful-paint')} | LCP {m('largest-contentful-paint')} | TBT {m('total-blocking-time')} | CLS {m('cumulative-layout-shift')} | SI {m('speed-index')} | {m('total-byte-weight')} | DOM {m('dom-size')}")
    print("   ", ", ".join(f"{x.get('label')} {x.get('requestCount')} req {round((x.get('transferSize') or 0)/1024)}KB" for x in rs if x.get('label') in ('Total','Image','Script','Font','Other','Stylesheet')))
    for k in ("largest-contentful-paint-element", "layout-shifts", "render-blocking-resources", "color-contrast", "uses-responsive-images", "bootup-time", "mainthread-work-breakdown"):
        a = A.get(k, {}); it = (a.get("details") or {}).get("items") or []
        if a.get("score") is not None and a.get("score") < 0.9:
            print(f"    [{k}] score={a.get('score')} {a.get('displayValue') or ''}")
            for x in it[:4]:
                nd = x.get("node") if isinstance(x.get("node"), dict) else None
                print("       ", {kk: str(vv)[:90] for kk, vv in x.items() if kk in ("url", "wastedMs", "total", "scripting", "groupLabel", "duration", "score")}, (nd or {}).get("snippet", "")[:100])
            if k == "largest-contentful-paint-element":
                for x in it[:2]:
                    for y in ((x.get("items") or []) if isinstance(x, dict) else []):
                        nd = y.get("node") if isinstance(y, dict) else None
                        if nd: print("        LCP:", nd.get("snippet", "")[:140])
                        if y.get("phase"): print("        fase", y.get("phase"), y.get("timing"))
