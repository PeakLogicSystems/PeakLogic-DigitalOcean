# Host inference models (optional)

Drop quantized ONNX models here for host-side MCSA scoring. When a file is missing,
PeakLogic uses the built-in **rule** backend (same fault labels as Opta edge AI).

| File | Profile | Labels |
|------|---------|--------|
| `lift-submersible-v3.onnx` | Lift pump (Opta MCSA-lite) | healthy, seal_leak, clog_ragging, impeller_worn |
| `hvac-comp-v1.onnx` | HVAC compressor CT | healthy, bearing_wear, compressor_stress, electrical_fault |
| `hvac-fan-v1.onnx` | HVAC fan CT | healthy, bearing_wear, imbalance, electrical_fault |

Input tensor: `[1, 64]` float32 from `src/inference/mcsaFeatures.js`.

Configure in `settings.json`:

```json
{
  "inference": {
    "hostEnabled": true,
    "mode": "host-supplement",
    "backend": "auto"
  }
}
```

Modes: `host-supplement` (default), `host-override`, `host-on-start`, `off`.

Install ONNX runtime (optional): `npm install onnxruntime-node`
