const { Client } = require('pg');
const client = new Client('postgres://fluxmind:password@localhost:5432/fluxmind_db');
client.connect().then(async () => {
  const res = await client.query('SELECT start_time FROM calendar_blocks WHERE type_of_block = $1', ['FIXED_EVENT']);
  console.log(res.rows[0].start_time);
  console.log(JSON.stringify(res.rows[0].start_time));
  client.end();
});
