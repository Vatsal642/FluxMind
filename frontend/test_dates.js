const H0 = 11;
const H1 = 27;

const now = new Date('2026-06-28T19:27:00+05:30');
const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

console.log("Today is:", today);

const day = new Date(today);

const logicalDayStart = new Date(day); logicalDayStart.setHours(H0,0,0,0);
const logicalDayEnd = new Date(day); logicalDayEnd.setHours(H1,0,0,0);

console.log("logicalDayStart:", logicalDayStart);
console.log("logicalDayEnd:", logicalDayEnd);

const s = new Date('2026-06-29T18:00:00+05:30'); // Monday 6pm
console.log("Task start time:", s);

console.log("Is s >= logicalDayStart?", s >= logicalDayStart);
console.log("Is s < logicalDayEnd?", s < logicalDayEnd);
