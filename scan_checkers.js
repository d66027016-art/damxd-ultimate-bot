const axios = require('axios');

const BASE_URL = 'https://api.ender.black/v1';
const ENDER_KEY = 'ender_11ff50fa71150deefdbffe5d6f045cbc';
const headers = {
    Authorization: ENDER_KEY,
    'Content-Type': 'application/json'
};

const cards = ['5111111111111111|11|2026|123'];

async function scanCheckers() {
    const gates = ['vbv', 'auth', 'charge', 'auth-charge'];
    const endpoints = ['/checkers', '/tools/cc-killer'];

    for (const endpoint of endpoints) {
        for (const gate of gates) {
            console.log(`Testing: ${endpoint} with gate: ${gate}...`);
            try {
                const res = await axios.post(`${BASE_URL}${endpoint}`, { gate, cards }, { headers });
                console.log(`SUCCESS! Status: ${res.status}`);
                console.log(`Data: ${JSON.stringify(res.data)}`);
            } catch (e) {
                console.log(`FAILED: ${e.message}`);
                if (e.response) {
                    console.log(`Status: ${e.response.status}`);
                    console.log(`Data: ${JSON.stringify(e.response.data)}`);
                }
            }
            console.log('---');
        }
    }
}

scanCheckers();
