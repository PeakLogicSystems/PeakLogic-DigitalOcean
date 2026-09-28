(*

  DUPLEXLS + EZ Meter — 4-float ALT2 alternator, facility PQ, R4 station alarm

  v38: merges logic/36_duplex_lift_station.st with EZ Meter facility PQ
  (DDS_* from Opta RS485 fieldbus). R4 = station alarm relay.
  Threshold: MECH_PQ_CFG_UV_V (cloud mqttParc.ezMeter + Opta /setup).



  Floats (ON = liquid at/above that level, pump-down service):

    LVL_HIGH  High level float — run all online pumps

    LVL_LEAD  Lead float — start lead pump (latched until LVL_OFF clears)

    LVL_LAG   Lag float — lead + lag (both stay on until LVL_OFF clears)

    LVL_OFF   Off float — de-stage; all pumps latch off below this level



  Auto interlock: PHASE_FAULT clears LEAD_CALL/LAG_CALL (same effect as dry OFF

  float while upper floats are on) and holds alternator off via ALT_OFF_REQ.

  Hand mode is not blocked by phase fault.



  Offline pumps (MOTORx_OFFLINE) are skipped by the alternator; a single

  online pump may run alone on lag/high if the partner is offline.



  HMI: screen_1 3D overview · screen_2 @composite/duplexls

  3D:  /samples/duplex-lift-station-ortho-3d.html

  HOA (MOTORx_HOA INT): 0=Auto  1=Off  2=Hand
    Auto — alternator P1/P2_ALT_RUN drives run; START/STOP ignored
    Off  — pump forced off regardless of alternator or floats; clears hand latch
    Hand — START/STOP latch only; alternator and floats do not run this pump



  STATION_STA (INT): 0=Online  1=Fault  2=Warning  3=Offline



  PHYSICAL I/O MAP (Sequent D1608E expansion slot 1 — X1_I1…X1_I16)

    X1_I1   HIGH float       → LVL_HIGH

    X1_I2   LEAD float       → LVL_LEAD

    X1_I3   LAG float        → LVL_LAG

    X1_I4   OFF float        → LVL_OFF

    X1_I5   Pump 1 run fb     fail-to-run aux contact

    X1_I6   Pump 2 run fb     fail-to-run aux contact

    X1_I7   Phase fault       → PHASE_FAULT

    X1_I8   Gen run           → GEN_RUN

    X1_I9   Gen fuel fault    → GEN_FUEL_FAULT

    X1_I10  Gen fault         → GEN_FAULT

    X1_I11  Pump 1 motor fault → MOTOR1_FAULT

    X1_I12  Pump 2 motor fault → MOTOR2_FAULT

    X1_I13…X1_I15            Spare DIs

    X1_I16  Control-panel AC loss (UPS) → POWER_FAIL — generator panels only; +24 V when AC to panel lost

    Base analog inputs 1–6 (Opta terminals I1–I6, tags AI1–AI6 ← I1_RAW–I6_RAW):

      0–1 V CT transmitters, linear 0–50 A (1.00 V = 50 A)

      AI1  Motor 1 phase A amps

      AI2  Motor 1 phase B amps

      AI3  Motor 1 phase C amps

      AI4  Motor 2 phase A amps

      AI5  Motor 2 phase B amps

      AI6  Motor 2 phase C amps

    R1   Pump 1 contactor ← MOTOR1_RUN

    R2   Pump 2 contactor ← MOTOR2_RUN

    R4   Station alarm relay ← LVL_HIGH / MECH_PQ_ALM / MOTOR1_FAULT / MOTOR2_FAULT

   Expansion DI convention: +24 V applied (input ON / HIGH) when active — wet float,
   run aux closed, or fault contact made. Unwired inputs read OFF (inactive).

*)



(* Opta deploy inits BOOL memory false — enable alternator each scan *)
TurnON(SYS_RUN);



