"""True FFT MCSA cook + motor-fault classification for Arduino UNO Q.

Mirrors PeakLogic host cooked-spectra schema (fund / rotor / bearing / ecc / pump)
and Opta-compatible start labels, with extra FFT-only labels (bearing_wear, eccentricity).
"""
from __future__ import annotations

import math
from typing import Any

FUND_HZ_DEFAULT = 60.0
SLIP_HZ = 3.6
LABELS = (
    "healthy",
    "seal_leak",
    "clog_ragging",
    "impeller_worn",
    "bearing_wear",
    "eccentricity",
)


def _hann(n: int) -> list[float]:
    if n <= 1:
        return [1.0] * n
    return [0.5 * (1.0 - math.cos(2.0 * math.pi * i / (n - 1))) for i in range(n)]


def _rfft_mag(samples: list[float]) -> list[float]:
    """Single-sided magnitude spectrum. Uses numpy when present, else DFT (tests / small N)."""
    n = len(samples)
    try:
        import numpy as np  # type: ignore

        x = np.asarray(samples, dtype=np.float64)
        mag = np.abs(np.fft.rfft(x))
        mag = (2.0 / n) * mag
        mag[0] *= 0.5
        return mag.tolist()
    except ImportError:
        nfreq = n // 2 + 1
        out = [0.0] * nfreq
        for k in range(nfreq):
            re = 0.0
            im = 0.0
            ang0 = 2.0 * math.pi * k / n
            for i, v in enumerate(samples):
                ang = ang0 * i
                re += v * math.cos(ang)
                im -= v * math.sin(ang)
            mag = math.hypot(re, im) * (2.0 / n)
            if k == 0:
                mag *= 0.5
            out[k] = mag
        return out


def _bin_hz(k: int, n: int, fs: float) -> float:
    return k * fs / n


