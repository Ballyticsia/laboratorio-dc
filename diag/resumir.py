import json, glob, os
for f in sorted(glob.glob("diag/out/lh/*.json")):
    try: d = json.load(open(f))
    except Exception as e: print(os.path.basename(f), "ERROR", e); continue
    A, C = d.get("audits", {}), d.get("categories", {})
    sc = {k: round((v.get("score") or 0) * 100) for k, v in C.items()}
    m = lambda k: A.get(k, {}).get("displayValue")
    print(f"\n=== {os.path.basename(f)[:-5]} {d.get('finalDisplayedUrl')} {sc}")
    print("FCP", m("first-contentful-paint"), "| LCP", m("largest-contentful-paint"), "| TBT", m("total-blocking-time"), "| CLS", m("cumulative-layout-shift"), "| SI", m("speed-index"), "| peso", m("total-byte-weight"), "| DOM", m("dom-size"), "| JS boot", m("bootup-time"), "| hilo principal", m("mainthread-work-breakdown"))
    rs = (A.get("resource-summary", {}).get("details") or {}).get("items") or []
    print("recursos:", ", ".join(f"{x.get('label')} {x.get('requestCount')} req {round((x.get('transferSize') or 0)/1024)}KB" for x in rs))
    if "ballytics" in f:
        nr = (A.get("network-requests", {}).get("details") or {}).get("items") or []
        print("más pesados:")
        for x in sorted(nr, key=lambda x: -(x.get("transferSize") or 0))[:14]:
            print(f"   {round((x.get('transferSize') or 0)/1024):6}KB {round(x.get('networkEndTime',0)-x.get('networkRequestTime',0)):5}ms {x.get('resourceType')} {x.get('url')[:120]}")
        for k in ("uses-responsive-images", "render-blocking-resources", "unused-javascript", "unused-css-rules", "uses-text-compression", "modern-image-formats", "offscreen-images", "unminified-javascript", "unminified-css", "font-display", "largest-contentful-paint-element", "layout-shifts", "image-size-responsive", "unsized-images", "uses-long-cache-ttl", "color-contrast", "tap-targets", "heading-order", "image-alt", "label", "link-name", "button-name"):
            a = A.get(k, {}); it = (a.get("details") or {}).get("items") or []
            if a.get("score") is not None and a.get("score") < 1 or it:
                print(f"  [{k}] score={a.get('score')} {a.get('displayValue') or ''} items={len(it)}")
                for x in it[:5]:
                    s = {kk: (str(vv)[:110]) for kk, vv in x.items() if kk in ("url", "wastedBytes", "totalBytes", "wastedMs", "node", "displayedSize", "actualSize", "cacheLifetimeMs")}
                    if "node" in x: s["node"] = (x["node"] or {}).get("snippet", "")[:110] if isinstance(x["node"], dict) else s["node"]
                    print("      ", s)
