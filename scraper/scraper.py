#!/usr/bin/env python3
"""
DR. Tracker – Scraper continuo para reports.new.php
Hace login automático y extrae datos JSON de los endpoints AJAX en loop.
"""

import os
import time
import json
import csv
import logging
import hashlib
from datetime import datetime
from pathlib import Path

import requests
from bs4 import BeautifulSoup

# ── Configuración ──────────────────────────────────────────────────────────────
BASE_URL   = "https://tracker.machukllc.xyz"
LOGIN_URL  = f"{BASE_URL}/login.php"

USERNAME   = os.getenv("TRACKER_USER", "conversion@tresenlinea.xyz")
PASSWORD   = os.getenv("TRACKER_PASS", "24731840Mt.")

# Intervalo entre scrapes en segundos
INTERVAL   = int(os.getenv("SCRAPE_INTERVAL", "60"))

OUTPUT_DIR = Path(os.getenv("OUTPUT_DIR", "data"))
OUTPUT_DIR.mkdir(exist_ok=True)

LOG_LEVEL  = os.getenv("LOG_LEVEL", "INFO")

# Endpoints AJAX del tracker
ENDPOINTS = {
    "stats": (
        f"{BASE_URL}/get_data.php"
        "?type=stats_pb&export=1"
        "&stats_type=none&sec_stats_type=none&third_stats_type=none&id=0"
    ),
    "reports": (
        f"{BASE_URL}/get_data.php"
        "?type=reports&export=1"
        "&reports_type=none&sec_reports_type=none&third_reports_type=none&id=0"
    ),
}

