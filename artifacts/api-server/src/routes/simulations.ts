import { randomUUID } from "node:crypto";
import { Router, type IRouter } from "express";
import {
  CreateSimulationBody,
  CreateSimulationResponse,
  GetSimulationParams,
  GetSimulationResponse,
  GetSimulationSummaryResponse,
  ListSimulationsResponse,
  StopSimulationParams,
  StopSimulationResponse,
  type Simulation,
  type SimulationEvent,
  type SimulationParticipant,
  type SimulationSummary,
} from "@workspace/api-zod";

const router: IRouter = Router();
const MAX_PARTICIPANTS = 100;
const MAX_ACTIVE_SESSIONS = 5;
const MAX_STORED_SESSIONS = 20;
const SIMULATION_INTERVAL_MS = 280;

const sessions = new Map<string, Simulation>();
const timers = new Map<string, ReturnType<typeof setInterval>>();

function appendEvent(
  simulation: Simulation,
  message: string,
  kind: SimulationEvent["kind"] = "info",
): void {
  simulation.events.push({
    id: randomUUID(),
    message,
    kind,
    at: new Date(),
  });

  if (simulation.events.length > 40) {
    simulation.events.shift();
  }
}

function toSummary(simulation: Simulation): SimulationSummary {
  return {
    id: simulation.id,
    pin: simulation.pin,
    baseName: simulation.baseName,
    count: simulation.count,
    joined: simulation.joined,
    status: simulation.status,
    startedAt: simulation.startedAt,
  };
}

function makeRoomForSession(): boolean {
  while (sessions.size >= MAX_STORED_SESSIONS) {
    const oldestFinished = Array.from(sessions.values())
      .filter((session) => session.status !== "running")
      .sort((left, right) => left.startedAt.getTime() - right.startedAt.getTime())[0];

    if (!oldestFinished) return false;
    sessions.delete(oldestFinished.id);
  }

  return true;
}

function stopTimer(simulationId: string): void {
  const timer = timers.get(simulationId);
  if (timer) clearInterval(timer);
  timers.delete(simulationId);
}

function stopSimulation(simulation: Simulation): void {
  if (simulation.status !== "running") return;

  stopTimer(simulation.id);
  simulation.status = "stopped";
  appendEvent(simulation, "Ensayo detenido. No se enviaron conexiones externas.", "system");
}

function startSimulation(input: {
  pin: string;
  count: number;
  baseName: string;
}): Simulation | null {
  const activeCount = Array.from(sessions.values()).filter(
    (session) => session.status === "running",
  ).length;

  if (activeCount >= MAX_ACTIVE_SESSIONS || !makeRoomForSession()) {
    return null;
  }

  const simulation: Simulation = {
    id: randomUUID(),
    pin: input.pin,
    baseName: input.baseName.trim(),
    count: Math.min(input.count, MAX_PARTICIPANTS),
    joined: 0,
    status: "running",
    startedAt: new Date(),
    participants: [],
    events: [],
  };

  sessions.set(simulation.id, simulation);
  appendEvent(
    simulation,
    "Ensayo local iniciado. No se contactará con Kahoot ni con servicios externos.",
    "system",
  );

  const timer = setInterval(() => {
    if (simulation.status !== "running") {
      stopTimer(simulation.id);
      return;
    }

    const ordinal = simulation.joined + 1;
    const participant: SimulationParticipant = {
      id: ordinal,
      name: simulation.baseName + "_" + ordinal,
      status: "simulated",
      createdAt: new Date(),
    };

    simulation.participants.push(participant);
    simulation.joined = ordinal;
    appendEvent(
      simulation,
      "Participante simulado generado: " + participant.name,
      "success",
    );

    if (simulation.joined >= simulation.count) {
      simulation.status = "completed";
      stopTimer(simulation.id);
      appendEvent(
        simulation,
        "Ensayo completado. Todos los datos permanecen en este simulador.",
        "system",
      );
    }
  }, SIMULATION_INTERVAL_MS);

  timers.set(simulation.id, timer);
  return simulation;
}

router.get("/simulations/summary", (_req, res): void => {
  const allSessions = Array.from(sessions.values());
  const recent = allSessions
    .sort((left, right) => right.startedAt.getTime() - left.startedAt.getTime())
    .slice(0, 8)
    .map(toSummary);

  res.json(
    GetSimulationSummaryResponse.parse({
      activeSessions: allSessions.filter((session) => session.status === "running")
        .length,
      totalSessions: allSessions.length,
      completedSessions: allSessions.filter(
        (session) => session.status === "completed",
      ).length,
      stoppedSessions: allSessions.filter((session) => session.status === "stopped")
        .length,
      participantsGenerated: allSessions.reduce(
        (total, session) => total + session.joined,
        0,
      ),
      recent,
    }),
  );
});

router.get("/simulations", (_req, res): void => {
  const recent = Array.from(sessions.values())
    .sort((left, right) => right.startedAt.getTime() - left.startedAt.getTime())
    .slice(0, 8)
    .map(toSummary);

  res.json(ListSimulationsResponse.parse(recent));
});

router.post("/simulations", (req, res): void => {
  const input = CreateSimulationBody.safeParse(req.body);

  if (!input.success) {
    res.status(400).json({ error: input.error.issues[0]?.message ?? "Datos no válidos." });
    return;
  }

  if (!input.data.baseName.trim()) {
    res.status(400).json({ error: "El nombre base no puede estar vacío." });
    return;
  }

  const simulation = startSimulation(input.data);
  if (!simulation) {
    req.log.warn("Simulation capacity reached");
    res.status(429).json({
      error:
        "Hay demasiados ensayos activos o guardados. Detén un ensayo en curso e inténtalo de nuevo.",
    });
    return;
  }

  req.log.info(
    { simulationId: simulation.id, requestedCount: simulation.count },
    "Started local simulation",
  );
  res.status(201).json(CreateSimulationResponse.parse(simulation));
});

router.get("/simulations/:simulationId", (req, res): void => {
  const rawId = Array.isArray(req.params.simulationId)
    ? req.params.simulationId[0]
    : req.params.simulationId;
  const params = GetSimulationParams.safeParse({ simulationId: rawId });

  if (!params.success) {
    res.status(400).json({ error: "Identificador de ensayo no válido." });
    return;
  }

  const simulation = sessions.get(params.data.simulationId);
  if (!simulation) {
    res.status(404).json({ error: "No se encontró ese ensayo en este servidor." });
    return;
  }

  res.json(GetSimulationResponse.parse(simulation));
});

router.post("/simulations/:simulationId/stop", (req, res): void => {
  const rawId = Array.isArray(req.params.simulationId)
    ? req.params.simulationId[0]
    : req.params.simulationId;
  const params = StopSimulationParams.safeParse({ simulationId: rawId });

  if (!params.success) {
    res.status(400).json({ error: "Identificador de ensayo no válido." });
    return;
  }

  const simulation = sessions.get(params.data.simulationId);
  if (!simulation) {
    res.status(404).json({ error: "No se encontró ese ensayo en este servidor." });
    return;
  }

  stopSimulation(simulation);
  req.log.info({ simulationId: simulation.id }, "Stopped local simulation");
  res.json(StopSimulationResponse.parse(simulation));
});

export default router;
