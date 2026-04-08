import { useEffect, useRef, useState } from 'react';

// Subscribes to server WS and exposes:
//  - prices: { [symbol]: { price, timestamp, bid, ask, prev } }
//  - scanner: latest scanner snapshot pushed from server
//  - strength: latest strength snapshot pushed from server
//  - connected: WS state
export function usePriceStream() {
  const [prices, setPrices] = useState({});
  const [scanner, setScanner] = useState(null);
  const [strength, setStrength] = useState(null);
  const [alerts, setAlerts] = useState([]); // newest first
  const [latestAlert, setLatestAlert] = useState(null); // for toast trigger
  const [connected, setConnected] = useState(false);
  const wsRef = useRef(null);
  const reconnectRef = useRef(null);

  useEffect(() => {
    let cancelled = false;

    const connect = () => {
      if (cancelled) return;
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      // In dev, bypass Vite's flaky ws proxy and hit the backend directly.
      const host = import.meta.env.DEV
        ? `${window.location.hostname}:3001`
        : window.location.host;
      const ws = new WebSocket(`${proto}//${host}/ws`);
      wsRef.current = ws;

      ws.onopen = () => setConnected(true);
      ws.onclose = () => {
        setConnected(false);
        if (!cancelled) {
          clearTimeout(reconnectRef.current);
          reconnectRef.current = setTimeout(connect, 2000);
        }
      };
      ws.onerror = () => ws.close();
      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          if (msg.type === 'price' && msg.symbol) {
            setPrices((prev) => {
              const prior = prev[msg.symbol];
              return {
                ...prev,
                [msg.symbol]: {
                  price: msg.price,
                  timestamp: msg.timestamp,
                  bid: msg.bid,
                  ask: msg.ask,
                  prev: prior?.price,
                },
              };
            });
          } else if (msg.type === 'scanner') {
            setScanner({ timestamp: msg.timestamp, results: msg.results });
          } else if (msg.type === 'strength') {
            setStrength({
              timestamp: msg.timestamp,
              currencies: msg.currencies,
              pairsUsed: msg.pairsUsed,
              pairsTotal: msg.pairsTotal,
            });
          } else if (msg.type === 'alerts-history') {
            setAlerts(msg.alerts || []);
          } else if (msg.type === 'alert' && msg.alert) {
            setAlerts((prev) => [msg.alert, ...prev].slice(0, 50));
            setLatestAlert(msg.alert);
          }
        } catch {
          // ignore
        }
      };
    };

    connect();
    return () => {
      cancelled = true;
      clearTimeout(reconnectRef.current);
      if (wsRef.current) wsRef.current.close();
    };
  }, []);

  return { prices, scanner, strength, alerts, latestAlert, connected };
}
