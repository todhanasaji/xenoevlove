# ============================================================
# XenoEvolve Omics
# Analysis history, temporal evidence, LC-MS/MS upload and
# report generation endpoints.
#
# Nothing here invents measurements: every value returned is
# computed from the uploaded data or the stored analysis.
# ============================================================

import base64
import csv
import io
import json
import math
import re
import struct
import threading
import xml.etree.ElementTree as ET
import zlib
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

from fastapi import APIRouter, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel

from rdkit import Chem
from rdkit.Chem import Descriptors

router = APIRouter()

DATA_DIR = Path(__file__).resolve().parent / "data"
HISTORY_PATH = DATA_DIR / "analyses.json"
REPORT_DIR = DATA_DIR / "reports"

MAX_UPLOAD_BYTES = 50 * 1024 * 1024
MAX_HISTORY = 200
PROTON_MASS = 1.007276466812
PPM_TOLERANCE = 5.0

DISCLAIMER = (
    "Predicted and putative results are hypotheses unless "
    "experimentally confirmed."
)

_lock = threading.Lock()
_analyses: dict[str, dict] = {}


# ============================================================
# ANALYSIS STORE
# ============================================================

def _load_history() -> None:
    try:
        stored = json.loads(HISTORY_PATH.read_text(encoding="utf-8"))
        for item in stored:
            if isinstance(item, dict) and isinstance(item.get("id"), str):
                _analyses[item["id"]] = item
    except (OSError, ValueError):
        pass


def store_analysis(result: dict) -> None:
    """Remember a completed /analyze response (memory + disk)."""
    if not isinstance(result.get("id"), str):
        return
    with _lock:
        _analyses[result["id"]] = result
        while len(_analyses) > MAX_HISTORY:
            _analyses.pop(next(iter(_analyses)))
        try:
            DATA_DIR.mkdir(exist_ok=True)
            HISTORY_PATH.write_text(
                json.dumps(list(_analyses.values())), encoding="utf-8"
            )
        except OSError:
            pass


def get_analysis(analysis_id: Optional[str]) -> Optional[dict]:
    if not analysis_id:
        return None
    return _analyses.get(analysis_id)


_load_history()


def _history_entry(result: dict) -> dict:
    chemical = result.get("chemical") or {}
    return {
        "id": result["id"],
        "created_at": result.get("created_at"),
        "status": result.get("status", "completed"),
        "compound": {
            "name": chemical.get("name"),
            "formula": chemical.get("formula"),
            "molecular_weight": chemical.get("molecular_weight"),
            "canonical_smiles": chemical.get("canonical_smiles"),
            "inchikey": chemical.get("inchikey"),
        },
    }


@router.get("/analysis/history")
def analysis_history():
    entries = [_history_entry(item) for item in _analyses.values()]
    entries.sort(key=lambda item: item.get("created_at") or "", reverse=True)
    return {"analyses": entries}


@router.get("/analysis/{analysis_id}")
def analysis_detail(analysis_id: str):
    result = get_analysis(analysis_id)
    if result is None:
        raise HTTPException(status_code=404, detail="Analysis not found.")
    return result


# ============================================================
# TEMPORAL EVIDENCE
# ============================================================

class TemporalRequest(BaseModel):
    analysis_id: Optional[str] = None
    observations: list[dict[str, Any]]


def _time_value(label: str, fallback: int) -> float:
    match = re.search(r"-?\d+(?:\.\d+)?", str(label))
    return float(match.group()) if match else float(fallback)


def _mean(values: list[float]) -> float:
    return sum(values) / len(values)


def _pearson(xs: list[float], ys: list[float]) -> Optional[float]:
    if len(xs) < 3:
        return None
    mx, my = _mean(xs), _mean(ys)
    sx = math.sqrt(sum((x - mx) ** 2 for x in xs))
    sy = math.sqrt(sum((y - my) ** 2 for y in ys))
    if sx == 0 or sy == 0:
        return None
    return sum((x - mx) * (y - my) for x, y in zip(xs, ys)) / (sx * sy)


