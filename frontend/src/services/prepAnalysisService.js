import { getSession } from './supabaseClient';


export async function generatePrepAnalysis(resumeData, jobDescription) {
  if (!resumeData && !jobDescription) {
    return null;
  }

  const resumeText = resumeData
    ? (typeof resumeData === 'string' ? resumeData : JSON.stringify(resumeData))
    : 'Not provided';
  const jdText = jobDescription
    ? (typeof jobDescription === 'string' ? jobDescription : JSON.stringify(jobDescription))
    : 'Not provided';

  const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';
  const DEEPSEEK_URL = `${API_BASE}/api/deepseek/chat`;
  const session = await getSession();
  const token = session?.access_token || '';

  const response = await fetch(DEEPSEEK_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': token ? `Bearer ${token}` : ''
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [
        {
          role: 'system',
          content: `You are an expert technical interviewer and executive recruiter. Compare the candidate's Resume with the Job Description.
Identify key preparation context and output:
1. Gaps: Estimate 2-4 gaps in the candidate's resume relative to the JD requirements (e.g. missing skills, specific tools, depth of experience, or industry domains).
2. Questions: Predict 3-5 specific, high-probability interview questions they are likely to ask based on those gaps and the JD.

Format your output strictly as a JSON object:
{
  "gaps": ["Gap 1", "Gap 2", ...],
  "questions": ["Question 1", "Question 2", ...]
}
Do not include any extra introductory text, markdown formatting blocks (like \`\`\`json), or conversational filler.`
        },
        {
          role: 'user',
          content: `CANDIDATE RESUME:
${resumeText}

JOB DESCRIPTION:
${jdText}`
        }
      ],
      max_tokens: 1024,
      temperature: 0.3,
      top_p: 0.9,
      stream: false
    })
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => response.statusText);
    throw new Error(`Prep analysis generation error: ${errorText}`);
  }

  const data = await response.json();
  const rawContent = data.choices?.[0]?.message?.content || '';

  const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[0]);
    } catch (err) {
      console.error('Failed parsing prep analysis JSON:', err, rawContent);
    }
  }

  throw new Error('Prep analysis response was not structured as JSON.');
}
