import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  ArrowDownRight,
  ArrowRight,
  Check,
  ChevronRight,
  CircleHelp,
  Clock3,
  Command,
  Fingerprint,
  FlaskConical,
  LoaderCircle,
  LockKeyhole,
  Pause,
  Play,
  RefreshCw,
  ShieldCheck,
  Signal,
  UsersRound,
  Waves,
} from 'lucide-react';
import {
  getGetSimulationQueryKey,
  getGetSimulationSummaryQueryKey,
  getListSimulationsQueryKey,
  useCreateSimulation,
  useGetSimulation,
  useGetSimulationSummary,
  useHealthCheck,
  useListSimulations,
  useStopSimulation,
} from '@workspace/api-client-react';
import type { Simulation, SimulationInput, SimulationSummary } from '@workspace/api-client-react';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Route, Switch, useLocation, Router as WouterRouter } from 'wouter';

const queryClient = new QueryClient();

const fmtTime = (value?: string) => {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? '—'
    : new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(date);
};

const fmtDate = (value?: string) => {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? '—'
    : new Intl.DateTimeFormat('es-ES', { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(date);
};

function statusLabel(status?: string) {
  return status === 'running' ? 'En curso' : status === 'completed' ? 'Completado' : status === 'stopped' ? 'Detenido' : 'Pendiente';
}

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'error' in error) return String((error as { error: unknown }).error);
  return 'Algo ha fallado. Inténtalo de nuevo.';
}

function StatusPill({ status, testId }: { status?: string; testId: string }) {
  const running = status === 'running';
  const completed = status === 'completed';
  return (
    <span data-testid={testId} className={`status-pill ${running ? 'status-running' : completed ? 'status-completed' : 'status-stopped'}`}>
      <span className={`status-dot ${running ? 'live-pulse' : ''}`} />
      {statusLabel(status)}
    </span>
  );
}

function LoadingBlock({ label }: { label: string }) {
  return (
    <div className="loading-block" data-testid={`loading-${label}`}>
      <span className="skeleton-line wide" />
      <span className="skeleton-line" />
      <span className="skeleton-line short" />
    </div>
  );
}

