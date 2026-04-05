const SESSIONS = {
  ASIAN: { start: '19:00', end: '02:00', label: 'Asian Session' },
  LONDON: { start: '02:00', end: '12:00', label: 'London Session' },
  NEW_YORK: { start: '07:00', end: '17:00', label: 'New York Session' },
};

const KILLZONES = {
  LONDON_OPEN: { start: '02:00', end: '05:00', label: 'London Open KZ' },
  NY_OPEN: { start: '07:00', end: '10:00', label: 'New York Open KZ' },
  LONDON_CLOSE: { start: '10:00', end: '12:00', label: 'London Close KZ' },
};

function getESTTime() {
  const now = new Date();
  const est = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  return est;
}

function formatTime(date) {
  return date.toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function timeToMinutes(timeStr) {
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
}

function isInTimeRange(currentMinutes, startStr, endStr) {
  const start = timeToMinutes(startStr);
  const end = timeToMinutes(endStr);
  if (start > end) {
    // Spans midnight
    return currentMinutes >= start || currentMinutes < end;
  }
  return currentMinutes >= start && currentMinutes < end;
}

function getActiveSession(estTime) {
  const minutes = estTime.getHours() * 60 + estTime.getMinutes();
  const active = [];
  for (const [key, session] of Object.entries(SESSIONS)) {
    if (isInTimeRange(minutes, session.start, session.end)) {
      active.push(key);
    }
  }
  return active.length > 0 ? active[0] : null;
}

function getActiveKillzone(estTime) {
  const minutes = estTime.getHours() * 60 + estTime.getMinutes();
  for (const [key, kz] of Object.entries(KILLZONES)) {
    if (isInTimeRange(minutes, kz.start, kz.end)) {
      return key;
    }
  }
  return null;
}

function getSessionInfo() {
  const estTime = getESTTime();
  const activeSession = getActiveSession(estTime);
  const activeKillzone = getActiveKillzone(estTime);
  const currentMinutes = estTime.getHours() * 60 + estTime.getMinutes();

  const killzones = Object.entries(KILLZONES).map(([key, kz]) => ({
    name: kz.label,
    key,
    start: kz.start,
    end: kz.end,
    active: isInTimeRange(currentMinutes, kz.start, kz.end),
  }));

  // Find next killzone
  let nextKillzone = null;
  let minWait = Infinity;
  for (const kz of killzones) {
    if (!kz.active) {
      const kzStart = timeToMinutes(kz.start);
      let wait = kzStart - currentMinutes;
      if (wait < 0) wait += 24 * 60;
      if (wait < minWait) {
        minWait = wait;
        nextKillzone = { name: kz.name, minutesUntil: wait };
      }
    }
  }

  const day = estTime.getDay();
  const isWeekend = day === 0 || day === 6;

  return {
    estTime: formatTime(estTime),
    activeSession: activeSession ? SESSIONS[activeSession].label : 'Off Hours',
    activeSessionKey: activeSession,
    activeKillzone: activeKillzone ? KILLZONES[activeKillzone].label : null,
    activeKillzoneKey: activeKillzone,
    killzones,
    nextKillzone,
    isWeekend,
  };
}

function isInsideKillzone() {
  const estTime = getESTTime();
  return getActiveKillzone(estTime) !== null;
}

module.exports = {
  SESSIONS,
  KILLZONES,
  getSessionInfo,
  isInsideKillzone,
  getESTTime,
};
