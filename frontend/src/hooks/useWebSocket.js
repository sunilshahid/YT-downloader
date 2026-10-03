import { useState, useEffect, useRef, useCallback } from 'react';

const API_BASE = typeof window !== 'undefined' && window.location 
  ? `${window.location.protocol}//${window.location.hostname}:8000` 
  : 'http://127.0.0.1:8000';

const WS_URL = typeof window !== 'undefined' && window.location 
  ? `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.hostname}:8000/ws/progress` 
  : 'ws://127.0.0.1:8000/ws/progress';

export default function useWebSocket() {
  const [downloads, setDownloads] = useState({});
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef(null);
  const heartbeatIntervalRef = useRef(null);
  const healthPollIntervalRef = useRef(null);
  const lastActiveTimestampRef = useRef(Date.now());

  // Function to safely disconnect and mark as offline
  const setOffline = useCallback(() => {
    setIsConnected(false);
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
      heartbeatIntervalRef.current = null;
    }
    if (wsRef.current) {
      try {
        wsRef.current.onopen = null;
        wsRef.current.onmessage = null;
        wsRef.current.onclose = null;
        wsRef.current.onerror = null;
        wsRef.current.close();
      } catch (e) {
        // ignore
      }
      wsRef.current = null;
    }
  }, []);

  const connect = useCallback(() => {
    // If already open, do nothing
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      return;
    }

    // If currently connecting, allow up to 2.5s before resetting
    if (wsRef.current && wsRef.current.readyState === WebSocket.CONNECTING) {
      if (Date.now() - lastActiveTimestampRef.current > 2500) {
        setOffline();
      } else {
        return;
      }
    }

    lastActiveTimestampRef.current = Date.now();

    try {
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        lastActiveTimestampRef.current = Date.now();
        setIsConnected(true);

        // Active Heartbeat: Ping every 1500ms and check for watchdog liveness
        if (heartbeatIntervalRef.current) clearInterval(heartbeatIntervalRef.current);
        heartbeatIntervalRef.current = setInterval(() => {
          if (!wsRef.current || ws.readyState !== WebSocket.OPEN) {
            setOffline();
            return;
          }

          // Check if we haven't received anything from server in 3200ms (missed 2 pings)
          if (Date.now() - lastActiveTimestampRef.current > 3200) {
            console.warn('[WS] Heartbeat watchdog timeout (server died). Marking offline.');
            setOffline();
            return;
          }

          try {
            ws.send('ping');
          } catch (err) {
            setOffline();
          }
        }, 1500);
      };

      ws.onmessage = (event) => {
        lastActiveTimestampRef.current = Date.now();
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'init' && data.downloads) {
            const map = {};
            data.downloads.forEach(d => { map[d.id] = d; });
            setDownloads(map);
          } else if (data.type === 'pong') {
            // Received pong response from server
          } else if (data.type === 'deleted' && data.ids) {
            setDownloads(prev => {
              const next = { ...prev };
              data.ids.forEach(id => delete next[id]);
              return next;
            });
          } else if (data.id) {
            setDownloads(prev => ({
              ...prev,
              [data.id]: data,
            }));
          }
        } catch (err) {
          console.error('WS parse error:', err);
        }
      };

      ws.onclose = () => {
        setOffline();
      };

      ws.onerror = () => {
        setOffline();
      };
    } catch {
      setOffline();
    }
  }, [setOffline]);

  // Fast Reconnect & Health Probe Loop (Every 1000ms when disconnected)
  useEffect(() => {
    let isCancelled = false;

    const probeAndReconnect = async () => {
      if (isCancelled) return;

      // If WebSocket is already open, do nothing
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        return;
      }

      // If currently connecting within threshold, let it connect
      if (wsRef.current && wsRef.current.readyState === WebSocket.CONNECTING) {
        if (Date.now() - lastActiveTimestampRef.current < 2500) {
          return;
        }
        setOffline();
      }

      // Check if backend HTTP is responding
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 800);
        const res = await fetch(`${API_BASE}/api/health`, { signal: controller.signal });
        clearTimeout(timer);
        if (res.ok) {
          // Backend is alive! Connect WebSocket immediately!
          connect();
        } else {
          setOffline();
        }
      } catch {
        // Backend is off
        setOffline();
      }
    };

    // Initial probe
    probeAndReconnect();

    // Fast 1s polling interval
    healthPollIntervalRef.current = setInterval(probeAndReconnect, 1000);

    // Browser tab focus & online events
    const handleFocus = () => probeAndReconnect();
    window.addEventListener('focus', handleFocus);
    window.addEventListener('online', handleFocus);

    return () => {
      isCancelled = true;
      if (healthPollIntervalRef.current) clearInterval(healthPollIntervalRef.current);
      if (heartbeatIntervalRef.current) clearInterval(heartbeatIntervalRef.current);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('online', handleFocus);
      if (wsRef.current) {
        try {
          wsRef.current.close();
        } catch (e) {}
      }
    };
  }, [connect, setOffline]);

  return { downloads, isConnected };
}
