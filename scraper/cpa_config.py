"""
Tabla de precios CPA por campaña y país.
precio_neto = base_price * (1 + fee_pct / 100)
"""

# (campaña, país) → precio neto USD
# Países en ISO-2 y nombre completo normalizados en lookup()

_RAW: list[dict] = [
    {"campaign": "FAFX",           "country": "ALL",        "base": 750.00, "fee": 0.00,  "net": 750.00},
    {"campaign": "X37",            "country": "Uruguay",    "base": 650.00, "fee": 0.00,  "net": 650.00},
    {"campaign": "X37",            "country": "Mexico",     "base": 750.00, "fee": 0.00,  "net": 750.00},
    {"campaign": "X37",            "country": "Colombia",   "base": 750.00, "fee": 0.00,  "net": 750.00},
    {"campaign": "X37",            "country": "Ecuador",    "base": 700.00, "fee": 0.00,  "net": 700.00},
    {"campaign": "Xcore",          "country": "Argentina",  "base": 750.00, "fee": 0.00,  "net": 750.00},
    {"campaign": "Xcore",          "country": "Colombia",   "base": 700.00, "fee": 0.00,  "net": 700.00},
    {"campaign": "Xcore",          "country": "Ecuador",    "base": 650.00, "fee": 0.00,  "net": 650.00},
    {"campaign": "Xcore",          "country": "Mexico",     "base": 600.00, "fee": 0.00,  "net": 600.00},
    {"campaign": "Flamad",         "country": "Colombia",   "base": 750.00, "fee": 0.00,  "net": 750.00},
    {"campaign": "Flamad",         "country": "Ecuador",    "base": 750.00, "fee": 0.00,  "net": 750.00},
    {"campaign": "Flamad",         "country": "Mexico",     "base": 700.00, "fee": 0.00,  "net": 700.00},
    {"campaign": "Flamad",         "country": "Argentina",  "base": 700.00, "fee": 0.00,  "net": 700.00},
    {"campaign": "Oneclick",       "country": "Colombia",   "base": 750.00, "fee": 1.50,  "net": 761.25},
    {"campaign": "Oneclick",       "country": "Argentina",  "base": 700.00, "fee": 1.50,  "net": 710.50},
    {"campaign": "Oneclick",       "country": "Ecuador",    "base": 700.00, "fee": 1.50,  "net": 710.50},
    {"campaign": "Oneclick",       "country": "Nicaragua",  "base": 750.00, "fee": 1.50,  "net": 761.25},
    {"campaign": "Oneclick",       "country": "Mexico",     "base": 750.00, "fee": 1.50,  "net": 761.25},
    {"campaign": "Oneclick",       "country": "Uruguay",    "base": 700.00, "fee": 1.50,  "net": 710.50},
    {"campaign": "Oneclick",       "country": "Peru",       "base": 750.00, "fee": 1.50,  "net": 761.25},
    {"campaign": "KK5",            "country": "Colombia",   "base": 650.00, "fee": 0.00,  "net": 650.00},
    {"campaign": "Digify",         "country": "Argentina",  "base": 750.00, "fee": 0.00,  "net": 750.00},
    {"campaign": "Duckmedia",      "country": "Argentina",  "base": 750.00, "fee": 0.00,  "net": 750.00},
    {"campaign": "Duckmedia",      "country": "Colombia",   "base": 750.00, "fee": 0.00,  "net": 750.00},
    {"campaign": "Xpoint",         "country": "ALL",        "base": 750.00, "fee": 0.00,  "net": 750.00},
    {"campaign": "Belmar",         "country": "Colombia",   "base": 850.00, "fee": 0.00,  "net": 850.00},
    {"campaign": "Belmar",         "country": "Uruguay",    "base": 800.00, "fee": 0.00,  "net": 800.00},
    {"campaign": "Belmar",         "country": "Argentina",  "base": 850.00, "fee": 0.00,  "net": 850.00},
    {"campaign": "Belmar",         "country": "Mexico",     "base": 850.00, "fee": 0.00,  "net": 850.00},
    {"campaign": "Goat",           "country": "ALL",        "base": 750.00, "fee": 2.00,  "net": 765.00},
    {"campaign": "KV",             "country": "Argentina",  "base": 611.40, "fee": 2.00,  "net": 623.63},
    {"campaign": "KV",             "country": "Colombia",   "base": 713.30, "fee": 2.00,  "net": 727.57},
    {"campaign": "KV",             "country": "Ecuador",    "base": 713.30, "fee": 2.00,  "net": 727.57},
    {"campaign": "OceanLeads",     "country": "Mexico",     "base": 700.00, "fee": 0.00,  "net": 700.00},
    {"campaign": "Newton Group",   "country": "ALL",        "base": 750.00, "fee": 3.00,  "net": 772.50},
    {"campaign": "Emduel",         "country": "Costa Rica", "base": 750.00, "fee": 0.00,  "net": 750.00},
    {"campaign": "Emduel",         "country": "Colombia",   "base": 750.00, "fee": 0.00,  "net": 750.00},
    {"campaign": "Emduel",         "country": "Uruguay",    "base": 750.00, "fee": 0.00,  "net": 750.00},
    {"campaign": "Emduel",         "country": "Honduras",   "base": 750.00, "fee": 0.00,  "net": 750.00},
    {"campaign": "Emduel",         "country": "Argentina",  "base": 900.00, "fee": 0.00,  "net": 900.00},
    {"campaign": "AMS",            "country": "ALL",        "base": 750.00, "fee": 0.00,  "net": 750.00},
    {"campaign": "NoLimits",       "country": "ALL",        "base": 750.00, "fee": 0.00,  "net": 750.00},
    {"campaign": "Traffomatic",    "country": "ALL",        "base": 765.00, "fee": 0.00,  "net": 765.00},
    {"campaign": "Tenx",           "country": "ALL",        "base": 713.00, "fee": 0.00,  "net": 750.00},
    {"campaign": "Casa Media",     "country": "Argentina",  "base": 800.00, "fee": 0.00,  "net": 800.00},
    {"campaign": "Academic Stock", "country": "Ecuador",    "base":   0.00, "fee": 0.00,  "net":   0.00},
    {"campaign": "Academic Stock", "country": "Argentina",  "base":   0.00, "fee": 0.00,  "net":   0.00},
    {"campaign": "Hexie",          "country": "Uruguay",    "base": 800.00, "fee": 0.00,  "net": 800.00},
    {"campaign": "Intek",          "country": "Argentina",  "base": 800.00, "fee": 0.00,  "net": 800.00},
]

