require('dotenv').config();
const fetch = require('node-fetch');

async function test() {
  const res = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.NVIDIA_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'meta/llama-3.1-8b-instruct',
      messages: [{role: 'user', content: 'test'}],
      max_tokens: 10,
      stream: true
    })
  });
  
  const reader = res.body;
  reader.on('data', chunk => console.log(chunk.toString()));
}
test();
