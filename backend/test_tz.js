const now = new Date();
const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

console.log("Server now:", now.toISOString());
console.log("Server now (local):", now.toString());
console.log("weekStart:", weekStart.toISOString());
console.log("weekStart (local):", weekStart.toString());
console.log("Offset:", now.getTimezoneOffset());