# Mapa ISO-2 → nombre completo (para normalizar lo que devuelve el tracker)
_ISO2_TO_NAME: dict[str, str] = {
    "AR": "Argentina",
    "CO": "Colombia",
    "MX": "Mexico",
    "UY": "Uruguay",
    "EC": "Ecuador",
    "PE": "Peru",
    "NI": "Nicaragua",
    "CR": "Costa Rica",
    "HN": "Honduras",
    "MX": "Mexico",
    "VE": "Venezuela",
    "CL": "Chile",
    "BO": "Bolivia",
    "PY": "Paraguay",
    "GT": "Guatemala",
    "PA": "Panama",
    "SV": "El Salvador",
    "DO": "Dominican Republic",
    "CU": "Cuba",
    "PR": "Puerto Rico",
}

# Índice: (campaign_lower, country_lower) → net price
_INDEX: dict[tuple[str, str], float] = {}
_ALL_INDEX: dict[str, float] = {}  # campaña con ALL countries

for row in _RAW:
    c = row["campaign"].lower()
    p = row["country"].lower()
    if p == "all":
        _ALL_INDEX[c] = row["net"]
    else:
        _INDEX[(c, p)] = row["net"]


def normalize_country(raw: str) -> str:
    """Convierte código ISO-2 o nombre a nombre completo normalizado."""
    raw = raw.strip()
    if len(raw) == 2:
        return _ISO2_TO_NAME.get(raw.upper(), raw)
    return raw


def get_cpa_price(campaign: str, country_raw: str) -> float | None:
    """
    Devuelve el precio neto USD para una combinación campaña+país.
    Primero busca match exacto; si no, busca campaña con ALL.
    Devuelve None si no hay precio configurado.
    """
    country = normalize_country(country_raw)
    c_key   = campaign.strip().lower()
    p_key   = country.lower()

    # Match exacto campaña+país
    price = _INDEX.get((c_key, p_key))
    if price is not None:
        return price

    # Campaña con ALL países
    price = _ALL_INDEX.get(c_key)
    if price is not None:
        return price

    return None


def all_prices() -> list[dict]:
    """Devuelve la tabla CPA completa."""
    return [r.copy() for r in _RAW]