(* ---- Expansion digital inputs → float status (HMI pilots + logic) ---- *)
(* Active when input ON (+24 V / HIGH) — wet float or contact made *)

IF IsON(X1_I1) THEN TurnON(LVL_HIGH); ELSE TurnOFF(LVL_HIGH); END_IF;

IF IsON(X1_I2) THEN TurnON(LVL_LEAD); ELSE TurnOFF(LVL_LEAD); END_IF;

IF IsON(X1_I3) THEN TurnON(LVL_LAG); ELSE TurnOFF(LVL_LAG); END_IF;

IF IsON(X1_I4) THEN TurnON(LVL_OFF); ELSE TurnOFF(LVL_OFF); END_IF;



(* Run feedback — aux made when pump runs (+24 V / input ON) *)

IF IsON(X1_I5) THEN TurnON(P1_RUN_FB); ELSE TurnOFF(P1_RUN_FB); END_IF;

IF IsON(X1_I6) THEN TurnON(P2_RUN_FB); ELSE TurnOFF(P2_RUN_FB); END_IF;



(* Power / generator status inputs (+24 V active) *)

IF IsON(X1_I7) THEN TurnON(PHASE_FAULT); ELSE TurnOFF(PHASE_FAULT); END_IF;

IF IsON(X1_I8) THEN TurnON(GEN_RUN); ELSE TurnOFF(GEN_RUN); END_IF;

IF IsON(X1_I9) THEN TurnON(GEN_FUEL_FAULT); ELSE TurnOFF(GEN_FUEL_FAULT); END_IF;

IF IsON(X1_I10) THEN TurnON(GEN_FAULT); ELSE TurnOFF(GEN_FAULT); END_IF;

IF IsON(X1_I11) THEN TurnON(MOTOR1_FAULT); ELSE TurnOFF(MOTOR1_FAULT); END_IF;

IF IsON(X1_I12) THEN TurnON(MOTOR2_FAULT); ELSE TurnOFF(MOTOR2_FAULT); END_IF;

IF IsON(X1_I16) THEN TurnON(POWER_FAIL); ELSE TurnOFF(POWER_FAIL); END_IF;



(* EZ Meter PQ faults (DDS_* from fieldbus) — before level demand interlock *)

IF DDS_V_A < MECH_PQ_CFG_UV_V OR DDS_V_B < MECH_PQ_CFG_UV_V OR DDS_V_C < MECH_PQ_CFG_UV_V THEN
  TurnON(MECH_PQ_UNDERVOLT);
ELSE
  TurnOFF(MECH_PQ_UNDERVOLT);
END_IF;

IF (DDS_V_A < MECH_PQ_CFG_UV_V AND (DDS_V_B > MECH_PQ_CFG_NOM_V * 0.5 OR DDS_V_C > MECH_PQ_CFG_NOM_V * 0.5))
  OR (DDS_V_B < MECH_PQ_CFG_UV_V AND (DDS_V_A > MECH_PQ_CFG_NOM_V * 0.5 OR DDS_V_C > MECH_PQ_CFG_NOM_V * 0.5))
  OR (DDS_V_C < MECH_PQ_CFG_UV_V AND (DDS_V_A > MECH_PQ_CFG_NOM_V * 0.5 OR DDS_V_B > MECH_PQ_CFG_NOM_V * 0.5)) THEN
  TurnON(MECH_PQ_PHASE_LOSS);
ELSE
  TurnOFF(MECH_PQ_PHASE_LOSS);
END_IF;



(* ---- Level demand latches (set at each float, reset below OFF float) ---- *)

IF IsON(LVL_LEAD) OR IsON(LVL_LAG) OR IsON(LVL_HIGH) THEN TurnON(LEAD_CALL); END_IF;

IF IsOFF(LVL_OFF) THEN TurnOFF(LEAD_CALL); END_IF;



IF IsON(LVL_LAG) OR IsON(LVL_HIGH) THEN TurnON(LAG_CALL); END_IF;