@router.post("/temporal/analyze")
def temporal_analyze(request: TemporalRequest):
    rows = []
    for index, obs in enumerate(request.observations):
        try:
            abundance = float(obs["abundance"])
            time_point = str(obs["time_point"]).strip()
            compound = str(obs["compound"]).strip()
        except (KeyError, TypeError, ValueError):
            raise HTTPException(
                status_code=422,
                detail=f"Observation {index + 1} needs time_point, compound and numeric abundance.",
            )
        if not time_point or not compound or not math.isfinite(abundance) or abundance < 0:
            raise HTTPException(
                status_code=422,
                detail=f"Observation {index + 1} has an invalid time_point, compound or abundance.",
            )
        rows.append((time_point, compound, abundance, str(obs.get("replicate") or "")))

    if not rows:
        raise HTTPException(status_code=422, detail="No observations supplied.")

    # Ordered, de-duplicated time points (numeric part if present).
    seen: list[str] = []
    for time_point, *_ in rows:
        if time_point not in seen:
            seen.append(time_point)
    times = sorted(seen, key=lambda t: (_time_value(t, seen.index(t)), seen.index(t)))

    compounds: list[str] = []
    for _, compound, *_ in rows:
        if compound not in compounds:
            compounds.append(compound)

    # Parent: the stored analysis compound if present, else the
    # compound with the highest abundance at the first time point.
    stored = get_analysis(request.analysis_id)
    parent = None
    if stored:
        name = ((stored.get("chemical") or {}).get("name") or "").lower()
        parent = next((c for c in compounds if c.lower() == name), None)
    if parent is None:
        first = {c: 0.0 for c in compounds}
        for time_point, compound, abundance, _ in rows:
            if time_point == times[0]:
                first[compound] = max(first[compound], abundance)
        parent = max(compounds, key=lambda c: first[c])
    products = [c for c in compounds if c != parent]

    def mean_at(compound: str, time_point: str) -> Optional[float]:
        values = [a for t, c, a, _ in rows if c == compound and t == time_point]
        return _mean(values) if values else None

    series = []
    for time_point in times:
        parent_value = mean_at(parent, time_point)
        product_values = [v for v in (mean_at(p, time_point) for p in products) if v is not None]
        series.append({
            "time_point": time_point,
            "parent_abundance": parent_value,
            "product_abundance": sum(product_values) if product_values else None,
        })
    paired = [s for s in series if s["parent_abundance"] is not None and s["product_abundance"] is not None]

    # Parent depletion.
    parent_points = [s["parent_abundance"] for s in series if s["parent_abundance"] is not None]
    if len(parent_points) >= 2 and parent_points[0] > 0:
        depletion = (parent_points[0] - parent_points[-1]) / parent_points[0]
        parent_text = f"{depletion * 100:.1f}% change from first to last time point" if depletion >= 0 else \
            f"No depletion (parent increased {abs(depletion) * 100:.1f}%)"
    else:
        parent_text = "Insufficient parent observations"

    # Product appearance order: first time each product exceeds
    # 10% of its own maximum.
    appearance = []
    for product in products:
        points = [(t, mean_at(product, t)) for t in times]
        points = [(t, v) for t, v in points if v is not None]
        peak = max((v for _, v in points), default=0)
        if peak > 0:
            first_time = next(t for t, v in points if v >= 0.1 * peak)
            appearance.append((times.index(first_time), product, first_time))
    appearance.sort()
    order_text = (
        " → ".join(f"{product} ({time})" for _, product, time in appearance)
        if appearance else "No product signal observed"
    )

    # Parent–product correlation.
    correlation = _pearson(
        [s["parent_abundance"] for s in paired],
        [s["product_abundance"] for s in paired],
    )
    correlation_text = (
        f"r = {correlation:.2f} (n = {len(paired)} time points)"
        if correlation is not None else "Not computable (needs ≥3 paired time points with variance)"
    )

    # Replicate consistency: mean coefficient of variation.
    cvs = []
    for compound in compounds:
        for time_point in times:
            values = [a for t, c, a, _ in rows if c == compound and t == time_point]
            if len(values) >= 2 and _mean(values) > 0:
                variance = sum((v - _mean(values)) ** 2 for v in values) / (len(values) - 1)
                cvs.append(math.sqrt(variance) / _mean(values))
    replicate_text = (
        f"Mean CV {_mean(cvs) * 100:.1f}% across {len(cvs)} replicate groups"
        if cvs else "No replicate groups supplied"
    )

    return {
        "success": True,
        "analysis_id": request.analysis_id,
        "parent_compound": parent,
        "product_compounds": products,
        "time_series": series,
        "parent_depletion_evidence": parent_text,
        "product_appearance_order": order_text,
        "parent_product_correlation": correlation_text,
        "replicate_consistency": replicate_text,
        "limitations": [
            "Temporal association supports prioritization but does not establish biochemical causation.",
            "Parent is taken from the linked analysis compound, else the most abundant compound at the first time point.",
        ],
    }


