(* =============================================================================
   ST feature suite — memory-only tags (no DI/Q/AI/AO drivers).
   Force stimulus tags in Tags or Live I/O, then Start runtime.

   Stimulus          Role / feature exercised
   --------          ------------------------
   VPB30             BOOL run / IsON / IsOFF / latch set
   VPB31             IF/ELSE / latch reset
   VPB32             AND / OR partner
   VPB33             Counter clock (rising edges on CTR30/CTR31)
   VPB34             Timer run input (TMR30 TON, TMR31 TOF, TMR32 TP)
   VPB35             PID auto (on) vs manual (off)
   VPB36             AVG EMA reset pulse
   VPB37             Counter reset pulse
   VPB38             NOT input
   VPI30             Compares, arithmetic, PID PV, AVG input
   VPI31             Compare / arithmetic reference
   VPI32             PID setpoint source (PidSp)
   VPI33             WithInLimits test value

   Results (VPB40–VPB70) — one flag per tested feature
   VPR30             PID output (PidOut)
   VPR31             MOV average output (AvgOut)
   VPR32             EMA average output (AvgOut)

   FB blocks: TMR30 TON · TMR31 TOF · TMR32 TP · CTR30 CTU · CTR31 CTD
             PID30 PI · AVG30 MOV · AVG31 EMA

   Load tags: st/fixtures/tags.all_st_features.json
   ============================================================================= *)

(* --- IsON / IsOFF --- *)
IF IsON(VPB30) THEN TurnON(VPB40); ELSE TurnOFF(VPB40); END_IF;
IF IsOFF(VPB30) THEN TurnON(VPB41); ELSE TurnOFF(VPB41); END_IF;

(* --- IF / ELSE --- *)
IF IsON(VPB30) THEN TurnON(VPB42); ELSE TurnOFF(VPB42); END_IF;

(* --- AND / OR / NOT --- *)
IF IsON(VPB30) AND IsON(VPB32) THEN TurnON(VPB43); ELSE TurnOFF(VPB43); END_IF;
IF IsON(VPB30) OR IsON(VPB32) THEN TurnON(VPB44); ELSE TurnOFF(VPB44); END_IF;
IF NOT IsON(VPB38) THEN TurnON(VPB45); ELSE TurnOFF(VPB45); END_IF;

(* --- Compare: > <= = >= < <> --- *)
IF VPI30 > VPI31 THEN TurnON(VPB46); ELSE TurnOFF(VPB46); END_IF;
IF VPI30 <= 50 THEN TurnON(VPB47); ELSE TurnOFF(VPB47); END_IF;
IF VPI30 = VPI31 THEN TurnON(VPB48); ELSE TurnOFF(VPB48); END_IF;
IF VPI30 >= 10 THEN TurnON(VPB49); ELSE TurnOFF(VPB49); END_IF;
IF VPI30 < 100 THEN TurnON(VPB50); ELSE TurnOFF(VPB50); END_IF;
IF VPI30 <> 0 THEN TurnON(VPB51); ELSE TurnOFF(VPB51); END_IF;

(* --- WithInLimits --- *)
IF WithInLimits(VPI33, 20.0, 80.0) THEN TurnON(VPB52); ELSE TurnOFF(VPB52); END_IF;

(* --- Arithmetic + unary minus + parentheses --- *)
IF VPI30 + VPI31 > 100 THEN TurnON(VPB62); ELSE TurnOFF(VPB62); END_IF;
IF VPI30 * 2 > VPI31 THEN TurnON(VPB63); ELSE TurnOFF(VPB63); END_IF;
IF VPI30 - VPI31 >= 0 THEN TurnON(VPB64); ELSE TurnOFF(VPB64); END_IF;
IF VPI30 / 10 >= 1 THEN TurnON(VPB65); ELSE TurnOFF(VPB65); END_IF;
IF VPI30 % 10 = 0 THEN TurnON(VPB66); ELSE TurnOFF(VPB66); END_IF;
IF (VPI30 + VPI31) >= 100 THEN TurnON(VPB61); ELSE TurnOFF(VPB61); END_IF;
IF -VPI30 < 0 THEN TurnON(VPB60); ELSE TurnOFF(VPB60); END_IF;

(* --- Set / reset latch --- *)
IF IsON(VPB30) THEN TurnON(VPB53); END_IF;
IF IsON(VPB31) THEN TurnOFF(VPB53); END_IF;

(* --- Timers: TON / TOF / TP (shared run input VPB34) --- *)
TimerInput(TMR30, VPB34);
TimerInput(TMR31, VPB34);
TimerInput(TMR32, VPB34);
IF TimerDone(TMR30) THEN TurnON(VPB54); ELSE TurnOFF(VPB54); END_IF;
IF TimerRun(TMR30) THEN TurnON(VPB55); ELSE TurnOFF(VPB55); END_IF;

(* --- Counters: CTU / CTD + reset + CounterValue --- *)
CounterCu(CTR30, VPB33);
CounterCd(CTR31, VPB33);
IF IsON(VPB37) THEN CounterReset(CTR30); END_IF;
IF IsON(VPB37) THEN CounterReset(CTR31); END_IF;
IF CounterDone(CTR30) THEN TurnON(VPB56); ELSE TurnOFF(VPB56); END_IF;
IF CounterValue(CTR30) >= 3 THEN TurnON(VPB57); ELSE TurnOFF(VPB57); END_IF;

(* --- PID: PidPv / PidSp / PidAuto / PidManual / PidOut / queries --- *)
PidPv(PID30, VPI30);
PidSp(PID30, VPI32);
IF IsON(VPB35) THEN
  PidAuto(PID30);
  PidOut(PID30, VPR30);
END_IF;
IF IsOFF(VPB35) THEN PidManual(PID30); END_IF;
IF PidAutoMode(PID30) THEN TurnON(VPB58); ELSE TurnOFF(VPB58); END_IF;
IF PidError(PID30) > 5.0 THEN TurnON(VPB59); ELSE TurnOFF(VPB59); END_IF;
IF PidValue(PID30) >= 0.0 THEN TurnON(VPB69); ELSE TurnOFF(VPB69); END_IF;

(* --- Averaging: MOV + EMA, AvgIn / AvgOut / AvgReset / AvgReady / AvgCount --- *)
AvgIn(AVG30, VPI30);
AvgOut(AVG30, VPR31);
IF AvgReady(AVG30) THEN TurnON(VPB67); ELSE TurnOFF(VPB67); END_IF;
IF AvgCount(AVG30) >= 3 THEN TurnON(VPB68); ELSE TurnOFF(VPB68); END_IF;

AvgIn(AVG31, VPI30);
AvgOut(AVG31, VPR32);
IF IsON(VPB36) THEN AvgReset(AVG31); END_IF;

(* --- Complex mix --- *)
IF IsON(VPB30) AND WithInLimits(VPI30, 10.0, 90.0) AND NOT IsOFF(VPB38) THEN TurnON(VPB70); ELSE TurnOFF(VPB70); END_IF;
