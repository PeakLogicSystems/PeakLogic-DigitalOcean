(* PID1: wire PV from VPI1, setpoint on tag preset, drive VPR1 when auto *)
PidPv(PID1, VPI1);
PidAuto(PID1);
IF PidAutoMode(PID1) THEN
  PidOut(PID1, VPR1);
END_IF;