IF IsOFF(LVL_OFF) THEN TurnOFF(LAG_CALL); END_IF;



(* Phase / PQ fault — inhibit auto demand (same as dry off float with upper floats on) *)

IF IsON(PHASE_FAULT) OR IsON(MECH_PQ_UNDERVOLT) OR IsON(MECH_PQ_PHASE_LOSS) THEN TurnOFF(LEAD_CALL); END_IF;

IF IsON(PHASE_FAULT) OR IsON(MECH_PQ_UNDERVOLT) OR IsON(MECH_PQ_PHASE_LOSS) THEN TurnOFF(LAG_CALL); END_IF;



IF IsON(LEAD_CALL) THEN TurnOFF(MASTER_OFF); ELSE TurnON(MASTER_OFF); END_IF;



(* Combined off: below OFF float, phase fault, or alternator faceplate OFF *)

IF IsON(MASTER_OFF) OR IsON(ALT_OFF) OR IsON(PHASE_FAULT) OR IsON(MECH_PQ_UNDERVOLT) OR IsON(MECH_PQ_PHASE_LOSS) THEN TurnON(ALT_OFF_REQ); ELSE TurnOFF(ALT_OFF_REQ); END_IF;



(* ---- Fail-to-run: output ON but no run feedback within 5 s -> fault (Auto only) ---- *)
(* Hand mode skips FTR — run aux may be unwired or on wrong DI during commissioning. *)

IF MOTOR1_HOA = 2 THEN

  TurnOFF(M1_FTR);

ELSE

  IF IsON(R1) AND IsOFF(P1_RUN_FB) THEN TurnON(M1_FTR); ELSE TurnOFF(M1_FTR); END_IF;

END_IF;



IF MOTOR2_HOA = 2 THEN

  TurnOFF(M2_FTR);

ELSE

  IF IsON(R2) AND IsOFF(P2_RUN_FB) THEN TurnON(M2_FTR); ELSE TurnOFF(M2_FTR); END_IF;

END_IF;



TimerInput(M1_FTR_TMR, M1_FTR);

TimerInput(M2_FTR_TMR, M2_FTR);



IF TimerDone(M1_FTR_TMR) THEN TurnON(M1_FAIL); END_IF;

IF TimerDone(M2_FTR_TMR) THEN TurnON(M2_FAIL); END_IF;



(* Auto-reset faults once the well is drained and at rest *)

IF IsOFF(LEAD_CALL) THEN

  TurnOFF(M1_FAIL);

  TurnOFF(M2_FAIL);

END_IF;



(* Online flags — HOA offline latch or fail-to-run removes pump from alternator rotation *)

IF IsON(MOTOR1_OFFLINE) OR IsON(M1_FAIL) THEN TurnOFF(MOTOR1_ONLINE); ELSE TurnON(MOTOR1_ONLINE); END_IF;

IF IsON(MOTOR2_OFFLINE) OR IsON(M2_FAIL) THEN TurnOFF(MOTOR2_ONLINE); ELSE TurnON(MOTOR2_ONLINE); END_IF;



(* ---- Alternator (ALT2) ---- *)

AltEnable(ALT1, SYS_RUN);

AltAutoFault(ALT1, SYS_RUN);

AltAdvance(ALT1, ALT_BUMP);

AltAdvance(ALT1, LEAD_CALL);



AltOff(ALT1, ALT_OFF_REQ);

AltHigh(ALT1, LVL_HIGH);

AltLow(ALT1, LAG_CALL);



AltOnline(ALT1, 1, MOTOR1_ONLINE);

AltOnline(ALT1, 2, MOTOR2_ONLINE);

AltUnitOut(ALT1, 1, P1_ALT_RUN);

AltUnitOut(ALT1, 2, P2_ALT_RUN);

AltLead(ALT1, LEAD_RUN);



IF AltFault(ALT1) OR IsON(M1_FAIL) OR IsON(M2_FAIL) THEN TurnON(ALT_FAULT); ELSE TurnOFF(ALT_FAULT); END_IF;

