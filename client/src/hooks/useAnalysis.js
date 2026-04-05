import { useState, useCallback, useRef, useEffect } from 'react';
import axios from 'axios';

const PAIRS = ['EUR/USD', 'GBP/USD', 'USD/JPY', 'GBP/JPY', 'AUD/USD', 'NZD/USD'];

export function useAnalysis() {
  const [selectedPair, setSelectedPair] = useState(PAIRS[0]);
  const [data, setData] = useState(null);
  const [allData, setAllData] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastFetch, setLastFetch] = useState(null);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const intervalRef = useRef(null);

  const fetchPair = useCallback(async (pair) => {
    setLoading(true);
    setError(null);
    try {
      const symbol = pair.replace('/', '-');
      const res = await axios.get(`/api/analyze/${symbol}`);
      setData(res.data);
      setAllData(prev => ({ ...prev, [pair]: res.data }));
      setLastFetch(new Date());
    } catch (err) {
      const msg = err.response?.data?.error || err.message;
      setError(msg);
      if (err.response?.status === 429) {
        setError('Rate limit reached. Please wait 60 seconds before retrying.');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await axios.get('/api/analyze-all');
      const results = {};
      for (const r of res.data) {
        if (!r.error) results[r.pair] = r;
      }
      setAllData(results);
      if (results[selectedPair]) setData(results[selectedPair]);
      setLastFetch(new Date());
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  }, [selectedPair]);

  const selectPair = useCallback((pair) => {
    setSelectedPair(pair);
    if (allData[pair]) {
      setData(allData[pair]);
    } else {
      setData(null);
    }
  }, [allData]);

  // Auto-refresh
  useEffect(() => {
    if (autoRefresh) {
      intervalRef.current = setInterval(() => {
        fetchPair(selectedPair);
      }, 5 * 60 * 1000);
    } else {
      clearInterval(intervalRef.current);
    }
    return () => clearInterval(intervalRef.current);
  }, [autoRefresh, selectedPair, fetchPair]);

  return {
    pairs: PAIRS,
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
  };
}

export function useSession() {
  const [session, setSession] = useState(null);

  const fetchSession = useCallback(async () => {
    try {
      const res = await axios.get('/api/session');
      setSession(res.data);
    } catch {
      // silent fail
    }
  }, []);

  useEffect(() => {
    fetchSession();
    const interval = setInterval(fetchSession, 30000);
    return () => clearInterval(interval);
  }, [fetchSession]);

  return session;
}
