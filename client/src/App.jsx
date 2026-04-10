import { useAnalysis, useSession } from './hooks/useAnalysis';
import { usePriceStream } from './hooks/usePriceStream';
import Header from './components/Header';
import PairSelector from './components/PairSelector';
import BiasCard from './components/BiasCard';
import KeyLevels from './components/KeyLevels';
import Checklist from './components/Checklist';
import AnalysisBox from './components/AnalysisBox';
import CandlestickChart from './components/CandlestickChart';
import MTFBiasPanel from './components/MTFBiasPanel';
import ScannerHeatmap from './components/ScannerHeatmap';
import StrengthMeter from './components/StrengthMeter';
import DxyBadge from './components/DxyBadge';
import AlertsPanel from './components/AlertsPanel';
import EconomicCalendar from './components/EconomicCalendar';
import CorrelationMatrix from './components/CorrelationMatrix';
import JournalPanel from './components/JournalPanel';
import LiveTradesPanel from './components/LiveTradesPanel';

function App() {
  const {
    pairs,
    selectedPair,
    selectPair,
    data,
    allData,
    loading,
    error,
    lastFetch,
    fetchPair,
    fetchAll,
    autoRefresh,
    setAutoRefresh,
  } = useAnalysis();

  const session = useSession();
  const {
    prices: livePrices,
    scanner: liveScanner,
    strength: liveStrength,
    alerts,
    latestAlert,
    connected: wsConnected,
    wsSymbol,
    switchSymbol,
  } = usePriceStream();
  const livePrice = data ? livePrices[data.pair] : null;
  const handleSelectPair = (p) => { selectPair(p); fetchPair(p); };

  return (
    <div className="min-h-screen bg-bg-primary">
      {/* Header with integrated session timeline */}
      <Header session={session} />

      <main className="max-w-[1440px] mx-auto px-4 sm:px-6 py-5 space-y-5">

        {/* Pair Selector */}
        <div className="glass rounded-2xl border border-border-subtle p-5 card-glow">
          <PairSelector
            pairs={pairs}
            selectedPair={selectedPair}
            onSelect={selectPair}
            onFetchPair={() => fetchPair(selectedPair)}
            onFetchAll={fetchAll}
            loading={loading}
            allData={allData}
            lastFetch={lastFetch}
          />
          <div className="flex items-center gap-3 mt-3 pt-3 border-t border-border-subtle">
            <label className="flex items-center gap-2 text-xs text-text-muted cursor-pointer font-medium">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                className="accent-accent w-3.5 h-3.5"
              />
              Auto-refresh (5 min)
            </label>
            <span className="flex items-center gap-1.5 text-xs text-text-muted font-medium">
              <span className={`inline-block w-2 h-2 rounded-full ${wsConnected ? 'bg-bull animate-pulse' : 'bg-bear'}`} />
              {wsConnected ? 'Live stream' : 'Stream offline'}
            </span>
          </div>
        </div>

        {/* ────── Live Trades (pinned top when active) ────── */}
        <LiveTradesPanel livePrices={livePrices} wsSymbol={wsSymbol} switchSymbol={switchSymbol} />

        {/* Error */}
        {error && (
          <div className="glass rounded-2xl border border-bear/30 p-5 text-bear text-sm font-semibold">
            {error}
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="glass rounded-2xl border border-border-subtle p-10 flex items-center justify-center">
            <div className="flex items-center gap-3 text-text-secondary">
              <svg className="animate-spin h-5 w-5 text-accent" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <span className="text-sm font-medium">Fetching data from Twelve Data API...</span>
            </div>
          </div>
        )}

        {/* ────── Section: Market Overview ────── */}
        <div className="flex items-center gap-3 pt-2">
          <div className="h-px flex-1 bg-border-subtle" />
          <span className="text-[10px] font-semibold text-text-muted/50 uppercase tracking-widest">Market Overview</span>
          <div className="h-px flex-1 bg-border-subtle" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2">
            <ScannerHeatmap
              onSelectPair={handleSelectPair}
              liveSnapshot={liveScanner}
            />
          </div>
          <div className="lg:col-span-1 space-y-5">
            <DxyBadge pair={selectedPair} strength={liveStrength} />
            <StrengthMeter liveSnapshot={liveStrength} />
          </div>
        </div>

        {/* ────── Section: Intelligence ────── */}
        <div className="flex items-center gap-3 pt-2">
          <div className="h-px flex-1 bg-border-subtle" />
          <span className="text-[10px] font-semibold text-text-muted/50 uppercase tracking-widest">Intelligence</span>
          <div className="h-px flex-1 bg-border-subtle" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <AlertsPanel
            alerts={alerts}
            latestAlert={latestAlert}
            onSelectPair={handleSelectPair}
          />
          <EconomicCalendar />
          <CorrelationMatrix />
        </div>

        {/* ────── Journal ────── */}
        <JournalPanel />

        {/* ────── Pair Detail ────── */}
        {data && (<>
          <div className="flex items-center gap-3 pt-2">
            <div className="h-px flex-1 bg-border-subtle" />
            <span className="text-[10px] font-semibold text-text-muted/50 uppercase tracking-widest">Pair Analysis</span>
            <div className="h-px flex-1 bg-border-subtle" />
          </div>
          <div className="fade-in space-y-5">
            {/* Top row: Bias + Levels + Checklist */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              <BiasCard data={data} livePrice={livePrice} />
              <KeyLevels levels={data.levels} pair={data.pair} />
              <Checklist items={data.checklist} />
            </div>

            {/* MTF Bias Panel */}
            <MTFBiasPanel
              timeframes={data.timeframes}
              strengthLabel={data.strengthLabel}
              bias={data.bias}
            />

            {/* Analysis */}
            <AnalysisBox analysis={data.analysis} />

            {/* Chart */}
            <CandlestickChart
              candles={data.candles4H}
              levels={data.levels}
            />

          </div>
        </>)}

        {/* Empty state */}
        {!data && !loading && !error && (
          <div className="glass rounded-2xl border border-border-subtle p-16 flex flex-col items-center justify-center text-center slide-up">
            <div className="w-12 h-12 rounded-xl bg-accent/15 border border-accent/25 flex items-center justify-center mb-4">
              <span className="text-accent-bright text-lg font-black">?</span>
            </div>
            <p className="text-text-secondary text-sm font-semibold mb-1">Select a pair and click "Fetch Bias"</p>
            <p className="text-text-muted text-xs">Live data from Twelve Data API with multi-timeframe SMC analysis</p>
          </div>
        )}

        {/* Footer */}
        <footer className="text-center py-6 border-t border-border-subtle mt-4">
          <p className="text-[11px] text-text-muted/50 font-medium tracking-wider uppercase">
            MhN's Panel &middot; Forex Trading Dashboard
          </p>
        </footer>
      </main>
    </div>
  );
}

export default App;
