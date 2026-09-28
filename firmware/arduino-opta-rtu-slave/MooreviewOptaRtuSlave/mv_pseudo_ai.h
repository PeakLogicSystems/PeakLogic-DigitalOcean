#pragma once
#include <Arduino.h>

void mvPseudoAiBegin();
void mvPseudoAiTick(uint32_t dtMs);

float mvPseudoAiMilliAmps(uint8_t aiIndex);   // aiIndex 2..5 → mA_AI3..6
float mvPseudoAiScaled(uint8_t aiIndex);     // engineering 0..100 default
float mvPseudoAiMcsaAmps(uint8_t ch);        // ch 0..5 → MCSA_CH1..6
float mvPseudoAiPumpHealth(uint8_t pumpIdx); // 0..1 → PDM_P1/P2_HEALTH (0..100)