# ============================================================
# LC-MS/MS UPLOAD
# ============================================================

def _parse_mgf(text: str) -> list[dict]:
    spectra, current = [], None
    for raw in text.splitlines():
        line = raw.strip()
        if line == "BEGIN IONS":
            current = {"peaks": []}
        elif line == "END IONS" and current is not None:
            spectra.append(current)
            current = None
        elif current is not None and line:
            if "=" in line and not line[0].isdigit():
                key, value = line.split("=", 1)
                key = key.upper()
                if key == "PEPMASS":
                    parts = value.split()
                    current["mz"] = float(parts[0])
                    if len(parts) > 1:
                        current["intensity"] = float(parts[1])
                elif key == "RTINSECONDS":
                    current["rt"] = float(value) / 60.0
                elif key == "TITLE":
                    current["title"] = value
            else:
                parts = line.split()
                if len(parts) >= 2:
                    current["peaks"].append((float(parts[0]), float(parts[1])))
    return spectra


def _parse_msp(text: str) -> list[dict]:
    spectra = []
    for block in re.split(r"\n\s*\n", text):
        spectrum: dict = {"peaks": []}
        in_peaks = False
        for raw in block.splitlines():
            line = raw.strip()
            if not line:
                continue
            if in_peaks or re.match(r"^-?\d", line):
                parts = re.split(r"[\s;,]+", line.rstrip(";"))
                try:
                    spectrum["peaks"].append((float(parts[0]), float(parts[1])))
                except (ValueError, IndexError):
                    pass
            elif ":" in line:
                key, value = line.split(":", 1)
                key, value = key.strip().upper(), value.strip()
                if key in ("PRECURSORMZ", "PRECURSOR_MZ"):
                    spectrum["mz"] = float(value)
                elif key in ("RETENTIONTIME", "RT"):
                    spectrum["rt"] = float(value)
                elif key == "NAME":
                    spectrum["title"] = value
                elif key == "NUM PEAKS":
                    in_peaks = True
        if spectrum["peaks"] or "mz" in spectrum:
            spectra.append(spectrum)
    return spectra