TurnOFF(ALT_BUMP);



(* ========== Pump 1 HOA ========== *)

IF IsON(MOTOR1_RESET) THEN

  SetInt(MOTOR1_STA, 0);

  SetInt(MOTOR1_HRS, 0);

  CounterReset(MOTOR1_CNTR);

  SetInt(MOTOR1_STARTS, 0);

  TurnOFF(MOTOR1_OFFLINE);

  TurnOFF(M1_FAIL);

  TurnOFF(MOTOR1_HAND);

  TurnOFF(MOTOR1_START);

  TurnOFF(MOTOR1_STOP);

  TurnOFF(MOTOR1_RESET);

END_IF;



IF IsON(MOTOR1_OFFLINE) THEN

  TurnOFF(MOTOR1_RUN);

  SetInt(MOTOR1_STA, 4);

ELSE

  IF MOTOR1_HOA = 1 THEN

    TurnOFF(MOTOR1_HAND);

    TurnOFF(MOTOR1_RUN);

    SetInt(MOTOR1_STA, 0);

  ELSE

    IF MOTOR1_HOA = 2 THEN

      IF IsON(MOTOR1_START) THEN TurnON(MOTOR1_HAND); END_IF;

      IF IsON(MOTOR1_STOP) THEN TurnOFF(MOTOR1_HAND); END_IF;

      IF IsON(MOTOR1_HAND) THEN TurnON(MOTOR1_RUN); SetInt(MOTOR1_STA, 1); END_IF;

      IF IsOFF(MOTOR1_HAND) THEN TurnOFF(MOTOR1_RUN); SetInt(MOTOR1_STA, 0); END_IF;

    ELSE

      TurnOFF(MOTOR1_HAND);

      IF IsON(P1_ALT_RUN) THEN TurnON(MOTOR1_RUN); SetInt(MOTOR1_STA, 1); ELSE TurnOFF(MOTOR1_RUN); SetInt(MOTOR1_STA, 0); END_IF;

    END_IF;

  END_IF;

END_IF;



IF IsON(MOTOR1_RUN) THEN SetInt(MOTOR1_HRS, MOTOR1_HRS + 0.0000277778); END_IF;

CounterCu(MOTOR1_CNTR, MOTOR1_RUN);

SetInt(MOTOR1_STARTS, CounterValue(MOTOR1_CNTR));

TurnOFF(MOTOR1_START);

TurnOFF(MOTOR1_STOP);



(* ========== Pump 2 HOA ========== *)

IF IsON(MOTOR2_RESET) THEN

  SetInt(MOTOR2_STA, 0);

  SetInt(MOTOR2_HRS, 0);

  CounterReset(MOTOR2_CNTR);

  SetInt(MOTOR2_STARTS, 0);

  TurnOFF(MOTOR2_OFFLINE);

  TurnOFF(M2_FAIL);

  TurnOFF(MOTOR2_HAND);

  TurnOFF(MOTOR2_START);

  TurnOFF(MOTOR2_STOP);

  TurnOFF(MOTOR2_RESET);

END_IF;



IF IsON(MOTOR2_OFFLINE) THEN

  TurnOFF(MOTOR2_RUN);

  SetInt(MOTOR2_STA, 4);

ELSE

  IF MOTOR2_HOA = 1 THEN

    TurnOFF(MOTOR2_HAND);

    TurnOFF(MOTOR2_RUN);

    SetInt(MOTOR2_STA, 0);

  ELSE

    IF MOTOR2_HOA = 2 THEN

      IF IsON(MOTOR2_START) THEN TurnON(MOTOR2_HAND); END_IF;

      IF IsON(MOTOR2_STOP) THEN TurnOFF(MOTOR2_HAND); END_IF;

      IF IsON(MOTOR2_HAND) THEN TurnON(MOTOR2_RUN); SetInt(MOTOR2_STA, 1); END_IF;

      IF IsOFF(MOTOR2_HAND) THEN TurnOFF(MOTOR2_RUN); SetInt(MOTOR2_STA, 0); END_IF;

    ELSE

      TurnOFF(MOTOR2_HAND);

      IF IsON(P2_ALT_RUN) THEN TurnON(MOTOR2_RUN); SetInt(MOTOR2_STA, 1); ELSE TurnOFF(MOTOR2_RUN); SetInt(MOTOR2_STA, 0); END_IF;

    END_IF;

  END_IF;

