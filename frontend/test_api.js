const H0 = 11;
const H1 = 27;

const now = new Date('2026-06-28T19:27:00+05:30');
const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

const day = new Date(today); // Sunday

const logicalDayStart = new Date(day); logicalDayStart.setHours(H0,0,0,0);
const logicalDayEnd = new Date(day); logicalDayEnd.setHours(H1,0,0,0);

console.log("Sunday start:", logicalDayStart);
console.log("Sunday end:", logicalDayEnd);

async function test() {
  const res = await fetch('http://localhost:4000/api/schedule', {
    headers: { 'Authorization': 'Bearer test-token' } // Wait, can't easily hit auth route, let's just query db via psql
  });
}
