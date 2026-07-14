const fetch = require('node-fetch');
async function test() {
  const res = await fetch('http://localhost:3001/api/deepseek/chat', {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'Authorization': 'Bearer mock-token-testuser'
    },
    body: JSON.stringify({
      provider: 'nvidia',
      model: 'meta/llama-3.1-8b-instruct',
      messages: [{role: 'user', content: 'Say hello in 3 words.'}],
      max_tokens: 30,
      stream: false
    })
  });
  console.log('Status:', res.status);
  const json = await res.json();
  console.log('Body:', JSON.stringify(json));
}
test();