def _nearest_bin(hz: float, n: int, fs: float) -> int:
    k = int(round(hz * n / fs))
    return max(0, min(n // 2, k))


def _peak_near(
    mag: list[float],
    n: int,
    fs: float,
    hz: float,
    radius: int = 2,
    exclude_k: int | None = None,
) -> tuple[float, float]:
    center = _nearest_bin(hz, n, fs)
    lo = max(1, center - radius)
    hi = min(len(mag) - 1, center + radius)
    best_k = -1
    best = -1.0
    for k in range(lo, hi + 1):
        if exclude_k is not None and abs(k - exclude_k) <= 1:
            continue
        if mag[k] > best:
            best = mag[k]
            best_k = k
    if best_k < 0:
        k = center
        if exclude_k is not None and abs(k - exclude_k) <= 1:
            k = max(1, exclude_k - 2) if k <= exclude_k else min(len(mag) - 1, exclude_k + 2)
        return _bin_hz(k, n, fs), mag[k]
    return _bin_hz(best_k, n, fs), best


def adc_to_amps(samples_i16: list[int], *, adc_max: float = 4095.0, vref: float = 3.3, v_per_amp: float = 0.033) -> list[float]:
    scale = vref / adc_max / v_per_amp
    return [s * scale for s in samples_i16]


def cook_channel(
    amps: list[float],
    *,
    ch: int = 0,
    sample_rate: float = 4096.0,
    fund_hz: float = FUND_HZ_DEFAULT,
) -> dict[str, Any]:
    n = len(amps)
    if n < 8:
        return {"ch": ch, "fund": [fund_hz, 0.0], "rotor": [], "bearing": [], "ecc": [], "pump": []}
    w = _hann(n)
    windowed = [amps[i] * w[i] for i in range(n)]
    mag = _rfft_mag(windowed)
    f_hz, f_amp = _peak_near(mag, n, sample_rate, fund_hz, radius=3)
    fund_k = _nearest_bin(f_hz, n, sample_rate)
    slip = SLIP_HZ
    rotor = [
        list(_peak_near(mag, n, sample_rate, f_hz - slip, radius=1, exclude_k=fund_k)),
        list(_peak_near(mag, n, sample_rate, f_hz + slip, radius=1, exclude_k=fund_k)),
    ]
    # Typical rolling-element sidebands (BPFO / BPFI neighborhood for small pumps)
    bearing = [
        list(_peak_near(mag, n, sample_rate, f_hz * 1.8, exclude_k=fund_k)),
        list(_peak_near(mag, n, sample_rate, f_hz * 3.1, exclude_k=fund_k)),
        list(_peak_near(mag, n, sample_rate, f_hz * 4.7, exclude_k=fund_k)),
    ]
    ecc = [
        list(_peak_near(mag, n, sample_rate, f_hz - 1.0, radius=1, exclude_k=fund_k)),
        list(_peak_near(mag, n, sample_rate, f_hz + 1.0, radius=1, exclude_k=fund_k)),
    ]
    pump = [
        list(_peak_near(mag, n, sample_rate, f_hz * 2, exclude_k=fund_k)),
        list(_peak_near(mag, n, sample_rate, f_hz * 3, exclude_k=fund_k)),
    ]
    return {
        "ch": ch,
        "fund": [round(f_hz, 3), round(f_amp, 6)],
        "rotor": [[round(a, 3), round(b, 6)] for a, b in rotor],
        "bearing": [[round(a, 3), round(b, 6)] for a, b in bearing],
        "ecc": [[round(a, 3), round(b, 6)] for a, b in ecc],
        "pump": [[round(a, 3), round(b, 6)] for a, b in pump],
    }


def _band_energy(pairs: list) -> float:
    s = 0.0
    for p in pairs or []:
        if isinstance(p, (list, tuple)) and len(p) >= 2:
            s += abs(float(p[1]))
    return s


def channel_metrics(channel: dict) -> dict[str, float]:
    fund = 0.0
    f = channel.get("fund")
    if isinstance(f, (list, tuple)) and len(f) >= 2:
        fund = abs(float(f[1]))
    side = _band_energy(channel.get("rotor")) + _band_energy(channel.get("bearing")) + _band_energy(channel.get("ecc"))
    harm = _band_energy(channel.get("pump"))
    return {
        "fund": fund,
        "sideband": side,
        "harmonic": harm,
        "ratioSide": side / fund if fund > 1e-6 else side,
        "ratioHarm": harm / fund if fund > 1e-6 else harm,
        "ratioBearing": _band_energy(channel.get("bearing")) / fund if fund > 1e-6 else 0.0,
        "ratioEcc": _band_energy(channel.get("ecc")) / fund if fund > 1e-6 else 0.0,
    }


def classify_pump_start(start_ms: float, run_amps: float, baseline_amps: float = 8.0) -> dict[str, Any]:
    base = baseline_amps if baseline_amps > 1 else 1.0
    amp_ratio = run_amps / base
    if start_ms >= 5000 or amp_ratio > 1.35:
        return {"label": "impeller_worn", "score": 0.88, "confidence": 0.85}
    if start_ms >= 3800 or amp_ratio > 1.2:
        return {"label": "clog_ragging", "score": 0.72, "confidence": 0.80}
    if start_ms >= 2800 or amp_ratio > 1.1:
        return {"label": "seal_leak", "score": 0.55, "confidence": 0.75}
    score = 0.12 + (start_ms - 1500.0) / 20000.0
    score = min(0.35, max(0.08, score))
    return {"label": "healthy", "score": score, "confidence": 0.88}


def classify_channel(channel: dict, *, start_ms: float | None = None, run_amps: float | None = None, baseline_amps: float = 8.0) -> dict[str, Any]:
    m = channel_metrics(channel)
    if m["ratioBearing"] > 0.22:
        return {"label": "bearing_wear", "score": 0.80, "confidence": 0.84, "features": m}
    if m["ratioEcc"] > 0.18 or m["ratioSide"] > 0.32:
        return {"label": "eccentricity", "score": 0.70, "confidence": 0.80, "features": m}
    if start_ms is not None and start_ms >= 150:
        out = classify_pump_start(start_ms, run_amps if run_amps is not None else m["fund"] * 50.0, baseline_amps)
        out["features"] = {**m, "startMs": start_ms, "runA": run_amps}
        return out
    if m["ratioHarm"] > 0.45:
        return {"label": "impeller_worn", "score": 0.74, "confidence": 0.78, "features": m}
    score = min(0.35, max(0.06, m["ratioSide"] * 0.4 + m["ratioHarm"] * 0.25))
    return {"label": "healthy", "score": score, "confidence": 0.86, "features": m}


def synthesize_current(
    n: int,
    fs: float,
    *,
    fund_hz: float = 60.0,
    run_amps: float = 8.0,
    mode: str = "healthy",
) -> list[float]:
    """Synthetic single-phase current for PC / App Lab sim (no CT attached)."""
    side = 0.03
    bearing = 0.01
    ecc = 0.01
    harm2 = 0.04
    if mode == "bearing_wear":
        bearing = 0.28
        side = 0.08
    elif mode == "eccentricity":
        ecc = 0.22
        side = 0.10
    elif mode == "impeller_worn":
        harm2 = 0.22
        side = 0.06
    elif mode == "clog_ragging":
        harm2 = 0.12
        side = 0.05
    elif mode == "seal_leak":
        side = 0.07
        ecc = 0.05
    out = []
    for i in range(n):
        t = i / fs
        x = run_amps * math.sin(2 * math.pi * fund_hz * t)
        x += run_amps * side * math.sin(2 * math.pi * (fund_hz - SLIP_HZ) * t)
        x += run_amps * side * math.sin(2 * math.pi * (fund_hz + SLIP_HZ) * t)
        x += run_amps * ecc * math.sin(2 * math.pi * (fund_hz + 1.0) * t)
        x += run_amps * bearing * math.sin(2 * math.pi * fund_hz * 3.1 * t)
        x += run_amps * harm2 * math.sin(2 * math.pi * fund_hz * 2 * t)
        out.append(x)
    return out


def rms(samples: list[float]) -> float:
    if not samples:
        return 0.0
    return math.sqrt(sum(v * v for v in samples) / len(samples))
