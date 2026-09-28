# Nexcomm inbound alignments

Generated from `st/fixtures/nexcomm-csv/` (USB `D:\\nexcomm csv`).

| Product CSV | Template id | Tags |
|-------------|-------------|------|
| `nexcomm-lpl-lift-station.csv` | `nexcomm_lpl_lift_station` | 16 |
| `nexcomm-lpl-res-atu.csv` | `nexcomm_lpl_res_atu` | 33 |
| `nexcomm-lp-com-dual-atu.csv` | `nexcomm_lp_com_dual_atu` | 33 |
| `nexcomm-com-lp-single-atu.csv` | `nexcomm_com_lp_single_atu` | 18 |
| `nexcomm-tcu-duplex.csv` | `nexcomm_tcu_duplex` | 27 |
| `nexcomm-tcu-dual-duplex.csv` | `nexcomm_tcu_dual_duplex` | 44 |
| `nexcomm-tcu-dual-atu.csv` | `nexcomm_tcu_dual_atu` | 93 |
| `nexcomm-epi-agitator.csv` | `nexcomm_epi_agitator` | 19 |

Regenerate:

```bash
node scripts/nexcomm-csv/generate-inbound-templates.js
```

Apply under **Drivers → Device template**. Set `serialNum` (normalized) and Mosquitto user/pass for `mqtts://mqtt.peaklogic.io:8883`.
