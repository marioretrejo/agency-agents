#!/usr/bin/env python3
"""
DR. Tracker – Scraper continuo
Recoge Leads y FTDs por País, Campaña y SubSource cada N segundos.
Guarda datos crudos y genera reporte CPA.
"""

import os
import time
import json
import csv
import logging
import hashlib
from datetime import datetime, date
from pathlib import Path

import requests
from bs4 import BeautifulSoup

from cpa_config import get_cpa_price, normalize_country

# ── Configuración ──────────────────────────────────────────────────────────────
BASE_URL   = "https://tracker.machukllc.xyz"
LOGIN_URL  = f"{BASE_URL}/login.php"
USERNAME   = os.getenv("TRACKER_USER", "conversion@tresenlinea.xyz")
PASSWORD   = os.getenv("TRACKER_PASS", "24731840Mt.")
INTERVAL   = int(os.getenv("SCRAPE_INTERVAL", "60"))
OUTPUT_DIR = Path(os.getenv("OUTPUT_DIR", "data"))
OUTPUT_DIR.mkdir(exist_ok=True)
LOG_LEVEL  = os.getenv("LOG_LEVEL", "INFO")

# Endpoints a scrapear
ENDPOINTS = {
    # Campaña + SubSource + País → Leads, FTDs
    "stats_campaign_sub_country": (
        f"{BASE_URL}/get_data.php?type=stats_pb&export=1"
        "&stats_type=Campaigns&sec_stats_type=SubSources&third_stats_type=Country&id=0"
    ),
    # Solo Campaña + País (resumen limpio)
    "stats_campaign_country": (
        f"{BASE_URL}/get_data.php?type=stats_pb&export=1"
        "&stats_type=Campaigns&sec_stats_type=Country&third_stats_type=none&id=0"
    ),
    # Reports con payouts
    "reports_campaign_country": (
        f"{BASE_URL}/get_data.php?type=reports&export=1"
        "&reports_type=Campaigns&sec_reports_type=Country&third_reports_type=none&id=0"
    ),
}

# ── Logging ────────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=getattr(logging, LOG_LEVEL.upper(), logging.INFO),
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler(OUTPUT_DIR / "scraper.log", encoding="utf-8"),
    ],
)
log = logging.getLogger(__name__)


# ── Scraper ────────────────────────────────────────────────────────────────────

