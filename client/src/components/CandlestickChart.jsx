import { useEffect, useRef } from 'react';
import { createChart, CandlestickSeries } from 'lightweight-charts';

function toTimestamp(datetime) {
  return Math.floor(new Date(datetime.replace(' ', 'T') + '-05:00').getTime() / 1000);
}

export default function CandlestickChart({ candles, levels, orderBlocks, fvgs }) {
  const containerRef = useRef(null);
  const chartRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      width: containerRef.current.clientWidth,
      height: 400,
      layout: {
        background: { color: '#131a28' },
        textColor: '#94a3b8',
        fontFamily: "'JetBrains Mono', monospace",
      },
      grid: {
        vertLines: { color: '#1e2d44' },
        horzLines: { color: '#1e2d44' },
      },
      crosshair: {
        mode: 0,
      },
      rightPriceScale: {
        borderColor: '#1e2d44',
      },
      timeScale: {
        borderColor: '#1e2d44',
        timeVisible: true,
        secondsVisible: false,
      },
    });

    chartRef.current = chart;

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#22c55e',
      downColor: '#ef4444',
      borderDownColor: '#ef4444',
      borderUpColor: '#22c55e',
      wickDownColor: '#ef4444',
      wickUpColor: '#22c55e',
    });

    if (candles && candles.length > 0) {
      const data = candles.map((c) => ({
        time: toTimestamp(c.datetime),
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      }));

      const seen = new Set();
      const unique = data.filter((d) => {
        if (seen.has(d.time)) return false;
        seen.add(d.time);
        return true;
      });
      unique.sort((a, b) => a.time - b.time);

      candleSeries.setData(unique);

      // Add price lines for levels
      if (levels) {
        for (const level of levels) {
          if (Array.isArray(level.value)) {
            const color =
              level.type === 'demand' ? '#22c55e' :
              level.type === 'supply' ? '#ef4444' :
              level.type === 'fvg' ? '#3b82f6' : '#eab308';

            candleSeries.createPriceLine({
              price: level.value[0],
              color,
              lineWidth: 1,
              lineStyle: 2,
              axisLabelVisible: false,
              title: level.label,
            });
            candleSeries.createPriceLine({
              price: level.value[1],
              color,
              lineWidth: 1,
              lineStyle: 2,
              axisLabelVisible: false,
              title: '',
            });
          } else if (typeof level.value === 'number') {
            const color =
              level.type === 'resistance' ? '#ef4444' :
              level.type === 'support' ? '#22c55e' : '#eab308';

            candleSeries.createPriceLine({
              price: level.value,
              color,
              lineWidth: 1,
              lineStyle: 2,
              axisLabelVisible: true,
              title: level.label,
            });
          }
        }
      }

      // Order block zones
      if (orderBlocks) {
        for (const ob of orderBlocks) {
          const color = ob.type === 'demand' ? 'rgba(34,197,94,0.6)' : 'rgba(239,68,68,0.6)';
          candleSeries.createPriceLine({
            price: ob.zone[0],
            color,
            lineWidth: 2,
            lineStyle: 0,
            axisLabelVisible: false,
            title: `${ob.type} OB`,
          });
          candleSeries.createPriceLine({
            price: ob.zone[1],
            color,
            lineWidth: 2,
            lineStyle: 0,
            axisLabelVisible: false,
            title: '',
          });
        }
      }

      // FVG zones
      if (fvgs) {
        for (const fvg of fvgs) {
          candleSeries.createPriceLine({
            price: fvg.zone[0],
            color: 'rgba(59,130,246,0.6)',
            lineWidth: 1,
            lineStyle: 1,
            axisLabelVisible: false,
            title: `${fvg.type} FVG`,
          });
          candleSeries.createPriceLine({
            price: fvg.zone[1],
            color: 'rgba(59,130,246,0.6)',
            lineWidth: 1,
            lineStyle: 1,
            axisLabelVisible: false,
            title: '',
          });
        }
      }

      chart.timeScale().fitContent();
    }

    const handleResize = () => {
      if (containerRef.current) {
        chart.applyOptions({ width: containerRef.current.clientWidth });
      }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, [candles, levels, orderBlocks, fvgs]);

  return (
    <div className="rounded-xl bg-bg-card border border-border p-4">
      <h3 className="text-sm font-semibold text-text-muted uppercase tracking-wider mb-3">
        4H Candlestick Chart
      </h3>
      <div ref={containerRef} className="w-full" />
      {(!candles || candles.length === 0) && (
        <div className="flex items-center justify-center h-[400px] text-text-muted text-sm">
          Fetch data to view chart
        </div>
      )}
    </div>
  );
}
