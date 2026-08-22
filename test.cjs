const http = require('http');

http.get('http://localhost:3000/api/pair-code?phone=1234567890', (res) => {
  let data = '';
  res.on('data', chunk => { data += chunk; });
  res.on('end', () => {
    console.log(`Status: ${res.statusCode}`);
    console.log(`Body: ${data}`);
  });
}).on('error', err => {
  console.log('Error: ', err.message);
});
