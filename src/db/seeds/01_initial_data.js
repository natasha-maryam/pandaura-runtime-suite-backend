const { v4: uuidv4 } = require('uuid');

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> } 
 */
exports.seed = async function(knex) {
  // Deletes ALL existing entries
  await knex('sync_events').del();
  await knex('tags').del();
  await knex('logic_files').del();

  // Insert sample logic files
  const sampleSTContent = `(* Temperature Control Logic *)
PROGRAM Temperature_Control
VAR
  Temperature_PV : REAL := 20.0;    (* Process Variable *)
  Temperature_SP : REAL := 75.0;    (* Set Point *)
  Heater_Output : REAL := 0.0;      (* Heater output 0-100% *)
  PID_Error : REAL;
  PID_Integral : REAL;
  PID_Derivative : REAL;
  PID_LastError : REAL;
  
  (* PID Parameters *)
  KP : REAL := 1.0;                 (* Proportional gain *)
  KI : REAL := 0.1;                 (* Integral gain *)
  KD : REAL := 0.01;                (* Derivative gain *)
END_VAR

(* Main control logic *)
PID_Error := Temperature_SP - Temperature_PV;

(* PID Calculation *)
PID_Integral := PID_Integral + PID_Error;
PID_Derivative := PID_Error - PID_LastError;

Heater_Output := KP * PID_Error + KI * PID_Integral + KD * PID_Derivative;

(* Limit output to 0-100% *)
IF Heater_Output > 100.0 THEN
  Heater_Output := 100.0;
ELSIF Heater_Output < 0.0 THEN
  Heater_Output := 0.0;
END_IF;

PID_LastError := PID_Error;

END_PROGRAM`;

  const samplePumpLogic = `(* Pump Control System *)
PROGRAM Pump_Control
VAR
  Tank_Level : REAL := 50.0;        (* Tank level 0-100% *)
  Pump_Running : BOOL := FALSE;      (* Pump status *)
  High_Level : REAL := 80.0;        (* High level setpoint *)
  Low_Level : REAL := 30.0;         (* Low level setpoint *)
  Emergency_Stop : BOOL := FALSE;    (* Emergency stop button *)
  Motor_Fault : BOOL := FALSE;      (* Motor fault input *)
END_VAR

(* Safety checks *)
IF Emergency_Stop OR Motor_Fault THEN
  Pump_Running := FALSE;
ELSE
  (* Level control logic *)
  IF Tank_Level <= Low_Level AND NOT Pump_Running THEN
    Pump_Running := TRUE;            (* Start pump *)
  ELSIF Tank_Level >= High_Level AND Pump_Running THEN
    Pump_Running := FALSE;           (* Stop pump *)
  END_IF;
END_IF;

END_PROGRAM`;

  await knex('logic_files').insert([
    {
      id: uuidv4(),
      name: 'Temperature_Control.st',
      content: sampleSTContent,
      vendor: 'neutral',
      last_modified: new Date().toISOString(),
      author: 'Engineer'
    },
    {
      id: uuidv4(),
      name: 'Pump_Control.st',
      content: samplePumpLogic,
      vendor: 'neutral',
      last_modified: new Date().toISOString(),
      author: 'Engineer'
    }
  ]);

  // Insert sample tags
  await knex('tags').insert([
    {
      id: uuidv4(),
      name: 'Temperature_PV',
      type: 'REAL',
      value: '72.5',
      address: 'DB1.DBD0',
      last_update: new Date().toISOString(),
      source: 'shadow',
      metadata: JSON.stringify({ description: 'Temperature Process Variable', units: '°C' })
    },
    {
      id: uuidv4(),
      name: 'Temperature_SP',
      type: 'REAL',
      value: '75.0',
      address: 'DB1.DBD4',
      last_update: new Date().toISOString(),
      source: 'shadow',
      metadata: JSON.stringify({ description: 'Temperature Setpoint', units: '°C' })
    },
    {
      id: uuidv4(),
      name: 'Heater_Output',
      type: 'REAL',
      value: '45.2',
      address: 'DB1.DBD8',
      last_update: new Date().toISOString(),
      source: 'shadow',
      metadata: JSON.stringify({ description: 'Heater Output', units: '%' })
    },
    {
      id: uuidv4(),
      name: 'Pump_Running',
      type: 'BOOL',
      value: 'false',
      address: 'DB1.DBX12.0',
      last_update: new Date().toISOString(),
      source: 'shadow',
      metadata: JSON.stringify({ description: 'Pump Running Status' })
    },
    {
      id: uuidv4(),
      name: 'Tank_Level',
      type: 'REAL',
      value: '67.8',
      address: 'DB1.DBD16',
      last_update: new Date().toISOString(),
      source: 'shadow',
      metadata: JSON.stringify({ description: 'Tank Level', units: '%' })
    },
    {
      id: uuidv4(),
      name: 'Emergency_Stop',
      type: 'BOOL',
      value: 'false',
      address: 'I0.0',
      last_update: new Date().toISOString(),
      source: 'live',
      metadata: JSON.stringify({ description: 'Emergency Stop Button' })
    }
  ]);
};