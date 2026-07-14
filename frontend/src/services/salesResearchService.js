/**
 * salesResearchService - Pre-call deep company research agent.
 *
 * User provides client name, role, and company. The agent uses DeepSeek LLM
 * to research the company and generate a briefing document with:
 *   - Company background
 *   - Tech stack / industry analysis
 *   - Pain points
 *   - Predicted objections
 *   - Discovery questions
 *   - Talk track
 */
import { getSession } from './supabaseClient';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';
const SALES_BRIEFING_URL = `${API_BASE}/api/sales/briefing`;

/**
 * Generate a pre-call briefing document.
 *
 * @param {object} params
 * @param {string} params.clientName - Name of the contact
 * @param {string} params.clientRole - Job title of the contact
 * @param {string} params.company   - Company name
 * @param {string} params.companyUrl - Company URL
 * @param {string} params.dealContext - What you're selling / deal background
 * @param {string} params.methodology - MEDDIC, BANT, SPIN, SPICED, Challenger
 * @returns {Promise<object>} structured briefing data
 */
export async function generateSalesBriefing({ clientName, clientRole, company, companyUrl, dealContext, methodology = 'SPIN', myCompany = {} }) {
  const session = await getSession();
  const token = session?.access_token || '';

  const response = await fetch(SALES_BRIEFING_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': token ? `Bearer ${token}` : ''
    },
    body: JSON.stringify({
      clientName,
      clientRole,
      clientCompany: company,
      clientUrl: companyUrl,
      dealContext,
      methodology,
      myCompany
    }),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => response.statusText);
    throw new Error(`Research API error ${response.status}: ${errText}`);
  }

  const data = await response.json();
  return data.briefingData;
}

