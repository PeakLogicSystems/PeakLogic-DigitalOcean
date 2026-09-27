(*
  Reversing motor — RMOTOR fb with Fwd/Rev contactors, interlock, reversal deadtime

  Tags (see st/fixtures/tags.reversing_motor.json):
    RMOTOR1        RMOTOR fb; preset = reversal deadtime (ms), default 500
    RM1_FWD_CMD    BOOL forward command (HMI or logic)
    RM1_REV_CMD    BOOL reverse command
    RM1_FWD_AUX    BOOL forward aux contact feedback
    RM1_REV_AUX    BOOL reverse aux contact feedback
    RM1_OVL        BOOL overload / thermal trip
    RM1_HOA        INT  0=Auto  1=Off  2=Hand (optional)
    RM1_FWD_OUT    BOOL forward contactor output
    RM1_REV_OUT    BOOL reverse contactor output
    RM1_STA        INT  0=Off  1=Fwd  2=Rev  3=Fault  4=Offline  5=Reversing
    RM1_HRS        REAL run hours (either direction)
    RM1_STARTS     INT  start count
    RM1_RESET      BOOL momentary reset (hours/starts/offline)
    RM1_OFFLINE    BOOL HMI offline latch

  Status matches MOTOR1_STA extensions for bidirectional run.
*)

RmtFwdCmd(RMOTOR1, RM1_FWD_CMD);
RmtRevCmd(RMOTOR1, RM1_REV_CMD);
RmtFwdAux(RMOTOR1, RM1_FWD_AUX);
RmtRevAux(RMOTOR1, RM1_REV_AUX);
RmtOverload(RMOTOR1, RM1_OVL);
RmtHoa(RMOTOR1, RM1_HOA);
RmtFwdOut(RMOTOR1, RM1_FWD_OUT);
RmtRevOut(RMOTOR1, RM1_REV_OUT);
RmtSta(RMOTOR1, RM1_STA);
RmtHrs(RMOTOR1, RM1_HRS);
RmtStarts(RMOTOR1, RM1_STARTS);
RmtReset(RMOTOR1, RM1_RESET);
RmtOffline(RMOTOR1, RM1_OFFLINE);

IF RmtFault(RMOTOR1) THEN
  TurnON(RM1_FAULT_LAMP);
ELSE
  TurnOFF(RM1_FAULT_LAMP);
END_IF;

TurnOFF(RM1_RESET);
