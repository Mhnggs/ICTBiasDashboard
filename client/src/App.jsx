import { useAnalysis, useSession } from './hooks/useAnalysis';
import Header from './components/Header';
import PairSelector from './components/PairSelector';
import BiasCard from './components/BiasCard';
import KeyLevels from './components/KeyLevels';
import Checklist from './components/Checklist';
import AnalysisBox from './components/AnalysisBox';
import CandlestickChart from './components/CandlestickChart';
import SessionTimeline from './components/SessionTimeline';
import KillzoneStatus from './components/KillzoneStatus';
import RiskCalculator from './components/RiskCalculator';

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

  return (
    <div className="min-h-screen bg-bg-primary">
      <Header session={session} />

      <main className="max-w-[1440px] mx-auto px-4 sm:px-6 py-4 space-y-4">
        {/* Pair Selector */}
        <div className="bg-bg-card border border-border rounded-xl p-4">
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
          <div className="flex items-center gap-2 mt-3">
            <label className="flex items-center gap-2 text-xs text-text-muted cursor-pointer">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                className="accent-accent"
              />
              Auto-refresh (5 min)
            </label>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-bear/10 border border-bear/30 rounded-xl p-4 text-bear text-sm">
            {error}
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="bg-bg-card border border-border rounded-xl p-8 flex items-center justify-center">
            <div className="flex items-center gap-3 text-text-secondary">
              <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <span className="text-sm">Fetching data from Twelve Data API...</span>
            </div>
          </div>
        )}

        {/* Main Grid */}
        {data && (
          <div className="fade-in space-y-4">
            {/* Top row: Bias + Levels + Checklist */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <BiasCard data={data} />
              <KeyLevels levels={data.levels} pair={data.pair} />
              <Checklist items={data.checklist} />
            </div>

            {/* Analysis Box */}
            <AnalysisBox analysis={data.analysis} />

            {/* Chart */}
            <CandlestickChart
              candles={data.candles4H}
              levels={data.levels}
              orderBlocks={data.orderBlocks}
              fvgs={data.fvgs}
            />

            {/* Bottom row: Session + Risk */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-1">
                <SessionTimeline session={session} />
              </div>
              <div className="md:col-span-1">
                <KillzoneStatus session={session} />
              </div>
              <div className="md:col-span-1">
                <RiskCalculator />
              </div>
            </div>
          </div>
        )}

        {/* Empty state when no data and not loading */}
        {!data && !loading && !error && (
          <div className="space-y-4">
            <div className="bg-bg-card border border-border rounded-xl p-12 flex flex-col items-center justify-center text-center">
              <p className="text-text-muted text-sm mb-2">Select a pair and click "Fetch Bias" to start analysis</p>
              <p className="text-text-muted text-xs">The dashboard will fetch live data from Twelve Data API and run SMC analysis</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <SessionTimeline session={session} />
              <KillzoneStatus session={session} />
              <RiskCalculator />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
