const http = require('http');
const req = http.request({hostname: 'localhost', port: 3000, path: '/', method: 'GET'}, (res) => {
  console.log('✅ Server attivo');
  process.exit(0);
});
req.on('error', () => {
  console.log('❌ Server non attivo');
  process.exit(1);
});
req.setTimeout(3000, () => {
  console.log('⏰ Timeout');
  req.destroy();
  process.exit(1);
});
req.end();