# Cabeceras de columnas para cada endpoint (primera fila del JSON)
HEADERS_MAP = {
    "stats":   ["ID", "Brand_Name", "Traffic_Source", "Country", "Leads", "FTDs", "CR_pct"],
    "reports": ["ID", "Brand_Name", "Traffic_Source", "Country",
                "Signups", "FTD", "CR_pct", "Affiliate_Payout", "Brand_Payout", "Total_Profit"],
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
            "Accept": "application/json, text/javascript, */*; q=0.01",
            "X-Requested-With": "XMLHttpRequest",
        })
        self.logged_in = False
        self._seen: dict[str, set[str]] = {k: set() for k in ENDPOINTS}

    # ── Autenticación ──────────────────────────────────────────────────────────

    def login(self) -> bool:
        """Hace login y devuelve True si tuvo éxito."""
        try:
            log.info("Iniciando sesión en %s …", BASE_URL)
            resp = self.session.get(LOGIN_URL, timeout=20)
            resp.raise_for_status()

            # Buscar token CSRF si existe
            soup = BeautifulSoup(resp.text, "html.parser")
            payload: dict[str, str] = {
                "email":    USERNAME,
                "password": PASSWORD,
                "login":    "",
                "theme":    "",
            }
            for inp in soup.find_all("input", {"type": "hidden"}):
                name = inp.get("name")
                if name and name not in payload:
                    payload[name] = inp.get("value", "")

            resp2 = self.session.post(
                LOGIN_URL, data=payload, timeout=20, allow_redirects=True
            )
            resp2.raise_for_status()

            if self._is_login_page(resp2.text):
                log.error("Login fallido – credenciales incorrectas o estructura cambiada")
                _save_debug(resp2.text, "login_failed", OUTPUT_DIR)
                return False

            log.info("Login exitoso – URL actual: %s", resp2.url)
            self.logged_in = True
            return True

        except requests.RequestException as exc:
            log.error("Error de red al hacer login: %s", exc)
            return False

    def _is_login_page(self, html: str) -> bool:
        return 'name="password"' in html or "name='password'" in html

    # ── Scraping de datos ──────────────────────────────────────────────────────

    def scrape(self) -> dict[str, list[dict]]:
        """Descarga ambos endpoints. Devuelve {endpoint_name: [records]}."""
        results: dict[str, list[dict]] = {}

        for name, url in ENDPOINTS.items():
            records = self._fetch_endpoint(name, url)
            results[name] = records

        return results

    def _fetch_endpoint(self, name: str, url: str) -> list[dict]:
        try:
            resp = self.session.get(url, timeout=30)
            resp.raise_for_status()
        except requests.RequestException as exc:
            log.error("[%s] Error de red: %s", name, exc)
            return []

        # Redirigido al login → sesión expirada
        if self._is_login_page(resp.text):
            log.warning("[%s] Sesión expirada, re-autenticando…", name)
            self.logged_in = False
            if self.login():
                return self._fetch_endpoint(name, url)
            return []

        try:
            raw = resp.json()
        except ValueError:
            log.warning("[%s] Respuesta no es JSON válido (len=%d)", name, len(resp.text))
            _save_debug(resp.text, f"bad_json_{name}", OUTPUT_DIR)
            return []

        if not isinstance(raw, list) or not raw:
            log.info("[%s] Respuesta vacía o inesperada: %s", name, str(raw)[:100])
            return []

        # Si la primera fila son cabeceras de texto, usarla como headers
        first = raw[0]
        if isinstance(first, list) and all(isinstance(v, str) for v in first):
            headers = [str(v).strip().replace(" ", "_") for v in first]
            data_rows = raw[1:]
        else:
            headers = HEADERS_MAP.get(name, [f"col_{i}" for i in range(len(first))])
            data_rows = raw

        ts = datetime.utcnow().isoformat()
        records: list[dict] = []
        for row in data_rows:
            if not isinstance(row, list):
                continue
            rec = {
                headers[i] if i < len(headers) else f"col_{i}": v
                for i, v in enumerate(row)
            }
            rec["_endpoint"]   = name
            rec["_scraped_at"] = ts
            records.append(rec)

        return records

    # ── Persistencia ──────────────────────────────────────────────────────────

    def save_new(self, name: str, records: list[dict]) -> int:
        """Persiste sólo filas nuevas (deduplicación por hash de contenido)."""
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
            writer = csv.DictWriter(f, fieldnames=fieldnames, extrasaction="ignore")
            if write_hdr:
                writer.writeheader()
            writer.writerows(new_rows)

        with open(jsonl_path, "a", encoding="utf-8") as f:
            for row in new_rows:
                f.write(json.dumps(row, ensure_ascii=False, default=str) + "\n")

        return len(new_rows)

    # ── Loop principal ────────────────────────────────────────────────────────

    def run(self):
        log.info("=" * 60)
        log.info("DR. Tracker Scraper arrancado")
        log.info("  Base URL  : %s", BASE_URL)
        log.info("  Usuario   : %s", USERNAME)
        log.info("  Intervalo : %d s", INTERVAL)
        log.info("  Salida    : %s", OUTPUT_DIR.resolve())
        log.info("  Endpoints : %s", ", ".join(ENDPOINTS))
        log.info("=" * 60)

        cycle = 0
        while True:
            cycle += 1

            if not self.logged_in:
                if not self.login():
                    log.error("No se pudo hacer login. Reintentando en %d s…", INTERVAL)
                    time.sleep(INTERVAL)
                    continue

            log.info("── Ciclo #%d ─────────────────────────────", cycle)
            all_data = self.scrape()

            for endpoint_name, records in all_data.items():
                new_count = self.save_new(endpoint_name, records)
                log.info(
                    "  [%-8s] %2d registros totales | %2d nuevos guardados",
                    endpoint_name, len(records), new_count,
                )

            log.info("Próximo ciclo en %d segundos…", INTERVAL)
            time.sleep(INTERVAL)


# ── Utilidades ────────────────────────────────────────────────────────────────

def _save_debug(html: str, tag: str, out_dir: Path):
    ts   = datetime.utcnow().strftime("%Y%m%dT%H%M%S")
    path = out_dir / f"debug_{tag}_{ts}.html"
    path.write_text(html, encoding="utf-8")
    log.debug("Debug HTML guardado: %s", path)


# ── Punto de entrada ──────────────────────────────────────────────────────────

if __name__ == "__main__":
    scraper = TrackerScraper()
    try:
        scraper.run()
    except KeyboardInterrupt:
        log.info("Scraper detenido por el usuario (Ctrl+C).")
