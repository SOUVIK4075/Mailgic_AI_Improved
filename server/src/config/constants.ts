// Single source of truth for email types, tones and input limits.
// The client reads these from GET /api/meta, so the UI and the validation can never drift apart.

export const EMAIL_TYPES = [
  { id: 'business', label: 'Business Email', description: 'Professional communication for business purposes' },
  { id: 'sales', label: 'Sales Pitch', description: 'Persuasive emails to promote products or services' },
  { id: 'personal', label: 'Personal Email', description: 'Friendly communication for personal matters' },
  { id: 'follow-up', label: 'Follow-up', description: 'Follow-up after meetings or events' },
  { id: 'introduction', label: 'Introduction', description: 'First-time connections and networking' },
  { id: 'support', label: 'Customer Support', description: 'Help desk and customer service responses' },
  { id: 'application', label: 'Job Application', description: 'Cover letters and job-related correspondence' },
  { id: 'request', label: 'Request / Proposal', description: 'Formal requests and business proposals' },
  { id: 'feedback', label: 'Feedback & Review', description: 'Performance reviews and constructive feedback' },
] as const;

export const TONES = [
  { id: 'professional', label: 'Professional', description: 'Formal and business-appropriate' },
  { id: 'friendly', label: 'Friendly', description: 'Warm and approachable' },
  { id: 'casual', label: 'Casual', description: 'Relaxed and informal' },
  { id: 'formal', label: 'Formal', description: 'Highly professional and ceremonious' },
  { id: 'enthusiastic', label: 'Enthusiastic', description: 'Energetic and positive' },
  { id: 'empathetic', label: 'Empathetic', description: 'Understanding and compassionate' },
  { id: 'assertive', label: 'Assertive', description: 'Confident and direct' },
  { id: 'diplomatic', label: 'Diplomatic', description: 'Tactful and considerate' },
  { id: 'persuasive', label: 'Persuasive', description: 'Compelling and influential' },
] as const;

export const EMAIL_TYPE_IDS = EMAIL_TYPES.map((t) => t.id) as [string, ...string[]];
export const TONE_IDS = TONES.map((t) => t.id) as [string, ...string[]];

export const LIMITS = {
  promptMinChars: 10,
  promptMaxChars: 2000,
  incomingEmailMaxChars: 8000,
  instructionsMaxChars: 500,
  minWords: 50,
  maxWords: 800,
  maxUploadMb: 5,
  knowledgeTextMaxChars: 200_000,
  maxDocumentsPerUser: 20,
} as const;

export const RAG = {
  chunkSize: 1000, // characters (~250 tokens)
  chunkOverlap: 150,
  topK: 4,
  // Atlas cosine scores are normalised to 0..1; below this a chunk is usually unrelated noise.
  minScore: 0.7,
  embedBatchSize: 64,
} as const;
