const shifts = [{
  id: "test",
  date: "2026-07-26",
  clockIn: "10:00",
  clockOut: "18:00",
  isOvernight: false,
  breakLength: 0
}];

const calculateTotalHours = (shifts) => {
  const intervals = shifts.map(s => {
    const [year, month, day] = s.date.split('-').map(Number);
    const [inH, inM] = s.clockIn.split(':').map(Number);
    const [outH, outM] = s.clockOut.split(':').map(Number);
        
    let start = new Date(year, month - 1, day, inH, inM).getTime();
    let end = new Date(year, month - 1, day, outH, outM).getTime();
        
    if (s.isOvernight || end < start) {
      end += 24 * 60 * 60 * 1000;
    }
        
    return { start, end, breakLength: s.breakLength };
  });

  if (intervals.length === 0) return 0;
  
  intervals.sort((a, b) => a.start - b.start);
  
  let merged = [ { start: intervals[0].start, end: intervals[0].end } ];
  for (let i = 1; i < intervals.length; i++) {
    const last = merged[merged.length - 1];
    const curr = intervals[i];
    if (curr.start <= last.end) {
      last.end = Math.max(last.end, curr.end);
    } else {
      merged.push({ start: curr.start, end: curr.end });
    }
  }
  
  let totalMs = 0;
  for (const m of merged) {
    totalMs += m.end - m.start;
  }
  
  let totalBreakMins = intervals.reduce((sum, inv) => sum + (Number(inv.breakLength) || 0), 0);
  let totalHours = (totalMs / (1000 * 60) - totalBreakMins) / 60;
  
  return Math.max(0, totalHours);
};

console.log(calculateTotalHours(shifts));
