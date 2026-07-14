require('dotenv').config();
const fetch = require('node-fetch');

async function test() {
  const prompt = `You are an expert interview coach helping a candidate answer questions in real-time.
VOICE-TO-VOICE CONVERSATIONAL RULES (CRITICAL):
- DIVE STRAIGHT IN: Do NOT start answers with filler. Start immediately with the main keywords and the core point in the very first sentence!

The "answer" field should be cleanly formatted using Markdown, including code blocks if the user asks for a code snippet or program.

OUTPUT FORMAT:
Return JSON:
{
  "answer": "A clear, natural, and concise response to the user's question. Use Markdown for bolding, lists, and code blocks (\`\`\`) if you are asked to write a program or script. Keep it highly scannable.",
  "bulletPoints": ["Key takeaway 1", "Key takeaway 2", "Key takeaway 3"],
  "hints": ["Keyword 1", "Keyword 2"]
}`;

  const res = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.NVIDIA_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'meta/llama-3.1-8b-instruct',
      messages: [
        {role: 'system', content: prompt},
        {role: 'user', content: 'Write a program for polymorphism.'}
      ],
      max_tokens: 1024,
      temperature: 0.4,
      top_p: 0.9
    })
  });
  
  const text = await res.text();
  console.log(text);
}
test();