END_IF;



IF IsON(MOTOR2_RUN) THEN SetInt(MOTOR2_HRS, MOTOR2_HRS + 0.0000277778); END_IF;

CounterCu(MOTOR2_CNTR, MOTOR2_RUN);

SetInt(MOTOR2_STARTS, CounterValue(MOTOR2_CNTR));

TurnOFF(MOTOR2_START);

TurnOFF(MOTOR2_STOP);



(* Wet-well level % for 3D HMI (simulated from float demand) *)

IF IsON(LVL_HIGH) THEN

  SetInt(TANK_LVL, 92);

ELSIF IsON(LVL_LAG) THEN

  SetInt(TANK_LVL, 68);

ELSIF IsON(LVL_LEAD) THEN

  SetInt(TANK_LVL, 45);

ELSIF IsOFF(LVL_OFF) THEN

  SetInt(TANK_LVL, 12);

ELSIF IsON(MOTOR1_RUN) OR IsON(MOTOR2_RUN) THEN

  IF TANK_LVL > 10 THEN SetInt(TANK_LVL, TANK_LVL - 0.05); END_IF;

ELSE

  IF TANK_LVL < 88 THEN SetInt(TANK_LVL, TANK_LVL + 0.08); END_IF;

END_IF;



(* ---- EZ Meter facility PQ (DDS_* from Opta RS485 fieldbus) ---- *)
SetInt(MECH_PQ_KW_SUM, (DDS_W_A + DDS_W_B + DDS_W_C) / 1000.0);
SetInt(MECH_PQ_KVA_SUM, (DDS_VA_A + DDS_VA_B + DDS_VA_C) / 1000.0);
IF MECH_PQ_KVA_SUM > 0.01 THEN
  SetInt(MECH_PQ_PF_SYS, MECH_PQ_KW_SUM / MECH_PQ_KVA_SUM);
ELSE
  SetInt(MECH_PQ_PF_SYS, 1.0);
END_IF;
SetInt(MECH_PQ_V_AVG, (DDS_V_A + DDS_V_B + DDS_V_C) / 3.0);
SetInt(MECH_PQ_I_SUM, DDS_I_A + DDS_I_B + DDS_I_C);

IF MECH_METER_KWH >= DDS_METER_KWH_PREV THEN
  SetInt(MECH_METER_INTERVAL_KWH, MECH_METER_KWH - DDS_METER_KWH_PREV);
ELSE
  SetInt(MECH_METER_INTERVAL_KWH, 0.0);
END_IF;
SetInt(DDS_METER_KWH_PREV, MECH_METER_KWH);

IF MECH_PQ_V_AVG > 1.0 THEN
  IF DDS_V_A >= DDS_V_B AND DDS_V_A >= DDS_V_C THEN
    IF DDS_V_B >= DDS_V_C THEN
      SetInt(MECH_PQ_V_IMBAL_PCT, (DDS_V_A - DDS_V_C) / MECH_PQ_V_AVG * 100.0);
    ELSE
      SetInt(MECH_PQ_V_IMBAL_PCT, (DDS_V_A - DDS_V_B) / MECH_PQ_V_AVG * 100.0);
    END_IF;
  ELSIF DDS_V_B >= DDS_V_A AND DDS_V_B >= DDS_V_C THEN
    IF DDS_V_A >= DDS_V_C THEN
      SetInt(MECH_PQ_V_IMBAL_PCT, (DDS_V_B - DDS_V_C) / MECH_PQ_V_AVG * 100.0);
    ELSE
      SetInt(MECH_PQ_V_IMBAL_PCT, (DDS_V_B - DDS_V_A) / MECH_PQ_V_AVG * 100.0);
    END_IF;
  ELSE
    IF DDS_V_A >= DDS_V_B THEN
      SetInt(MECH_PQ_V_IMBAL_PCT, (DDS_V_C - DDS_V_B) / MECH_PQ_V_AVG * 100.0);
    ELSE
      SetInt(MECH_PQ_V_IMBAL_PCT, (DDS_V_C - DDS_V_A) / MECH_PQ_V_AVG * 100.0);
    END_IF;
  END_IF;