def _decode_array(b64: str, bits: int, compressed: bool, order: str) -> list[float]:
    raw = base64.b64decode(b64)
    if compressed:
        raw = zlib.decompress(raw)
    count = len(raw) // (bits // 8)
    code = ("<" if order == "little" else ">") + ("d" if bits == 64 else "f") * count
    return list(struct.unpack(code, raw[: count * (bits // 8)]))


def _local(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def _parse_mzml(data: bytes) -> list[dict]:
    spectra = []
    for _, elem in ET.iterparse(io.BytesIO(data)):
        if _local(elem.tag) != "spectrum":
            continue
        spectrum: dict = {"peaks": []}
        arrays: dict[str, list[float]] = {}
        ms_level = None
        for node in elem.iter():
            tag = _local(node.tag)
            if tag == "cvParam":
                name = node.get("name", "")
                if name == "ms level":
                    ms_level = int(node.get("value", "0"))
                elif name == "scan start time":
                    value = float(node.get("value", "0"))
                    spectrum["rt"] = value if node.get("unitName", "minute") == "minute" else value / 60.0
                elif name == "selected ion m/z":
                    spectrum["mz"] = float(node.get("value"))
            elif tag == "binaryDataArray":
                names = {p.get("name") for p in node if _local(p.tag) == "cvParam"}
                bits = 64 if "64-bit float" in names else 32
                binary = next((c.text for c in node if _local(c.tag) == "binary"), None)
                if not binary:
                    continue
                values = _decode_array(binary, bits, "zlib compression" in names, "little")
                if "m/z array" in names:
                    arrays["mz"] = values
                elif "intensity array" in names:
                    arrays["intensity"] = values
        if arrays.get("mz") and arrays.get("intensity"):
            spectrum["peaks"] = list(zip(arrays["mz"], arrays["intensity"]))
        spectrum["ms_level"] = ms_level
        if spectrum["peaks"]:
            spectra.append(spectrum)
        elem.clear()
    return spectra


def _parse_mzxml(data: bytes) -> list[dict]:
    spectra = []
    for _, elem in ET.iterparse(io.BytesIO(data)):
        if _local(elem.tag) != "scan":
            continue
        spectrum: dict = {"peaks": [], "ms_level": int(elem.get("msLevel", "1"))}
        rt = elem.get("retentionTime")
        if rt:
            match = re.search(r"-?\d+(?:\.\d+)?", rt)
            if match:
                spectrum["rt"] = float(match.group()) / 60.0
        for node in elem:
            tag = _local(node.tag)
            if tag == "precursorMz" and node.text:
                spectrum["mz"] = float(node.text)
            elif tag == "peaks" and node.text:
                bits = int(node.get("precision", "32"))
                values = _decode_array(node.text.strip(), bits, node.get("compressionType") == "zlib", "big")
                spectrum["peaks"] = list(zip(values[0::2], values[1::2]))
        if spectrum["peaks"]:
            spectra.append(spectrum)
        elem.clear()
    return spectra


def _parse_table(text: str) -> list[dict]:
    """CSV/TXT: columns mz (or m/z), intensity, optional rt/retention_time."""
    sample = text[:2048]
    dialect = csv.Sniffer().sniff(sample, delimiters=",;\t ") if sample.strip() else csv.excel
    reader = csv.reader(io.StringIO(text), dialect)
    rows = [r for r in reader if r]
    if not rows:
        return []
    header = [h.strip().lower() for h in rows[0]]
    has_header = not re.match(r"^-?\d", header[0])

    def col(*names):
        for name in names:
            if name in header:
                return header.index(name)
        return None

    if has_header:
        mz_i = col("mz", "m/z", "precursor_mz", "mass")
        in_i = col("intensity", "abundance", "area", "height")
        rt_i = col("rt", "retention_time", "retention time", "rt_min")
        body = rows[1:]
    else:
        mz_i, in_i, rt_i, body = 0, 1, 2 if len(rows[0]) > 2 else None, rows
    if mz_i is None:
        raise HTTPException(status_code=422, detail="Could not find an m/z column (expected mz or m/z).")
    spectra = []
    for row in body:
        try:
            spectra.append({
                "mz": float(row[mz_i]),
                "intensity": float(row[in_i]) if in_i is not None and len(row) > in_i else None,
                "rt": float(row[rt_i]) if rt_i is not None and len(row) > rt_i and row[rt_i] else None,
                "peaks": [],
            })
        except (ValueError, IndexError):
            continue
    return spectra


def _candidate_masses(stored: dict) -> list[dict]:
    """Exact masses of RDKit-valid candidate products from a stored analysis."""
    candidates = []
    for item in stored.get("candidate_products") or []:
        for index, smiles in enumerate(item.get("product_smiles") or []):
            mol = Chem.MolFromSmiles(smiles)
            if mol is None:
                continue
            candidates.append({
                "id": f"{item.get('id', 'candidate')}-{index + 1}",
                "smiles": smiles,
                "exact_mass": Descriptors.ExactMolWt(mol),
            })
    parent = (stored.get("chemical") or {}).get("smiles")
    mol = Chem.MolFromSmiles(parent) if parent else None
    if mol is not None:
        candidates.append({
            "id": "parent",
            "smiles": parent,
            "exact_mass": Descriptors.ExactMolWt(mol),
        })
    return candidates


@router.post("/msms/analyze")
async def msms_analyze(file: UploadFile = File(...), analysis_id: Optional[str] = Form(None)):
    data = await file.read(MAX_UPLOAD_BYTES + 1)
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="File exceeds the 50 MB upload limit.")
    name = (file.filename or "").lower()
    extension = Path(name).suffix

    try:
        if extension == ".mzml":
            spectra = _parse_mzml(data)
        elif extension == ".mzxml":
            spectra = _parse_mzxml(data)
        elif extension in (".mgf", ".msp", ".txt", ".csv"):
            text = data.decode("utf-8", errors="replace")
            if extension == ".mgf" or "BEGIN IONS" in text[:2000]:
                spectra = _parse_mgf(text)
            elif extension == ".msp" or re.search(r"^\s*(NAME|PRECURSORMZ):", text[:2000], re.I | re.M):
                spectra = _parse_msp(text)
            else:
                spectra = _parse_table(text)
        else:
            raise HTTPException(status_code=415, detail=f"Unsupported file type '{extension}'.")
    except HTTPException:
        raise
    except (ET.ParseError, ValueError, struct.error, zlib.error, csv.Error) as issue:
        raise HTTPException(status_code=422, detail=f"Could not parse {file.filename}: {issue}")

    if not spectra:
        raise HTTPException(status_code=422, detail="No spectra or features were found in the file.")

    stored = get_analysis(analysis_id)
    candidates = _candidate_masses(stored) if stored else []

    features = []
    matches = []
    for index, spectrum in enumerate(spectra[:5000]):
        mz = spectrum.get("mz")
        peaks = spectrum.get("peaks") or []
        if mz is None and peaks:
            mz = max(peaks, key=lambda p: p[1])[0]
        if mz is None:
            continue
        intensity = spectrum.get("intensity")
        if intensity is None and peaks:
            intensity = max(p[1] for p in peaks)
        best = None
        for candidate in candidates:
            for adduct, neutral in (("[M+H]+", mz - PROTON_MASS), ("[M-H]-", mz + PROTON_MASS)):
                ppm = (neutral - candidate["exact_mass"]) / candidate["exact_mass"] * 1e6
                if abs(ppm) <= PPM_TOLERANCE and (best is None or abs(ppm) < abs(best["ppm_error"])):
                    best = {
                        "candidate_id": candidate["id"],
                        "smiles": candidate["smiles"],
                        "adduct": adduct,
                        "theoretical_mass": round(candidate["exact_mass"], 5),
                        "ppm_error": round(ppm, 2),
                    }
        feature = {
            "id": f"feature-{index + 1}",
            "feature": spectrum.get("title") or f"Feature {index + 1}",
            "mz": round(mz, 5),
            "retention_time": spectrum.get("rt"),
            "intensity": intensity,
            "isotope_pattern": None,
            "msms_match": f"{len(peaks)} fragment peaks" if peaks else None,
            "candidate_metabolite": best["smiles"] if best else None,
        }
        features.append(feature)
        if best:
            matches.append({**best, "feature": feature["feature"], "observed_mz": feature["mz"]})

    by_rt = [f for f in features if f["retention_time"] is not None and f["intensity"] is not None]
    chromatogram = sorted(
        ({"retention_time": f["retention_time"], "intensity": f["intensity"]} for f in by_rt),
        key=lambda p: p["retention_time"],
    )
    top_peaks = max(spectra, key=lambda s: len(s.get("peaks") or []), default={}).get("peaks") or []

    return {
        "success": True,
        "filename": file.filename,
        "analysis_id": analysis_id if stored else None,
        "spectra_parsed": len(spectra),
        "features": features,
        "chromatogram": chromatogram,
        "mass_spectrum": [{"mz": mz, "intensity": inten} for mz, inten in top_peaks],
        "candidate_match": matches or None,
        "match_tolerance_ppm": PPM_TOLERANCE,
        "limitations": [
            "Exact mass alone is insufficient for structural confirmation; standard confirmation and orthogonal evidence may be required.",
            "Matching covers [M+H]+ and [M-H]- of the parent and RDKit-valid candidate products only; isotope patterns and fragment annotation are not scored.",
            "Chromatogram is built from precursor features that carry both retention time and intensity.",
        ] + ([] if stored else ["No stored analysis was linked, so no candidate matching was attempted."]),
    }


# ============================================================
# REPORTS
# ============================================================

class ReportRequest(BaseModel):
    analysis_id: Optional[str] = None
    format: str = "pdf"
    disclaimer: Optional[str] = None


@router.post("/report/generate")
def report_generate(request: ReportRequest, http_request: Request):
    stored = get_analysis(request.analysis_id)
    if stored is None:
        raise HTTPException(status_code=404, detail="Analysis not found; run an analysis first.")
    try:
        from reportlab.lib.pagesizes import A4
        from reportlab.lib.styles import getSampleStyleSheet
        from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer
        from xml.sax.saxutils import escape
    except ImportError:
        raise HTTPException(status_code=501, detail="PDF generation requires the reportlab package.")

    chemical = stored.get("chemical") or {}
    styles = getSampleStyleSheet()
    story = [
        Paragraph("XenoEvolve Omics Analysis Report", styles["Title"]),
        Paragraph(f"Generated {datetime.now(timezone.utc).isoformat(timespec='seconds')} · analysis {escape(stored['id'])}", styles["Normal"]),
        Spacer(1, 12),
        Paragraph("Compound", styles["Heading2"]),
    ]
    for label, key in (("Name", "name"), ("Formula", "formula"), ("Molecular weight", "molecular_weight"),
                       ("Canonical SMILES", "canonical_smiles"), ("InChIKey", "inchikey"), ("LogP", "logp")):
        story.append(Paragraph(f"<b>{label}:</b> {escape(str(chemical.get(key, '—')))}", styles["Normal"]))

    story.append(Paragraph("Candidate transformations", styles["Heading2"]))
    for item in (stored.get("transformations") or [])[:25]:
        story.append(Paragraph(
            escape(f"{item.get('reaction') or item.get('candidate') or item.get('id')} — "
                   f"probability {item.get('predicted_probability', '—')}"), styles["Normal"]))

    story.append(Paragraph("Pathway hypotheses", styles["Heading2"]))
    for path in (stored.get("pathways") or [])[:15]:
        story.append(Paragraph(
            escape(f"{path.get('name') or path.get('id')} — score {path.get('score', '—')}, "
                   f"confidence {path.get('confidence', '—')}"), styles["Normal"]))

    story.append(Paragraph("Provenance", styles["Heading2"]))
    story.append(Paragraph(escape(", ".join(stored.get("provenance") or ["—"])), styles["Normal"]))
    story.append(Paragraph("Limitations", styles["Heading2"]))
    for line in [request.disclaimer or DISCLAIMER] + list(stored.get("limitations") or []):
        story.append(Paragraph("• " + escape(line), styles["Normal"]))

    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    path = REPORT_DIR / f"{re.sub(r'[^A-Za-z0-9_-]', '', stored['id'])}.pdf"
    SimpleDocTemplate(str(path), pagesize=A4, title="XenoEvolve Omics Analysis Report").build(story)

    return {
        "success": True,
        "analysis_id": stored["id"],
        "format": "pdf",
        "download_url": str(http_request.base_url) + f"report/download/{path.stem}",
    }


@router.get("/report/download/{report_id}")
def report_download(report_id: str):
    path = REPORT_DIR / f"{re.sub(r'[^A-Za-z0-9_-]', '', report_id)}.pdf"
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Report not found.")
    return FileResponse(path, media_type="application/pdf", filename=path.name)