class TrackerScraper:
    def __init__(self):
        self.session = requests.Session()
        self.session.headers.update({
            "User-Agent": (
                "Mozilla/5.0 (X11; Linux x86_64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/120.0.0.0 Safari/537.36"
            ),
            "X-Requested-With": "XMLHttpRequest",
        })
        self.logged_in = False
        self._seen: dict[str, set[str]] = {k: set() for k in ENDPOINTS}
        # Snapshot de FTDs previos para detectar duplicados/nuevos entre ciclos
        self._ftd_snapshot: dict[str, int] = {}

    # ── Auth ───────────────────────────────────────────────────────────────────

    def login(self) -> bool:
        try:
            log.info("Autenticando en %s …", BASE_URL)
            r = self.session.get(LOGIN_URL, timeout=20)
            r.raise_for_status()
            soup = BeautifulSoup(r.text, "html.parser")

            payload: dict[str, str] = {
                "email": USERNAME, "password": PASSWORD, "login": "", "theme": ""
            }
            for inp in soup.find_all("input", {"type": "hidden"}):
                name = inp.get("name")
                if name and name not in payload:
                    payload[name] = inp.get("value", "")

            r2 = self.session.post(LOGIN_URL, data=payload, timeout=20, allow_redirects=True)
            r2.raise_for_status()

            if 'name="password"' in r2.text:
                log.error("Login fallido – credenciales incorrectas")
                return False

            log.info("Login OK → %s", r2.url)
            self.logged_in = True
            return True
        except requests.RequestException as exc:
            log.error("Error de red al hacer login: %s", exc)
            return False

    # ── Fetch ──────────────────────────────────────────────────────────────────

    def _fetch(self, name: str, url: str) -> list[dict]:
        try:
            resp = self.session.get(url, timeout=30)
            resp.raise_for_status()
        except requests.RequestException as exc:
            log.error("[%s] Error: %s", name, exc)
            return []

        if 'name="password"' in resp.text:
            log.warning("[%s] Sesión expirada, re-login…", name)
            self.logged_in = False
            if self.login():
                return self._fetch(name, url)
            return []

        try:
            raw = resp.json()
        except ValueError:
            log.warning("[%s] JSON inválido", name)
            return []

        if not raw or not isinstance(raw, list):
            return []

        # Detectar si primera fila es cabecera
        first = raw[0]
        if isinstance(first, list) and all(isinstance(v, str) for v in first):
            headers = [str(v).strip().replace(" ", "_").replace("(", "").replace(")", "") for v in first]
            data_rows = raw[1:]
        else:
            headers = [f"col_{i}" for i in range(len(first))]
            data_rows = raw

        ts = datetime.utcnow().isoformat()
        records: list[dict] = []
        for row in data_rows:
            if not isinstance(row, list) or not any(row):
                continue
            rec = {
                (headers[i] if i < len(headers) else f"col_{i}"): v
                for i, v in enumerate(row)
            }
            rec["_endpoint"]   = name
            rec["_scraped_at"] = ts
            # Normalizar país
            for key in ("Country", "country"):
                if key in rec:
                    rec[key] = normalize_country(str(rec[key]))
            records.append(rec)

        return records

    def scrape_all(self) -> dict[str, list[dict]]:
        return {name: self._fetch(name, url) for name, url in ENDPOINTS.items()}

    # ── CPA Enrichment ─────────────────────────────────────────────────────────

    def enrich_cpa(self, records: list[dict]) -> list[dict]:
        """Agrega columnas CPA a registros que tengan campaña + país + FTDs."""
        enriched = []
        for rec in records:
            # Detectar campos campaña y país según el endpoint
            campaign = (
                rec.get("Campaigns") or rec.get("Traffic_Source") or
                rec.get("col_1") or ""
            )
            country_raw = (
                rec.get("Country") or rec.get("country") or
                rec.get("col_3") or ""
            )
            ftds = int(rec.get("FTDs", rec.get("FTD", 0)) or 0)

            price = get_cpa_price(str(campaign), str(country_raw))
            rec["_campaign_norm"]  = campaign
            rec["_country_norm"]   = normalize_country(str(country_raw))
            rec["_cpa_unit_price"] = price if price is not None else 0.0
            rec["_cpa_total"]      = round(ftds * (price or 0.0), 2)
            rec["_ftds_int"]       = ftds
            enriched.append(rec)
        return enriched

    # ── Persistencia ──────────────────────────────────────────────────────────

    def save_new(self, name: str, records: list[dict]) -> int:
        if not records:
            return 0
        new_rows: list[dict] = []
        for rec in records:
            payload = {k: v for k, v in rec.items() if not k.startswith("_scraped")}
            h = hashlib.md5(
                json.dumps(payload, sort_keys=True, default=str).encode()
            ).hexdigest()
            if h not in self._seen[name]:
                self._seen[name].add(h)
                rec["_hash"] = h
                new_rows.append(rec)

        if not new_rows:
            return 0

        date_str  = datetime.utcnow().strftime("%Y%m%d")
        csv_path  = OUTPUT_DIR / f"{name}_{date_str}.csv"
        jsonl_path = OUTPUT_DIR / f"{name}_{date_str}.jsonl"

        fieldnames = list(dict.fromkeys(k for r in new_rows for k in r))
        write_hdr  = not csv_path.exists()
        with open(csv_path, "a", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=fieldnames, extrasaction="ignore")
            if write_hdr:
                w.writeheader()
            w.writerows(new_rows)

        with open(jsonl_path, "a", encoding="utf-8") as f:
            for row in new_rows:
                f.write(json.dumps(row, ensure_ascii=False, default=str) + "\n")

        return len(new_rows)

    # ── Finance Report ────────────────────────────────────────────────────────

    def generate_finance_report(
        self,
        records: list[dict],
        date_from: str | None = None,
        date_to:   str | None = None,
        country_filter: str | None = None,
        campaign_filter: str | None = None,
        subsource_filter: str | None = None,
    ) -> dict:
        """
        Genera el resumen tipo MARKETING FINANCE.
        Devuelve dict con totales y tabla de detalle.
        """
        date_from = date_from or date.today().isoformat()
        date_to   = date_to   or date.today().isoformat()

        rows = records
        if country_filter:
            cf = country_filter.lower()
            rows = [r for r in rows if cf in str(r.get("_country_norm", "")).lower()]
        if campaign_filter:
            pf = campaign_filter.lower()
            rows = [r for r in rows if pf in str(r.get("_campaign_norm", "")).lower()]
        if subsource_filter:
            sf = subsource_filter.lower()
            rows = [r for r in rows
                    if sf in str(r.get("Sub_Source", r.get("col_2", ""))).lower()]

        total_leads = sum(int(r.get("Leads", 0) or 0) for r in rows)
        total_ftds  = sum(r.get("_ftds_int", 0) for r in rows)

        # FTDs Originales = FTDs con precio configurado (se cobran)
        # FTDs Duplicados = FTDs sin precio (no configurados / sin pago)
        ftds_originales  = sum(r["_ftds_int"] for r in rows if r.get("_cpa_unit_price", 0) > 0)
        ftds_duplicados  = total_ftds - ftds_originales

        cpa_total = sum(r.get("_cpa_total", 0.0) for r in rows)
        ecpa      = round(cpa_total / total_ftds, 2) if total_ftds > 0 else 0.0

        # Detalle por campaña + país
        detail: dict[tuple, dict] = {}
        for r in rows:
            key = (r.get("_campaign_norm", ""), r.get("_country_norm", ""))
            if key not in detail:
                detail[key] = {
                    "campaign":    key[0],
                    "country":     key[1],
                    "leads":       0,
                    "ftds":        0,
                    "cpa_price":   r.get("_cpa_unit_price", 0.0),
                    "cpa_total":   0.0,
                    "sub_sources": set(),
                }
            d = detail[key]
            d["leads"]     += int(r.get("Leads", 0) or 0)
            d["ftds"]      += r.get("_ftds_int", 0)
            d["cpa_total"] += r.get("_cpa_total", 0.0)
            ss = r.get("Sub_Source") or r.get("col_2") or ""
            if ss:
                d["sub_sources"].add(str(ss))

        detail_list = []
        for d in sorted(detail.values(), key=lambda x: (-x["cpa_total"], x["campaign"])):
            d2 = d.copy()
            d2["sub_sources"] = ", ".join(sorted(d["sub_sources"]))
            d2["cr_pct"]      = round(d["ftds"] / d["leads"] * 100, 2) if d["leads"] > 0 else 0.0
            d2["cpa_total"]   = round(d["cpa_total"], 2)
            detail_list.append(d2)

        return {
            "date_from":       date_from,
            "date_to":         date_to,
            "total_leads":     total_leads,
            "total_ftds":      total_ftds,
            "ftds_originales": ftds_originales,
            "ftds_duplicados": ftds_duplicados,
            "cpa_total_usd":   round(cpa_total, 2),
            "ecpa_usd":        ecpa,
            "detail":          detail_list,
        }

    def print_finance_report(self, report: dict):
        """Imprime el reporte en consola con formato legible."""
        sep = "─" * 70
        print(f"\n{'═'*70}")
        print(f"  MARKETING FINANCE REPORT")
        print(f"  {report['date_from']}  →  {report['date_to']}")
        print(f"{'═'*70}")
        print(f"  {'TOTAL FTDs':20s}  {report['total_ftds']:>8}")
        print(f"  {'FTDs DUPLICADOS':20s}  {report['total_ftds'] - report['ftds_originales']:>8}")
        print(f"  {'FTD ORIGINAL':20s}  {report['ftds_originales']:>8}")
        print(sep)
        print(f"  {'CPA':20s}  ${report['cpa_total_usd']:>12,.2f}")
        print(f"  {'ECPA':20s}  ${report['ecpa_usd']:>12,.2f}")
        print(f"  {'TOTAL LEADS':20s}  {report['total_leads']:>8}")
        print(f"\n  {'CAMPAIGN':<22} {'COUNTRY':<14} {'LEADS':>7} {'FTDS':>5} {'CR%':>6} {'UNIT $':>9} {'TOTAL $':>10}")
        print(sep)
        for d in report["detail"]:
            print(
                f"  {d['campaign']:<22} {d['country']:<14} "
                f"{d['leads']:>7} {d['ftds']:>5} {d['cr_pct']:>5.1f}% "
                f"${d['cpa_price']:>8,.2f} ${d['cpa_total']:>9,.2f}"
            )
        print(f"{'═'*70}\n")

    def save_finance_report(self, report: dict):
        """Guarda el reporte como JSON."""
        ts   = datetime.utcnow().strftime("%Y%m%dT%H%M%S")
        path = OUTPUT_DIR / f"finance_report_{ts}.json"
        with open(path, "w", encoding="utf-8") as f:
            json.dump(report, f, ensure_ascii=False, indent=2, default=str)
        # CSV de detalle
        csv_path = OUTPUT_DIR / f"finance_detail_{ts}.csv"
        if report["detail"]:
            keys = list(report["detail"][0].keys())
            with open(csv_path, "w", newline="", encoding="utf-8") as f:
                w = csv.DictWriter(f, fieldnames=keys, extrasaction="ignore")
                w.writeheader()
                w.writerows(report["detail"])
        log.info("Reporte guardado: %s", path)
        return path

    # ── Loop ──────────────────────────────────────────────────────────────────

    def run(self):
        log.info("=" * 60)
        log.info("DR. Tracker Scraper + Finance Report")
        log.info("  Intervalo : %d s", INTERVAL)
        log.info("  Salida    : %s", OUTPUT_DIR.resolve())
        log.info("=" * 60)

        cycle = 0
        latest_stats: list[dict] = []

        while True:
            cycle += 1
            if not self.logged_in:
                if not self.login():
                    log.error("Login fallido. Reintentando en %d s…", INTERVAL)
                    time.sleep(INTERVAL)
                    continue

            log.info("── Ciclo #%d ──────────────────────────────", cycle)
            all_data = self.scrape_all()

            for name, records in all_data.items():
                enriched = self.enrich_cpa(records)
                new_count = self.save_new(name, enriched)
                log.info("  [%-30s] %2d registros | %2d nuevos", name, len(records), new_count)

                # Usar stats_campaign_sub_country como fuente principal del reporte
                if name == "stats_campaign_sub_country" and records:
                    latest_stats = enriched

            # Generar reporte Finance cada ciclo
            if latest_stats:
                report = self.generate_finance_report(latest_stats)
                self.print_finance_report(report)
                self.save_finance_report(report)

            log.info("Próximo ciclo en %d s…\n", INTERVAL)
            time.sleep(INTERVAL)


# ── Punto de entrada ──────────────────────────────────────────────────────────

if __name__ == "__main__":
    scraper = TrackerScraper()
    try:
        scraper.run()
    except KeyboardInterrupt:
        log.info("Scraper detenido (Ctrl+C).")