function Home() {
  const queryClient = useQueryClient();
  const health = useHealthCheck();
  const simulations = useListSimulations();
  const overview = useGetSimulationSummary();
  const [selectedId, setSelectedId] = useState('');
  const [pin, setPin] = useState('');
  const [count, setCount] = useState(12);
  const [baseName, setBaseName] = useState('Ensayo');
  const [formError, setFormError] = useState('');
  const selectedQuery = useGetSimulation(selectedId, {
    query: {
      enabled: Boolean(selectedId),
      queryKey: getGetSimulationQueryKey(selectedId),
      refetchInterval: (query) => query.state.data?.status === 'running' ? 800 : false,
    },
  });
  const createMutation = useCreateSimulation();
  const stopMutation = useStopSimulation();
  const selected = selectedQuery.data as Simulation | undefined;
  const recent = simulations.data ?? overview.data?.recent ?? [];
  const backendReady = health.data?.status === 'ok' || health.data?.status === 'healthy';

  useEffect(() => {
    if (!selectedId && recent.length > 0) setSelectedId(recent[0].id);
  }, [selectedId, recent]);

  const refreshDashboard = () => {
    void queryClient.invalidateQueries({ queryKey: getListSimulationsQueryKey() });
    void queryClient.invalidateQueries({ queryKey: getGetSimulationSummaryQueryKey() });
  };

  const submitSimulation = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError('');
    const normalizedPin = pin.trim();
    const normalizedName = baseName.trim();
    if (!/^[0-9]{4,10}$/.test(normalizedPin)) {
      setFormError('Escribe un PIN de ensayo de entre 4 y 10 cifras.');
      return;
    }
    if (!normalizedName || normalizedName.length > 24) {
      setFormError('Elige un nombre base de hasta 24 caracteres.');
      return;
    }
    const input: SimulationInput = { pin: normalizedPin, count, baseName: normalizedName };
    createMutation.mutate({ data: input }, {
      onSuccess: (created) => {
        queryClient.setQueryData(getGetSimulationQueryKey(created.id), created);
        queryClient.setQueryData<SimulationSummary[]>(getListSimulationsQueryKey(), (old) => [
          created as SimulationSummary,
          ...(old ?? []).filter((item) => item.id !== created.id),
        ]);
        setSelectedId(created.id);
        refreshDashboard();
      },
      onError: (error) => setFormError(errorMessage(error)),
    });
  };

  const stopSelected = () => {
    if (!selected || selected.status !== 'running') return;
    stopMutation.mutate({ simulationId: selected.id }, {
      onSuccess: (stopped) => {
        queryClient.setQueryData(getGetSimulationQueryKey(stopped.id), stopped);
        queryClient.setQueryData<SimulationSummary[]>(getListSimulationsQueryKey(), (old) =>
          old?.map((item) => item.id === stopped.id ? { ...item, ...stopped } : item),
        );
        refreshDashboard();
      },
    });
  };

  const retryData = () => {
    void simulations.refetch();
    void overview.refetch();
    void health.refetch();
  };

  return (
    <div className="app-shell">
      <div className="app-content">
        <header className="topbar">
          <div className="brand-lockup">
            <div className="brand-mark" aria-hidden="true"><Waves size={18} strokeWidth={2.4} /></div>
            <div>
              <div className="brand-name" data-testid="text-product-name">Sala de ensayo</div>
              <div className="brand-caption">SIMULADOR AISLADO</div>
            </div>
          </div>
          <div className="topbar-right">
            <span className="local-badge"><LockKeyhole size={13} /> SIN CONEXIÓN</span>
            <span className={`connection-state ${health.isError ? 'connection-error' : ''}`} data-testid="status-server-connection">
              <span className="connection-dot" />
              {health.isLoading ? 'Comprobando servidor' : health.isError ? 'Servidor no disponible' : backendReady ? 'Servidor listo' : 'Servidor activo'}
            </span>
          </div>
        </header>

        <main className="page-wrap">
          <section className="welcome-row fade-up">
            <div>
              <div className="eyebrow"><span className="eyebrow-line" /> CONTROL DE ENSAYO</div>
              <h1 className="display-font">Ensaya el flujo<br /><span>antes del día real.</span></h1>
              <p className="intro-copy">Un entorno aislado para probar un flujo de participantes. No se contacta con Kahoot ni se afecta a partidas reales. Las sesiones se guardan mientras este servidor esté activo.</p>
            </div>
            <div className="session-stamp">
              <div className="stamp-glyph"><Fingerprint size={23} /></div>
              <div><strong>SIMULACIÓN SEGURA</strong><span>Sin conexión a partidas reales</span></div>
            </div>
          </section>

          {(simulations.isError || overview.isError || health.isError) && (
            <div className="alert-strip" role="alert" data-testid="error-dashboard">
              <CircleHelp size={17} />
              <span>{errorMessage(simulations.error ?? overview.error ?? health.error)}</span>
              <button type="button" onClick={retryData} data-testid="button-retry-dashboard"><RefreshCw size={14} /> Reintentar</button>
            </div>
          )}

          <section className="metrics-grid fade-up-delay" aria-label="Rehearsal overview">
            <Metric label="ENSAYOS ACTIVOS" value={overview.data?.activeSessions} loading={overview.isLoading} icon={<Activity size={15} />} testId="metric-active-runs" />
            <Metric label="ENSAYOS TOTALES" value={overview.data?.totalSessions} loading={overview.isLoading} icon={<FlaskConical size={15} />} testId="metric-total-runs" />
            <Metric label="PARTICIPANTES SIMULADOS" value={overview.data?.participantsGenerated} loading={overview.isLoading} icon={<UsersRound size={15} />} testId="metric-participants-generated" />
            <Metric label="COMPLETADOS" value={overview.data?.completedSessions} loading={overview.isLoading} icon={<Check size={15} />} testId="metric-finished-runs" />
          </section>

          <section className="workbench">
            <aside className="configure-card panel-card">
              <div className="card-heading">
                <div className="number-chip">01</div>
                  <div><div className="section-kicker">CONFIGURAR ENSAYO</div><h2>Parámetros</h2></div>
              </div>
              <p className="card-intro">Elige una etiqueta y el tamaño del grupo ficticio que quieres generar.</p>
              <form onSubmit={submitSimulation} className="setup-form">
                <label htmlFor="session-pin">PIN de ensayo <span className="field-note">solo etiqueta · 4–10 cifras</span></label>
                <div className="input-shell">
                  <Command size={16} />
                  <input id="session-pin" type="text" inputMode="numeric" pattern="[0-9]{4,10}" minLength={4} maxLength={10} placeholder="p. ej., 483921" value={pin} onChange={(event) => setPin(event.target.value.replace(/\D/g, '').slice(0, 10))} data-testid="input-session-pin" />
                </div>
                <label htmlFor="participant-name">Nombre base <span className="field-note">máximo 24 caracteres</span></label>
                <div className="input-shell">
                  <UsersRound size={16} />
                  <input id="participant-name" type="text" maxLength={24} placeholder="p. ej., Ensayo" value={baseName} onChange={(event) => setBaseName(event.target.value)} data-testid="input-participant-name" />
                </div>
                <div className="count-heading">
                  <label htmlFor="participant-count">Participantes que generar</label>
                  <output className="count-output mono" htmlFor="participant-count" data-testid="text-participant-count">{count}</output>
                </div>
                <input id="participant-count" className="count-slider" type="range" min={1} max={100} value={count} style={{ background: `linear-gradient(90deg,#ba6948 0%,#d8aa8c ${count}%,#e6e1d5 ${count}%,#e6e1d5 100%)` }} onChange={(event) => setCount(Number(event.target.value))} data-testid="input-participant-count" />
                <div className="range-endpoints"><span>1 participante</span><span>máximo 100</span></div>
                {formError && <div className="form-error" role="alert" data-testid="error-simulation-form">{formError}</div>}
                <button type="submit" className="primary-button" disabled={createMutation.isPending} data-testid="button-start-simulation">
                  {createMutation.isPending ? <><LoaderCircle className="spin" size={17} /> Iniciando ensayo…</> : <><Play size={16} fill="currentColor" /> Iniciar ensayo <ArrowRight size={16} /></>}
                </button>
              </form>
              <div className="privacy-note"><ShieldCheck size={16} /><span>Solo se generan participantes ficticios. El PIN no se reenvía a servicios externos.</span></div>
            </aside>

            <section className="monitor-card panel-card">
              <div className="monitor-topline">
                <div className="card-heading compact">
                  <div className="number-chip number-chip-soft">02</div>
                  <div><div className="section-kicker">SEGUIMIENTO</div><h2>Actividad del ensayo</h2></div>
                </div>
                {selected ? <StatusPill status={selected.status} testId="status-selected-simulation" /> : <span className="monitor-idle">EN ESPERA</span>}
              </div>
              {selectedQuery.isError && (
                <div className="inline-error" role="alert" data-testid="error-selected-simulation">
                  <span>{errorMessage(selectedQuery.error)}</span>
                   <button type="button" onClick={() => void selectedQuery.refetch()} data-testid="button-retry-selected"><RefreshCw size={14} /> Reintentar</button>
                </div>
              )}
              {selectedQuery.isLoading && selectedId ? <LoadingBlock label="selected-simulation" /> : selected ? (
                <div className="monitor-body" data-testid={`panel-selected-simulation-${selected.id}`}>
                  <div className="run-summary">
                    <div className="run-name-block">
                       <span className="small-label">ENSAYO SELECCIONADO</span>
                       <h3 data-testid={`text-selected-name-${selected.id}`}>Grupo {selected.baseName}</h3>
                      <div className="run-meta">
                         <span data-testid={`text-selected-pin-${selected.id}`}><Command size={12} /> PIN {selected.pin}</span>
                         <span data-testid={`text-selected-started-${selected.id}`}><Clock3 size={12} /> Inicio {fmtTime(selected.startedAt)}</span>
                      </div>
                    </div>
                    <div className="participant-total">
                      <span className="total-number" data-testid={`text-joined-count-${selected.id}`}>{selected.joined}</span>
                       <span>de {selected.count} simulados</span>
                    </div>
                  </div>
                  <div className="progress-track" aria-label={`${selected.joined} de ${selected.count} participantes simulados`}>
                    <div className="progress-fill" style={{ width: `${Math.min(100, selected.count ? (selected.joined / selected.count) * 100 : 0)}%` }} data-testid={`progress-simulation-${selected.id}`} />
                  </div>
                   <div className="live-divider"><span><Signal size={13} /> PARTICIPANTES</span><span className="mono">{selected.participants.length} / {selected.count}</span></div>
                  {selected.participants.length ? (
                    <div className="participant-list scrollbar-thin" data-testid={`list-participants-${selected.id}`}>
                      {selected.participants.map((participant, index) => (
                        <div className="participant-row" key={participant.id} data-testid={`row-participant-${participant.id}`}>
                          <span className={`participant-index participant-index-${index % 4}`}>{String(index + 1).padStart(2, '0')}</span>
                          <span className="participant-name" data-testid={`text-participant-name-${participant.id}`}>{participant.name}</span>
                           <span className="participant-status"><span /> SIMULADO</span>
                          <span className="participant-time mono" data-testid={`text-participant-time-${participant.id}`}>{fmtTime(participant.createdAt)}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="stream-empty" data-testid={`empty-participants-${selected.id}`}>
                      <span className="stream-wave"><Waves size={19} /></span>
                       <div><strong>Esperando al primer participante</strong><span>Los participantes simulados aparecerán aquí.</span></div>
                    </div>
                  )}
                  <div className="monitor-footer">
                    <div className="event-indicator"><span className={selected.status === 'running' ? 'event-live-dot' : 'event-done-dot'} />{selected.status === 'running' ? 'Actualización automática' : 'Ensayo finalizado'}</div>
                    {selected.status === 'running' && <button type="button" className="stop-button" onClick={stopSelected} disabled={stopMutation.isPending} data-testid="button-stop-simulation">
                       {stopMutation.isPending ? <LoaderCircle size={14} className="spin" /> : <Pause size={14} />} Detener ensayo
                    </button>}
                  </div>
                  {stopMutation.isError && <div className="mutation-error" role="alert" data-testid="error-stop-simulation">{errorMessage(stopMutation.error)}</div>}
                  {selected.events.length > 0 && (
                    <div className="event-log" data-testid={`list-events-${selected.id}`}>
                       <div className="event-log-title"><span>EVENTOS RECIENTES</span><ArrowDownRight size={13} /></div>
                      {selected.events.slice(-4).reverse().map((item) => (
                        <div className="event-row" key={item.id} data-testid={`event-${item.id}`}>
                          <span className={`event-kind event-kind-${item.kind}`} />
                          <span className="event-message" data-testid={`text-event-message-${item.id}`}>{item.message}</span>
                          <span className="event-time mono" data-testid={`text-event-time-${item.id}`}>{fmtTime(item.at)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="monitor-empty" data-testid="empty-run-monitor">
                  <div className="empty-orbit"><div className="orbit-center"><Waves size={23} /></div><span /><span /><span /></div>
                   <h3>Ningún ensayo seleccionado</h3>
                   <p>Inicia un ensayo o selecciona uno del historial para seguir su actividad simulada.</p>
                   <span className="empty-footnote"><LockKeyhole size={12} /> Aquí solo aparecen datos simulados</span>
                </div>
              )}
            </section>
          </section>

          <section className="recent-section">
            <div className="recent-heading">
              <div>
                <div className="section-kicker">HISTORIAL DE ENSAYOS</div>
                <h2>Ensayos recientes <span className="recent-count mono" data-testid="text-recent-count">{recent.length}</span></h2>
              </div>
              <div className="history-caption"><span className="history-mark" /> Memoria temporal del servidor</div>
            </div>
            {simulations.isLoading && <div className="recent-loading" data-testid="loading-recent-simulations"><LoadingBlock label="recent-runs" /></div>}
             {!simulations.isLoading && simulations.isError && <div className="history-message error-history" data-testid="error-recent-simulations">No se pudieron cargar los ensayos recientes. <button type="button" onClick={() => void simulations.refetch()} data-testid="button-retry-recent">Reintentar</button></div>}
            {!simulations.isLoading && !simulations.isError && recent.length === 0 && (
              <div className="history-empty" data-testid="empty-recent-simulations">
                <div className="history-empty-icon"><FlaskConical size={19} /></div>
                 <div><strong>Aún no hay ensayos.</strong><p>Cuando inicies uno, aparecerá aquí para que puedas volver a consultarlo.</p></div>
                <ChevronRight size={17} />
              </div>
            )}
            {!simulations.isLoading && recent.length > 0 && (
              <div className="history-table" data-testid="list-recent-simulations">
                <div className="history-table-head"><span>ENSAYO</span><span>PIN</span><span>PARTICIPANTES</span><span>INICIO</span><span>ESTADO</span><span /></div>
                {recent.map((run) => (
                  <button className={`history-row ${selectedId === run.id ? 'history-row-selected' : ''}`} key={run.id} type="button" onClick={() => setSelectedId(run.id)} data-testid={`button-select-simulation-${run.id}`}>
                     <span className="history-run-name"><span className="history-run-symbol"><FlaskConical size={14} /></span><span><strong data-testid={`text-history-name-${run.id}`}>Grupo {run.baseName}</strong><small className="mono" data-testid={`text-history-id-${run.id}`}>{run.id.slice(0, 8)}</small></span></span>
                    <span className="mono history-pin" data-testid={`text-history-pin-${run.id}`}>{run.pin}</span>
                    <span className="history-participants" data-testid={`text-history-count-${run.id}`}><UsersRound size={14} /> {run.joined} <span>/ {run.count}</span></span>
                    <span className="history-date" data-testid={`text-history-date-${run.id}`}>{fmtDate(run.startedAt)}</span>
                    <span><StatusPill status={run.status} testId={`status-history-${run.id}`} /></span>
                    <span className="history-arrow"><ChevronRight size={16} /></span>
                  </button>
                ))}
              </div>
            )}
          </section>

          <footer className="page-footer">
             <span><span className="footer-symbol">S</span> Sala de ensayo <span className="footer-separator">/</span> Un espacio privado para practicar</span>
             <span className="footer-local"><LockKeyhole size={12} /> SOLO SIMULACIÓN · SIN CONEXIONES EXTERNAS</span>
          </footer>
        </main>
      </div>
    </div>
  );
}

function Metric({ label, value, loading, icon, testId }: { label: string; value?: number; loading: boolean; icon: ReactNode; testId: string }) {
  return (
    <div className="metric-cell">
      <div className="metric-top"><span className="metric-icon">{icon}</span><span>{label}</span></div>
      {loading ? <span className="metric-skeleton" data-testid={`loading-${testId}`} /> : <strong data-testid={testId}>{value ?? 0}</strong>}
    </div>
  );
}

function Router() {
  return (
    <RoutedErrorBoundary>
      <Switch>
        <Route path="/" component={Home} />
        <Route component={NotFound} />
      </Switch>
    </RoutedErrorBoundary>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
