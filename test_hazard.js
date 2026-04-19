const http = require('http');

const testRecord = {
    category_id: 1,
    title: "TEST: Massive Rogue Wave",
    description: "A huge wave reported off the coast of Madagascar.",
    latitude: -19.5,
    longitude: 48.2,
    severity: "critical",
    photos: []
};

const req = http.request({
    hostname: 'localhost',
    port: 3000,
    path: '/api/reports',
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MSwiaWF0IjoxNzcxOTI2NjY3fQ.Ni1goT4Lq2MbdolzTk3Q2uq2fIwF6zIzoiTv_vUM4XaME'
    }
}, (res) => {
    let data = '';
    res.on('data', chunk => { data += chunk; });
    res.on('end', () => {
        console.log(`Response Status: ${res.statusCode}`);
        console.log(`Backend Reply: ${data}`);
    });
});

req.on('error', (e) => {
    console.error(`Error sending test hazard: ${e.message}`);
});

req.write(JSON.stringify(testRecord));
req.end();