ELSE
  SetInt(MECH_PQ_V_IMBAL_PCT, 0.0);
END_IF;

IF DDS_V_A > MECH_PQ_CFG_OV_V OR DDS_V_B > MECH_PQ_CFG_OV_V OR DDS_V_C > MECH_PQ_CFG_OV_V THEN
  TurnON(MECH_PQ_OVERVOLT);
ELSE
  TurnOFF(MECH_PQ_OVERVOLT);
END_IF;

IF MECH_PQ_V_IMBAL_PCT > MECH_PQ_CFG_IMBAL_PCT THEN
  TurnON(MECH_PQ_V_IMBAL);
ELSE
  TurnOFF(MECH_PQ_V_IMBAL);
END_IF;

IF MECH_PQ_I_SUM > MECH_PQ_CFG_LOAD_I AND MECH_PQ_PF_SYS < MECH_PQ_CFG_LOW_PF THEN
  TurnON(MECH_PQ_LOW_PF);
ELSE
  TurnOFF(MECH_PQ_LOW_PF);
END_IF;

IF DDS_HZ_A < MECH_PQ_CFG_FREQ_MIN OR DDS_HZ_A > MECH_PQ_CFG_FREQ_MAX THEN
  TurnON(MECH_PQ_FREQ_FAULT);
ELSE
  TurnOFF(MECH_PQ_FREQ_FAULT);
END_IF;

IF MECH_PQ_UNDERVOLT OR MECH_PQ_OVERVOLT OR MECH_PQ_PHASE_LOSS OR MECH_PQ_V_IMBAL OR MECH_PQ_LOW_PF OR MECH_PQ_FREQ_FAULT THEN
  TurnON(MECH_PQ_ALM);
ELSE
  TurnOFF(MECH_PQ_ALM);
END_IF;

(* ---- Station summary status for HMI (0=Online 1=Fault 2=Warning 3=Offline) ---- *)

IF IsON(ALT_FAULT) OR IsON(M1_FAIL) OR IsON(M2_FAIL) OR IsON(PHASE_FAULT) OR IsON(MECH_PQ_UNDERVOLT) OR IsON(MECH_PQ_PHASE_LOSS) OR IsON(GEN_FAULT) OR IsON(GEN_FUEL_FAULT) THEN

  SetInt(STATION_STA, 1);

ELSIF IsOFF(SYS_RUN) OR IsON(ALT_OFF_REQ) THEN

  SetInt(STATION_STA, 3);

ELSIF IsON(LVL_HIGH) OR IsON(POWER_FAIL) THEN

  SetInt(STATION_STA, 2);

ELSE

  SetInt(STATION_STA, 0);

END_IF;



(* ---- Baseboard relay outputs ← pump run commands ---- *)

IF IsON(MOTOR1_RUN) THEN TurnON(R1); ELSE TurnOFF(R1); END_IF;

IF IsON(MOTOR2_RUN) THEN TurnON(R2); ELSE TurnOFF(R2); END_IF;

IF IsON(LVL_HIGH) OR IsON(MECH_PQ_ALM) OR IsON(MOTOR1_FAULT) OR IsON(MOTOR2_FAULT) OR IsON(POWER_FAIL) THEN
  TurnON(R4);
ELSE
  TurnOFF(R4);
END_IF;
